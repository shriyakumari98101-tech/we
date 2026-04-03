import { SlashCommandBuilder } from "discord.js";
import { isServerOwner } from "../modules/permissions.js";
import { getData, saveData } from "../modules/storage.js";
import { sendLog, modEmbed } from "../modules/logger.js";

export const data = new SlashCommandBuilder()
  .setName("whitelist")
  .setDescription("Whitelist a bot so it won't be kicked (server owner only)")
  .addStringOption((o) =>
    o.setName("botname").setDescription("The bot's user ID or @mention").setRequired(true)
  );

export const prefixName = "whitelist";

export async function execute(interaction) {
  if (!isServerOwner(interaction.member)) {
    return interaction.reply({ content: "Only the server owner can use this command.", ephemeral: true });
  }

  const input = interaction.options.getString("botname");
  const botId = input.replace(/[<@!>]/g, "");

  const data = getData();
  if (!data.whitelistedBots) data.whitelistedBots = [];

  if (data.whitelistedBots.includes(botId)) {
    return interaction.reply({ content: `Bot \`${botId}\` is already whitelisted.`, ephemeral: true });
  }

  data.whitelistedBots.push(botId);
  await saveData();

  await sendLog(
    interaction.guild,
    modEmbed(0x00cc00, "Bot Whitelisted", `Bot \`${botId}\` was whitelisted by <@${interaction.user.id}>`)
  );

  return interaction.reply({ content: `Bot \`${botId}\` has been whitelisted. It will not be kicked if it joins.`, ephemeral: true });
}

export async function executePrefix(message, args) {
  if (!isServerOwner(message.member)) return message.reply("Only the server owner can use this command.");
  const input = args[0];
  if (!input) return message.reply("Provide a bot ID to whitelist.");
  const botId = input.replace(/[<@!>]/g, "");
  const data = getData();
  if (!data.whitelistedBots) data.whitelistedBots = [];
  if (data.whitelistedBots.includes(botId)) return message.reply(`Bot \`${botId}\` is already whitelisted.`);
  data.whitelistedBots.push(botId);
  await saveData();
  await sendLog(message.guild, modEmbed(0x00cc00, "Bot Whitelisted", `Bot \`${botId}\` was whitelisted by <@${message.author.id}>`));
  return message.reply(`Bot \`${botId}\` has been whitelisted.`);
}
