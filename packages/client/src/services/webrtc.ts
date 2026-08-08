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
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private speakingCallbacks: Array<(userId: number, speaking: boolean) => void> = [];
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
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      video: false
    });
    this.localStream = stream;
    return stream;
  }

  async connectToPeer(peer: { userId: number; username: string; radminIp: string }, isInitiator: boolean): Promise<void> {
    if (this.peers.has(peer.userId)) {
      this.disconnectPeer(peer.userId);
    }

    const connection = new RTCPeerConnection(this.config);
    const audioEl = new Audio();
    audioEl.autoplay = true;
    if (this.outputDeviceId) {
      (audioEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(this.outputDeviceId).catch(() => {});
    }

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
      if (!audioEl.srcObject) {
        audioEl.srcObject = event.streams[0];
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
    
    if (type === 'offer') {
      if (!peer) {
        // We received an offer but peer is not initialized yet. Initialize implicitly.
        await this.connectToPeer({ userId: fromUserId, username: `User ${fromUserId}`, radminIp: '' }, false);
        peer = this.peers.get(fromUserId);
      }
      if (peer) {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(data));
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
      }
    } else if (type === 'candidate') {
      if (peer) {
        try {
          await peer.connection.addIceCandidate(new RTCIceCandidate(data));
        } catch (e) {
          console.error('Error adding ICE candidate', e);
        }
      }
    }
  }

  disconnectPeer(userId: number): void {
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

  private monitorAudioLevel(userId: number, stream: MediaStream): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    const dataArray = new Float32Array(analyser.frequencyBinCount);
    let isCurrentlySpeaking = false;
    
    const checkLevel = () => {
      if (!this.peers.has(userId)) return;
      
      analyser.getFloatFrequencyData(dataArray);
      
      // Calculate average level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      
      const speaking = average > -50;
      
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
