import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { hasManageMessagesPerm } from "../modules/permissions.js";
import { sendLog, modEmbed } from "../modules/logger.js";

export const data = new SlashCommandBuilder()
  .setName("lockdown")
  .setDescription("Lock or unlock the current channel")
  .addStringOption((o) =>
    o.setName("action").setDescription("lock or unlock").setRequired(true).addChoices(
      { name: "Lock", value: "lock" },
      { name: "Unlock", value: "unlock" }
    )
  )
  .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false));

export const prefixName = "lockdown";

async function doLockdown(guild, executor, channel, action, reason, replyFn) {
  if (!hasManageMessagesPerm(executor)) {
    return replyFn("You don't have permission to use lockdown.");
  }

  const lockReason = reason || "No reason provided";
  const everyoneRole = guild.roles.everyone;
  const allow = action === "unlock";

  try {
    await channel.permissionOverwrites.edit(everyoneRole, {
      SendMessages: allow ? null : false,
    });

    const label = action === "lock" ? "Channel Locked" : "Channel Unlocked";
    const color = action === "lock" ? 0xff4444 : 0x00cc00;

    await sendLog(
      guild,
      modEmbed(color, label, `<#${channel.id}> was ${action}ed by <@${executor.id}>`, [
        { name: "Reason", value: lockReason },
      ])
    );

    return replyFn(`Channel has been **${action}ed**. Reason: ${lockReason}`);
  } catch (err) {
    return replyFn(`Failed to ${action} channel: ${err.message}`);
  }
}

export async function execute(interaction) {
  const action = interaction.options.getString("action");
  const reason = interaction.options.getString("reason");
  await interaction.deferReply({ ephemeral: true });
  await doLockdown(interaction.guild, interaction.member, interaction.channel, action, reason, (msg) =>
    interaction.editReply({ content: msg })
  );
}

export async function executePrefix(message, args) {
  const action = args[0]?.toLowerCase();
  if (!["lock", "unlock"].includes(action)) return message.reply("Usage: `<prefix>lockdown lock/unlock [reason]`");
  const reason = args.slice(1).join(" ");
  await doLockdown(message.guild, message.member, message.channel, action, reason, (msg) => message.reply(msg));
}
