import { PermissionFlagsBits, ChannelType } from "discord.js";
import { getData, saveData } from "./storage.js";
import { sendLog, modEmbed } from "./logger.js";
import { isWhitelistedOwner, isWhitelistedBot } from "./permissions.js";
import { markBotBan } from "./botActions.js";

const spamTracker = new Map();
const mentionTracker = new Map();
const SPAM_THRESHOLD = 5;
const SPAM_WINDOW = 5000;
const MENTION_THRESHOLD = 2;
const SPAM_TIMEOUT_MS = 5 * 60 * 1000;

export async function handleSpamCheck(message) {
  const userId = message.author.id;
  const now = Date.now();

  if (!spamTracker.has(userId)) {
    spamTracker.set(userId, { timestamps: [], messageIds: [], channelId: message.channel.id });
  }

  const tracker = spamTracker.get(userId);
  tracker.timestamps = tracker.timestamps.filter((t) => now - t < SPAM_WINDOW);
  tracker.timestamps.push(now);
  tracker.messageIds.push(message.id);
  tracker.channelId = message.channel.id;

  if (tracker.timestamps.length >= SPAM_THRESHOLD) {
    spamTracker.delete(userId);

    await message.delete().catch(() => {});

    try {
      const messages = await message.channel.messages.fetch({ limit: 20 }).catch(() => null);
      if (messages) {
        const spamMsgs = messages.filter(
          (m) => m.author.id === userId && Date.now() - m.createdTimestamp < SPAM_WINDOW + 2000
        );
        if (spamMsgs.size > 1) {
          await message.channel.bulkDelete(spamMsgs).catch(() => {});
        }
      }
    } catch {}

    try {
      await message.member?.timeout(SPAM_TIMEOUT_MS, "Anti-spam: sending messages too fast");
      await sendLog(
        message.guild,
        modEmbed(
          0xffa500,
          "Anti-Spam: User Timed Out",
          `<@${userId}> was timed out for **5 minutes** for spamming (${SPAM_THRESHOLD}+ messages in 5 seconds).`
        )
      );
    } catch {}
  }
}

export async function handleMentionCheck(message) {
  const userId = message.author.id;
  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount < 3) return;

  const data = getData();
  if (!data._mentionStrikes) data._mentionStrikes = {};
  data._mentionStrikes[userId] = (data._mentionStrikes[userId] || 0) + 1;
  await saveData();

  if (data._mentionStrikes[userId] >= MENTION_THRESHOLD) {
    try {
      await message.delete().catch(() => {});
      await message.member?.kick("Anti-raid: mass mentioning users");
      data._mentionStrikes[userId] = 0;
      await saveData();
      await sendLog(
        message.guild,
        modEmbed(0xff4444, "Mass Mention Kick", `<@${userId}> was kicked for mass mentioning.`)
      );
    } catch {}
  } else {
    await message.delete().catch(() => {});
    await sendLog(
      message.guild,
      modEmbed(
        0xffa500,
        "Mass Mention Warning",
        `<@${userId}> warned for mass mention (strike ${data._mentionStrikes[userId]}/${MENTION_THRESHOLD}).`
      )
    );
  }
}

const GIF_DOMAINS = [
  "tenor.com",
  "c.tenor.com",
  "media.tenor.com",
  "giphy.com",
  "media.giphy.com",
  "i.giphy.com",
  "media0.giphy.com",
  "media1.giphy.com",
  "media2.giphy.com",
  "media3.giphy.com",
  "media4.giphy.com",
  "gfycat.com",
  "thumbs.gfycat.com",
  "giant.gfycat.com",
  "imgur.com",
  "i.imgur.com",
  "klipy.com",
  "www.klipy.com",
  "media.klipy.com",
];

function isGifLink(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (GIF_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d))) return true;
    if (parsed.pathname.toLowerCase().endsWith(".gif")) return true;
  } catch {}
  return false;
}

function isHidingUrl(content, url) {
  const maskedLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
  let match;
  while ((match = maskedLinkRegex.exec(content)) !== null) {
    if (match[2] === url) return true;
  }
  return false;
}

export async function handleLinkFilter(message) {
  const ALLOWED_ROLE_IDS = [
    "1489027942137860116",
    "1480340173442125844",
    "1488894822327779348",
    "1489206286871433257",
  ];

  const memberRoleIds = message.member?.roles.cache.map((r) => r.id) || [];
  const hasExemptRole = ALLOWED_ROLE_IDS.some((id) => memberRoleIds.includes(id));
  if (hasExemptRole) return;

  if (message.attachments.size > 0 && !message.content.trim()) return;

  const INVITE_REGEX = /discord(?:\.gg|(?:app)?\.com\/invite)\/[a-zA-Z0-9-]+/i;
  const URL_REGEX = /https?:\/\/[^\s]+/gi;

  const content = message.content;

  if (INVITE_REGEX.test(content)) {
    await message.delete().catch(() => {});
    await sendLog(
      message.guild,
      modEmbed(0xff0000, "Invite Link Blocked", `<@${message.author.id}> tried to send an invite link.`)
    );
    return;
  }

  const urls = content.match(URL_REGEX) || [];
  const blockedUrls = urls.filter((url) => {
    if (isGifLink(url)) {
      if (isHidingUrl(content, url)) return true;
      return false;
    }
    return true;
  });

  if (blockedUrls.length > 0) {
    await message.delete().catch(() => {});
    await sendLog(
      message.guild,
      modEmbed(0xff8800, "Link Deleted", `<@${message.author.id}> tried to send a non-allowed link.`)
    );
  }
}

