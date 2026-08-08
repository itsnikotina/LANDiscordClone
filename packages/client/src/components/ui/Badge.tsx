import React from 'react';

interface BadgeProps {
  color?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md';
}

const Badge: React.FC<BadgeProps> = ({ color = '#ed4245', children, size = 'sm' }) => {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: color,
      color: '#fff',
      borderRadius: '16px',
      fontSize: size === 'sm' ? '12px' : '14px',
      padding: size === 'sm' ? '0 4px' : '2px 6px',
      fontWeight: 'bold',
      lineHeight: 1
    }}>
      {children}
    </span>
  );
};

export default Badge;
