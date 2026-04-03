import { SlashCommandBuilder } from "discord.js";
import { isServerOwner } from "../modules/permissions.js";
import { getData, saveData } from "../modules/storage.js";
import { sendLog, modEmbed } from "../modules/logger.js";

export const data = new SlashCommandBuilder()
  .setName("unwhitelistowner")
  .setDescription("Remove a user from the whitelist (server owner only)")
  .addUserOption((o) =>
    o.setName("username").setDescription("The user to remove from whitelist").setRequired(true)
  );

export const prefixName = "unwhitelistowner";

export async function execute(interaction) {
  if (!isServerOwner(interaction.member)) {
    return interaction.reply({ content: "Only the server owner can use this command.", ephemeral: true });
  }

  const target = interaction.options.getUser("username");
  const data = getData();
  if (!data.whitelistedOwners) data.whitelistedOwners = [];

  const idx = data.whitelistedOwners.indexOf(target.id);
  if (idx === -1) {
    return interaction.reply({ content: `**${target.tag}** is not whitelisted.`, ephemeral: true });
  }

  data.whitelistedOwners.splice(idx, 1);
  await saveData();

  await sendLog(
    interaction.guild,
    modEmbed(0xff8800, "User Un-whitelisted", `<@${target.id}> was removed from the whitelist by <@${interaction.user.id}>`)
  );

  return interaction.reply({ content: `**${target.tag}** has been removed from the whitelist.`, ephemeral: true });
}

export async function executePrefix(message, args) {
  if (!isServerOwner(message.member)) return message.reply("Only the server owner can use this command.");
  const targetId = args[0]?.replace(/[<@!>]/g, "");
  const target = await message.client.users.fetch(targetId).catch(() => null);
  if (!target) return message.reply("Please mention a valid user.");
  const data = getData();
  if (!data.whitelistedOwners) data.whitelistedOwners = [];
  const idx = data.whitelistedOwners.indexOf(target.id);
  if (idx === -1) return message.reply(`**${target.tag}** is not whitelisted.`);
  data.whitelistedOwners.splice(idx, 1);
  await saveData();
  await sendLog(message.guild, modEmbed(0xff8800, "User Un-whitelisted", `<@${target.id}> was removed from whitelist by <@${message.author.id}>`));
  return message.reply(`**${target.tag}** has been removed from the whitelist.`);
}
