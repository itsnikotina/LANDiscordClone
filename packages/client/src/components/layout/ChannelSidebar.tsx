import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify/react';
import { useGuildStore } from '../../store/guildStore';
import { useAuthStore } from '../../store/authStore';
import { useVoiceStore } from '../../store/voiceStore';
import { channels as channelsApi } from '../../services/api';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import AudioSettingsModal from '../ui/AudioSettingsModal';
import SpeakingIndicator from '../voice/SpeakingIndicator';

const ChannelSidebar: React.FC = () => {
  const { activeGuildId, guilds, activeChannelId, voiceStates, getMember, getChannel } = useGuildStore();
  const { user } = useAuthStore();
  const {
    channelId: voiceChannelId, guildId: voiceGuildId, leaveChannel,
    isMuted, isDeafened, isStreaming, isSelfSpeaking, peersArray, toggleMute, toggleDeafen, toggleStream
  } = useVoiceStore();
  const navigate = useNavigate();
  const [creatingInCategoryId, setCreatingInCategoryId] = useState<string | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'TEXT' | 'VOICE'>('TEXT');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const guild = guilds.find(g => g.id === activeGuildId);

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
      return next;
    });
  };

  const copyInviteCode = () => {
    if (!guild) return;
    navigator.clipboard.writeText(guild.inviteCode);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guild || !newChannelName.trim() || !creatingInCategoryId) return;

    try {
      const channel = await channelsApi.create(guild.id, newChannelName.trim(), newChannelType, creatingInCategoryId);
      useGuildStore.getState().addChannel(guild.id, channel);
      setCreatingInCategoryId(null);
      setNewChannelName('');
      setNewChannelType('TEXT');
    } catch (error: any) {
      console.error('Failed to create channel:', error);
      alert('Erro ao criar o canal: ' + (error.response?.data?.error || error.message));
    }
  };

  if (!guild && activeGuildId !== '@me') return <div style={{ width: '240px', backgroundColor: 'var(--color-bg-secondary)' }} />;

  return (
    <div style={{ width: '240px', height: '100vh', backgroundColor: 'var(--color-bg-secondary)', display: 'flex', flexDirection: 'column' }}>
      {guild ? (
        <>
          <div style={{
            height: '48px', padding: '0 16px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-bg-tertiary)',
            backgroundColor: '#27292c', cursor: 'pointer', fontWeight: 600
          }}
          onClick={() => setShowInviteModal(true)}
          >
            <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{guild.name}</div>
            <Icon icon="solar:user-plus-bold" width={16} color="var(--color-text-muted)" />
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {guild.categories?.map(category => {
              const isCollapsed = collapsedCategories.has(category.id);
              return (
              <div key={category.id} style={{ marginBottom: '16px' }}>
                <div
                  onClick={() => toggleCategory(category.id)}
                  style={{
                    display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)',
                    textTransform: 'uppercase', padding: '4px 8px', cursor: 'pointer'
                  }}
                >
                  <Icon
                    icon="solar:alt-arrow-down-bold"
                    width={12}
                    style={{ marginRight: '4px', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }}
                  />
                  {category.name}
                  <button
                    onClick={(e) => { e.stopPropagation(); setCreatingInCategoryId(category.id); }}
                    title="Criar canal"
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex' }}
                  >
                    <Icon icon="solar:add-circle-bold" width={16} />
                  </button>
                </div>
                {!isCollapsed && category.channels?.map(channel => (
                  <React.Fragment key={channel.id}>
                    <div
                      onClick={() => navigate(`/channels/${guild.id}/${channel.id}`)}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '0 8px', height: '32px', borderRadius: '4px', cursor: 'pointer',
                        color: activeChannelId === channel.id ? 'var(--color-text-normal)' : 'var(--color-text-muted)',
                        backgroundColor: activeChannelId === channel.id ? 'var(--color-bg-modifier-selected)' : 'transparent',
                        marginBottom: '2px'
                      }}
                      onMouseOver={e => { if (activeChannelId !== channel.id) e.currentTarget.style.backgroundColor = 'var(--color-bg-modifier-hover)' }}
                      onMouseOut={e => { if (activeChannelId !== channel.id) e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <span style={{ marginRight: '8px', display: 'flex' }}>
                        {channel.type === 'VOICE' ? <Icon icon="solar:volume-loud-bold" width={16} /> : '#'}
                      </span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{channel.name}</span>
                    </div>
                    {channel.type === 'VOICE' && voiceStates.filter(v => v.channelId === channel.id).map(vs => {
                      const member = getMember(vs.userId);
                      const displayName = member?.username ?? vs.username ?? `Usuário ${vs.userId}`;
                      const speaking = vs.userId === user?.id
                        ? isSelfSpeaking
                        : (peersArray.find(p => p.userId === vs.userId)?.isSpeaking ?? false);
                      return (
                        <div key={vs.userId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 8px 2px 32px', marginBottom: '2px' }}>
                          <SpeakingIndicator isSpeaking={speaking} size="sm">
                            <Avatar user={{ username: displayName, avatarColor: member?.avatarColor ?? '#5865F2' }} size={20} showStatus={false} />
                          </SpeakingIndicator>
                          <span style={{ flex: 1, fontSize: '13px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {displayName}
                          </span>
                          {/* SQLite delivers 0/1 numbers; `0 &&` would render a literal "0" */}
                          {!!vs.muted && <Icon icon="mdi:microphone-off" color="var(--color-danger)" width={14} />}
                          {!!vs.streaming && <Badge color="#ed4245">AO VIVO</Badge>}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, padding: '16px' }}>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>
            Mensagens Diretas
          </div>
        </div>
      )}

      {voiceChannelId && (() => {
        const callChannel = getChannel(voiceChannelId);
        const callGuild = guilds.find(g => g.id === voiceGuildId);
        return (
          <div style={{ backgroundColor: '#232428', borderBottom: '1px solid var(--color-bg-tertiary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 8px 4px 8px' }}>
              <Icon icon="solar:soundwave-bold" width={18} color="var(--color-success)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-success)' }}>Voz conectada</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {callChannel?.name ?? 'canal'} / {callGuild?.name ?? 'servidor'}
                </div>
              </div>
              <button onClick={leaveChannel} title="Desconectar" style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', display: 'flex' }}>
                <Icon icon="solar:end-call-bold" width={20} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: '4px', padding: '0 8px 8px 8px' }}>
              <button onClick={toggleMute} style={{ flex: 1, background: 'var(--color-bg-tertiary)', border: 'none', borderRadius: '4px', padding: '6px', color: isMuted ? 'var(--color-danger)' : 'var(--color-text-normal)', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                <Icon icon={isMuted ? 'mdi:microphone-off' : 'solar:microphone-bold'} width={18} />
              </button>
              <button onClick={toggleDeafen} style={{ flex: 1, background: 'var(--color-bg-tertiary)', border: 'none', borderRadius: '4px', padding: '6px', color: isDeafened ? 'var(--color-danger)' : 'var(--color-text-normal)', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                <Icon icon={isDeafened ? 'mdi:headset-off' : 'solar:headphones-round-sound-bold'} width={18} />
              </button>
              <button onClick={toggleStream} style={{ flex: 1, background: isStreaming ? 'var(--color-success)' : 'var(--color-bg-tertiary)', border: 'none', borderRadius: '4px', padding: '6px', color: 'var(--color-text-normal)', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                <Icon icon="solar:monitor-bold" width={18} />
              </button>
            </div>
          </div>
        );
      })()}

      <div style={{ height: '52px', backgroundColor: 'var(--color-bg-accent)', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, padding: '4px', borderRadius: '4px', cursor: 'pointer' }}>
            <SpeakingIndicator isSpeaking={isSelfSpeaking} size="sm">
              <Avatar user={user} size={32} />
            </SpeakingIndicator>
            <div style={{ marginLeft: '8px', minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.username}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Online</div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={toggleMute} style={{ background: 'none', border: 'none', color: isMuted ? 'var(--color-danger)' : 'var(--color-text-muted)', padding: '4px', cursor: 'pointer', borderRadius: '4px', display: 'flex' }}>
            <Icon icon={isMuted ? 'mdi:microphone-off' : 'solar:microphone-bold'} width={18} />
          </button>
          <button onClick={toggleDeafen} style={{ background: 'none', border: 'none', color: isDeafened ? 'var(--color-danger)' : 'var(--color-text-muted)', padding: '4px', cursor: 'pointer', borderRadius: '4px', display: 'flex' }}>
            <Icon icon={isDeafened ? 'mdi:headset-off' : 'solar:headphones-round-sound-bold'} width={18} />
          </button>
          <button
            onClick={() => setShowAudioSettings(true)}
            title="Configurações de áudio"
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', padding: '4px', cursor: 'pointer', borderRadius: '4px', display: 'flex' }}>
            <Icon icon="solar:settings-bold" width={18} />
          </button>
          <button 
            onClick={() => {
              useAuthStore.getState().logout();
              window.location.href = '/login';
            }} 
            title="Sair"
            style={{ background: 'none', border: 'none', color: 'var(--color-danger)', padding: '4px', cursor: 'pointer', borderRadius: '4px', display: 'flex' }}>
            <Icon icon="solar:logout-3-bold" width={18} />
          </button>
        </div>
      </div>

      <AudioSettingsModal isOpen={showAudioSettings} onClose={() => setShowAudioSettings(false)} />

      <Modal isOpen={!!creatingInCategoryId} onClose={() => setCreatingInCategoryId(null)} title="Criar Canal">
        <form onSubmit={handleCreateChannel} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#b5bac1', fontWeight: 700, textTransform: 'uppercase' }}>
              Nome do Canal
            </label>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              required
              autoFocus
              style={{ width: '100%', padding: '10px', background: '#1e1f22', border: 'none', borderRadius: '4px', color: '#fff', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
              <input type="radio" checked={newChannelType === 'TEXT'} onChange={() => setNewChannelType('TEXT')} />
              Texto
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
              <input type="radio" checked={newChannelType === 'VOICE'} onChange={() => setNewChannelType('VOICE')} />
              Voz
            </label>
          </div>
          <button
            type="submit"
            style={{ padding: '10px', backgroundColor: 'var(--color-brand)', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
          >
            Criar Canal
          </button>
        </form>
      </Modal>

      {guild && (
        <Modal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} title={`Convidar para ${guild.name}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', margin: 0 }}>
              Envie este código para seus amigos. Eles usam "Entrar com Convite" na barra de servidores.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                readOnly
                value={guild.inviteCode}
                style={{ flex: 1, padding: '10px', background: '#1e1f22', border: 'none', borderRadius: '4px', color: '#fff', outline: 'none', fontFamily: 'var(--font-mono)' }}
              />
              <button
                onClick={copyInviteCode}
                style={{ padding: '10px 16px', backgroundColor: 'var(--color-brand)', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
              >
                {inviteCopied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ChannelSidebar;

