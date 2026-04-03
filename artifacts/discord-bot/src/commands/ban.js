import { SlashCommandBuilder } from "discord.js";
import { hasBanPerm, canModerate, checkRateLimit, consumeRateLimit, isTrusted } from "../modules/permissions.js";
import { sendLog, modEmbed } from "../modules/logger.js";
import { markBotBan } from "../modules/botActions.js";

export const data = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Ban a member from the server")
  .addUserOption((o) => o.setName("player").setDescription("The user to ban").setRequired(true))
  .addStringOption((o) => o.setName("reason").setDescription("Reason for the ban").setRequired(false));

export const prefixName = "ban";

export async function doBan(guild, executor, target, reason, replyFn, { isBotInternal = false } = {}) {
  if (!hasBanPerm(executor)) {
    return replyFn("You do not have permission to ban members.");
  }

  const targetMember = await guild.members.fetch(target.id).catch(() => null);

  if (targetMember) {
    const hierarchy = canModerate(executor, targetMember);
    if (!hierarchy.ok) return replyFn(hierarchy.reason);
  }

  if (!isBotInternal && !isTrusted(executor)) {
    const limit = await checkRateLimit(guild.id, executor.id, "ban");
    if (limit.limited) {
      return replyFn(`You can only ban 1 person every 2 hours. Try again in **${limit.remaining} minute(s)**.`);
    }
  }

  if (targetMember && !targetMember.bannable) {
    return replyFn("I cannot ban this member (they may have a higher role than me).");
  }

  const banReason = reason || "No reason provided";

  try {
    markBotBan(guild.id, target.id);
    await target.send(
      `You have been banned from **${guild.name}**.\nReason: ${banReason}\n\nYou can appeal here: https://discord.gg/FjGk7YbmAQ`
    ).catch(() => {});
    await guild.members.ban(target.id, { reason: banReason });

    if (!isBotInternal && !isTrusted(executor)) {
      await consumeRateLimit(guild.id, executor.id, "ban");
    }

    await sendLog(
      guild,
      modEmbed(0xff0000, "Member Banned", `<@${target.id}> was banned by <@${executor.id}>`, [
        { name: "Reason", value: banReason },
      ])
    );
    return replyFn(`Successfully banned **${target.tag}**. Reason: ${banReason}`);
  } catch (err) {
    return replyFn(`Failed to ban: ${err.message}`);
  }
}

export async function execute(interaction) {
  const target = interaction.options.getUser("player");
  const reason = interaction.options.getString("reason");
  await interaction.deferReply({ ephemeral: true });
  await doBan(interaction.guild, interaction.member, target, reason, (msg) =>
    interaction.editReply({ content: msg })
  );
}

export async function executePrefix(message, args) {
  const targetId = args[0]?.replace(/[<@!>]/g, "");
  const reason = args.slice(1).join(" ");
  const target = await message.client.users.fetch(targetId).catch(() => null);
  if (!target) return message.reply("Please mention a valid user to ban.");
  await doBan(message.guild, message.member, target, reason, (msg) => message.reply(msg));
}
