import {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import {
  MAIN_GUILD_ID,
  APPEAL_GUILD_ID,
  APPROVER_ROLE_ID,
  APPEAL_INVITE,
  createSession,
  getSession,
  clearSession,
  getQuestion,
  SERVER_BAN_QUESTIONS,
  buildAppealAgainRow,
} from "../modules/appealSystem.js";
import { getData, saveData } from "../modules/storage.js";
import { generateQrAttachment } from "../modules/qrHelper.js";
import { generateToken, getBaseUrl } from "../commands/usercreate.js";
import bcrypt from "bcryptjs";

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction) {
  if (interaction.isChatInputCommand()) {
    if (interaction.guildId === APPEAL_GUILD_ID) {
      await interaction.reply({ content: "Commands are not available in this server.", ephemeral: true });
      return;
    }

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) { await interaction.reply({ content: "Unknown command.", ephemeral: true }); return; }
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error in command ${interaction.commandName}:`, err);
      const msg = { content: "An error occurred while running this command.", ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
    return;
  }

  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const customId = interaction.customId;

  if (customId === "start_server_ban" || customId === "start_game_ban") {
    await interaction.deferReply({ ephemeral: true });
    if (getSession(userId)) {
      await interaction.editReply({ content: "You already have an active appeal in progress. Please check your DMs." });
      return;
    }
    const type = customId === "start_server_ban" ? "server" : "game";
    if (type === "server") {
      const mainGuild = interaction.client.guilds.cache.get(MAIN_GUILD_ID);
      let banReason = "Unknown";
      if (mainGuild) {
        const ban = await mainGuild.bans.fetch(userId).catch(() => null);
        if (!ban) {
          await interaction.editReply({ content: "You do not appear to be banned from the main server. If you believe this is an error, please contact a moderator." });
          return;
        }
        banReason = ban.reason || "No reason provided";
      }
      createSession(userId, "server", banReason);
    } else {
      createSession(userId, "game");
    }
    const session = getSession(userId);
    const firstQ = getQuestion(session);
    try {
      await interaction.user.send(
        type === "server"
          ? `**Server Ban Appeal**\n\nYour ban reason on record: **${session.banReason}**\n\nI will now ask you ${SERVER_BAN_QUESTIONS.length} questions. Please answer honestly and in your own words.\n\n**Question 1/${SERVER_BAN_QUESTIONS.length}:** ${firstQ}`
          : `**In-Game Ban Appeal**\n\nI will guide you through the appeal process. Please answer all questions honestly and in your own words.\n\n**First question:** ${firstQ}`
      );
      await interaction.editReply({ content: "I have sent you a DM to start your appeal. Please check your direct messages." });
    } catch {
      clearSession(userId);
      await interaction.editReply({ content: "I could not DM you. Please enable DMs from server members and try again." });
    }
    return;
  }

  if (customId === "appeal_again_s" || customId === "appeal_again_g") {
    await interaction.deferReply({ ephemeral: true });
    const type = customId === "appeal_again_s" ? "server" : "game";
    if (type === "server") {
      const mainGuild = interaction.client.guilds.cache.get(MAIN_GUILD_ID);
      let banReason = "Unknown";
      if (mainGuild) {
        const ban = await mainGuild.bans.fetch(userId).catch(() => null);
        if (ban) banReason = ban.reason || "No reason provided";
      }
      createSession(userId, "server", banReason);
    } else {
      createSession(userId, "game");
    }
    const session = getSession(userId);
    const firstQ = getQuestion(session);
    try {
      await interaction.user.send(`**Starting a new appeal.**\n\nPlease answer every question in your own words — do not use AI.\n\n**Question 1:** ${firstQ}`);
      await interaction.editReply({ content: "Check your DMs — your new appeal has started." });
    } catch {
      clearSession(userId);
      await interaction.editReply({ content: "Could not DM you. Enable DMs and try again." });
    }
    return;
  }

  if (customId.startsWith("approve_") || customId.startsWith("deny_")) {
    const parts = customId.split("_");
    const action = parts[0];
    const targetId = parts[1];
    const appealType = parts[2];

    const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    const hasRole = member?.roles.cache.has(APPROVER_ROLE_ID);
    if (!hasRole) {
      await interaction.reply({ content: "You do not have permission to approve or deny appeals.", ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`reason_modal_${action}_${targetId}_${appealType}`)
      .setTitle(action === "approve" ? "Approve Appeal" : "Deny Appeal")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Reason for your decision")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder("Explain your decision clearly...")
            .setMaxLength(500)
        )
      );
    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith("confirm_pw_")) {
    const parts = customId.replace("confirm_pw_", "").split("_");
    const targetDiscordId = parts[0];
    const confirmToken = parts[1];

    if (userId !== targetDiscordId) {
      await interaction.reply({ content: "This confirmation is not for you.", ephemeral: true });
      return;
    }

    const data = getData();
    const pending = data._pendingPasswordChanges?.[targetDiscordId];

    if (!pending || pending.confirmToken !== confirmToken || Date.now() > pending.expiresAt) {
      await interaction.update({ content: "This confirmation has expired or is invalid.", components: [] });
      return;
    }

    const user = data.users?.[pending.username];
    if (user) {
      user.passwordHash = pending.newHash;
      user.plainPassword = pending.newPlain;
    }
    delete data._pendingPasswordChanges[targetDiscordId];
    await saveData();

    await interaction.update({
      content: "✅ **Password changed successfully.** Your new password is now active.",
      components: [],
    });
    return;
  }

  if (customId.startsWith("cancel_pw_")) {
    const targetDiscordId = customId.replace("cancel_pw_", "");
    if (userId !== targetDiscordId) {
      await interaction.reply({ content: "This button is not for you.", ephemeral: true });
      return;
    }
    const data = getData();
    if (data._pendingPasswordChanges) delete data._pendingPasswordChanges[targetDiscordId];
    await saveData();
    await interaction.update({ content: "❌ Password change cancelled.", components: [] });
    return;
  }

  if (customId.startsWith("confirm_shift_")) {
    const raw = customId.replace("confirm_shift_", "");
    const lastUnderscore = raw.lastIndexOf("_");
    const targetDiscordId = raw.substring(0, lastUnderscore);
    const shiftToken = raw.substring(lastUnderscore + 1);

    if (userId !== targetDiscordId) {
      await interaction.reply({ content: "This invitation is not for you.", ephemeral: true });
      return;
    }

    const data = getData();
    const pending = data._pendingShifts?.[targetDiscordId];

    if (!pending || pending.shiftToken !== shiftToken || Date.now() > pending.expiresAt) {
      await interaction.update({ content: "This invitation has expired.", components: [] });
      return;
    }

    const hashedPassword = await bcrypt.hash(pending.password, 10);
    const qrToken = generateToken();

    data.users[pending.newUsername] = {
      username: pending.newUsername,
      discordId: targetDiscordId,
      passwordHash: hashedPassword,
      plainPassword: pending.password,
      qrToken,
      createdAt: Date.now(),
      createdBy: "shift",
      settings: { color: "default", language: "en" },
      shiftedTo: null,
    };

    delete data._pendingShifts[targetDiscordId];
    await saveData();

    const base = getBaseUrl();
    const qrFile = await generateQrAttachment(qrToken).catch(() => null);

    const msgContent =
      `✅ **Account created for you!**\n\n` +
      `**Username:** \`${pending.newUsername}\`\n` +
      `**Password:** \`${pending.password}\`\n` +
      `**QR Login Token:** \`${qrToken}\`\n\n` +
      `**Login:** ${base}/login\n\nDo not share these credentials.`;

    if (qrFile) {
      await interaction.update({ content: msgContent, components: [], files: [qrFile] });
    } else {
      await interaction.update({ content: msgContent, components: [] });
    }
    return;
  }

  if (customId.startsWith("deny_shift_")) {
    const targetDiscordId = customId.replace("deny_shift_", "");
    if (userId !== targetDiscordId) {
      await interaction.reply({ content: "This button is not for you.", ephemeral: true });
      return;
    }
    const data = getData();
    if (data._pendingShifts) delete data._pendingShifts[targetDiscordId];
    await saveData();
    await interaction.update({ content: "You have declined the web panel invitation.", components: [] });
    return;
  }
}

