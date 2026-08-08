import React, { useState } from 'react';
import { Icon } from '@iconify/react';
import Avatar from '../ui/Avatar';
import { resolveAttachmentUrl } from '../../services/api';

interface User { id: number; username: string; avatarColor: string; status: 'online'|'idle'|'dnd'|'invisible'; radminIp?: string; }
interface Message { id: string; channelId: string; authorId: number; author: User; content: string; attachments: string[]; createdAt: number; editedAt?: number; }

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
const isVideoAttachment = (url: string) => VIDEO_EXTENSIONS.some(ext => url.toLowerCase().endsWith(ext));

interface MessageItemProps {
  message: Message;
  isGrouped: boolean;
  currentUserId: number;
  onDelete: (id: string) => void;
  onEdit: (id: string, newContent: string) => void;
}

const renderMarkdown = (text: string) => {
  let html = text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<span class="md-bold">$1</span>')
    .replace(/\*(.*?)\*/g, '<span class="md-italic">$1</span>')
    .replace(/```([\s\S]*?)```/g, '<span class="md-codeblock">$1</span>')
    .replace(/`(.*?)`/g, '<span class="md-code">$1</span>')
    .replace(/^> (.*?)$/gm, '<div class="md-quote">$1</div>');
  
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
};

const MessageItem: React.FC<MessageItemProps> = ({ message, isGrouped, currentUserId, onDelete, onEdit }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isHovered, setIsHovered] = useState(false);
  
  const isAuthor = message.authorId === currentUserId;

  const handleEditSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onEdit(message.id, editContent);
      setIsEditing(false);
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditContent(message.content);
    }
  };

  const date = new Date(message.createdAt);
  const timeStr = `hoje às ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        padding: isGrouped ? '2px 16px 2px 72px' : '16px 16px 2px 72px',
        position: 'relative',
        backgroundColor: isHovered ? 'var(--color-bg-modifier-hover)' : 'transparent',
      }}
    >
      {!isGrouped && (
        <div style={{ position: 'absolute', left: '16px', top: '16px' }}>
          <Avatar user={message.author} size={40} showStatus={false} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {!isGrouped && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
            <span style={{ color: message.author.avatarColor, fontWeight: 500, fontSize: '16px' }}>
              {message.author.username}
            </span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
              {timeStr}
            </span>
          </div>
        )}

        {isEditing ? (
          <div style={{ marginTop: isGrouped ? 0 : 4 }}>
            <textarea
              autoFocus
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onKeyDown={handleEditSubmit}
              style={{
                width: '100%',
                backgroundColor: 'var(--color-bg-secondary)',
                border: 'none',
                borderRadius: '8px',
                padding: '8px',
                color: 'var(--color-text-normal)',
                resize: 'none',
                fontFamily: 'var(--font-primary)',
                outline: 'none'
              }}
              rows={editContent.split('\n').length || 1}
            />
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              escape to cancel • enter to save
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--color-text-normal)', lineHeight: 1.375, wordBreak: 'break-word' }}>
            {message.content && renderMarkdown(message.content)}
            {message.editedAt && (
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '4px' }}>(editado)</span>
            )}
          </div>
        )}

        {message.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
            {message.attachments.map((url) => (
              isVideoAttachment(url) ? (
                <video key={url} src={resolveAttachmentUrl(url)} controls style={{ maxWidth: '360px', maxHeight: '300px', borderRadius: '8px' }} />
              ) : (
                <img key={url} src={resolveAttachmentUrl(url)} alt="anexo" style={{ maxWidth: '360px', maxHeight: '300px', borderRadius: '8px', objectFit: 'cover' }} />
              )
            ))}
          </div>
        )}
      </div>

      {isHovered && !isEditing && isAuthor && (
        <div style={{
          position: 'absolute',
          top: '-16px',
          right: '16px',
          backgroundColor: 'var(--color-bg-primary)',
          border: '1px solid var(--color-bg-tertiary)',
          borderRadius: '4px',
          display: 'flex',
          overflow: 'hidden',
          boxShadow: '0 0 0 1px rgba(4,4,5,0.15)'
        }}>
          <button
            onClick={() => setIsEditing(true)}
            style={{ background: 'none', border: 'none', padding: '4px 8px', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex' }}
            onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-modifier-hover)'}
            onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Icon icon="solar:pen-bold" width={16} />
          </button>
          <button
            onClick={() => onDelete(message.id)}
            style={{ background: 'none', border: 'none', padding: '4px 8px', cursor: 'pointer', color: 'var(--color-danger)', display: 'flex' }}
            onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-modifier-hover)'}
            onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Icon icon="solar:trash-bin-trash-bold" width={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default MessageItem;
