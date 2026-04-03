import { SlashCommandBuilder } from "discord.js";
import { isServerOwner, isWhitelistedOwner } from "../modules/permissions.js";
import { getData, saveData } from "../modules/storage.js";
import { sendLog, modEmbed } from "../modules/logger.js";

export const data = new SlashCommandBuilder()
  .setName("prefix")
  .setDescription("Set a custom prefix for text-based commands")
  .addStringOption((o) =>
    o.setName("prefix").setDescription("The new prefix to use (e.g. ! or ?)").setRequired(true)
  );

export const prefixName = "prefix";

async function doPrefix(guild, executor, newPrefix, replyFn) {
  if (!isServerOwner(executor) && !isWhitelistedOwner(executor.id)) {
    return replyFn("Only the server owner can change the prefix.");
  }

  const data = getData();
  if (!data.prefixes) data.prefixes = {};
  data.prefixes[guild.id] = newPrefix;
  await saveData();

  await sendLog(
    guild,
    modEmbed(0x00ccff, "Prefix Changed", `Prefix changed to \`${newPrefix}\` by <@${executor.id}>`)
  );

  return replyFn(`Prefix set to \`${newPrefix}\`. You can now use \`${newPrefix}ban\`, \`${newPrefix}kick\`, etc.`);
}

export async function execute(interaction) {
  const newPrefix = interaction.options.getString("prefix");
  await interaction.deferReply({ ephemeral: true });
  await doPrefix(interaction.guild, interaction.member, newPrefix, (msg) =>
    interaction.editReply({ content: msg })
  );
}

export async function executePrefix(message, args) {
  const newPrefix = args[0];
  if (!newPrefix) return message.reply("Please provide a prefix. Usage: `<prefix>prefix <newprefix>`");
  await doPrefix(message.guild, message.member, newPrefix, (msg) => message.reply(msg));
}