async function handleModalSubmit(interaction) {
  if (!interaction.customId.startsWith("reason_modal_")) return;

  const raw = interaction.customId.replace("reason_modal_", "");
  const parts = raw.split("_");
  const action = parts[0];
  const targetId = parts[1];
  const appealType = parts[2];

  const reason = interaction.fields.getTextInputValue("reason");

  const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  const hasRole = member?.roles.cache.has(APPROVER_ROLE_ID);
  if (!hasRole) {
    await interaction.reply({ content: "You do not have permission to approve or deny appeals.", ephemeral: true });
    return;
  }

  await interaction.deferUpdate().catch(() => {});

  const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
  const reviewerTag = interaction.user.tag;

  const data = getData();
  const appeal = data.appeals?.find((a) => a.userId === targetId && a.status === "pending");

  if (action === "approve") {
    if (appealType === "s") {
      const mainGuild = interaction.client.guilds.cache.get(MAIN_GUILD_ID);
      if (mainGuild) await mainGuild.members.unban(targetId, `Appeal accepted by ${reviewerTag}`).catch(() => {});
      await targetUser?.send(`Your server ban appeal has been **accepted**.\n\n**Reason:** ${reason}\n\nYou have been unbanned. Here is your invite back:\n${APPEAL_INVITE}`).catch(() => {});
    } else {
      await targetUser?.send(`Your in-game ban appeal has been **accepted**.\n\n**Reason:** ${reason}\n\nPlease wait **1–2 days** for your in-game ban to be removed.`).catch(() => {});
    }
    await interaction.message.edit({ content: `✅ Appeal approved by <@${interaction.user.id}>`, components: [] }).catch(() => {});
  } else {
    await targetUser?.send(`Your appeal has been **denied**.\n\n**Reason:** ${reason}\n\nIf you have further questions, please contact a staff member.`).catch(() => {});
    await interaction.message.edit({ content: `❌ Appeal denied by <@${interaction.user.id}>`, components: [] }).catch(() => {});
  }

  if (appeal) {
    appeal.status = action === "approve" ? "approved" : "denied";
    appeal.reason = reason;
    appeal.reviewedBy = interaction.user.id;
    appeal.reviewedAt = Date.now();
    await saveData();
  }
}
