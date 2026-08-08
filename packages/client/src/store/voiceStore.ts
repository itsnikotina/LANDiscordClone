import { create } from 'zustand';
import { gateway, GatewayOpcode } from '../services/gateway';
import { webrtcManager } from '../services/webrtc';

export interface VoicePeer {
  userId: number;
  username: string;
  avatarColor: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isStreaming: boolean;
  stream?: MediaStream;
}

interface VoiceStore {
  channelId: string | null;
  guildId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isStreaming: boolean;
  joinError: string | null;
  peersArray: VoicePeer[];
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  
  joinChannel: (channelId: string, guildId: string) => Promise<void>;
  leaveChannel: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleStream: () => Promise<void>;
  addPeer: (peer: VoicePeer) => void;
  removePeer: (userId: number) => void;
  updatePeer: (userId: number, updates: Partial<VoicePeer>) => void;
  setPeerSpeaking: (userId: number, speaking: boolean) => void;
  isInVoice: () => boolean;
}

export const useVoiceStore = create<VoiceStore>((set, get) => ({
  channelId: null,
  guildId: null,
  isMuted: false,
  isDeafened: false,
  isStreaming: false,
  joinError: null,
  peersArray: [],
  localStream: null,
  screenStream: null,
  
  joinChannel: async (channelId: string, guildId: string) => {
    if (get().channelId === channelId) return;
    if (get().channelId) {
      get().leaveChannel();
    }
    set({ joinError: null });
    try {
      const stream = await webrtcManager.initLocalAudio();
      set({ channelId, guildId, localStream: stream });
      
      gateway.send(GatewayOpcode.JOIN_VOICE, {
        guildId,
        channelId,
        muted: get().isMuted,
        deafened: get().isDeafened,
        streaming: get().isStreaming
      });
      
      webrtcManager.onSpeakingChange((userId, speaking) => {
        get().setPeerSpeaking(userId, speaking);
      });
      
    } catch (err) {
      console.error('Failed to join voice channel', err);
      set({ joinError: 'Não foi possível conectar ao canal de voz. Verifique a permissão do microfone.' });
    }
  },
  
  leaveChannel: () => {
    gateway.send(GatewayOpcode.LEAVE_VOICE, {
      guildId: get().guildId,
      channelId: get().channelId
    });
    webrtcManager.disconnectAll();
    set({ channelId: null, guildId: null, peersArray: [], localStream: null, screenStream: null, isStreaming: false });
  },
  
  toggleMute: () => {
    const newMuted = !get().isMuted;
    set({ isMuted: newMuted });
    webrtcManager.setMuted(newMuted);
    
    if (get().channelId) {
      gateway.send(GatewayOpcode.UPDATE_PRESENCE, {
        muted: newMuted,
        deafened: get().isDeafened,
        streaming: get().isStreaming
      });
    }
  },
  
  toggleDeafen: () => {
    const newDeafened = !get().isDeafened;
    // If deafening, also mute. If undeafening, maintain mute state (simplified).
    set({ isDeafened: newDeafened, isMuted: newDeafened || get().isMuted });
    
    if (get().channelId) {
      gateway.send(GatewayOpcode.UPDATE_PRESENCE, {
        muted: get().isMuted,
        deafened: newDeafened,
        streaming: get().isStreaming
      });
    }
  },
  
  toggleStream: async () => {
    if (get().isStreaming) {
      webrtcManager.stopScreenShare();
      set({ isStreaming: false, screenStream: null });
      gateway.send(GatewayOpcode.STOP_STREAM, {});
    } else {
      try {
        const stream = await webrtcManager.startScreenShare();
        set({ isStreaming: true, screenStream: stream });
        gateway.send(GatewayOpcode.START_STREAM, {});
      } catch (err) {
        console.error('Failed to start stream', err);
      }
    }
  },
  
  addPeer: (peer: VoicePeer) => set((state) => {
    const existing = state.peersArray.find(p => p.userId === peer.userId);
    if (existing) return state;
    return { peersArray: [...state.peersArray, peer] };
  }),
  
  removePeer: (userId: number) => set((state) => ({
    peersArray: state.peersArray.filter(p => p.userId !== userId)
  })),
  
  updatePeer: (userId: number, updates: Partial<VoicePeer>) => set((state) => ({
    peersArray: state.peersArray.map(p => p.userId === userId ? { ...p, ...updates } : p)
  })),
  
  setPeerSpeaking: (userId: number, speaking: boolean) => set((state) => ({
    peersArray: state.peersArray.map(p => p.userId === userId ? { ...p, isSpeaking: speaking } : p)
  })),
  
  isInVoice: () => get().channelId !== null
}));
