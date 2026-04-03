import { SlashCommandBuilder } from "discord.js";
import { getData } from "../modules/storage.js";
import { getBaseUrl } from "../modules/urlHelper.js";

export const data = new SlashCommandBuilder()
  .setName("notifyall")
  .setDescription("DM all registered web panel users their credentials and panel link (owner only)");

export async function execute(interaction) {
  if (!interaction.guild || interaction.guild.ownerId !== interaction.user.id) {
    await interaction.reply({
      content: "Only the server owner can use this command.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const botData = getData();
  const users = Object.values(botData.users || {});

  if (users.length === 0) {
    await interaction.editReply({ content: "No registered web panel users found." });
    return;
  }

  const base = getBaseUrl();
  const loginUrl = `${base}/login`;
  const panelUrl = `${base}/panel`;
  const changeUrl = `${base}/changepassword`;

  let sent = 0;
  let failed = 0;
  const failedUsers = [];

  for (const user of users) {
    try {
      const discordUser = await interaction.client.users.fetch(user.discordId).catch(() => null);
      if (!discordUser) { failed++; failedUsers.push(user.username); continue; }

      const pwLine = user.plainPassword
        ? `**Password:** \`${user.plainPassword}\``
        : `**Password:** *(not stored — use /changepassword to reset)*`;

      const msg =
        `🛡️ **SEB Security — Web Panel Credentials**\n\n` +
        `Here are your current login details for the SEB Security control panel.\n\n` +
        `**Username:** \`${user.username}\`\n` +
        `${pwLine}\n\n` +
        `**🔐 Login:** ${loginUrl}\n` +
        `**📊 Panel:** ${panelUrl}\n` +
        `**🔑 Change Password:** ${changeUrl}\n\n` +
        `Do not share these credentials with anyone. If you didn't request this message, contact a server admin.`;

      await discordUser.send(msg);
      sent++;
    } catch {
      failed++;
      failedUsers.push(user.username);
    }
  }

  let reply = `📨 **Notification complete.**\n\n✅ Sent: **${sent}** users\n❌ Failed: **${failed}** users`;
  if (failedUsers.length > 0) {
    reply += `\n\nCould not DM: ${failedUsers.map(u => `\`${u}\``).join(", ")} (DMs may be disabled)`;
  }

  await interaction.editReply({ content: reply });
}
