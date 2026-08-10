import { gateway, GatewayOpcode } from './gateway';

export interface PeerInfo {
  userId: number;
  username: string;
  radminIp: string;
  connection: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  stream?: MediaStream;
  screenStream?: MediaStream;
  isSpeaking: boolean;
  isInitiator: boolean;
}

class WebRTCManager {
  private peers = new Map<number, PeerInfo>();
  // Guards against firing multiple ICE restarts for the same peer at once.
  private restartingPeers = new Set<number>();
  // ICE candidates that arrived before the peer/remoteDescription was ready.
  private pendingCandidates = new Map<number, RTCIceCandidateInit[]>();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private speakingCallbacks: Array<(userId: number, speaking: boolean) => void> = [];
  private selfSpeakingCallbacks: Array<(speaking: boolean) => void> = [];
  private remoteStreamCallbacks: Array<(userId: number, stream: MediaStream | null) => void> = [];
  private outputDeviceId: string | null = null;
  
  private readonly config: RTCConfiguration = {
    iceServers: [],
    iceTransportPolicy: 'all'
  };

  constructor() {
    // Autoplay can be silently blocked until a user gesture - any click retries stalled audio.
    document.addEventListener('pointerdown', () => {
      for (const userId of this.peers.keys()) this.ensurePlaying(userId);
    });
  }

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
      if (connection.connectionState === 'failed' || connection.connectionState === 'disconnected') {
        this.attemptIceRestart(peer.userId);
      }
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
      event.track.onunmute = () => {
        console.log(`[webrtc] peer ${peer.userId} ${event.track.kind} track receiving packets`);
        if (event.track.kind === 'audio') this.ensurePlaying(peer.userId);
      };
      const stream = event.streams[0];
      if (!stream) return;
      const p = this.peers.get(peer.userId);

      if (event.track.kind === 'video') {
        // Screen share stream (its audio, if any, plays through the <video> element in the UI).
        if (p) p.screenStream = stream;
        this.remoteStreamCallbacks.forEach(cb => cb(peer.userId, stream));
        return;
      }

      // Audio belonging to the screen stream is not the mic - don't let it evict the voice stream.
      if (audioEl.srcObject && audioEl.srcObject !== stream && stream.getVideoTracks().length > 0) return;

      // Always (re)attach: after a rejoin/renegotiation the element may hold a dead stream.
      if (audioEl.srcObject !== stream) {
        audioEl.srcObject = stream;
        if (p) {
          p.stream = stream;
          this.monitorAudioLevel(peer.userId, stream);
        }
      }
      this.ensurePlaying(peer.userId);
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
      isSpeaking: false,
      isInitiator
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
    } else if (type === 'stream-stop') {
      if (peer) {
        peer.screenStream = undefined;
        this.remoteStreamCallbacks.forEach(cb => cb(fromUserId, null));
      }
    }
  }

  /**
   * play() can fail transiently (autoplay policy, device switch, dead stream after rejoin).
   * Retries every 2s until it sticks or the peer is gone - a stalled element here is exactly
   * the "I only hear him after leaving and rejoining" bug.
   */
  private ensurePlaying(userId: number): void {
    const peer = this.peers.get(userId);
    if (!peer || !peer.audioEl.srcObject || !peer.audioEl.paused) return;
    peer.audioEl.play().then(
      () => console.log(`[webrtc] peer ${userId} audio element playing`),
      (err) => {
        console.warn(`[webrtc] peer ${userId} audio play blocked (${err?.name ?? err}), retrying in 2s`);
        setTimeout(() => this.ensurePlaying(userId), 2000);
      }
    );
  }

  /**
   * No STUN/TURN means a stuck ICE connection never self-heals - without this, a transient
   * network blip permanently kills audio in one/both directions until someone leaves and rejoins.
   * Only the original offer-sender renegotiates (avoids both sides racing/glare).
   */
  private async attemptIceRestart(userId: number): Promise<void> {
    const peer = this.peers.get(userId);
    if (!peer || !peer.isInitiator || this.restartingPeers.has(userId)) return;

    this.restartingPeers.add(userId);
    console.warn(`[webrtc] peer ${userId} connection unhealthy, attempting ICE restart`);
    try {
      const offer = await peer.connection.createOffer({ iceRestart: true });
      await peer.connection.setLocalDescription(offer);
      gateway.send(GatewayOpcode.VOICE_SIGNAL, {
        targetUserId: userId,
        type: 'offer',
        data: offer
      });
    } catch (e) {
      console.error(`[webrtc] ICE restart failed for peer ${userId}`, e);
    } finally {
      this.restartingPeers.delete(userId);
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
    this.restartingPeers.delete(userId);
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

  async startScreenShare(sourceId?: string): Promise<MediaStream> {
    if (this.screenStream) {
      this.stopScreenShare();
    }

    // Tells Electron's display-media handler which window/monitor to capture.
    if (sourceId && window.electronAPI?.selectScreenSource) {
      await window.electronAPI.selectScreenSource(sourceId);
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

  /** Remote screen-share video streams starting (stream) / stopping (null) per peer. */
  onRemoteStream(cb: (userId: number, stream: MediaStream | null) => void): () => void {
    this.remoteStreamCallbacks.push(cb);
    return () => {
      this.remoteStreamCallbacks = this.remoteStreamCallbacks.filter(c => c !== cb);
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
