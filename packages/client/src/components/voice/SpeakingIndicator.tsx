import React from 'react';

interface SpeakingIndicatorProps {
  isSpeaking: boolean;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const SpeakingIndicator: React.FC<SpeakingIndicatorProps> = ({ isSpeaking, size = 'md', children }) => {
  return (
    <div style={{
      borderRadius: '50%',
      border: isSpeaking ? '2px solid var(--color-speaking)' : '2px solid transparent',
      animation: isSpeaking ? 'speaking-pulse 1.5s infinite' : 'none',
      padding: '2px',
      display: 'inline-flex'
    }}>
      {children}
    </div>
  );
};

export default SpeakingIndicator;
