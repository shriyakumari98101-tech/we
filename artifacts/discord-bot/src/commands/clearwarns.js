import { SlashCommandBuilder } from "discord.js";
import { hasTimeoutPerm } from "../modules/permissions.js";
import { getData, saveData } from "../modules/storage.js";
import { sendLog, modEmbed } from "../modules/logger.js";

export const data = new SlashCommandBuilder()
  .setName("clearwarns")
  .setDescription("Clear all warnings for a user")
  .addUserOption((o) => o.setName("player").setDescription("The user to clear warns for").setRequired(true));

export const prefixName = "clearwarns";

async function doClearWarns(guild, executor, target, replyFn) {
  if (!hasTimeoutPerm(executor)) {
    return replyFn("You don't have permission to clear warns.");
  }

  const data = getData();
  if (!data.warns?.[guild.id]?.[target.id]?.length) {
    return replyFn(`**${target.tag}** has no warns to clear.`);
  }

  data.warns[guild.id][target.id] = [];
  await saveData();

  await sendLog(
    guild,
    modEmbed(0x00cc00, "Warns Cleared", `Warnings for <@${target.id}> were cleared by <@${executor.id}>`)
  );

  return replyFn(`All warnings for **${target.tag}** have been cleared.`);
}

export async function execute(interaction) {
  const target = interaction.options.getUser("player");
  await interaction.deferReply({ ephemeral: true });
  await doClearWarns(interaction.guild, interaction.member, target, (msg) =>
    interaction.editReply({ content: msg })
  );
}

export async function executePrefix(message, args) {
  const targetId = args[0]?.replace(/[<@!>]/g, "");
  const target = await message.client.users.fetch(targetId).catch(() => null);
  if (!target) return message.reply("Please mention a user.");
  await doClearWarns(message.guild, message.member, target, (msg) => message.reply(msg));
}
