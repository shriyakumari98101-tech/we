import { SlashCommandBuilder } from "discord.js";
import { hasKickPerm, canModerate, checkRateLimit, consumeRateLimit, isTrusted } from "../modules/permissions.js";
import { sendLog, modEmbed } from "../modules/logger.js";
import { markBotKick } from "../modules/botActions.js";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Kick a member from the server")
  .addUserOption((o) => o.setName("player").setDescription("The user to kick").setRequired(true))
  .addStringOption((o) => o.setName("reason").setDescription("Reason for the kick").setRequired(false));

export const prefixName = "kick";

export async function doKick(guild, executor, target, reason, replyFn, { isBotInternal = false } = {}) {
  if (!hasKickPerm(executor)) {
    return replyFn("You do not have permission to kick members.");
  }

  const member = await guild.members.fetch(target.id).catch(() => null);
  if (!member) return replyFn("Could not find that member in this server.");

  const hierarchy = canModerate(executor, member);
  if (!hierarchy.ok) return replyFn(hierarchy.reason);

  if (!isBotInternal && !isTrusted(executor)) {
    const limit = await checkRateLimit(guild.id, executor.id, "kick");
    if (limit.limited) {
      return replyFn(`You can only kick 1 person every 2 hours. Try again in **${limit.remaining} minute(s)**.`);
    }
  }

  if (!member.kickable) return replyFn("I cannot kick this member (they may have a higher role than me).");

  const kickReason = reason || "No reason provided";

  try {
    markBotKick(guild.id, target.id);
    await target.send(
      `You have been kicked from **${guild.name}**.\nReason: ${kickReason}`
    ).catch(() => {});
    await member.kick(kickReason);

    if (!isBotInternal && !isTrusted(executor)) {
      await consumeRateLimit(guild.id, executor.id, "kick");
    }

    await sendLog(
      guild,
      modEmbed(0xff8800, "Member Kicked", `<@${target.id}> was kicked by <@${executor.id}>`, [
        { name: "Reason", value: kickReason },
      ])
    );
    return replyFn(`Successfully kicked **${target.tag}**. Reason: ${kickReason}`);
  } catch (err) {
    return replyFn(`Failed to kick: ${err.message}`);
  }
}

export async function execute(interaction) {
  const target = interaction.options.getUser("player");
  const reason = interaction.options.getString("reason");
  await interaction.deferReply({ ephemeral: true });
  await doKick(interaction.guild, interaction.member, target, reason, (msg) =>
    interaction.editReply({ content: msg })
  );
}

export async function executePrefix(message, args) {
  const targetId = args[0]?.replace(/[<@!>]/g, "");
  const reason = args.slice(1).join(" ");
  const target = await message.client.users.fetch(targetId).catch(() => null);
  if (!target) return message.reply("Please mention a valid user to kick.");
  await doKick(message.guild, message.member, target, reason, (msg) => message.reply(msg));
}
