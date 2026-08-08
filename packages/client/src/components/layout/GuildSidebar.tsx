import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGuildStore } from '../../store/guildStore';
import Modal from '../ui/Modal';

const GuildSidebar: React.FC = () => {
  const { guilds, activeGuildId } = useGuildStore();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [newGuildName, setNewGuildName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCreateGuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuildName.trim()) return;
    setError(null);
    
    try {
      const { guilds: guildsApi } = await import('../../services/api');
      const newGuild = await guildsApi.create(newGuildName.trim());
      
      // Update local store to include the new guild
      const currentGuilds = useGuildStore.getState().guilds;
      useGuildStore.getState().setGuilds([...currentGuilds, newGuild]);
      
      setIsModalOpen(false);
      setNewGuildName('');
      navigate(`/channels/${newGuild.id}`);
    } catch (error: any) {
      console.error('Failed to create guild:', error);
      setError(error.response?.data?.details || error.response?.data?.error || error.message);
    }
  };

  const handleJoinGuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setError(null);

    try {
      const { guilds: guildsApi } = await import('../../services/api');
      const guild = await guildsApi.join(inviteCode.trim());

      const currentGuilds = useGuildStore.getState().guilds;
      if (!currentGuilds.some(g => g.id === guild.id)) {
        useGuildStore.getState().setGuilds([...currentGuilds, guild]);
      }

      setIsModalOpen(false);
      setInviteCode('');
      navigate(`/channels/${guild.id}`);
    } catch (error: any) {
      console.error('Failed to join guild:', error);
      setError(error.response?.data?.error || error.message);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setError(null);
    setMode('create');
  };

  return (
    <div style={{
      width: '72px',
      height: '100vh',
      backgroundColor: 'var(--color-bg-tertiary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '12px',
      overflowY: 'auto',
      gap: '8px'
    }}>
      <div
        onClick={() => navigate('/channels/@me')}
        title="Início"
        style={{
          width: '48px', height: '48px',
          backgroundColor: activeGuildId === '@me' ? 'var(--color-brand)' : 'var(--color-bg-primary)',
          borderRadius: activeGuildId === '@me' ? '16px' : '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '24px', cursor: 'pointer',
          transition: 'all 0.2s',
          position: 'relative'
        }}
      >
        🏠
        {activeGuildId === '@me' && (
          <div style={{ position: 'absolute', left: '-12px', width: '4px', height: '40px', backgroundColor: '#fff', borderRadius: '0 4px 4px 0' }} />
        )}
      </div>

      <div style={{ width: '32px', height: '2px', backgroundColor: '#35373c', borderRadius: '1px' }} />

      {guilds.map(guild => (
        <div
          key={guild.id}
          onClick={() => navigate(`/channels/${guild.id}`)}
          title={guild.name}
          style={{
            width: '48px', height: '48px',
            backgroundColor: guild.iconColor,
            borderRadius: activeGuildId === guild.id ? '16px' : '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer',
            transition: 'all 0.2s',
            position: 'relative'
          }}
          onMouseOver={(e) => { if(activeGuildId !== guild.id) e.currentTarget.style.borderRadius = '16px'; }}
          onMouseOut={(e) => { if(activeGuildId !== guild.id) e.currentTarget.style.borderRadius = '50%'; }}
        >
          {guild.name.charAt(0).toUpperCase()}
          {activeGuildId === guild.id && (
            <div style={{ position: 'absolute', left: '-12px', width: '4px', height: '40px', backgroundColor: '#fff', borderRadius: '0 4px 4px 0' }} />
          )}
        </div>
      ))}

      <div
        onClick={() => { setMode('create'); setIsModalOpen(true); }}
        title="Adicionar um Servidor"
        style={{
          width: '48px', height: '48px',
          backgroundColor: 'var(--color-bg-primary)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-success)', fontSize: '24px', cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onMouseOver={(e) => { e.currentTarget.style.borderRadius = '16px'; e.currentTarget.style.backgroundColor = 'var(--color-success)'; e.currentTarget.style.color = '#fff'; }}
        onMouseOut={(e) => { e.currentTarget.style.borderRadius = '50%'; e.currentTarget.style.backgroundColor = 'var(--color-bg-primary)'; e.currentTarget.style.color = 'var(--color-success)'; }}
      >
        +
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={mode === 'create' ? 'Criar um Servidor' : 'Entrar em um Servidor'}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => { setMode('create'); setError(null); }}
            style={{
              flex: 1, padding: '8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 600,
              backgroundColor: mode === 'create' ? '#5865f2' : '#1e1f22', color: '#fff'
            }}
          >
            Criar
          </button>
          <button
            type="button"
            onClick={() => { setMode('join'); setError(null); }}
            style={{
              flex: 1, padding: '8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 600,
              backgroundColor: mode === 'join' ? '#5865f2' : '#1e1f22', color: '#fff'
            }}
          >
            Entrar com Convite
          </button>
        </div>

        {error && (
          <div style={{ color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>{error}</div>
        )}

        {mode === 'create' ? (
          <form onSubmit={handleCreateGuild} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#b5bac1', fontWeight: 700, textTransform: 'uppercase' }}>
                Nome do Servidor
              </label>
              <input
                type="text"
                value={newGuildName}
                onChange={(e) => setNewGuildName(e.target.value)}
                required
                autoFocus
                style={{
                  width: '100%', padding: '10px', background: '#1e1f22', border: 'none', borderRadius: '4px', color: '#fff', outline: 'none'
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '8px 16px' }}>
                Cancelar
              </button>
              <button type="submit" style={{ background: '#5865f2', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>
                Criar
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleJoinGuild} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#b5bac1', fontWeight: 700, textTransform: 'uppercase' }}>
                Código de Convite
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Ex: a1b2c3d4"
                required
                autoFocus
                style={{
                  width: '100%', padding: '10px', background: '#1e1f22', border: 'none', borderRadius: '4px', color: '#fff', outline: 'none'
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '8px 16px' }}>
                Cancelar
              </button>
              <button type="submit" style={{ background: '#5865f2', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>
                Entrar
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default GuildSidebar;
