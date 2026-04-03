import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("serverinfo")
  .setDescription("Show information about this server");

export const prefixName = "serverinfo";

function buildEmbed(guild) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL())
    .addFields(
      { name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
      { name: "Members", value: `${guild.memberCount}`, inline: true },
      { name: "Channels", value: `${guild.channels.cache.size}`, inline: true },
      { name: "Roles", value: `${guild.roles.cache.size}`, inline: true },
      { name: "Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
    )
    .setTimestamp();
}

export async function execute(interaction) {
  await interaction.reply({ embeds: [buildEmbed(interaction.guild)] });
}

export async function executePrefix(message) {
  await message.reply({ embeds: [buildEmbed(message.guild)] });
}
