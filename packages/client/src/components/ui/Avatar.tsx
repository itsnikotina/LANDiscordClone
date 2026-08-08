import React from 'react';

interface AvatarProps {
  user: { username: string; avatarColor: string; status?: string };
  size?: number;
  showStatus?: boolean;
}

const Avatar: React.FC<AvatarProps> = ({ user, size = 40, showStatus = true }) => {
  const firstLetter = user.username ? user.username.charAt(0).toUpperCase() : '?';
  
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online': return 'var(--color-status-online)';
      case 'idle': return 'var(--color-status-idle)';
      case 'dnd': return 'var(--color-status-dnd)';
      case 'invisible': return 'var(--color-status-invisible)';
      default: return 'var(--color-status-invisible)';
    }
  };

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      backgroundColor: user.avatarColor || '#5865f2',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontWeight: 'bold',
      fontSize: size * 0.4,
      position: 'relative',
      flexShrink: 0
    }}>
      {firstLetter}
      {showStatus && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 12,
          height: 12,
          borderRadius: '50%',
          backgroundColor: getStatusColor(user.status),
          border: '2px solid var(--color-bg-primary)'
        }} />
      )}
    </div>
  );
};

export default Avatar;
