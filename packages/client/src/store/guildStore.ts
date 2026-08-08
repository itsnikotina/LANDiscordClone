import { create } from 'zustand';
import { Guild, Channel, Member, Message, VoiceState, messages as apiMessages } from '../services/api';

interface GuildState {
  guilds: Guild[];
  activeGuildId: string | null;
  activeChannelId: string | null;
  messages: Record<string, Message[]>;
  isLoadingMessages: boolean;
  voiceStates: VoiceState[];
  
  setGuilds: (guilds: Guild[]) => void;
  addGuild: (guild: Guild) => void;
  removeGuild: (guildId: string) => void;
  addChannel: (guildId: string, channel: Channel) => void;
  setActiveGuild: (guildId: string) => void;
  setActiveChannel: (channelId: string) => void;
  fetchMessages: (channelId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  editMessage: (channelId: string, messageId: string, content: string) => void;
  updateVoiceState: (state: VoiceState) => void;
  setVoiceStates: (states: VoiceState[]) => void;
  removeVoiceState: (userId: number) => void;
  addMember: (guildId: string, member: Member) => void;
  updateMemberStatus: (userId: number, status: string) => void;
  getActiveGuild: () => Guild | undefined;
  getChannel: (channelId: string) => Channel | undefined;
  getMember: (userId: number) => Member | undefined;
  getUsersInVoiceChannel: (channelId: string) => VoiceState[];
}

export const useGuildStore = create<GuildState>((set, get) => ({
  guilds: [],
  activeGuildId: null,
  activeChannelId: null,
  messages: {},
  isLoadingMessages: false,
  voiceStates: [],
  
  setGuilds: (guilds: Guild[]) => set({ guilds }),
  
  addGuild: (guild: Guild) => set((state) => ({ guilds: [...state.guilds, guild] })),
  
  removeGuild: (guildId: string) => set((state) => ({
    guilds: state.guilds.filter(g => g.id !== guildId),
    activeGuildId: state.activeGuildId === guildId ? null : state.activeGuildId
  })),
  
  addChannel: (guildId: string, channel: Channel) => set((state) => ({
    guilds: state.guilds.map(g => {
      if (g.id !== guildId) return g;
      // Creator receives the channel twice (REST response + own gateway broadcast).
      const exists = g.channels.some(c => c.id === channel.id)
        || g.categories.some(cat => (cat.channels || []).some(c => c.id === channel.id));
      if (exists) return g;
      if (channel.categoryId) {
        return {
          ...g,
          categories: g.categories.map(c => c.id === channel.categoryId
            ? { ...c, channels: [...(c.channels || []), channel] }
            : c)
        };
      }
      return { ...g, channels: [...g.channels, channel] };
    })
  })),
  
  setActiveGuild: (guildId: string) => set({ activeGuildId: guildId }),
  
  setActiveChannel: (channelId: string) => set({ activeChannelId: channelId }),
  
  fetchMessages: async (channelId: string) => {
    set({ isLoadingMessages: true });
    try {
      const msgs = await apiMessages.list(channelId);
      set((state) => ({
        messages: { ...state.messages, [channelId]: msgs },
        isLoadingMessages: false
      }));
    } catch (err) {
      set({ isLoadingMessages: false });
      console.error('Failed to fetch messages', err);
    }
  },
  
  addMessage: (message: Message) => set((state) => {
    const channelMsgs = state.messages[message.channelId] || [];
    // Avoid duplicates: the sender gets the message both from the REST response and its own gateway broadcast.
    if (channelMsgs.some(m => m.id === message.id)) return state;
    return {
      messages: {
        ...state.messages,
        [message.channelId]: [...channelMsgs, message]
      }
    };
  }),
  
  deleteMessage: (channelId: string, messageId: string) => set((state) => {
    const channelMsgs = state.messages[channelId] || [];
    return {
      messages: {
        ...state.messages,
        [channelId]: channelMsgs.filter(m => m.id !== messageId)
      }
    };
  }),
  
  editMessage: (channelId: string, messageId: string, content: string) => set((state) => {
    const channelMsgs = state.messages[channelId] || [];
    return {
      messages: {
        ...state.messages,
        [channelId]: channelMsgs.map(m => m.id === messageId ? { ...m, content, editedAt: Date.now() } : m)
      }
    };
  }),
  
  updateVoiceState: (state: VoiceState) => set((prevState) => {
    const filtered = prevState.voiceStates.filter(v => v.userId !== state.userId);
    return {
      voiceStates: [...filtered, state]
    };
  }),
  
  setVoiceStates: (states: VoiceState[]) => set({ voiceStates: states }),
  
  addMember: (guildId: string, member: Member) => set((state) => ({
    guilds: state.guilds.map(g => {
      if (g.id !== guildId) return g;
      if (g.members.some(m => m.userId === member.userId)) return g;
      return { ...g, members: [...g.members, member] };
    })
  })),
  
  removeVoiceState: (userId: number) => set((state) => ({
    voiceStates: state.voiceStates.filter(v => v.userId !== userId)
  })),
  
  updateMemberStatus: (userId: number, status: string) => set((state) => ({
    guilds: state.guilds.map(g => ({
      ...g,
      members: g.members?.map(m => m.userId === userId ? { ...m, status } : m)
    }))
  })),
  
  getActiveGuild: () => {
    const state = get();
    return state.guilds.find(g => g.id === state.activeGuildId);
  },
  
  getChannel: (channelId: string) => {
    const state = get();
    for (const guild of state.guilds) {
      const chan = guild.channels.find(c => c.id === channelId)
        ?? guild.categories?.flatMap(cat => cat.channels ?? []).find(c => c.id === channelId);
      if (chan) return chan;
    }
    return undefined;
  },
  
  getMember: (userId: number) => {
    const state = get();
    for (const guild of state.guilds) {
      const member = guild.members?.find(m => m.userId === userId);
      if (member) return member;
    }
    return undefined;
  },
  
  getUsersInVoiceChannel: (channelId: string) => {
    const state = get();
    return state.voiceStates.filter(v => v.channelId === channelId);
  }
}));
