import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Icon } from '@iconify/react';
import { useGuildStore } from '../../store/guildStore';
import { messages as messagesApi, MAX_ATTACHMENT_SIZE } from '../../services/api';

interface MessageInputProps {
  channelId: string;
  channelName: string;
}

export interface MessageInputHandle {
  addFiles: (files: File[]) => void;
}

const EMOJIS = ['😀','😂','🎉','❤️','👍','🔥','💯','😭','🤔','👀'];

const isAllowedAttachment = (file: File) => file.type.startsWith('image/') || file.type.startsWith('video/');

const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(({ channelId, channelName }, ref) => {
  const [content, setContent] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Small thumbnail previews for pending attachments, regenerated whenever the file list changes.
  useEffect(() => {
    const next = pendingFiles.map(file => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach(p => URL.revokeObjectURL(p.url));
  }, [pendingFiles]);

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    const rejected = files.filter(f => !isAllowedAttachment(f) || f.size > MAX_ATTACHMENT_SIZE);
    if (rejected.length > 0) {
      setError(`Alguns arquivos foram ignorados (apenas imagens/vídeos até ${MAX_ATTACHMENT_SIZE / (1024 * 1024)}MB são permitidos)`);
    } else {
      setError(null);
    }

    const accepted = files.filter(f => isAllowedAttachment(f) && f.size <= MAX_ATTACHMENT_SIZE);
    setPendingFiles(prev => [...prev, ...accepted]);
  };

  useImperativeHandle(ref, () => ({ addFiles }));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    addFiles(files);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = content.trim();
    if (isUploading || (!trimmed && pendingFiles.length === 0)) return;

    setIsUploading(true);
    setError(null);
    try {
      const uploaded = await Promise.all(pendingFiles.map(file => messagesApi.upload(channelId, file)));
      const msg = await messagesApi.send(channelId, trimmed, uploaded.map(u => u.url));
      useGuildStore.getState().addMessage(msg);
      setContent('');
      setPendingFiles([]);
      setShowEmojis(false);
    } catch (err) {
      console.error('[MessageInput] Failed to send message:', err);
      setError('Falha ao enviar a mensagem. Tente novamente.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const insertEmoji = (emoji: string) => {
    setContent(prev => prev + emoji);
    setShowEmojis(false);
    textareaRef.current?.focus();
  };

  return (
    <div style={{ padding: '0 16px 24px 16px' }}>
      {previews.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          {previews.map(({ file, url }, index) => (
            <div key={`${file.name}-${index}`} style={{
              position: 'relative', width: '80px', height: '80px',
              borderRadius: '8px', overflow: 'hidden', flexShrink: 0,
              backgroundColor: 'var(--color-bg-secondary)'
            }}>
              {file.type.startsWith('video/') ? (
                <video src={url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <img src={url} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              <button
                onClick={() => removePendingFile(index)}
                title="Remover"
                style={{
                  position: 'absolute', top: '4px', right: '4px',
                  background: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: '4px',
                  padding: '2px', cursor: 'pointer', color: '#fff', display: 'flex'
                }}
              >
                <Icon icon="solar:trash-bin-trash-bold" width={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--color-danger)', fontSize: '12px', marginBottom: '4px' }}>{error}</div>
      )}

      <div style={{
        backgroundColor: '#383a40',
        borderRadius: '8px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        position: 'relative'
      }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ background: 'none', border: 'none', color: '#b5bac1', fontSize: '20px', cursor: 'pointer', padding: '4px', marginRight: '8px', display: 'flex' }}
          title="Adicionar arquivo"
        >
          <Icon icon="solar:paperclip-bold" width={22} />
        </button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Conversar em #${channelName}`}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            color: 'var(--color-text-normal)',
            resize: 'none',
            outline: 'none',
            fontFamily: 'var(--font-primary)',
            fontSize: '16px',
            lineHeight: 1.375,
            padding: '4px 0',
            minHeight: '24px',
            maxHeight: '50vh'
          }}
          rows={content.split('\n').length || 1}
        />

        <div style={{ display: 'flex', alignItems: 'center' }}>
          {content.length > 1800 && (
            <span style={{ color: content.length > 2000 ? 'var(--color-danger)' : 'var(--color-status-idle)', fontSize: '12px', marginRight: '8px' }}>
              {2000 - content.length}
            </span>
          )}
          
          <button
            onClick={() => setShowEmojis(!showEmojis)}
            style={{ background: 'none', border: 'none', color: '#b5bac1', fontSize: '20px', cursor: 'pointer', padding: '4px', display: 'flex' }}
          >
            <Icon icon="solar:emoji-funny-circle-bold" width={22} />
          </button>
        </div>

        {showEmojis && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: '8px',
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: '8px',
            padding: '8px',
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}>
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => insertEmoji(emoji)}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', padding: '4px' }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-modifier-hover)'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

MessageInput.displayName = 'MessageInput';

export default MessageInput;

