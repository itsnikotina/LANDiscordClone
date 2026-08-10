import React, { useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';

interface ScreenShareViewProps {
  stream: MediaStream;
  username: string;
  onClose?: () => void;
  muted?: boolean;
}

const ScreenShareView: React.FC<ScreenShareViewProps> = ({ stream, username, onClose, muted }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
      />
      
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        opacity: 0,
        transition: 'opacity 0.2s',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '16px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.5) 100%)'
      }}
      onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
      onMouseOut={(e) => e.currentTarget.style.opacity = '0'}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {onClose && (
            <button onClick={onClose} style={{ background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', padding: '8px', borderRadius: '4px', cursor: 'pointer', display: 'flex' }}>
              <Icon icon="solar:close-circle-bold" width={18} />
            </button>
          )}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', color: '#fff', fontSize: '14px' }}>
            {username}
          </div>
          <button onClick={toggleFullscreen} style={{ background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', padding: '8px', borderRadius: '4px', cursor: 'pointer', display: 'flex' }}>
            <Icon icon="solar:full-screen-square-bold" width={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScreenShareView;
