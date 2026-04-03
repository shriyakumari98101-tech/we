import { EmbedBuilder } from "discord.js";
import { getData, DEFAULT_LOG_CHANNEL_ID, saveData } from "./storage.js";

export function getLogChannelId() {
  try {
    return getData().logChannelId || DEFAULT_LOG_CHANNEL_ID;
  } catch {
    return DEFAULT_LOG_CHANNEL_ID;
  }
}

export async function sendLog(guild, embed) {
  try {
    const channelId = getLogChannelId();
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ embeds: [embed] });

    const data = getData();
    if (!data.recentLogs) data.recentLogs = [];
    data.recentLogs.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: embed.data.title || "Log",
      description: embed.data.description || "",
      color: embed.data.color || 0xffffff,
      guildId: guild.id,
      guildName: guild.name,
      at: Date.now(),
    });
    if (data.recentLogs.length > 200) data.recentLogs.length = 200;
    await saveData();
  } catch (err) {
    console.error("Failed to send log:", err.message);
  }
}

export function modEmbed(color, title, description, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
  if (fields.length) embed.addFields(fields);
  return embed;
}
