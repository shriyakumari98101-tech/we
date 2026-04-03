import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createServer } from "http";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getData, saveData } from "./storage.js";
import { getClient } from "./clientRef.js";
import { PermissionFlagsBits } from "discord.js";
import { generateQrAttachment } from "./qrHelper.js";
import { generateToken } from "../commands/usercreate.js";
import { getBaseUrl, isSecureEnvironment, isReplitDev } from "./urlHelper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function cookieOptions(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const secure = isSecureEnvironment();
  return {
    httpOnly: true,
    secure,
    maxAge: maxAgeMs,
    sameSite: (secure && isReplitDev()) ? "none" : "lax",
  };
}

const MAIN_GUILD_ID = "1480339629465927680";
const APPEAL_GUILD_ID = "1479899007219142806";
const APPROVER_ROLE_ID = "1489530613601144904";
const JWT_SECRET = process.env.SESSION_SECRET || "seb_security_secret_fallback";

async function getAccessLevel(discordId) {
  const client = getClient();
  const data = getData();

  if (data.whitelistedOwners?.includes(discordId)) return "whitelist";

  if (!client) {
    const isPanelUser = Object.values(data.users || {}).some((u) => u.discordId === discordId);
    return isPanelUser ? "mod" : "guest";
  }

  const mainGuild = client.guilds.cache.get(MAIN_GUILD_ID);
  const appealGuild = client.guilds.cache.get(APPEAL_GUILD_ID);

  if (mainGuild?.ownerId === discordId) return "owner";

  const member = await mainGuild?.members.fetch(discordId).catch(() => null);

  if (member?.permissions.has(PermissionFlagsBits.Administrator)) return "administrator";
  if (
    member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member?.permissions.has(PermissionFlagsBits.BanMembers)
  ) return "admin";
  if (
    member?.permissions.has(PermissionFlagsBits.KickMembers) ||
    member?.permissions.has(PermissionFlagsBits.ModerateMembers)
  ) return "mod";

  const appealMember = await appealGuild?.members.fetch(discordId).catch(() => null);
  if (appealMember?.roles.cache.has(APPROVER_ROLE_ID)) return "appeal_staff";

  return "guest";
}

function hasAppealAccess(level) {
  return ["appeal_staff", "admin", "administrator", "whitelist", "owner"].includes(level);
}

function hasLogAccess(level) {
  return ["mod", "admin", "administrator", "whitelist", "owner"].includes(level);
}

function hasShiftAccess(level) {
  return ["administrator", "whitelist", "owner"].includes(level);
}

function hasModerationAccess(level) {
  return ["mod", "admin", "administrator", "whitelist", "owner"].includes(level);
}

function hasAccountsAccess(level) {
  return ["whitelist", "owner"].includes(level);
}

function canBan(level) {
  return ["admin", "administrator", "whitelist", "owner"].includes(level);
}

function canKick(level) {
  return ["admin", "administrator", "whitelist", "owner"].includes(level);
}

function canTimeout(level) {
  return ["mod", "admin", "administrator", "whitelist", "owner"].includes(level);
}

function requireAuth(req, res, next) {
  // Accept token from Authorization header (sessionStorage approach) or cookie (fallback)
  let token = req.cookies?.auth_token;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7);
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie("auth_token", cookieOptions(0));
    return res.status(401).json({ error: "Session expired" });
  }
}

