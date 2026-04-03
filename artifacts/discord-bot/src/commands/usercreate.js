import { SlashCommandBuilder } from "discord.js";
import bcrypt from "bcryptjs";
import { getData, saveData } from "../modules/storage.js";
import { generateQrAttachment } from "../modules/qrHelper.js";
import { getBaseUrl } from "../modules/urlHelper.js";
export { getBaseUrl } from "../modules/urlHelper.js";

export const data = new SlashCommandBuilder()
  .setName("usercreate")
  .setDescription("Create a web panel account for a user (server owner only)")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("The Discord user to create an account for").setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("username").setDescription("Username for the web panel").setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("password").setDescription("Password for the web panel").setRequired(true)
  );

export async function execute(interaction) {
  const guild = interaction.guild;

  if (!guild || guild.ownerId !== interaction.user.id) {
    await interaction.reply({
      content: "Only the server owner can create web panel accounts.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser("user");
  const username = interaction.options.getString("username").toLowerCase().replace(/\s+/g, "_");
  const password = interaction.options.getString("password");

  const botData = getData();
  if (!botData.users) botData.users = {};

  if (botData.users[username]) {
    await interaction.editReply({ content: `Username \`${username}\` is already taken.` });
    return;
  }

  const existingUser = Object.values(botData.users).find((u) => u.discordId === targetUser.id);
  if (existingUser) {
    await interaction.editReply({
      content: `<@${targetUser.id}> already has a web panel account (\`${existingUser.username}\`).`,
    });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const qrToken = generateToken();

  botData.users[username] = {
    username,
    discordId: targetUser.id,
    passwordHash: hashedPassword,
    plainPassword: password,
    qrToken,
    createdAt: Date.now(),
    createdBy: interaction.user.id,
    settings: { color: "default", language: "en" },
    shiftedTo: null,
  };

  await saveData();

  const base = getBaseUrl();
  const loginUrl = `${base}/login`;
  const panelUrl = `${base}/panel`;

  const dmMessage =
    `🛡️ **SEB Security — Web Panel Access**\n\n` +
    `An account has been created for you by the server owner.\n\n` +
    `**Username:** \`${username}\`\n` +
    `**Password:** \`${password}\`\n\n` +
    `**🔑 QR Login Token:** \`${qrToken}\`\n` +
    `*(Scan the QR code or paste the token above on the login page)*\n\n` +
    `**🔐 Login:** ${loginUrl}\n` +
    `**📊 Panel:** ${panelUrl}\n\n` +
    `Do not share these credentials with anyone.`;

  try {
    const qrFile = await generateQrAttachment(qrToken);
    await targetUser.send({ content: dmMessage, files: [qrFile] });
    await interaction.editReply({
      content:
        `Account created for <@${targetUser.id}>. Credentials and QR code sent via DM.\n\n` +
        `**Login:** ${loginUrl}\n**Panel:** ${panelUrl}`,
    });
  } catch {
    await interaction.editReply({
      content:
        `Account created for <@${targetUser.id}> but I could not DM them.\n\n` +
        `**Username:** \`${username}\`\n**Password:** \`${password}\`\n` +
        `**QR Token:** \`${qrToken}\`\n` +
        `**Login:** ${loginUrl}\n**Panel:** ${panelUrl}`,
    });
  }
}

export function generateToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let token = "SEB";
  for (let i = 0; i < 20; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}
