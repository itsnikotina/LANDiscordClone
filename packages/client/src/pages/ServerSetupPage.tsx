import React, { useState, useEffect } from 'react';
import { buildServerConfig, saveServerConfig, ServerConfig } from '../services/serverConfig';
import { applyServerConfig } from '../services/api';

interface ServerSetupPageProps {
  onConfigured: () => void;
}

interface DiscoveredServer { address: string; apiPort: number; wsPort: number; lastSeen: number; }

const ServerSetupPage: React.FC<ServerSetupPageProps> = ({ onConfigured }) => {
  const [host, setHost] = useState('');
  const [error, setError] = useState('');
  const [discovered, setDiscovered] = useState<DiscoveredServer[]>([]);

  // Poll for servers auto-detected via UDP broadcast (Electron only - browsers can't do raw UDP).
  useEffect(() => {
    if (!window.electronAPI?.getDiscoveredServers) return;

    const poll = () => window.electronAPI.getDiscoveredServers().then(setDiscovered).catch(() => {});
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  const connectTo = (config: ServerConfig) => {
    saveServerConfig(config);
    applyServerConfig();
    onConfigured();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) return;

    try {
      connectTo(buildServerConfig(host));
    } catch {
      setError('Endereço inválido. Use algo como 26.0.0.1 ou 26.0.0.1:3001');
    }
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #2b1d42 0%, #1e243b 100%)',
    }}>
      <div style={{
        width: '440px',
        background: '#2b2d31',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        padding: '32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', fontSize: '24px', fontWeight: 'bold' }}>
          <span style={{ marginRight: '8px' }}>🎮</span> Discord P2P
        </div>
        <p style={{ color: '#b5bac1', fontSize: '14px', textAlign: 'center', marginBottom: '24px' }}>
          Digite o endereço IP de quem está hospedando o servidor (peça pra essa pessoa).
          Isso só precisa ser feito uma vez.
        </p>

        {discovered.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#b5bac1', fontWeight: 700, textTransform: 'uppercase' }}>
              Encontrados na rede
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {discovered.map(s => (
                <button
                  key={s.address}
                  type="button"
                  onClick={() => connectTo({ apiUrl: `http://${s.address}:${s.apiPort}`, wsUrl: `ws://${s.address}:${s.wsPort}` })}
                  style={{
                    padding: '10px', background: '#1e1f22', border: '1px solid #3ba55d', borderRadius: '4px',
                    color: '#fff', cursor: 'pointer', textAlign: 'left', fontSize: '14px'
                  }}
                >
                  🟢 {s.address} <span style={{ color: '#b5bac1' }}>— clique para conectar</span>
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center', color: '#72767d', fontSize: '12px', margin: '16px 0' }}>ou digite manualmente</div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#b5bac1', fontWeight: 700, textTransform: 'uppercase' }}>
              IP do Servidor
            </label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="Ex: 26.0.0.1"
              required
              autoFocus
              style={{
                width: '100%', padding: '10px', background: '#1e1f22', border: 'none', borderRadius: '4px', color: '#fff', outline: 'none'
              }}
            />
          </div>

          {error && <div style={{ color: '#ed4245', fontSize: '13px' }}>{error}</div>}

          <button
            type="submit"
            style={{
              padding: '12px', background: '#5865f2', color: '#fff', border: 'none', borderRadius: '4px',
              fontWeight: 600, cursor: 'pointer', fontSize: '15px'
            }}
          >
            Conectar
          </button>
        </form>
      </div>
    </div>
  );
};

export default ServerSetupPage;
