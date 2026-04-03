import { Events, AuditLogEvent } from "discord.js";
import { isBotKick } from "../modules/botActions.js";
import { isWhitelistedOwner } from "../modules/permissions.js";
import { getData, saveData } from "../modules/storage.js";
import { sendLog, modEmbed } from "../modules/logger.js";

export const name = Events.GuildMemberRemove;
export const once = false;

export async function execute(member) {
  const { guild, user } = member;

  if (user.bot) return;

  if (isBotKick(guild.id, user.id)) return;

  await new Promise((r) => setTimeout(r, 1500));

  try {
    const auditLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberKick });
    const entry = auditLogs.entries.find(
      (e) => e.targetId === user.id && Date.now() - e.createdTimestamp < 10000
    );

    if (!entry) return;

    const executorId = entry.executorId;

    if (executorId === guild.client.user.id) return;
    if (guild.ownerId === executorId) return;
    if (isWhitelistedOwner(executorId)) return;

    const executor = await guild.members.fetch(executorId).catch(() => null);
    if (!executor) return;

    const roles = executor.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id);
    const data = getData();
    if (!data.strippedRoles) data.strippedRoles = {};
    data.strippedRoles[executorId] = roles;
    await saveData();

    await executor.roles.set([], "Anti-abuse: used manual kick instead of bot command").catch(() => {});

    await executor.send(
      `⚠️ **Warning from ${guild.name}**\n\nYou manually kicked a member in **${guild.name}** instead of using the bot's \`/kick\` command.\n\nAs a result, your roles have been temporarily removed.\n\nPlease kindly ask the **server owner** to restore your roles.`
    ).catch(() => {});

    await sendLog(
      guild,
      modEmbed(
        0xff8800,
        "Manual Kick Detected — Roles Stripped",
        `<@${executorId}> manually kicked <@${user.id}> instead of using \`/kick\`. Their roles have been removed.`,
        [{ name: "Roles Removed", value: roles.map((r) => `<@&${r}>`).join(", ") || "None" }]
      )
    );
  } catch (err) {
    console.error("guildMemberRemove handler error:", err.message);
  }
}
