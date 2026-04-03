import { Events } from "discord.js";
import { getData, saveData } from "../modules/storage.js";
import { isWhitelistedOwner } from "../modules/permissions.js";
import { handleSpamCheck, handleMentionCheck, handleLinkFilter } from "../modules/antinuke.js";
import { sendLog, modEmbed } from "../modules/logger.js";
import { findProfanity } from "../modules/profanity.js";
import {
  getSession,
  clearSession,
  getQuestion,
  submitAppeal,
  SERVER_BAN_QUESTIONS,
  GAME_BAN_QUESTIONS,
} from "../modules/appealSystem.js";

export const name = Events.MessageCreate;
export const once = false;

const PROFANITY_WARN_THRESHOLD = 4;

export async function execute(message) {
  if (message.author.bot) return;

  if (!message.guild) {
    await handleDmMessage(message);
    return;
  }

  if (isWhitelistedOwner(message.author.id)) return;

  await handleSpamCheck(message);
  await handleMentionCheck(message);
  await handleLinkFilter(message);

  const textContent = message.content.trim();
  if (textContent.length > 0) {
    const badWord = findProfanity(textContent);
    if (badWord) {
      await message.delete().catch(() => {});
      await handleProfanityStrike(message, badWord);
      return;
    }
  }

  const data = getData();
  const guildPrefix = data.prefixes?.[message.guild.id];
  if (!guildPrefix) return;
  if (!message.content.startsWith(guildPrefix)) return;

  const args = message.content.slice(guildPrefix.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();
  const command = message.client.prefixCommands?.get(commandName);
  if (!command) return;

  try {
    await command.executePrefix(message, args);
  } catch (err) {
    console.error("Prefix command error:", err);
    await message.reply("An error occurred while running that command.").catch(() => {});
  }
}

async function handleProfanityStrike(message, word) {
  const userId = message.author.id;
  const guildId = message.guild.id;
  const data = getData();

  if (!data._profanityStrikes) data._profanityStrikes = {};
  if (!data._profanityStrikes[guildId]) data._profanityStrikes[guildId] = {};

  const current = (data._profanityStrikes[guildId][userId] || 0) + 1;
  data._profanityStrikes[guildId][userId] = current;
  await saveData();

  const remaining = PROFANITY_WARN_THRESHOLD - current;

  if (current >= PROFANITY_WARN_THRESHOLD) {
    data._profanityStrikes[guildId][userId] = 0;
    await saveData();

    if (!data.warns) data.warns = {};
    if (!data.warns[guildId]) data.warns[guildId] = {};
    if (!data.warns[guildId][userId]) data.warns[guildId][userId] = [];
    data.warns[guildId][userId].push({
      reason: "Repeated use of prohibited language",
      at: Date.now(),
    });
    await saveData();

    await message.author
      .send(
        `Your message in **${message.guild.name}** was deleted.\n\n**Reason:** It contained a prohibited word.\n\nYou have received a **formal warning** for repeatedly using prohibited language. Further violations may result in a timeout or ban.`
      )
      .catch(() => {});

    await sendLog(
      message.guild,
      modEmbed(
        0xff0000,
        "Profanity Warning Issued",
        `<@${userId}> received a warning for repeated use of prohibited language (reached ${PROFANITY_WARN_THRESHOLD} deletions).`
      )
    );
  } else {
    await message.author
      .send(
        `Your message in **${message.guild.name}** was deleted.\n\n**Reason:** It contained a prohibited word.\n\nPlease keep the chat clean. ${remaining > 0 ? `If you continue, you will receive a warning after ${remaining} more violation${remaining === 1 ? "" : "s"}.` : ""}`
      )
      .catch(() => {});
  }
}

async function handleDmMessage(message) {
  const userId = message.author.id;
  const session = getSession(userId);
  if (!session) return;

  const content = message.content.trim();
  const attachment = message.attachments.first();

  if (session.type === "game" && session.step === 0) {
    session.answers.push(content);

    const lower = content.toLowerCase();
    const ANTI_CHEAT_KEYWORDS = [
      "anticheat", "anti-cheat", "anti cheat",
      "eac", "vac", "battleye", "easy anti cheat",
    ];
    session.isAntiCheat = ANTI_CHEAT_KEYWORDS.some((kw) => lower.includes(kw));

    if (session.isAntiCheat) {
      session.step = 1;
      await message.author
        .send(
          "We do not appeal anti-cheat bans. However, if you have a recording of the time you were banned, it may help your case.\n\nPlease send a YouTube video link or upload a video file directly here. Type `skip` if you have nothing to provide."
        )
        .catch(() => {});
      return;
    }

    session.step = 1;
    await message.author
      .send("Please send a **screenshot** of the ban message. Upload it as an image directly in this DM.")
      .catch(() => {});
    return;
  }

  if (session.type === "game" && session.step === 1) {
    if (session.isAntiCheat) {
      if (content.toLowerCase() !== "skip") {
        const ytRegex = /(?:youtu\.be\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)/i;
        if (ytRegex.test(content) || content.startsWith("http")) {
          session.mediaUrl = content;
          session.answers.push(`Video: ${content}`);
        } else if (attachment) {
          session.mediaUrl = attachment.url;
          session.answers.push(`Video attachment: ${attachment.url}`);
        } else {
          session.answers.push("No recording provided.");
        }
      } else {
        session.answers.push("No recording provided.");
      }
      await submitAppeal(message.client, userId, session);
      return;
    }

    if (attachment && attachment.contentType?.startsWith("image/")) {
      session.screenshotUrl = attachment.url;
      session.answers.push(`Screenshot: ${attachment.url}`);
    } else if (attachment) {
      session.answers.push(`Attachment: ${attachment.url}`);
    } else {
      session.answers.push(content.length > 0 ? content : "No screenshot provided.");
    }

    session.step = 2;
    const firstGameQ = getQuestion(session);
    if (firstGameQ) {
      await message.author
        .send(`**Question 1/${GAME_BAN_QUESTIONS.length}:** ${firstGameQ}`)
        .catch(() => {});
    }
    return;
  }

  session.answers.push(content);
  session.step += 1;

  const nextQ = getQuestion(session);
  if (nextQ) {
    let questionNum;
    let total;
    if (session.type === "server") {
      questionNum = session.step + 1;
      total = SERVER_BAN_QUESTIONS.length;
    } else {
      questionNum = session.step - 1;
      total = GAME_BAN_QUESTIONS.length;
    }
    await message.author
      .send(`**Question ${questionNum}/${total}:** ${nextQ}`)
      .catch(() => {});
    return;
  }

  await submitAppeal(message.client, userId, session);
}
