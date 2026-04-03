import { Events, AuditLogEvent } from "discord.js";
import { getData, saveData } from "../modules/storage.js";
import { isWhitelistedOwner } from "../modules/permissions.js";
import { sendLog, modEmbed, getLogChannelId } from "../modules/logger.js";

export const name = Events.MessageDelete;
export const once = false;

export async function execute(message) {
  if (!message.guild) return;
  if (message.author?.bot) return;

  const content = message.content || "[No text content]";
  const authorId = message.author?.id || "Unknown";
  const channelId = message.channelId;

  const data = getData();

  if (!data.deletedMessages) data.deletedMessages = {};
  if (!data.deletedMessages[authorId]) data.deletedMessages[authorId] = [];

  data.deletedMessages[authorId].unshift({
    content,
    channelId,
    deletedAt: Date.now(),
    attachments: message.attachments?.map((a) => a.url) || [],
  });

  if (data.deletedMessages[authorId].length > 10) {
    data.deletedMessages[authorId] = data.deletedMessages[authorId].slice(0, 10);
  }

  await saveData();

  let deletedById = null;
  let deletedBy = "Unknown";

  try {
    const auditLogs = await message.guild.fetchAuditLogs({
      limit: 3,
      type: AuditLogEvent.MessageDelete,
    });
    const entry = auditLogs.entries.first();
    if (entry && entry.targetId === authorId && Date.now() - entry.createdTimestamp < 5000) {
      deletedById = entry.executorId;
      deletedBy = `<@${deletedById}>`;
    } else {
      deletedById = authorId;
      deletedBy = message.author ? `<@${authorId}> (self-deleted)` : "Unknown";
    }
  } catch {
    deletedById = authorId;
  }

  const logChannelId = getLogChannelId();

  if (channelId === logChannelId && deletedById) {
    const guild = message.guild;
    const isOwner = guild.ownerId === deletedById;
    const isWhitelisted = isWhitelistedOwner(deletedById);

    if (!isOwner && !isWhitelisted) {
      const culprit = await guild.members.fetch(deletedById).catch(() => null);
      if (culprit) {
        const roles = culprit.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id);
        data.strippedRoles = data.strippedRoles || {};
        data.strippedRoles[deletedById] = roles;
        await saveData();

        await culprit.roles.set([], "Deleted a message in the logs channel").catch(() => {});

        await culprit.send(
          `⚠️ **Warning from ${guild.name}**\n\nYou deleted a message in the **logs channel**, which is strictly against the rules.\n\nYour roles have been removed. Kindly ask your **senior** to restore your roles.`
        ).catch(() => {});

        await sendLog(
          guild,
          modEmbed(
            0xff0000,
            "Log Channel Message Deleted — Roles Stripped",
            `<@${deletedById}> deleted a message in the log channel. Their roles have been removed.`,
            [
              { name: "Deleted Content", value: content.substring(0, 512) || "[Empty]" },
              { name: "Roles Removed", value: roles.map((r) => `<@&${r}>`).join(", ") || "None" },
            ]
          )
        );
        return;
      }
    }
  }

  await sendLog(
    message.guild,
    modEmbed(
      0xffcc00,
      "Message Deleted",
      `Message by <@${authorId}> in <#${channelId}> was deleted by ${deletedBy}`,
      [{ name: "Content", value: content.substring(0, 1024) || "[Empty]" }]
    )
  );
}
