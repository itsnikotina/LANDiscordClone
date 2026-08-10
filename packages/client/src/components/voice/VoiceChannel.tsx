import React, { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { useVoiceStore } from '../../store/voiceStore';
import { useAuthStore } from '../../store/authStore';
import Avatar from '../ui/Avatar';
import VoiceControls from './VoiceControls';
import ScreenShareView from '../screenshare/ScreenShareView';

interface Channel {
  id: string;
  name: string;
}

/** Gives each call tile a distinct moody gradient based on the user's avatar color, like Discord's call tiles. */
const tileBackground = (color: string) => `linear-gradient(160deg, ${color}99, #1e1f22)`;

const VoiceChannel: React.FC<{ channel: Channel; guildId: string }> = ({ channel, guildId }) => {
  const { peersArray, channelId, joinChannel, joinError, isMuted, isSelfSpeaking, screenStream } = useVoiceStore();
  const { user } = useAuthStore();
  const isInVoice = channelId === channel.id;
  // Which participant's screen is being watched full-size ('self' = own preview).
  const [focusedUserId, setFocusedUserId] = useState<number | 'self' | null>(null);

  // Join automatically on entering the channel's view instead of requiring an extra click.
  useEffect(() => {
    if (channelId !== channel.id) {
      joinChannel(channel.id, guildId);
    }
  }, [channel.id, guildId]);

  if (!isInVoice) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <h2 style={{ marginBottom: '16px' }}>{channel.name}</h2>
        {joinError ? (
          <>
            <div style={{ color: 'var(--color-danger)', marginBottom: '16px', textAlign: 'center', maxWidth: '320px' }}>{joinError}</div>
            <button
              onClick={() => joinChannel(channel.id, guildId)}
              style={{
                padding: '12px 24px',
                backgroundColor: 'var(--color-success)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              Tentar novamente
            </button>
          </>
        ) : (
          <div style={{ color: 'var(--color-text-muted)' }}>Conectando...</div>
        )}
      </div>
    );
  }

  const totalParticipants = 1 + peersArray.length;
  const gridCols = Math.ceil(Math.sqrt(totalParticipants));
  const gridRows = Math.ceil(totalParticipants / gridCols);

  // Resolve the focused stream; falls back to grid when it stopped/user left.
  const focusedStream = focusedUserId === 'self'
    ? screenStream
    : focusedUserId !== null
      ? peersArray.find(p => p.userId === focusedUserId)?.stream ?? null
      : null;
  const focusedName = focusedUserId === 'self'
    ? user?.username ?? ''
    : peersArray.find(p => p.userId === focusedUserId)?.username ?? '';

  if (focusedUserId !== null && focusedStream) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0, padding: '16px' }}>
          <ScreenShareView
            stream={focusedStream}
            username={focusedName}
            onClose={() => setFocusedUserId(null)}
          />
        </div>
        <VoiceControls />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        flex: 1,
        padding: '16px',
        display: 'grid',
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gridTemplateRows: `repeat(${gridRows}, 1fr)`,
        gap: '8px',
        overflow: 'hidden'
      }}>
        {user && (
          <div
            onClick={() => { if (screenStream) setFocusedUserId('self'); }}
            title={screenStream ? 'Clique para focar' : undefined}
            style={{
            background: tileBackground(user.avatarColor),
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            cursor: screenStream ? 'pointer' : 'default',
            boxShadow: isSelfSpeaking ? 'inset 0 0 0 3px var(--color-speaking)' : 'none'
          }}>
            {screenStream ? (
              <video
                autoPlay
                playsInline
                muted
                ref={el => { if (el) el.srcObject = screenStream }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
              />
            ) : (
              <Avatar user={user} size={80} showStatus={false} />
            )}
            <div style={{
              position: 'absolute', bottom: '8px', left: '8px',
              backgroundColor: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px',
              fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px'
            }}>
              {user.username}
              {isMuted && <Icon icon="mdi:microphone-off" color="var(--color-danger)" width={14} />}
            </div>
          </div>
        )}

        {peersArray.map(peer => (
            <div
              key={peer.userId}
              onClick={() => { if (peer.stream) setFocusedUserId(peer.userId); }}
              title={peer.stream ? 'Clique para focar' : undefined}
              style={{
              background: tileBackground(peer.avatarColor),
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
              cursor: peer.stream ? 'pointer' : 'default',
              boxShadow: peer.isSpeaking ? 'inset 0 0 0 3px var(--color-speaking)' : 'none'
            }}>
              {peer.stream ? (
                <video 
                  autoPlay 
                  playsInline 
                  muted={false}
                  ref={el => { if (el) el.srcObject = peer.stream! }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
                />
              ) : (
                <Avatar user={peer} size={80} showStatus={false} />
              )}
              
              <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                backgroundColor: 'rgba(0,0,0,0.6)',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {peer.username}
                {peer.isMuted && <Icon icon="mdi:microphone-off" color="var(--color-danger)" width={14} />}
              </div>
            </div>
        ))}
      </div>
      <VoiceControls />
    </div>
  );
};

export default VoiceChannel;
