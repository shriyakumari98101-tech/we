import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getData } from "../modules/storage.js";

export const data = new SlashCommandBuilder()
  .setName("warns")
  .setDescription("View warns for a user")
  .addUserOption((o) => o.setName("player").setDescription("The user to check").setRequired(true));

export const prefixName = "warns";

async function doWarns(guild, target, replyFn) {
  const data = getData();
  const warnList = data.warns?.[guild.id]?.[target.id];

  if (!warnList || warnList.length === 0) {
    return replyFn(`**${target.tag}** has no warnings.`);
  }

  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle(`Warnings for ${target.tag}`)
    .setThumbnail(target.displayAvatarURL())
    .setTimestamp();

  warnList.forEach((w, i) => {
    embed.addFields({
      name: `Warn #${i + 1} — ${new Date(w.at).toLocaleDateString()}`,
      value: `Reason: ${w.reason}\nBy: <@${w.by}>`,
    });
  });

  return replyFn({ embeds: [embed] });
}

export async function execute(interaction) {
  const target = interaction.options.getUser("player");
  await interaction.deferReply({ ephemeral: false });
  await doWarns(interaction.guild, target, (content) =>
    interaction.editReply(typeof content === "string" ? { content } : content)
  );
}

export async function executePrefix(message, args) {
  const targetId = args[0]?.replace(/[<@!>]/g, "");
  const target = await message.client.users.fetch(targetId).catch(() => null);
  if (!target) return message.reply("Please mention a user.");
  await doWarns(message.guild, target, (content) =>
    message.reply(typeof content === "string" ? { content } : content)
  );
}
