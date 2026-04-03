import { SlashCommandBuilder } from "discord.js";
import { isServerOwner } from "../modules/permissions.js";
import { getData, saveData } from "../modules/storage.js";
import { sendLog, modEmbed } from "../modules/logger.js";

export const data = new SlashCommandBuilder()
  .setName("whitelistowner")
  .setDescription("Whitelist a user so the bot ignores their actions (server owner only)")
  .addUserOption((o) =>
    o.setName("username").setDescription("The user to whitelist").setRequired(true)
  );

export const prefixName = "whitelistowner";

export async function execute(interaction) {
  if (!isServerOwner(interaction.member)) {
    return interaction.reply({ content: "Only the server owner can use this command.", ephemeral: true });
  }

  const target = interaction.options.getUser("username");
  const data = getData();
  if (!data.whitelistedOwners) data.whitelistedOwners = [];

  if (data.whitelistedOwners.includes(target.id)) {
    return interaction.reply({ content: `**${target.tag}** is already whitelisted.`, ephemeral: true });
  }

  data.whitelistedOwners.push(target.id);
  await saveData();

  await sendLog(
    interaction.guild,
    modEmbed(0x00ff88, "User Whitelisted", `<@${target.id}> was whitelisted as a trusted user by <@${interaction.user.id}>`)
  );

  return interaction.reply({ content: `**${target.tag}** has been whitelisted. The bot will ignore their actions.`, ephemeral: true });
}

export async function executePrefix(message, args) {
  if (!isServerOwner(message.member)) return message.reply("Only the server owner can use this command.");
  const targetId = args[0]?.replace(/[<@!>]/g, "");
  const target = await message.client.users.fetch(targetId).catch(() => null);
  if (!target) return message.reply("Please mention a valid user.");
  const data = getData();
  if (!data.whitelistedOwners) data.whitelistedOwners = [];
  if (data.whitelistedOwners.includes(target.id)) return message.reply(`**${target.tag}** is already whitelisted.`);
  data.whitelistedOwners.push(target.id);
  await saveData();
  await sendLog(message.guild, modEmbed(0x00ff88, "User Whitelisted", `<@${target.id}> was whitelisted by <@${message.author.id}>`));
  return message.reply(`**${target.tag}** has been whitelisted.`);
}
