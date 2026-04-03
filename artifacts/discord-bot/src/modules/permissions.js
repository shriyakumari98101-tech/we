import { PermissionFlagsBits } from "discord.js";
import { getData, saveData } from "./storage.js";

export function isWhitelistedOwner(userId) {
  const data = getData();
  return data.whitelistedOwners.includes(userId);
}

export function isWhitelistedBot(botId) {
  const data = getData();
  return data.whitelistedBots.includes(botId);
}

export function isServerOwner(member) {
  return member.guild.ownerId === member.id;
}

export function isTrusted(member) {
  return isServerOwner(member) || isWhitelistedOwner(member.id);
}

export function hasPermission(member, permission) {
  if (isTrusted(member)) return true;
  return member.permissions.has(permission);
}

export function hasBanPerm(member) {
  return hasPermission(member, PermissionFlagsBits.BanMembers);
}

export function hasKickPerm(member) {
  return hasPermission(member, PermissionFlagsBits.KickMembers);
}

export function hasTimeoutPerm(member) {
  return hasPermission(member, PermissionFlagsBits.ModerateMembers);
}

export function hasManageMessagesPerm(member) {
  return hasPermission(member, PermissionFlagsBits.ManageMessages);
}

export function getHighestRolePosition(member) {
  return member.roles.highest.position;
}

export function canModerate(executor, target) {
  if (isTrusted(executor)) return { ok: true };
  if (isServerOwner({ id: target.id, guild: executor.guild })) {
    return { ok: false, reason: "You cannot moderate the server owner." };
  }
  const execPos = getHighestRolePosition(executor);
  const targetPos = getHighestRolePosition(target);
  if (execPos <= targetPos) {
    return {
      ok: false,
      reason: `You cannot moderate **${target.user?.tag || target.displayName}** — they have an equal or higher role than you.`,
    };
  }
  return { ok: true };
}

const RATE_LIMIT_MS = 2 * 60 * 60 * 1000;

export async function checkRateLimit(guildId, userId, action) {
  const data = getData();
  if (!data.rateLimits) data.rateLimits = {};
  if (!data.rateLimits[guildId]) data.rateLimits[guildId] = {};
  if (!data.rateLimits[guildId][userId]) data.rateLimits[guildId][userId] = {};

  const key = data.rateLimits[guildId][userId][action];
  const now = Date.now();

  if (key && now - key < RATE_LIMIT_MS) {
    const remaining = Math.ceil((RATE_LIMIT_MS - (now - key)) / 60000);
    return { limited: true, remaining };
  }
  return { limited: false };
}

export async function consumeRateLimit(guildId, userId, action) {
  const data = getData();
  if (!data.rateLimits) data.rateLimits = {};
  if (!data.rateLimits[guildId]) data.rateLimits[guildId] = {};
  if (!data.rateLimits[guildId][userId]) data.rateLimits[guildId][userId] = {};
  data.rateLimits[guildId][userId][action] = Date.now();
  await saveData();
}
