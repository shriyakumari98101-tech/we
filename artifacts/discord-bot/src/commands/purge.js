import { SlashCommandBuilder } from "discord.js";
import { hasManageMessagesPerm } from "../modules/permissions.js";
import { sendLog, modEmbed } from "../modules/logger.js";

export const data = new SlashCommandBuilder()
  .setName("purge")
  .setDescription("Bulk delete messages from the current channel")
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Number of messages to delete (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)
  )
  .addUserOption((o) => o.setName("player").setDescription("Only delete messages from this user").setRequired(false));

export const prefixName = "purge";

async function doPurge(guild, executor, channel, amount, filterUser, replyFn) {
  if (!hasManageMessagesPerm(executor)) {
    return replyFn("You don't have permission to purge messages.");
  }

  try {
    let messages = await channel.messages.fetch({ limit: amount });
    if (filterUser) {
      messages = messages.filter((m) => m.author.id === filterUser.id);
    }

    const deleted = await channel.bulkDelete(messages, true);

    await sendLog(
      guild,
      modEmbed(0x5865f2, "Messages Purged", `**${deleted.size}** messages deleted in <#${channel.id}> by <@${executor.id}>`, [
        filterUser ? { name: "Filtered User", value: `<@${filterUser.id}>` } : null,
      ].filter(Boolean))
    );

    return replyFn(`Deleted **${deleted.size}** messages.`);
  } catch (err) {
    return replyFn(`Failed to purge: ${err.message}`);
  }
}

export async function execute(interaction) {
  const amount = interaction.options.getInteger("amount");
  const filterUser = interaction.options.getUser("player");
  await interaction.deferReply({ ephemeral: true });
  await doPurge(interaction.guild, interaction.member, interaction.channel, amount, filterUser, (msg) =>
    interaction.editReply({ content: msg })
  );
}

export async function executePrefix(message, args) {
  const amount = parseInt(args[0]);
  if (isNaN(amount) || amount < 1 || amount > 100)
    return message.reply("Usage: `<prefix>purge <1-100> [@user]`");
  const targetId = args[1]?.replace(/[<@!>]/g, "");
  const filterUser = targetId ? await message.client.users.fetch(targetId).catch(() => null) : null;
  await doPurge(message.guild, message.member, message.channel, amount, filterUser, (msg) => message.reply(msg));
}
