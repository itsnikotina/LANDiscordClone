import React, { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import Modal from '../ui/Modal';

interface ScreenSource {
  id: string;
  name: string;
  type: 'screen' | 'window';
  thumbnail: string;
}

interface ScreenSourcePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sourceId: string) => void;
}

const SourceGrid: React.FC<{
  sources: ScreenSource[];
  onSelect: (sourceId: string) => void;
}> = ({ sources, onSelect }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
    {sources.map(source => (
      <button
        key={source.id}
        onClick={() => onSelect(source.id)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          padding: '8px',
          backgroundColor: 'var(--color-bg-tertiary, #202225)',
          border: '1px solid transparent',
          borderRadius: '8px',
          cursor: 'pointer',
          textAlign: 'left'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary, #5865f2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
      >
        <img
          src={source.thumbnail}
          alt={source.name}
          style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: '4px', backgroundColor: '#000' }}
        />
        <span style={{
          color: 'var(--color-text-primary, #dcddde)',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {source.name}
        </span>
      </button>
    ))}
  </div>
);

const ScreenSourcePicker: React.FC<ScreenSourcePickerProps> = ({ isOpen, onClose, onSelect }) => {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    window.electronAPI?.getScreenSources().then(list => {
      if (!cancelled) {
        setSources(list);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  const screens = sources.filter(s => s.type === 'screen');
  const windows = sources.filter(s => s.type === 'window');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Compartilhar tela">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '60vh', overflowY: 'auto' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted, #96989d)', fontSize: '13px' }}>
            <Icon icon="svg-spinners:180-ring" width={16} />
            Carregando fontes...
          </div>
        )}
        {!loading && screens.length > 0 && (
          <div>
            <div style={{ color: 'var(--color-text-muted, #96989d)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
              Telas
            </div>
            <SourceGrid sources={screens} onSelect={onSelect} />
          </div>
        )}
        {!loading && windows.length > 0 && (
          <div>
            <div style={{ color: 'var(--color-text-muted, #96989d)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
              Janelas
            </div>
            <SourceGrid sources={windows} onSelect={onSelect} />
          </div>
        )}
        {!loading && sources.length === 0 && (
          <div style={{ color: 'var(--color-text-muted, #96989d)', fontSize: '13px' }}>
            Nenhuma fonte de captura encontrada.
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ScreenSourcePicker;
