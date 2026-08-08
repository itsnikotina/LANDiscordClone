import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useGuildStore } from '../store/guildStore';
import GuildSidebar from '../components/layout/GuildSidebar';
import ChannelSidebar from '../components/layout/ChannelSidebar';
import MainArea from '../components/layout/MainArea';
import MemberList from '../components/layout/MemberList';

const GuildPage: React.FC = () => {
  const { guildId, channelId } = useParams<{ guildId: string; channelId?: string }>();
  const { setActiveGuild, setActiveChannel } = useGuildStore();

  useEffect(() => {
    if (guildId) setActiveGuild(guildId);
  }, [guildId, setActiveGuild]);

  useEffect(() => {
    if (channelId) setActiveChannel(channelId);
  }, [channelId, setActiveChannel]);

  return (
    <div className="app-layout">
      <GuildSidebar />
      <ChannelSidebar />
      <MainArea />
      <MemberList />
    </div>
  );
};

export default GuildPage;
