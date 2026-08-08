import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import GuildPage from './pages/GuildPage';
import ServerSetupPage from './pages/ServerSetupPage';
import { useAuthStore } from './store/authStore';
import { useGuildStore } from './store/guildStore';
import { useVoiceStore } from './store/voiceStore';
import { gateway, GatewayOpcode } from './services/gateway';
import { webrtcManager } from './services/webrtc';
import { getEffectiveServerConfig } from './services/serverConfig';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  const { isAuthenticated, token, user } = useAuthStore();
  const [isServerConfigured, setIsServerConfigured] = useState(!!getEffectiveServerConfig());

  useEffect(() => {
    if (isAuthenticated && token) {
      const wsUrl = getEffectiveServerConfig()?.wsUrl ?? 'ws://localhost:3002';
      gateway.connect(wsUrl, token);

      const handleReady = (data: any) => {
        useGuildStore.getState().setGuilds(data.guilds);
      };

      const handleMessageCreate = (data: any) => {
        useGuildStore.getState().addMessage(data.message);
      };

      const handleMessageUpdate = (data: any) => {
        useGuildStore.getState().editMessage(data.message.channelId, data.message.id, data.message.content);
      };

      const handleMessageDelete = (data: any) => {
        useGuildStore.getState().deleteMessage(data.channelId, data.messageId);
      };

      const handleVoiceStateUpdate = (data: any) => {
        useGuildStore.getState().updateVoiceState(data);
        useVoiceStore.getState().updatePeer(data.userId, {
          isMuted: !!data.muted,
          isDeafened: !!data.deafened,
          isStreaming: !!data.streaming,
        });
      };

      const handleVoiceLeft = (data: any) => {
        useGuildStore.getState().removeVoiceState(data.userId);
        useVoiceStore.getState().removePeer(data.userId);
        webrtcManager.disconnectPeer(data.userId);
      };

      const handleVoiceJoined = (data: any) => {
        const voiceStore = useVoiceStore.getState();
        for (const peer of data.peers ?? []) {
          const member = useGuildStore.getState().getMember(peer.userId);
          voiceStore.addPeer({
            userId: peer.userId,
            username: peer.username ?? member?.username ?? `User ${peer.userId}`,
            avatarColor: member?.avatarColor ?? '#5865F2',
            isSpeaking: false,
            isMuted: false,
            isDeafened: false,
            isStreaming: false,
          });
          // We're the one who just joined, so we initiate the offer to each existing peer.
          webrtcManager.connectToPeer(peer, true);
        }
      };

      const handleVoicePeerSignal = (data: any) => {
        if (data.type === 'offer') {
          const voiceStore = useVoiceStore.getState();
          if (!voiceStore.peersArray.some(p => p.userId === data.fromUserId)) {
            const guildState = useGuildStore.getState();
            const member = guildState.getMember(data.fromUserId);
            const voiceState = guildState.voiceStates.find(v => v.userId === data.fromUserId);
            voiceStore.addPeer({
              userId: data.fromUserId,
              username: member?.username ?? voiceState?.username ?? `User ${data.fromUserId}`,
              avatarColor: member?.avatarColor ?? '#5865F2',
              isSpeaking: false,
              isMuted: false,
              isDeafened: false,
              isStreaming: false,
            });
          }
        }
        webrtcManager.handleSignal(data.fromUserId, data.type, data.data);
      };
      
      const handleGuildMemberAdd = (data: any) => {
        useGuildStore.getState().addMember(data.guildId, data.member);
      };
      
      const handleChannelCreate = (data: any) => {
        useGuildStore.getState().addChannel(data.guildId, data.channel);
      };
      
      const handlePresenceUpdate = (data: any) => {
        useGuildStore.getState().updateMemberStatus(data.userId, data.status);
      };

      gateway.on(GatewayOpcode.READY, handleReady);
      gateway.on(GatewayOpcode.MESSAGE_CREATE, handleMessageCreate);
      gateway.on(GatewayOpcode.MESSAGE_UPDATE, handleMessageUpdate);
      gateway.on(GatewayOpcode.MESSAGE_DELETE, handleMessageDelete);
      gateway.on(GatewayOpcode.VOICE_STATE_UPDATE, handleVoiceStateUpdate);
      gateway.on(GatewayOpcode.VOICE_LEFT, handleVoiceLeft);
      gateway.on(GatewayOpcode.VOICE_JOINED, handleVoiceJoined);
      gateway.on(GatewayOpcode.VOICE_PEER_SIGNAL, handleVoicePeerSignal);
      gateway.on(GatewayOpcode.PRESENCE_UPDATE, handlePresenceUpdate);
      gateway.on(GatewayOpcode.GUILD_MEMBER_ADD, handleGuildMemberAdd);
      gateway.on(GatewayOpcode.CHANNEL_CREATE, handleChannelCreate);

      return () => {
        gateway.off(GatewayOpcode.READY, handleReady);
        gateway.off(GatewayOpcode.MESSAGE_CREATE, handleMessageCreate);
        gateway.off(GatewayOpcode.MESSAGE_UPDATE, handleMessageUpdate);
        gateway.off(GatewayOpcode.MESSAGE_DELETE, handleMessageDelete);
        gateway.off(GatewayOpcode.VOICE_STATE_UPDATE, handleVoiceStateUpdate);
        gateway.off(GatewayOpcode.VOICE_LEFT, handleVoiceLeft);
        gateway.off(GatewayOpcode.VOICE_JOINED, handleVoiceJoined);
        gateway.off(GatewayOpcode.VOICE_PEER_SIGNAL, handleVoicePeerSignal);
        gateway.off(GatewayOpcode.PRESENCE_UPDATE, handlePresenceUpdate);
        gateway.off(GatewayOpcode.GUILD_MEMBER_ADD, handleGuildMemberAdd);
        gateway.off(GatewayOpcode.CHANNEL_CREATE, handleChannelCreate);
        gateway.disconnect();
      };
    }
  }, [isAuthenticated, token]);

  return (
    <BrowserRouter>
      {!isServerConfigured ? (
        <ServerSetupPage onConfigured={() => setIsServerConfigured(true)} />
      ) : (
        <Routes>
          <Route path="/" element={<Navigate to="/channels/@me" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/channels/:guildId/:channelId?"
            element={
              <ProtectedRoute>
                <GuildPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      )}
    </BrowserRouter>
  );
};

export default App;