export async function handleDangerousRole(role) {
  const guild = role.guild;
  const data = getData();
  const whitelistedOwners = data.whitelistedOwners || [];

  if (role.permissions.has(PermissionFlagsBits.Administrator)) {
    try {
      const auditLogs = await guild.fetchAuditLogs({ limit: 5, type: 30 }).catch(() => null);
      if (auditLogs) {
        const entry = auditLogs.entries.find((e) => e.targetId === role.id);
        if (entry) {
          const creatorId = entry.executor?.id;
          if (
            creatorId &&
            creatorId !== guild.ownerId &&
            !whitelistedOwners.includes(creatorId)
          ) {
            await role.delete("Anti-nuke: dangerous admin role created").catch(() => {});
            await sendLog(
              guild,
              modEmbed(
                0xff0000,
                "Dangerous Role Deleted",
                `A role with Administrator permission was created by <@${creatorId}> and was deleted.`
              )
            );
            return;
          }
        }
      }
      await sendLog(
        guild,
        modEmbed(
          0xff8800,
          "Dangerous Role Created",
          `Role **${role.name}** has Administrator permission. Created by server owner or whitelisted user — allowed.`
        )
      );
    } catch (err) {
      console.error("Error handling dangerous role:", err.message);
    }
  }
}

export async function handleChannelDelete(channel) {
  const guild = channel.guild;
  const data = getData();

  const auditLogs = await guild.fetchAuditLogs({ limit: 5, type: 12 }).catch(() => null);
  if (!auditLogs) return;
  const entry = auditLogs.entries.first();
  if (!entry) return;

  const executorId = entry.executor?.id;
  if (
    !executorId ||
    executorId === guild.ownerId ||
    (data.whitelistedOwners || []).includes(executorId)
  )
    return;

  const logChannelId = data.logChannelId || "1484747550505308302";
  const isLogChannel = channel.id === logChannelId;

  if (isLogChannel) {
    const executorUser = await guild.client.users.fetch(executorId).catch(() => null);
    const oldChannelName = channel.name;

    try {
      if (executorUser) {
        await executorUser
          .send(
            `You have been banned from **${guild.name}**.\nReason: Deleted the server logs channel.\n\nYou can appeal here: https://discord.gg/FjGk7YbmAQ`
          )
          .catch(() => {});
      }
      markBotBan(guild.id, executorId);
      await guild.members.ban(executorId, { reason: "Deleted the server logs channel" });
    } catch (err) {
      console.error("Failed to ban log channel deleter:", err.message);
    }

    try {
      const adminRole = guild.roles.cache.find(
        (r) => r.permissions.has(PermissionFlagsBits.Administrator) && r.id !== guild.id
      );

      const newChannel = await guild.channels.create({
        name: "server-logs",
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          ...(adminRole
            ? [
                {
                  id: adminRole.id,
                  allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                  ],
                },
              ]
            : []),
          {
            id: guild.client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ],
        topic: "Server security logs — restricted to Administrators",
        reason: "Auto-recreated after logs channel was deleted",
      });

      data.logChannelId = newChannel.id;
      await saveData();

      await newChannel.send({
        embeds: [
          modEmbed(
            0xff0000,
            "⚠️ Logs Channel Was Deleted & Recreated",
            `The previous log channel (**#${oldChannelName}** / \`${logChannelId}\`) was deleted by <@${executorId}>.\n\nThat user has been **banned** and this new channel has been created as the new log channel.`,
            [
              { name: "Deleted By", value: `<@${executorId}>` },
              { name: "Old Channel", value: `#${oldChannelName} (\`${logChannelId}\`)` },
              { name: "New Channel", value: `<#${newChannel.id}>` },
              { name: "Action Taken", value: "Banned — appeal: https://discord.gg/FjGk7YbmAQ" },
            ]
          ),
        ],
      });
    } catch (err) {
      console.error("Failed to recreate log channel:", err.message);
    }
    return;
  }

  if (!data.channelDeletions) data.channelDeletions = {};
  if (!data.channelDeletions[executorId]) {
    data.channelDeletions[executorId] = { count: 0, firstAt: Date.now() };
  }

  const window = 30000;
  const tracker = data.channelDeletions[executorId];
  if (Date.now() - tracker.firstAt > window) {
    tracker.count = 0;
    tracker.firstAt = Date.now();
  }

  tracker.count += 1;
  await saveData();

  if (tracker.count >= 4) {
    tracker.count = 0;
    await saveData();

    const member = await guild.members.fetch(executorId).catch(() => null);
    if (member) {
      const roles = member.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id);
      data.strippedRoles = data.strippedRoles || {};
      data.strippedRoles[executorId] = roles;
      await saveData();

      try {
        await member.roles.set([], "Anti-nuke: mass channel deletion detected");
        await sendLog(
          guild,
          modEmbed(
            0xff0000,
            "Anti-Nuke: Roles Stripped",
            `<@${executorId}> deleted 4+ channels rapidly. All roles have been removed.`,
            [{ name: "Roles Removed", value: roles.map((r) => `<@&${r}>`).join(", ") || "None" }]
          )
        );
      } catch {}
    }
  }
}
