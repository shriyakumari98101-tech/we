const pendingBans = new Set();
const pendingKicks = new Set();

export function markBotBan(guildId, userId) {
  const key = `${guildId}:${userId}`;
  pendingBans.add(key);
  setTimeout(() => pendingBans.delete(key), 8000);
}

export function markBotKick(guildId, userId) {
  const key = `${guildId}:${userId}`;
  pendingKicks.add(key);
  setTimeout(() => pendingKicks.delete(key), 8000);
}

export function isBotBan(guildId, userId) {
  return pendingBans.has(`${guildId}:${userId}`);
}

export function isBotKick(guildId, userId) {
  return pendingKicks.has(`${guildId}:${userId}`);
}
