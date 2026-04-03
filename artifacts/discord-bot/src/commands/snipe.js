import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getData } from "../modules/storage.js";
import { hasManageMessagesPerm } from "../modules/permissions.js";

export const data = new SlashCommandBuilder()
  .setName("snipe")
  .setDescription("Show last 10 deleted messages by a user")
  .addUserOption((o) => o.setName("player").setDescription("The user to snipe").setRequired(true));

export const prefixName = "snipe";

async function doSnipe(guild, executor, target, replyFn) {
  if (!hasManageMessagesPerm(executor)) {
    return replyFn("You need Manage Messages permission to use this command.");
  }

  const data = getData();
  const messages = data.deletedMessages?.[target.id];

  if (!messages || messages.length === 0) {
    return replyFn(`No deleted messages found for **${target.tag}**.`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Last deleted messages by ${target.tag}`)
    .setThumbnail(target.displayAvatarURL())
    .setTimestamp();

  messages.slice(0, 10).forEach((msg, i) => {
    const date = new Date(msg.deletedAt).toLocaleString();
    embed.addFields({
      name: `#${i + 1} — <#${msg.channelId}> at ${date}`,
      value: msg.content?.substring(0, 300) || "[No text content]",
    });
  });

  return replyFn({ embeds: [embed] });
}

export async function execute(interaction) {
  const target = interaction.options.getUser("player");
  await interaction.deferReply({ ephemeral: false });
  await doSnipe(interaction.guild, interaction.member, target, (content) =>
    interaction.editReply(typeof content === "string" ? { content } : content)
  );
}

export async function executePrefix(message, args) {
  const targetId = args[0]?.replace(/[<@!>]/g, "");
  const target = await message.client.users.fetch(targetId).catch(() => null);
  if (!target) return message.reply("Please mention a user.");
  await doSnipe(message.guild, message.member, target, (content) =>
    message.reply(typeof content === "string" ? { content } : content)
  );
}
