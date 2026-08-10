import React, { useState } from 'react';
import { Icon } from '@iconify/react';
import { useVoiceStore } from '../../store/voiceStore';
import ScreenSourcePicker from '../screenshare/ScreenSourcePicker';

const pillButtonStyle = (active: boolean, danger?: boolean): React.CSSProperties => ({
  width: '44px', height: '44px', borderRadius: '50%', border: 'none', cursor: 'pointer',
  backgroundColor: danger ? 'var(--color-danger)' : active ? 'var(--color-danger)' : '#4f545c',
  color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.2s',
});

const VoiceControls: React.FC = () => {
  const { isMuted, isStreaming, channelId, toggleMute, toggleStream, leaveChannel } = useVoiceStore();
  const [showPicker, setShowPicker] = useState(false);

  if (!channelId) return null;

  const handleStreamClick = () => {
    if (isStreaming) {
      toggleStream();
    } else if (typeof window.electronAPI?.getScreenSources === 'function') {
      setShowPicker(true);
    } else {
      // Browser fallback: the native getDisplayMedia picker handles source selection.
      toggleStream();
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        backgroundColor: '#1e1f22', borderRadius: '28px', padding: '8px 16px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
      }}>
        <button onClick={toggleMute} title={isMuted ? 'Desmutar' : 'Mutar'} style={pillButtonStyle(isMuted)}>
          <Icon icon={isMuted ? 'mdi:microphone-off' : 'solar:microphone-bold'} width={20} />
        </button>

        <button onClick={handleStreamClick} title={isStreaming ? 'Parar Compartilhamento' : 'Compartilhar Tela'} style={{ ...pillButtonStyle(false), backgroundColor: isStreaming ? 'var(--color-success)' : '#4f545c' }}>
          <Icon icon="solar:monitor-bold" width={20} />
        </button>

        <button onClick={leaveChannel} title="Desconectar" style={pillButtonStyle(false, true)}>
          <Icon icon="solar:end-call-bold" width={22} />
        </button>
      </div>

      <ScreenSourcePicker
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(sourceId) => {
          setShowPicker(false);
          toggleStream(sourceId);
        }}
      />
    </div>
  );
};


export default VoiceControls;
