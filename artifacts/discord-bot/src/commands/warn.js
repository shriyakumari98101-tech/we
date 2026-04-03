import { SlashCommandBuilder } from "discord.js";
import { hasTimeoutPerm, canModerate } from "../modules/permissions.js";
import { sendLog, modEmbed } from "../modules/logger.js";
import { getData, saveData } from "../modules/storage.js";
import { markBotBan } from "../modules/botActions.js";

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Warn a member (escalates to timeout then ban)")
  .addUserOption((o) => o.setName("player").setDescription("The user to warn").setRequired(true))
  .addStringOption((o) => o.setName("reason").setDescription("Reason for the warning").setRequired(false));

export const prefixName = "warn";

const WARN_PUNISHMENTS = {
  1: { type: "timeout", duration: 24 * 60 * 60 * 1000, label: "24-hour timeout" },
  2: { type: "timeout", duration: 48 * 60 * 60 * 1000, label: "48-hour timeout" },
  3: { type: "ban", label: "permanent ban" },
};

async function doWarn(guild, executor, target, reason, replyFn) {
  if (!hasTimeoutPerm(executor)) {
    return replyFn("You do not have permission to warn members.");
  }

  const member = await guild.members.fetch(target.id).catch(() => null);
  if (!member) return replyFn("Could not find that member in this server.");

  const hierarchy = canModerate(executor, member);
  if (!hierarchy.ok) return replyFn(hierarchy.reason);

  if (member.isCommunicationDisabled()) {
    const expiresAt = Math.floor(member.communicationDisabledUntil.getTime() / 1000);
    return replyFn(
      `**${target.tag}** is currently timed out and cannot be warned again until the timeout expires.\nTimeout expires: <t:${expiresAt}:R> (<t:${expiresAt}:F>)`
    );
  }

  const data = getData();
  if (!data.warns) data.warns = {};
  if (!data.warns[guild.id]) data.warns[guild.id] = {};
  if (!data.warns[guild.id][target.id]) data.warns[guild.id][target.id] = [];

  const warnReason = reason || "No reason provided";
  const warnList = data.warns[guild.id][target.id];
  warnList.push({ reason: warnReason, at: Date.now(), by: executor.id });
  await saveData();

  const warnCount = warnList.length;
  const punishment = WARN_PUNISHMENTS[Math.min(warnCount, 3)];
  const nextWarnCount = warnCount + 1;
  const nextPunishment = WARN_PUNISHMENTS[Math.min(nextWarnCount, 3)];

  let actionTaken = "";
  let dmMessage = `You have received warn **#${warnCount}** in **${guild.name}**.\nReason: ${warnReason}\n\n`;

  if (punishment.type === "timeout") {
    try {
      await member.timeout(punishment.duration, `Warn #${warnCount}: ${warnReason}`);
      actionTaken = punishment.label;
      dmMessage += `**Action taken:** ${punishment.label}\n`;
    } catch (err) {
      actionTaken = `Failed to apply timeout: ${err.message}`;
    }
  } else if (punishment.type === "ban") {
    dmMessage += `**Action taken:** You have been banned from the server.\nYou can appeal here: https://discord.gg/FjGk7YbmAQ\n`;
    await target.send(dmMessage).catch(() => {});
    try {
      markBotBan(guild.id, target.id);
      await member.ban({ reason: `Warn #3: ${warnReason}` });
      actionTaken = "banned";
    } catch (err) {
      actionTaken = `Failed to ban: ${err.message}`;
    }

    await sendLog(
      guild,
      modEmbed(0xff0000, `Member Warned & Banned (Warn #${warnCount})`, `<@${target.id}> received warn #${warnCount} and was banned.`, [
        { name: "Reason", value: warnReason },
        { name: "Moderator", value: `<@${executor.id}>` },
      ])
    );
    return replyFn(`**${target.tag}** has received warn #${warnCount} and has been **banned**.\nTotal warns: ${warnCount}`);
  }

  if (nextPunishment) {
    dmMessage += `\n⚠️ Your next warn (#${nextWarnCount}) will result in: **${nextPunishment.label}**`;
  }

  await target.send(dmMessage).catch(() => {});

  await sendLog(
    guild,
    modEmbed(0xffaa00, `Member Warned (Warn #${warnCount})`, `<@${target.id}> received warn #${warnCount}`, [
      { name: "Reason", value: warnReason },
      { name: "Action", value: actionTaken },
      { name: "Moderator", value: `<@${executor.id}>` },
      { name: "Next Warn Punishment", value: nextPunishment ? nextPunishment.label : "None" },
    ])
  );

  return replyFn(
    `**${target.tag}** has received warn #${warnCount}.\nAction: **${actionTaken}**\nNext warn punishment: **${nextPunishment?.label || "None"}**`
  );
}

export async function execute(interaction) {
  const target = interaction.options.getUser("player");
  const reason = interaction.options.getString("reason");
  await interaction.deferReply({ ephemeral: true });
  await doWarn(interaction.guild, interaction.member, target, reason, (msg) =>
    interaction.editReply({ content: msg })
  );
}

export async function executePrefix(message, args) {
  const targetId = args[0]?.replace(/[<@!>]/g, "");
  const reason = args.slice(1).join(" ");
  const target = await message.client.users.fetch(targetId).catch(() => null);
  if (!target) return message.reply("Please mention a valid user to warn.");
  await doWarn(message.guild, message.member, target, reason, (msg) => message.reply(msg));
}
