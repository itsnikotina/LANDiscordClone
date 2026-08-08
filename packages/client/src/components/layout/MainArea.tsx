import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { useGuildStore } from '../../store/guildStore';
import { useAuthStore } from '../../store/authStore';
import MessageList from '../chat/MessageList';
import MessageInput, { MessageInputHandle } from '../chat/MessageInput';
import VoiceChannel from '../voice/VoiceChannel';

const MainArea: React.FC = () => {
  const { activeGuildId, activeChannelId, guilds, messages } = useGuildStore();
  const { user } = useAuthStore();
  const messageInputRef = useRef<MessageInputHandle>(null);
  const dragCounter = useRef(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const guild = guilds.find(g => g.id === activeGuildId);
  const channel = (guild?.categories || []).flatMap(c => c.channels || []).find(ch => ch.id === activeChannelId);

  // Load the channel's message history - it's otherwise only populated by messages sent/received live this session.
  useEffect(() => {
    if (channel && channel.type === 'TEXT') {
      useGuildStore.getState().fetchMessages(channel.id);
    }
  }, [channel?.id]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounter.current++;
    setIsDraggingFile(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) messageInputRef.current?.addFiles(files);
  };

  if (!channel) {
    return (
      <div style={{ flex: 1, backgroundColor: 'var(--color-bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
        <div style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Selecione um canal</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, backgroundColor: 'var(--color-bg-primary)', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{
        height: '48px', borderBottom: '1px solid var(--color-bg-tertiary)', padding: '0 16px', display: 'flex', alignItems: 'center', flexShrink: 0
      }}>
        <span style={{ fontSize: '24px', color: 'var(--color-text-muted)', marginRight: '8px', display: 'flex' }}>
          {channel.type === 'VOICE' ? <Icon icon="solar:volume-loud-bold" width={22} /> : '#'}
        </span>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>{channel.name}</span>
        {channel.topic && (
          <>
            <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--color-bg-tertiary)', margin: '0 16px' }} />
            <span style={{ color: 'var(--color-text-muted)', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {channel.topic}
            </span>
          </>
        )}
      </div>

      {channel.type === 'TEXT' && (
        <div
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <MessageList channelId={channel.id} messages={messages[channel.id] || []} currentUserId={user?.id || 0} />
          <MessageInput ref={messageInputRef} channelId={channel.id} channelName={channel.name} />

          {isDraggingFile && (
            <div style={{
              position: 'absolute', inset: 0, backgroundColor: 'rgba(88,101,242,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', zIndex: 10
            }}>
              <div style={{
                border: '3px dashed var(--color-brand)', borderRadius: '16px', padding: '32px 56px',
                backgroundColor: 'var(--color-bg-secondary)', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '8px'
              }}>
                <Icon icon="solar:gallery-add-bold" width={48} color="var(--color-brand)" />
                <div style={{ fontWeight: 700, fontSize: '18px' }}>Enviar para #{channel.name}</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Solte os arquivos aqui</div>
              </div>
            </div>
          )}
        </div>
      )}

      {channel.type === 'VOICE' && (
        <VoiceChannel channel={channel} guildId={activeGuildId ?? ''} />
      )}

      {channel.type === 'FORUM' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
          Fórum em breve
        </div>
      )}
    </div>
  );
};

export default MainArea;
