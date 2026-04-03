import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { detectAIContent } from "./aiDetection.js";
import { getData, saveData } from "./storage.js";

export const MAIN_GUILD_ID = "1480339629465927680";
export const APPEAL_GUILD_ID = "1479899007219142806";
export const APPEAL_CHANNEL_ID = "1489530591400558642";
export const APPROVER_ROLE_ID = "1489530613601144904";
export const APPEAL_INVITE = "https://discord.gg/DCbbDTYRan";

export const SERVER_BAN_QUESTIONS = [
  "Please confirm your Discord username (your display name in the server).",
  "When were you banned? Give us an approximate date.",
  "Do you know the reason why you were banned? Describe it as best you can.",
  "Do you believe the ban was unfair or a mistake? Explain in your own words.",
  "Were you following the server rules at the time of your ban?",
  "Have you ever been warned or muted in this server before the ban?",
  "Did you have any ongoing conflicts with other members at the time?",
  "Were there other people involved in the situation that led to your ban?",
  "Do you have any evidence or context you can share to support your appeal?",
  "What do you think happened from your side of things?",
  "What will you do differently if you are unbanned?",
  "Is there anything else you want the staff to know before they make a decision?",
];

export const GAME_BAN_QUESTIONS = [
  "What is your in-game username?",
  "What were you doing in the game at the time of the ban?",
  "Do you think the ban was a mistake? If yes, explain exactly why.",
  "Have you ever been banned from this game before?",
  "Did you use any mods, hacks, or third-party tools while playing?",
  "Why should we give you another chance in the game?",
];


export const sessions = new Map();

export function createSession(userId, type, banReason = null) {
  sessions.set(userId, {
    type,
    step: 0,
    answers: [],
    banReason,
    isAntiCheat: false,
    awaitingMedia: false,
    mediaUrl: null,
    screenshotUrl: null,
  });
}

export function getSession(userId) {
  return sessions.get(userId);
}

export function clearSession(userId) {
  sessions.delete(userId);
}

export function getQuestion(session) {
  if (session.type === "server") {
    return SERVER_BAN_QUESTIONS[session.step] || null;
  }
  if (session.type === "game") {
    if (session.step === 0) return "Why were you banned? Describe what happened.";
    if (session.isAntiCheat) {
      if (session.step === 1) {
        return "We do not appeal anti-cheat bans. However, if you have a recording of the time you were banned, it may help your case.\n\nPlease send a YouTube video link or upload a video directly. Type `skip` if you do not have one.";
      }
      return null;
    }
    if (session.step === 1) {
      return "Please send a screenshot of the ban message. Upload it as an image directly in this DM.";
    }
    const qIndex = session.step - 2;
    return GAME_BAN_QUESTIONS[qIndex] || null;
  }
  return null;
}

export function buildApproveRow(userId, type) {
  const t = type === "server" ? "s" : "g";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_${userId}_${t}`)
      .setLabel("Approve Appeal")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`deny_${userId}_${t}`)
      .setLabel("Deny Appeal")
      .setStyle(ButtonStyle.Danger)
  );
}

export function buildAppealStartRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("start_server_ban")
      .setLabel("Server Ban Appeal")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("start_game_ban")
      .setLabel("In-Game Ban Appeal")
      .setStyle(ButtonStyle.Secondary)
  );
}

export function buildAppealAgainRow(type) {
  const t = type === "server" ? "s" : "g";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_again_${t}`)
      .setLabel("Appeal Again")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
  );
}

export async function submitAppeal(client, userId, session) {
  const user = await client.users.fetch(userId).catch(() => null);
  const appealGuild = client.guilds.cache.get(APPEAL_GUILD_ID);
  if (!appealGuild) return;

  const channel = await appealGuild.channels.fetch(APPEAL_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const allAnswers = session.answers;
  const combinedText = allAnswers.join("\n");

  if (user) {
    await user.send("Analyzing your appeal... please wait a moment.").catch(() => {});
  }

  const aiResult = await detectAIContent(combinedText);

  if (aiResult.isAI) {
    if (user) {
      await user
        .send({
          content:
            `Your appeal was flagged as AI-generated (${aiResult.confidence}% confidence).\n**Reason:** ${aiResult.reason}\n\nPlease write your own genuine response in your own words and try again.`,
          components: [buildAppealAgainRow(session.type)],
        })
        .catch(() => {});
    }
    clearSession(userId);
    return;
  }

  const typeLabel = session.type === "server" ? "SERVER BAN APPEAL" : "IN-GAME BAN APPEAL";
  const questions =
    session.type === "server"
      ? SERVER_BAN_QUESTIONS
      : session.isAntiCheat
      ? ["Why were you banned?", "Recording/video provided:"]
      : ["Why were you banned?", "Screenshot provided:", ...GAME_BAN_QUESTIONS];

  let description = "";
  if (session.type === "server" && session.banReason) {
    description += `**Fetched Ban Reason:** ${session.banReason}\n\n`;
  }

  allAnswers.forEach((answer, i) => {
    const q = questions[i] || `Question ${i + 1}`;
    description += `**${i + 1}. ${q}**\n${answer}\n\n`;
  });

  const embed = new EmbedBuilder()
    .setColor(session.type === "server" ? 0xff4444 : 0xff8800)
    .setTitle(typeLabel)
    .setDescription(description.substring(0, 4000))
    .addFields(
      { name: "User", value: `<@${userId}> (\`${userId}\`)` },
      { name: "AI Scan", value: `Human (${100 - aiResult.confidence}% confidence)` }
    )
    .setTimestamp();

  if (session.screenshotUrl) {
    embed.setImage(session.screenshotUrl);
  }

  const appealId = `${userId}_${Date.now()}`;

  const msg = await channel.send({
    content: `<@&${APPROVER_ROLE_ID}>`,
    embeds: [embed],
    components: [buildApproveRow(userId, session.type)],
  });

  if (session.mediaUrl) {
    await channel.send(`Recording/Video: ${session.mediaUrl}`).catch(() => {});
  }

  const data = getData();
  if (!data.appeals) data.appeals = [];
  data.appeals.unshift({
    id: appealId,
    userId,
    userTag: user?.tag || userId,
    type: session.type,
    banReason: session.banReason || null,
    answers: allAnswers,
    questions,
    status: "pending",
    reason: null,
    reviewedBy: null,
    messageId: msg.id,
    submittedAt: Date.now(),
    reviewedAt: null,
  });
  if (data.appeals.length > 500) data.appeals.length = 500;
  await saveData();

  if (user) {
    await user
      .send(
        "Your appeal has been submitted and is now under review.\n\nPlease do not leave the server while your appeal is being reviewed. You will receive a DM once a decision has been made."
      )
      .catch(() => {});
  }

  clearSession(userId);
}
