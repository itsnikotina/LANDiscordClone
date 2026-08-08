import React from 'react';
import { useGuildStore } from '../../store/guildStore';
import Avatar from '../ui/Avatar';

const ONLINE_STATUSES = ['online', 'idle', 'dnd'];

const MemberList: React.FC = () => {
  const { activeGuildId, guilds } = useGuildStore();
  const guild = guilds.find(g => g.id === activeGuildId);

  if (!guild) return <div style={{ width: '240px', backgroundColor: 'var(--color-bg-secondary)' }} />;

  const members = [...(guild.members ?? [])].sort((a, b) => a.username.localeCompare(b.username));
  const online = members.filter(m => ONLINE_STATUSES.includes(m.status));
  const offline = members.filter(m => !ONLINE_STATUSES.includes(m.status));

  const renderGroup = (label: string, group: typeof members, dimmed: boolean) => (
    group.length === 0 ? null : (
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)',
          textTransform: 'uppercase', padding: '4px 8px'
        }}>
          {label} — {group.length}
        </div>
        {group.map(member => (
          <div
            key={member.userId}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 8px',
              borderRadius: '4px', cursor: 'pointer', opacity: dimmed ? 0.5 : 1
            }}
            onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-modifier-hover)'}
            onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Avatar user={{ username: member.username, avatarColor: member.avatarColor, status: member.status }} size={32} />
            <span style={{
              fontSize: '14px', color: 'var(--color-text-normal)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
              {member.username}
            </span>
          </div>
        ))}
      </div>
    )
  );

  return (
    <div style={{ width: '240px', height: '100vh', backgroundColor: 'var(--color-bg-secondary)', overflowY: 'auto', padding: '16px 0' }}>
      {renderGroup('Online', online, false)}
      {renderGroup('Offline', offline, true)}
    </div>
  );
};

export default MemberList;
