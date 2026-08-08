import { create } from 'zustand';
import { auth, User } from '../services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, serverPassword: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  updateStatus: (status: User['status']) => void;
  clearError: () => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('discord_p2p_token'),
  isAuthenticated: !!localStorage.getItem('discord_p2p_token'),
  isLoading: true,
  error: null,
  
  login: async (username: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const data = await auth.login(username, password);
      localStorage.setItem('discord_p2p_token', data.token);
      set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Login failed', isLoading: false });
      throw err;
    }
  },
  
  register: async (username: string, password: string, serverPassword: string) => {
    try {
      set({ isLoading: true, error: null });
      const data = await auth.register(username, password, serverPassword);
      localStorage.setItem('discord_p2p_token', data.token);
      set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Registration failed', isLoading: false });
      throw err;
    }
  },
  
  logout: () => {
    localStorage.removeItem('discord_p2p_token');
    set({ user: null, token: null, isAuthenticated: false });
  },
  
  setUser: (user: User) => set({ user }),
  
  updateStatus: (status: User['status']) => set((state) => ({
    user: state.user ? { ...state.user, status } : null
  })),
  
  clearError: () => set({ error: null }),
  
  initialize: async () => {
    const { token } = get();
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }
    
    try {
      const user = await auth.me();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      localStorage.removeItem('discord_p2p_token');
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  }
}));
