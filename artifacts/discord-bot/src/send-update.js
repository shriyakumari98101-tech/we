import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const MAIN_UPDATE_CHANNEL = "1488618228401045667";
const APPEAL_INFO_CHANNEL = "1489536634834780312";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await sendMainUpdate();
  await sendAppealUpdate();
  console.log("Done. Exiting.");
  process.exit(0);
});

async function sendMainUpdate() {
  const channel = await client.channels.fetch(MAIN_UPDATE_CHANNEL).catch(() => null);
  if (!channel) return console.error("Main update channel not found.");

  const embed = new EmbedBuilder()
    .setColor(0x7289da)
    .setTitle("🛡️ SEB Security — Major Update")
    .setDescription("A large update has been applied to the bot and web panel. Here's what's new:")
    .addFields(
      {
        name: "🌐 Web Panel — Moderation Actions",
        value:
          "You can now moderate users directly from the web panel:\n" +
          "• **Moderators** — Timeout & Warn users\n" +
          "• **Admins** — Timeout, Warn, Kick, and Ban (ban automatically queues an appeal)\n" +
          "• **Owner** — All actions\n\n" +
          "All web actions are logged to the server log channel.",
      },
      {
        name: "🔑 QR Code Login",
        value:
          "Web panel accounts now support **QR token login**.\n" +
          "When an account is created, the bot DMs you a QR code image and a token string.\n" +
          "On the login page, switch to the **QR Token** tab and paste your token to log in instantly — no username or password needed.",
      },
      {
        name: "🔐 Password Change via DM",
        value:
          "You can now change your web panel password from **Settings**.\n" +
          "After entering your new password, the bot DMs you on Discord to confirm. Click confirm and the change goes live immediately.",
      },
      {
        name: "🔄 Shift Account — Upgraded",
        value:
          "The shift system is now smarter:\n" +
          "• If the target Discord user **already has an account**, this account gets reassigned to them directly.\n" +
          "• If they **don't have an account**, the bot DMs them an invitation with Confirm/Decline buttons. On confirm, an account is auto-created with their Discord username and a random password — QR code included.\n" +
          "• The target user is **always DM'd first** before any account is created or transferred.",
      },
      {
        name: "⚙️ Settings — Language & Password",
        value:
          "Two new settings have been added to the panel:\n" +
          "• **Language** — Save your preferred language (20+ supported)\n" +
          "• **Change Password** — Request a change, confirm it via Discord DM",
      },
      {
        name: "🔒 Filter Fixes",
        value:
          "• **GIF links** from Tenor, Giphy, Gfycat, and Imgur are no longer deleted\n" +
          "• **Images and pictures** sent without text are now ignored by the link filter\n" +
          "• **Mild words** (wtf, shit, ass, damn, etc.) are no longer blocked — only serious slurs and explicit language remain filtered",
      }
    )
    .setFooter({ text: "SEB Security Bot" })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  console.log("Main update sent.");
}

async function sendAppealUpdate() {
  const channel = await client.channels.fetch(APPEAL_INFO_CHANNEL).catch(() => null);
  if (!channel) return console.error("Appeal info channel not found.");

  const embed = new EmbedBuilder()
    .setColor(0x7289da)
    .setTitle("📩 Ban Appeal System — AI Detection Updated")
    .setDescription(
      "The AI detection system for ban appeals has been **fully rebuilt** and is significantly more accurate.\n\n" +
      "**What changed:**\n" +
      "• The new system analyzes your writing directly — looking at word choice, sentence structure, phrasing patterns, and tone\n" +
      "• It detects AI-generated text even without any third-party service — the analysis runs entirely on the bot\n" +
      "• Common AI giveaways are now flagged: formal apology phrases, transition words, uniform sentence lengths, overly structured paragraphs, and corporate-sounding language\n" +
      "• Natural human writing — casual tone, informal words, typos, short answers — is recognized and allowed through\n\n" +
      "**What this means for you:**\n" +
      "If you write your appeal in your **own words**, naturally and honestly, it will pass.\n" +
      "If you use AI to write it — even partially — it will very likely be detected and rejected.\n\n" +
      "**Tips:**\n" +
      "• Write like you talk. Short, honest answers are fine.\n" +
      "• Don't use phrases like *\"Going forward\"*, *\"I sincerely apologize\"*, or *\"I take full responsibility\"*\n" +
      "• Don't use transition words like *\"Furthermore\"* or *\"Moreover\"*\n" +
      "• You don't need to write an essay — just be genuine"
    )
    .setFooter({ text: "SEB Security Bot" })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  console.log("Appeal update sent.");
}

client.login(TOKEN);
