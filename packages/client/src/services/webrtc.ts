import { gateway, GatewayOpcode } from './gateway';

export interface PeerInfo {
  userId: number;
  username: string;
  radminIp: string;
  connection: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  stream?: MediaStream;
  isSpeaking: boolean;
}

class WebRTCManager {
  private peers = new Map<number, PeerInfo>();
  // ICE candidates that arrived before the peer/remoteDescription was ready.
  private pendingCandidates = new Map<number, RTCIceCandidateInit[]>();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private speakingCallbacks: Array<(userId: number, speaking: boolean) => void> = [];
  private selfSpeakingCallbacks: Array<(speaking: boolean) => void> = [];
  private outputDeviceId: string | null = null;
  
  private readonly config: RTCConfiguration = {
    iceServers: [],
    iceTransportPolicy: 'all'
  };

  /** Applies (or remembers, for future peers) the speaker/output device audio plays through. */
  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId;
    for (const peer of this.peers.values()) {
      const el = peer.audioEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (el.setSinkId) {
        try {
          await el.setSinkId(deviceId);
        } catch (e) {
          console.error('Failed to set audio output device', e);
        }
      }
    }
  }

  async initLocalAudio(deviceId?: string): Promise<MediaStream> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false
      });
    } catch (e) {
      if (!deviceId) throw e;
      // Saved device id can go stale (unplugged/re-enumerated) - fall back to system default.
      console.warn('[webrtc] Saved microphone unavailable, falling back to system default', e);
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    console.log('[webrtc] Capturing microphone:', stream.getAudioTracks()[0]?.label ?? 'unknown');
    this.localStream = stream;
    this.monitorLocalAudioLevel(stream);
    return stream;
  }

  /** Swaps the mic mid-call: replaces the outgoing audio track on every peer connection. */
  async setInputDevice(deviceId?: string): Promise<MediaStream> {
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      video: false
    });
    const newTrack = newStream.getAudioTracks()[0];
    const oldStream = this.localStream;
    const oldTrack = oldStream?.getAudioTracks()[0];
    if (oldTrack) newTrack.enabled = oldTrack.enabled; // preserve mute state

    for (const peer of this.peers.values()) {
      const sender = peer.connection.getSenders().find(
        s => s.track?.kind === 'audio' && (!oldStream || oldStream.getTracks().includes(s.track!))
      );
      if (sender) {
        await sender.replaceTrack(newTrack).catch(e => console.error('[webrtc] replaceTrack failed', e));
      }
    }

    console.log('[webrtc] Switched microphone to:', newTrack?.label ?? 'unknown');
    this.localStream = newStream; // old monitor loop stops itself on next tick
    oldStream?.getTracks().forEach(t => t.stop());
    this.monitorLocalAudioLevel(newStream);
    return newStream;
  }

  async connectToPeer(peer: { userId: number; username: string; radminIp: string }, isInitiator: boolean): Promise<void> {
    if (this.peers.has(peer.userId)) {
      this.disconnectPeer(peer.userId);
    }

    const localTracks = this.localStream?.getAudioTracks().map(t => t.label) ?? [];
    console.log(`[webrtc] connectToPeer ${peer.userId} initiator=${isInitiator} sending mic:`, localTracks.length ? localTracks : 'NONE (no localStream! peer will not hear us)');

    const connection = new RTCPeerConnection(this.config);
    const audioEl = new Audio();
    audioEl.autoplay = true;
    if (this.outputDeviceId) {
      (audioEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(this.outputDeviceId).catch(() => {});
    }

    connection.onconnectionstatechange = () => {
      console.log(`[webrtc] peer ${peer.userId} connection: ${connection.connectionState}`);
    };
    connection.oniceconnectionstatechange = () => {
      console.log(`[webrtc] peer ${peer.userId} ice: ${connection.iceConnectionState}`);
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        gateway.send(GatewayOpcode.VOICE_SIGNAL, {
          targetUserId: peer.userId,
          type: 'candidate',
          data: event.candidate
        });
      }
    };

    connection.ontrack = (event) => {
      console.log(`[webrtc] peer ${peer.userId} ontrack: kind=${event.track.kind} muted=${event.track.muted}`);
      // 'mute' on a remote track = no RTP packets arriving for it (sender side is not transmitting).
      event.track.onmute = () => console.warn(`[webrtc] peer ${peer.userId} ${event.track.kind} track went SILENT (no packets arriving)`);
      event.track.onunmute = () => console.log(`[webrtc] peer ${peer.userId} ${event.track.kind} track receiving packets`);
      if (!audioEl.srcObject) {
        audioEl.srcObject = event.streams[0];
        audioEl.play().catch(err => console.warn('[webrtc] Autoplay blocked for incoming audio, retrying on next user gesture:', err));
        const p = this.peers.get(peer.userId);
        if (p) {
          p.stream = event.streams[0];
          this.monitorAudioLevel(peer.userId, event.streams[0]);
        }
      }
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => connection.addTrack(track, this.localStream!));
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => connection.addTrack(track, this.screenStream!));
    }

    this.peers.set(peer.userId, {
      ...peer,
      connection,
      audioEl,
      isSpeaking: false
    });

    if (isInitiator) {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      gateway.send(GatewayOpcode.VOICE_SIGNAL, {
        targetUserId: peer.userId,
        type: 'offer',
        data: offer
      });
    }
  }

  async handleSignal(fromUserId: number, type: string, data: any): Promise<void> {
    let peer = this.peers.get(fromUserId);
    console.log(`[webrtc] signal from ${fromUserId}: ${type}${peer ? '' : ' (no peer yet)'}`);
    
    if (type === 'offer') {
      if (!peer) {
        // We received an offer but peer is not initialized yet. Initialize implicitly.
        await this.connectToPeer({ userId: fromUserId, username: `User ${fromUserId}`, radminIp: '' }, false);
        peer = this.peers.get(fromUserId);
      }
      if (peer) {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(data));
        await this.flushPendingCandidates(fromUserId, peer.connection);
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        gateway.send(GatewayOpcode.VOICE_SIGNAL, {
          targetUserId: fromUserId,
          type: 'answer',
          data: answer
        });
      }
    } else if (type === 'answer') {
      if (peer) {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(data));
        await this.flushPendingCandidates(fromUserId, peer.connection);
      }
    } else if (type === 'candidate') {
      // Candidates can arrive before the offer/answer; queue them until remoteDescription is set.
      if (!peer || !peer.connection.remoteDescription) {
        const queue = this.pendingCandidates.get(fromUserId) ?? [];
        queue.push(data);
        this.pendingCandidates.set(fromUserId, queue);
        return;
      }
      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(data));
      } catch (e) {
        console.error('Error adding ICE candidate', e);
      }
    }
  }

  private async flushPendingCandidates(userId: number, connection: RTCPeerConnection): Promise<void> {
    const queue = this.pendingCandidates.get(userId);
    if (!queue) return;
    this.pendingCandidates.delete(userId);
    for (const candidate of queue) {
      try {
        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding queued ICE candidate', e);
      }
    }
  }

  disconnectPeer(userId: number): void {
    this.pendingCandidates.delete(userId);
    const peer = this.peers.get(userId);
    if (peer) {
      peer.connection.close();
      peer.audioEl.srcObject = null;
      this.peers.delete(userId);
    }
  }

  disconnectAll(): void {
    for (const [userId, peer] of this.peers) {
      this.disconnectPeer(userId);
    }
    this.peers.clear();
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  setMuted(muted: boolean): void {
    console.log(`[webrtc] mic ${muted ? 'MUTED' : 'unmuted'}`);
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }

  async startScreenShare(): Promise<MediaStream> {
    if (this.screenStream) {
      this.stopScreenShare();
    }
    
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    
    // Add screen stream to all existing connections
    for (const [, peer] of this.peers) {
      this.screenStream.getTracks().forEach(track => {
        peer.connection.addTrack(track, this.screenStream!);
      });
      // renegotiate
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      gateway.send(GatewayOpcode.VOICE_SIGNAL, {
        targetUserId: peer.userId,
        type: 'offer',
        data: offer
      });
    }
    
    return this.screenStream;
  }

  stopScreenShare(): void {
    if (!this.screenStream) return;
    
    const tracks = this.screenStream.getTracks();
    for (const [, peer] of this.peers) {
      const senders = peer.connection.getSenders();
      senders.forEach(sender => {
        if (sender.track && tracks.includes(sender.track)) {
          peer.connection.removeTrack(sender);
        }
      });
      // renegotation can be triggered or let the other side handle removal via onremovetrack
    }
    
    tracks.forEach(track => track.stop());
    this.screenStream = null;
  }

  getPeers(): Map<number, PeerInfo> {
    return this.peers;
  }

  onSpeakingChange(cb: (userId: number, speaking: boolean) => void): () => void {
    this.speakingCallbacks.push(cb);
    return () => {
      this.speakingCallbacks = this.speakingCallbacks.filter(c => c !== cb);
    };
  }

  /** Local mic level, separate from remote peers since the local user isn't in `peers`. */
  onSelfSpeakingChange(cb: (speaking: boolean) => void): () => void {
    this.selfSpeakingCallbacks.push(cb);
    return () => {
      this.selfSpeakingCallbacks = this.selfSpeakingCallbacks.filter(c => c !== cb);
    };
  }

  private monitorLocalAudioLevel(stream: MediaStream): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    // Chrome creates AudioContext in 'suspended' state without a user gesture - analyser reads silence until resumed.
    this.audioContext.resume().catch(() => {});

    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 512;

    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Float32Array(analyser.fftSize);
    let isCurrentlySpeaking = false;

    const checkLevel = () => {
      if (this.localStream !== stream) return; // stream was replaced/stopped - stop this loop

      // RMS of the raw waveform is a far more reliable "is anyone talking" signal than
      // averaging frequency-bin dB values, which stays near-silent regardless of actual
      // voice volume because most high-frequency bins are always near the noise floor.
      analyser.getFloatTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) sumSquares += dataArray[i] * dataArray[i];
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const db = 20 * Math.log10(rms || 0.000001);
      const speaking = db > -50;

      if (speaking !== isCurrentlySpeaking) {
        isCurrentlySpeaking = speaking;
        this.selfSpeakingCallbacks.forEach(cb => cb(speaking));
      }

      setTimeout(checkLevel, 100);
    };

    checkLevel();
  }

  private monitorAudioLevel(userId: number, stream: MediaStream): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    this.audioContext.resume().catch(() => {});
    
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 512;
    
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    const dataArray = new Float32Array(analyser.fftSize);
    let isCurrentlySpeaking = false;
    
    const checkLevel = () => {
      if (!this.peers.has(userId)) return;
      
      analyser.getFloatTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) sumSquares += dataArray[i] * dataArray[i];
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const db = 20 * Math.log10(rms || 0.000001);
      const speaking = db > -50;
      
      if (speaking !== isCurrentlySpeaking) {
        isCurrentlySpeaking = speaking;
        const peer = this.peers.get(userId);
        if (peer) {
          peer.isSpeaking = speaking;
        }
        this.speakingCallbacks.forEach(cb => cb(userId, speaking));
      }
      
      setTimeout(checkLevel, 100);
    };
    
    checkLevel();
  }
}

export const webrtcManager = new WebRTCManager();
