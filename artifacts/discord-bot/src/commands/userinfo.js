import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getData } from "../modules/storage.js";

export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Show information about a user")
  .addUserOption((o) => o.setName("player").setDescription("The user to look up").setRequired(false));

export const prefixName = "userinfo";

async function buildEmbed(guild, user, member) {
  const data = getData();
  const warnCount = data.warns?.[guild.id]?.[user.id]?.length || 0;

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`User Info: ${user.tag}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: "User ID", value: user.id, inline: true },
      { name: "Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`, inline: true },
      member ? { name: "Joined Server", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`, inline: true } : null,
      member ? { name: "Roles", value: member.roles.cache.filter((r) => r.id !== guild.id).map((r) => `<@&${r.id}>`).join(", ") || "None" } : null,
      { name: "Warnings", value: `${warnCount}`, inline: true },
    ).filter(Boolean)
    .setTimestamp();
}

export async function execute(interaction) {
  const user = interaction.options.getUser("player") || interaction.user;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  await interaction.reply({ embeds: [await buildEmbed(interaction.guild, user, member)] });
}

export async function executePrefix(message, args) {
  const targetId = args[0]?.replace(/[<@!>]/g, "") || message.author.id;
  const user = await message.client.users.fetch(targetId).catch(() => message.author);
  const member = await message.guild.members.fetch(user.id).catch(() => null);
  await message.reply({ embeds: [await buildEmbed(message.guild, user, member)] });
}
