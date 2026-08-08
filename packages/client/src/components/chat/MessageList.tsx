import React, { useEffect, useRef } from 'react';
import MessageItem from './MessageItem';
import { messages as messagesApi } from '../../services/api';
import { useGuildStore } from '../../store/guildStore';

interface User { id: number; username: string; avatarColor: string; status: 'online'|'idle'|'dnd'|'invisible'; radminIp?: string; }
interface Message { id: string; channelId: string; authorId: number; author: User; content: string; attachments: string[]; createdAt: number; editedAt?: number; }

interface MessageListProps {
  channelId: string;
  messages: Message[];
  currentUserId: number;
}

const MessageList: React.FC<MessageListProps> = ({ channelId, messages, currentUserId }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleDelete = async (id: string) => {
    try {
      await messagesApi.delete(channelId, id);
      useGuildStore.getState().deleteMessage(channelId, id);
    } catch (err) {
      console.error('[MessageList] Failed to delete message:', err);
    }
  };

  const handleEdit = async (id: string, newContent: string) => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    try {
      await messagesApi.edit(channelId, id, trimmed);
      useGuildStore.getState().editMessage(channelId, id, trimmed);
    } catch (err) {
      console.error('[MessageList] Failed to edit message:', err);
    }
  };

  return (
    <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px', marginTop: 'auto' }}>
        <h1 style={{ margin: '16px 0 8px 0', fontSize: '32px' }}>Bem-vindo ao canal!</h1>
        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>Este é o começo do canal.</p>
      </div>

      {messages.map((msg, index) => {
        const prevMsg = messages[index - 1];
        // Group if same author and within 7 minutes
        const isGrouped = prevMsg && 
          prevMsg.authorId === msg.authorId && 
          (msg.createdAt - prevMsg.createdAt) < 7 * 60 * 1000;

        return (
          <MessageItem
            key={msg.id}
            message={msg}
            isGrouped={!!isGrouped}
            currentUserId={currentUserId}
            onDelete={handleDelete}
            onEdit={handleEdit}
          />
        );
      })}
      <div style={{ height: '16px' }} />
    </div>
  );
};

export default MessageList;
