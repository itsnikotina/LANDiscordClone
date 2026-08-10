import axios from 'axios';
import { getEffectiveServerConfig } from './serverConfig';

export interface User { id: number; username: string; avatarColor: string; status: 'online'|'idle'|'dnd'|'invisible'; radminIp?: string; }
export interface Guild { id: string; name: string; iconColor: string; ownerId: number; inviteCode: string; categories: Category[]; channels: Channel[]; roles: Role[]; members: Member[]; }
export interface Category { id: string; guildId: string; name: string; position: number; channels: Channel[]; }
export interface Channel { id: string; guildId: string; categoryId?: string; name: string; type: 'TEXT'|'VOICE'|'FORUM'; topic?: string; position: number; }
export interface Message { id: string; channelId: string; authorId: number; author: User; content: string; attachments: string[]; createdAt: number; editedAt?: number; }
export interface VoiceState { userId: number; username: string; channelId: string; guildId: string; muted: boolean; deafened: boolean; streaming: boolean; radminIp?: string; }
export interface Role { id: string; guildId: string; name: string; color: string; hoist: boolean; permissions: number; position: number; }
export interface Member { userId: number; username: string; avatarColor: string; status: string; roles: string[]; }
export interface UploadedAttachment { url: string; filename: string; mimetype: string; size: number; }
export interface RtcConfig { turnPort: number; username: string; credential: string; }

/** Must match packages/server/src/config.ts maxFileSize. */
export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

export const apiClient = axios.create();

/** Applies a (possibly just-saved) server address without needing a page reload. */
export function applyServerConfig(): void {
  apiClient.defaults.baseURL = getEffectiveServerConfig()?.apiUrl;
}
applyServerConfig();

/** Attachment URLs are stored relative (e.g. /uploads/x.png) - resolve them against the API server, not the Vite dev server. */
export const resolveAttachmentUrl = (url: string) => url.startsWith('http') ? url : `${apiClient.defaults.baseURL ?? ''}${url}`;

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('discord_p2p_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthMe404 = error.response?.status === 404 && error.config?.url?.includes('/auth/me');
    if (error.response && (error.response.status === 401 || isAuthMe404)) {
      localStorage.removeItem('discord_p2p_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const auth = {
  register: async (username: string, password: string, serverPassword?: string) => {
    const res = await apiClient.post<{ token: string; user: User }>('/auth/register', { username, password, serverPassword });
    return res.data;
  },
  login: async (username: string, password: string) => {
    const res = await apiClient.post<{ token: string; user: User }>('/auth/login', { username, password });
    return res.data;
  },
  me: async () => {
    const res = await apiClient.get<User>('/auth/me');
    return res.data;
  }
};

export const guilds = {
  list: async () => {
    const res = await apiClient.get<Guild[]>('/guilds');
    return res.data;
  },
  get: async (id: string) => {
    const res = await apiClient.get<Guild>(`/guilds/${id}`);
    return res.data;
  },
  create: async (name: string) => {
    const res = await apiClient.post<Guild>('/guilds', { name });
    return res.data;
  },
  join: async (inviteCode: string) => {
    const res = await apiClient.post<Guild>('/guilds/join', { inviteCode });
    return res.data;
  },
  delete: async (id: string) => {
    const res = await apiClient.delete(`/guilds/${id}`);
    return res.data;
  }
};

export const channels = {
  create: async (guildId: string, name: string, type: 'TEXT'|'VOICE'|'FORUM', categoryId?: string) => {
    const res = await apiClient.post<Channel>(`/guilds/${guildId}/channels`, { name, type, categoryId });
    return res.data;
  },
  delete: async (guildId: string, channelId: string) => {
    const res = await apiClient.delete(`/guilds/${guildId}/channels/${channelId}`);
    return res.data;
  },
  update: async (guildId: string, channelId: string, data: Partial<Channel>) => {
    const res = await apiClient.patch<Channel>(`/guilds/${guildId}/channels/${channelId}`, data);
    return res.data;
  }
};

export const messages = {
  list: async (channelId: string, before?: string) => {
    const res = await apiClient.get<Message[]>(`/channels/${channelId}/messages`, { params: { before } });
    return res.data;
  },
  send: async (channelId: string, content: string, attachments?: string[]) => {
    const res = await apiClient.post<Message>(`/channels/${channelId}/messages`, { content, attachments });
    return res.data;
  },
  upload: async (channelId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<UploadedAttachment>(`/channels/${channelId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  delete: async (channelId: string, messageId: string) => {
    const res = await apiClient.delete(`/channels/${channelId}/messages/${messageId}`);
    return res.data;
  },
  edit: async (channelId: string, messageId: string, content: string) => {
    const res = await apiClient.patch<Message>(`/channels/${channelId}/messages/${messageId}`, { content });
    return res.data;
  }
};

export const roles = {
  list: async (guildId: string) => {
    const res = await apiClient.get<Role[]>(`/guilds/${guildId}/roles`);
    return res.data;
  },
  create: async (guildId: string, name: string, color: string, permissions: number) => {
    const res = await apiClient.post<Role>(`/guilds/${guildId}/roles`, { name, color, permissions });
    return res.data;
  },
  assignToMember: async (guildId: string, userId: number, roleIds: string[]) => {
    const res = await apiClient.put(`/guilds/${guildId}/members/${userId}/roles`, { roleIds });
    return res.data;
  }
};

export const rtc = {
  getConfig: async () => {
    const res = await apiClient.get<RtcConfig>('/rtc-config');
    return res.data;
  }
};
