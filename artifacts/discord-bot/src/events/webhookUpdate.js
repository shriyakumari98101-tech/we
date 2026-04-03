import { Events, AuditLogEvent } from "discord.js";
import { sendLog, modEmbed } from "../modules/logger.js";
import { isWhitelistedOwner } from "../modules/permissions.js";

export const name = Events.WebhooksUpdate;
export const once = false;

export async function execute(channel) {
  const guild = channel.guild;

  try {
    const webhooks = await channel.fetchWebhooks();
    const auditLogs = await guild.fetchAuditLogs({
      limit: 5,
      type: AuditLogEvent.WebhookCreate,
    });

    for (const webhook of webhooks.values()) {
      const entry = auditLogs.entries.find((e) => e.targetId === webhook.id);
      if (!entry) continue;

      const creatorId = entry.executorId;
      if (creatorId === guild.ownerId || isWhitelistedOwner(creatorId)) continue;

      try {
        await webhook.delete("Anti-nuke: unauthorized webhook creation");
        await sendLog(
          guild,
          modEmbed(
            0xff4444,
            "Webhook Deleted",
            `Unauthorized webhook **${webhook.name}** created by <@${creatorId}> in <#${channel.id}> was deleted.`
          )
        );
      } catch (err) {
        console.error("Failed to delete webhook:", err.message);
      }
    }
  } catch (err) {
    console.error("webhookUpdate error:", err.message);
  }
}
