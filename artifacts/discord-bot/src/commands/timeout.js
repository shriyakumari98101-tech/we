import { SlashCommandBuilder } from "discord.js";
import { hasTimeoutPerm } from "../modules/permissions.js";
import { sendLog, modEmbed } from "../modules/logger.js";

export const data = new SlashCommandBuilder()
  .setName("timeout")
  .setDescription("Timeout a member")
  .addUserOption((o) => o.setName("player").setDescription("The user to timeout").setRequired(true))
  .addIntegerOption((o) =>
    o.setName("duration").setDescription("Duration in minutes").setRequired(true).setMinValue(1).setMaxValue(40320)
  )
  .addStringOption((o) => o.setName("reason").setDescription("Reason for the timeout").setRequired(false));

export const prefixName = "timeout";

async function doTimeout(guild, executor, target, durationMs, reason, replyFn) {
  if (!hasTimeoutPerm(executor)) {
    return replyFn("You do not have permission to timeout members.", true);
  }

  const member = await guild.members.fetch(target.id).catch(() => null);
  if (!member) return replyFn("Could not find that member in this server.", true);
  if (!member.moderatable) return replyFn("I cannot timeout this member.", true);

  const timeoutReason = reason || "No reason provided";

  try {
    await member.timeout(durationMs, timeoutReason);
    await sendLog(
      guild,
      modEmbed(0xffcc00, "Member Timed Out", `<@${target.id}> was timed out by <@${executor.id}>`, [
        { name: "Duration", value: `${Math.round(durationMs / 60000)} minutes` },
        { name: "Reason", value: timeoutReason },
      ])
    );
    return replyFn(`Successfully timed out **${target.tag}** for ${Math.round(durationMs / 60000)} minutes.`);
  } catch (err) {
    return replyFn(`Failed to timeout: ${err.message}`, true);
  }
}

export async function execute(interaction) {
  const target = interaction.options.getUser("player");
  const duration = interaction.options.getInteger("duration");
  const reason = interaction.options.getString("reason");
  await interaction.deferReply({ ephemeral: true });
  await doTimeout(interaction.guild, interaction.member, target, duration * 60 * 1000, reason, (msg) =>
    interaction.editReply({ content: msg })
  );
}

export async function executePrefix(message, args) {
  const targetId = args[0]?.replace(/[<@!>]/g, "");
  const duration = parseInt(args[1]);
  const reason = args.slice(2).join(" ");
  if (isNaN(duration)) return message.reply("Usage: `<prefix>timeout @user <minutes> [reason]`");
  const target = await message.client.users.fetch(targetId).catch(() => null);
  if (!target) return message.reply("Please mention a valid user.");
  await doTimeout(message.guild, message.member, target, duration * 60 * 1000, reason, (msg) =>
    message.reply(msg)
  );
}