export function startWebServer() {
  const app = express();
  const port = process.env.PORT || 3000;

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(join(__dirname, "../web")));

  app.get("/", (req, res) => {
    res.redirect("/login");
  });

  app.get("/login", (req, res) => {
    const data = getData();
    const userCount = Object.keys(data.users || {}).length;
    if (userCount === 0) return res.redirect("/setup");
    res.sendFile(join(__dirname, "../web/login.html"));
  });

  app.get("/panel", (req, res) => {
    res.sendFile(join(__dirname, "../web/panel.html"));
  });

  app.get("/setup", (req, res) => {
    const data = getData();
    const userCount = Object.keys(data.users || {}).length;
    if (userCount > 0) return res.redirect("/login");
    res.sendFile(join(__dirname, "../web/setup.html"));
  });

  app.post("/api/setup", async (req, res) => {
    const data = getData();
    const userCount = Object.keys(data.users || {}).length;
    if (userCount > 0) return res.status(403).json({ error: "Setup already complete — accounts already exist" });

    const { username, discordId, password } = req.body || {};
    if (!username || !discordId || !password) return res.status(400).json({ error: "Username, Discord ID and password required" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    if (!/^\d{17,20}$/.test(discordId)) return res.status(400).json({ error: "Invalid Discord User ID" });

    const cleanUsername = username.toLowerCase().replace(/\s+/g, "_");
    const { generateToken } = await import("../commands/usercreate.js");
    const hashedPassword = await bcrypt.hash(password, 10);
    const qrToken = generateToken();

    if (!data.users) data.users = {};
    data.users[cleanUsername] = {
      username: cleanUsername,
      discordId,
      passwordHash: hashedPassword,
      plainPassword: password,
      qrToken,
      createdAt: Date.now(),
      createdBy: "setup",
      settings: { color: "default", language: "en" },
      shiftedTo: null,
    };
    await saveData();
    res.json({ ok: true, qrToken });
  });

  app.get("/changepassword", (req, res) => {
    res.sendFile(join(__dirname, "../web/changepassword.html"));
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok", bot: getClient()?.isReady() ? "online" : "starting" });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });

    const data = getData();
    const user = data.users?.[username.toLowerCase()];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ username: user.username, discordId: user.discordId }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("auth_token", token, cookieOptions());
    res.json({ ok: true, token });
  });

  app.post("/api/auth/qrlogin", (req, res) => {
    const { token: qrToken } = req.body || {};
    if (!qrToken) return res.status(400).json({ error: "QR token required" });

    const data = getData();
    const user = Object.values(data.users || {}).find((u) => u.qrToken === qrToken.trim());
    if (!user) return res.status(401).json({ error: "Invalid or expired QR token" });

    const jwtToken = jwt.sign({ username: user.username, discordId: user.discordId }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("auth_token", jwtToken, cookieOptions());
    res.json({ ok: true, token: jwtToken });
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("auth_token", cookieOptions(0));
    res.json({ ok: true });
  });

  app.get("/api/me", requireAuth, async (req, res) => {
    const data = getData();
    const user = data.users?.[req.user.username];
    if (!user) return res.status(404).json({ error: "User not found" });

    const accessLevel = await getAccessLevel(user.discordId);
    res.json({
      username: user.username,
      discordId: user.discordId,
      accessLevel,
      settings: user.settings || { color: "default", language: "en" },
      hasAppealAccess: hasAppealAccess(accessLevel),
      hasLogAccess: hasLogAccess(accessLevel),
      hasShiftAccess: hasShiftAccess(accessLevel),
      hasModerationAccess: hasModerationAccess(accessLevel),
      hasAccountsAccess: hasAccountsAccess(accessLevel),
      canBan: canBan(accessLevel),
      canKick: canKick(accessLevel),
      canTimeout: canTimeout(accessLevel),
    });
  });

  app.get("/api/appeals", requireAuth, async (req, res) => {
    const data = getData();
    const user = data.users?.[req.user.username];
    if (!user) return res.status(403).json({ error: "Forbidden" });
    const level = await getAccessLevel(user.discordId);
    if (!hasAppealAccess(level)) return res.status(403).json({ error: "Forbidden" });

    const status = req.query.status;
    let appeals = data.appeals || [];
    if (status) appeals = appeals.filter((a) => a.status === status);
    res.json(appeals.slice(0, 100));
  });

  app.get("/api/logs", requireAuth, async (req, res) => {
    const data = getData();
    const user = data.users?.[req.user.username];
    if (!user) return res.status(403).json({ error: "Forbidden" });
    const level = await getAccessLevel(user.discordId);
    if (!hasLogAccess(level)) return res.status(403).json({ error: "Forbidden" });
    res.json((data.recentLogs || []).slice(0, 100));
  });

  app.get("/api/settings", requireAuth, (req, res) => {
    const data = getData();
    const user = data.users?.[req.user.username];
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user.settings || { color: "default", language: "en" });
  });

  app.post("/api/settings", requireAuth, async (req, res) => {
    const { color, language } = req.body || {};
    const data = getData();
    const user = data.users?.[req.user.username];
    if (!user) return res.status(404).json({ error: "User not found" });

    user.settings = {
      color: color || user.settings?.color || "default",
      language: language || user.settings?.language || "en",
    };
    await saveData();
    res.json({ ok: true, settings: user.settings });
  });

  app.post("/api/password/request-change", requireAuth, async (req, res) => {
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const data = getData();
    const user = data.users?.[req.user.username];
    if (!user) return res.status(404).json({ error: "User not found" });

    const client = getClient();
    if (!client?.isReady()) return res.status(503).json({ error: "The Discord bot is not currently online. Set your DISCORD_BOT_TOKEN and restart to use password reset." });

    const confirmToken = generateToken();
    const hashedNew = await bcrypt.hash(newPassword, 10);

    if (!data._pendingPasswordChanges) data._pendingPasswordChanges = {};
    data._pendingPasswordChanges[user.discordId] = {
      confirmToken,
      newHash: hashedNew,
      newPlain: newPassword,
      username: user.username,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    await saveData();

    const discordUser = await client.users.fetch(user.discordId).catch(() => null);
    if (!discordUser) return res.status(400).json({ error: "Could not DM your Discord account" });

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_pw_${user.discordId}_${confirmToken}`)
        .setLabel("✅ Confirm Password Change")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`cancel_pw_${user.discordId}`)
        .setLabel("❌ Cancel")
        .setStyle(ButtonStyle.Danger)
    );

    await discordUser.send({
      content: `🔐 **Password Change Request**\n\nYou requested to change your web panel password for account \`${user.username}\`.\n\nClick below to confirm. This expires in **10 minutes**.`,
      components: [row],
    }).catch(() => {});

    res.json({ ok: true, message: "Check your Discord DMs to confirm the change." });
  });

  app.post("/api/password/send-code", async (req, res) => {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: "Username required" });

    const data = getData();
    const user = data.users?.[username.toLowerCase()];
    if (!user) return res.status(404).json({ error: "No account found with that username" });

    const client = getClient();
    if (!client?.isReady()) return res.status(503).json({ error: "The Discord bot is not currently online. Set your DISCORD_BOT_TOKEN and restart to use password reset." });

    const discordUser = await client.users.fetch(user.discordId).catch(() => null);
    if (!discordUser) return res.status(400).json({ error: "Could not reach your Discord account — ensure DMs are open" });

    const code = String(Math.floor(100000 + Math.random() * 900000));

    if (!data._passwordCodes) data._passwordCodes = {};
    data._passwordCodes[user.discordId] = {
      code,
      username: user.username,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    await saveData();

    await discordUser.send(
      `🔐 **SEB Security — Password Reset Code**\n\n` +
      `Your one-time password reset code for account \`${user.username}\` is:\n\n` +
      `## \`${code}\`\n\n` +
      `This code expires in **10 minutes**. Do not share it with anyone.\n` +
      `If you did not request this, you can safely ignore this message.`
    ).catch(() => {});

    res.json({ ok: true });
  });

  app.post("/api/password/change-with-code", async (req, res) => {
    const { username, code, newPassword } = req.body || {};
    if (!username || !code || !newPassword) {
      return res.status(400).json({ error: "Username, code and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const data = getData();
    const user = data.users?.[username.toLowerCase()];
    if (!user) return res.status(404).json({ error: "Account not found" });

    const pending = data._passwordCodes?.[user.discordId];
    if (!pending) return res.status(400).json({ error: "No code found — request a new one" });
    if (Date.now() > pending.expiresAt) {
      delete data._passwordCodes[user.discordId];
      await saveData();
      return res.status(400).json({ error: "Code has expired — request a new one" });
    }
    if (pending.code !== code.trim()) {
      return res.status(400).json({ error: "Incorrect code" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.plainPassword = newPassword;
    delete data._passwordCodes[user.discordId];
    await saveData();

    const client = getClient();
    const discordUser = await client?.users.fetch(user.discordId).catch(() => null);
    await discordUser?.send(
      `✅ **Password changed successfully** for account \`${user.username}\`.\n` +
      `Your new password is now active. You can log in at: ${getBaseUrl()}/login`
    ).catch(() => {});

    res.json({ ok: true });
  });

  app.post("/api/password/change-with-qr", async (req, res) => {
    const { username, qrToken, newPassword } = req.body || {};
    if (!username || !qrToken || !newPassword) {
      return res.status(400).json({ error: "Username, QR token and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const data = getData();
    const user = data.users?.[username.toLowerCase()];
    if (!user) return res.status(404).json({ error: "Account not found" });
    if (!user.qrToken || user.qrToken !== qrToken.trim()) {
      return res.status(401).json({ error: "Invalid QR token" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.plainPassword = newPassword;
    await saveData();

    const client = getClient();
    if (client?.isReady()) {
      const discordUser = await client.users.fetch(user.discordId).catch(() => null);
      await discordUser?.send(
        `✅ **Password changed successfully** for account \`${user.username}\`.\n` +
        `Your new password is now active. You can log in at: ${getBaseUrl()}/login`
      ).catch(() => {});
    }

    res.json({ ok: true });
  });

  app.get("/api/accounts", requireAuth, async (req, res) => {
    const data = getData();
    const user = data.users?.[req.user.username];
    if (!user) return res.status(403).json({ error: "Forbidden" });
    const level = await getAccessLevel(user.discordId);
    if (!hasAccountsAccess(level)) return res.status(403).json({ error: "Forbidden" });

    const accounts = Object.values(data.users || {}).map((u) => ({
      username: u.username,
      discordId: u.discordId,
      plainPassword: u.plainPassword || null,
      createdAt: u.createdAt || null,
    }));

    res.json(accounts);
  });

  app.delete("/api/accounts/:username", requireAuth, async (req, res) => {
    const data = getData();
    const user = data.users?.[req.user.username];
    if (!user) return res.status(403).json({ error: "Forbidden" });
    const level = await getAccessLevel(user.discordId);
    if (!hasAccountsAccess(level)) return res.status(403).json({ error: "Forbidden" });

    const target = req.params.username.toLowerCase();
    if (target === req.user.username) return res.status(400).json({ error: "Cannot delete your own account" });
    if (!data.users?.[target]) return res.status(404).json({ error: "Account not found" });

    delete data.users[target];
    await saveData();
    res.json({ ok: true });
  });

  app.post("/api/moderation/timeout", requireAuth, async (req, res) => {
    const { userId, minutes, reason } = req.body || {};
    if (!userId || !minutes) return res.status(400).json({ error: "userId and minutes required" });

    const data = getData();
    const caller = data.users?.[req.user.username];
    if (!caller) return res.status(403).json({ error: "Forbidden" });
    const level = await getAccessLevel(caller.discordId);
    if (!canTimeout(level)) return res.status(403).json({ error: "Insufficient permissions" });

    const client = getClient();
    if (!client) return res.status(500).json({ error: "Bot not ready" });

    const guild = client.guilds.cache.get(MAIN_GUILD_ID);
    if (!guild) return res.status(500).json({ error: "Guild not found" });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return res.status(404).json({ error: "User not found in server" });

    const durationMs = Math.min(parseInt(minutes) * 60 * 1000, 28 * 24 * 60 * 60 * 1000);
    const finalReason = reason || `Timed out via web panel by ${caller.username}`;

    await member.timeout(durationMs, finalReason);

    const { sendLog, modEmbed } = await import("./logger.js");
    await sendLog(guild, modEmbed(0xffa500, "Web Panel: Timeout",
      `<@${userId}> was timed out for **${minutes}min** via the web panel.\n**By:** \`${caller.username}\`\n**Reason:** ${finalReason}`
    ));

    res.json({ ok: true, action: "timeout", target: userId, minutes });
  });

  app.post("/api/moderation/kick", requireAuth, async (req, res) => {
    const { userId, reason } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId required" });

    const data = getData();
    const caller = data.users?.[req.user.username];
    if (!caller) return res.status(403).json({ error: "Forbidden" });
    const level = await getAccessLevel(caller.discordId);
    if (!canKick(level)) return res.status(403).json({ error: "Insufficient permissions — need admin+" });

    const client = getClient();
    if (!client) return res.status(500).json({ error: "Bot not ready" });

    const guild = client.guilds.cache.get(MAIN_GUILD_ID);
    if (!guild) return res.status(500).json({ error: "Guild not found" });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return res.status(404).json({ error: "User not found in server" });

    const finalReason = reason || `Kicked via web panel by ${caller.username}`;
    await member.kick(finalReason);

    const { sendLog, modEmbed } = await import("./logger.js");
    await sendLog(guild, modEmbed(0xff8800, "Web Panel: Kick",
      `<@${userId}> was kicked via the web panel.\n**By:** \`${caller.username}\`\n**Reason:** ${finalReason}`
    ));

    res.json({ ok: true, action: "kick", target: userId });
  });

  app.post("/api/moderation/ban", requireAuth, async (req, res) => {
    const { userId, reason } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId required" });

    const data = getData();
    const caller = data.users?.[req.user.username];
    if (!caller) return res.status(403).json({ error: "Forbidden" });
    const level = await getAccessLevel(caller.discordId);
    if (!canBan(level)) return res.status(403).json({ error: "Insufficient permissions — need admin+" });

    const client = getClient();
    if (!client) return res.status(500).json({ error: "Bot not ready" });

    const guild = client.guilds.cache.get(MAIN_GUILD_ID);
    if (!guild) return res.status(500).json({ error: "Guild not found" });

    const finalReason = reason || `Banned via web panel by ${caller.username}`;

    let targetUser = null;
    try { targetUser = await client.users.fetch(userId); } catch {}

    if (targetUser) {
      await targetUser.send(
        `You have been **banned** from the server.\n**Reason:** ${finalReason}\n\nYou may appeal here: https://discord.gg/DCbbDTYRan`
      ).catch(() => {});
    }

    await guild.members.ban(userId, { reason: finalReason });

    const { sendLog, modEmbed } = await import("./logger.js");
    await sendLog(guild, modEmbed(0xff0000, "Web Panel: Ban",
      `<@${userId}> was banned via the web panel.\n**By:** \`${caller.username}\`\n**Reason:** ${finalReason}`
    ));

    const appealId = `${userId}_${Date.now()}`;
    if (!data.appeals) data.appeals = [];
    data.appeals.unshift({
      id: appealId,
      userId,
      userTag: targetUser?.tag || userId,
      type: "server",
      banReason: finalReason,
      answers: [],
      questions: [],
      status: "pending",
      reason: null,
      reviewedBy: null,
      messageId: null,
      submittedAt: null,
      reviewedAt: null,
      bannedViaPanel: true,
    });
    if (data.appeals.length > 500) data.appeals.length = 500;
    await saveData();

    res.json({ ok: true, action: "ban", target: userId });
  });

  app.post("/api/moderation/warn", requireAuth, async (req, res) => {
    const { userId, reason } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId required" });

    const data = getData();
    const caller = data.users?.[req.user.username];
    if (!caller) return res.status(403).json({ error: "Forbidden" });
    const level = await getAccessLevel(caller.discordId);
    if (!canTimeout(level)) return res.status(403).json({ error: "Insufficient permissions" });

    const client = getClient();
    const guild = client?.guilds.cache.get(MAIN_GUILD_ID);
    if (!guild) return res.status(500).json({ error: "Guild not found" });

    const finalReason = reason || `Warned via web panel by ${caller.username}`;
    const guildId = MAIN_GUILD_ID;

    if (!data.warns) data.warns = {};
    if (!data.warns[guildId]) data.warns[guildId] = {};
    if (!data.warns[guildId][userId]) data.warns[guildId][userId] = [];
    data.warns[guildId][userId].push({ reason: finalReason, at: Date.now(), by: caller.username });
    await saveData();

    const targetUser = await client.users.fetch(userId).catch(() => null);
    if (targetUser) {
      await targetUser.send(`⚠️ You have been **warned** in the server.\n**Reason:** ${finalReason}`).catch(() => {});
    }

    const { sendLog, modEmbed } = await import("./logger.js");
    await sendLog(guild, modEmbed(0xfaa61a, "Web Panel: Warn",
      `<@${userId}> was warned via the web panel.\n**By:** \`${caller.username}\`\n**Reason:** ${finalReason}`
    ));

    res.json({ ok: true, action: "warn", target: userId });
  });

  app.post("/api/shift", requireAuth, async (req, res) => {
    const { newDiscordId } = req.body || {};
    if (!newDiscordId) return res.status(400).json({ error: "newDiscordId required" });

    const data = getData();
    const user = data.users?.[req.user.username];
    if (!user) return res.status(404).json({ error: "User not found" });

    const level = await getAccessLevel(user.discordId);
    if (!hasShiftAccess(level)) return res.status(403).json({ error: "Forbidden" });

    const client = getClient();
    const targetUser = await client?.users.fetch(newDiscordId).catch(() => null);
    if (!targetUser) return res.status(400).json({ error: "Discord user not found" });

    const existingAccount = Object.values(data.users).find((u) => u.discordId === newDiscordId);
    const oldDiscordId = user.discordId;

    const notify = async (discordId, msg) => {
      const u = await client?.users.fetch(discordId).catch(() => null);
      await u?.send(msg).catch(() => {});
    };

    if (existingAccount) {
      user.discordId = newDiscordId;
      user.shiftedTo = newDiscordId;
      await saveData();

      await targetUser.send(
        `⚠️ **Account Shift Alert**\n\nThe web panel account \`${user.username}\` has been shifted to you from <@${oldDiscordId}>.\n\nYour existing account (\`${existingAccount.username}\`) remains unchanged.\n\nIf this was not expected, contact the server owner.`
      ).catch(() => {});

      const shiftMsg = `⚠️ **Account Shift Alert**\n\nThe web panel account \`${user.username}\` was shifted from <@${oldDiscordId}> to <@${newDiscordId}> (who already has an account).`;
      const mainGuild = client?.guilds.cache.get(MAIN_GUILD_ID);
      if (mainGuild?.ownerId) await notify(mainGuild.ownerId, shiftMsg);
      for (const wlId of data.whitelistedOwners || []) {
        if (wlId !== mainGuild?.ownerId) await notify(wlId, shiftMsg);
      }

      return res.json({ ok: true, newDiscordId, targetTag: targetUser.tag, hadExistingAccount: true });
    }

    if (!data._pendingShifts) data._pendingShifts = {};
    const shiftToken = generateToken();
    const randomPassword = generateToken().slice(3, 13);
    const discordUsername = targetUser.username;
    const newUsername = discordUsername.toLowerCase().replace(/[^a-z0-9_]/g, "_").substring(0, 20);
    const safeUsername = data.users[newUsername] ? `${newUsername}_${Math.floor(Math.random() * 1000)}` : newUsername;

    data._pendingShifts[newDiscordId] = {
      shiftToken,
      fromAccountUsername: user.username,
      fromDiscordId: oldDiscordId,
      newUsername: safeUsername,
      password: randomPassword,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    await saveData();

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_shift_${newDiscordId}_${shiftToken}`)
        .setLabel("✅ Accept Panel Access")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_shift_${newDiscordId}`)
        .setLabel("❌ Decline")
        .setStyle(ButtonStyle.Danger)
    );

    const base = getBaseUrl();
    await targetUser.send({
      content:
        `🛡️ **SEB Security — Web Panel Invitation**\n\n` +
        `<@${oldDiscordId}> is inviting you to access the web control panel.\n\n` +
        `If you accept, an account will be created for you:\n` +
        `**Username:** \`${safeUsername}\`\n` +
        `**Password:** \`${randomPassword}\`\n\n` +
        `**Login:** ${base}/login\n\nThis offer expires in **15 minutes**.`,
      components: [row],
    }).catch(() => {});

    res.json({ ok: true, newDiscordId, targetTag: targetUser.tag, pendingConfirmation: true });
  });

  app.get("/api/commands", (req, res) => {
    res.json(COMMAND_LIST);
  });

  const server = createServer(app);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Web server listening on port ${port}`);
  });
  return server;
}

const COMMAND_LIST = [
  { name: "/ban", description: "Ban a user from the server", category: "Moderation" },
  { name: "/kick", description: "Kick a user from the server", category: "Moderation" },
  { name: "/warn", description: "Warn a user", category: "Moderation" },
  { name: "/warns", description: "View warns for a user", category: "Moderation" },
  { name: "/clearwarns", description: "Clear all warns for a user", category: "Moderation" },
  { name: "/timeout", description: "Timeout a user", category: "Moderation" },
  { name: "/purge", description: "Delete multiple messages", category: "Moderation" },
  { name: "/lockdown", description: "Lock or unlock a channel", category: "Moderation" },
  { name: "/snipe", description: "Show the last deleted messages by a user", category: "Utility" },
  { name: "/userinfo", description: "Get info about a user", category: "Utility" },
  { name: "/serverinfo", description: "Get info about the server", category: "Utility" },
  { name: "/roblox", description: "View Roblox game stats", category: "Utility" },
  { name: "/whitelist", description: "Whitelist a bot", category: "Security" },
  { name: "/whitelistowner", description: "Whitelist a trusted owner", category: "Security" },
  { name: "/prefix", description: "Set a custom command prefix", category: "Config" },
  { name: "/usercreate", description: "Create a web panel account (owner only)", category: "Config" },
];
