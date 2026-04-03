import { Client, GatewayIntentBits } from "discord.js";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.DISCORD_BOT_TOKEN;

const DATA_DIR = process.env.DATA_DIR
  ? process.env.DATA_DIR
  : join(__dirname, "../data");
const DATA_FILE = join(DATA_DIR, "botdata.json");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  let data;
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    data = JSON.parse(raw);
  } catch {
    console.error("Could not read botdata.json");
    process.exit(1);
  }

  const users = Object.values(data.users || {});
  if (!users.length) {
    console.log("No users found.");
    process.exit(0);
  }

  console.log(`Found ${users.length} accounts. Sending DMs...`);
  let sent = 0;
  let failed = 0;

  for (const user of users) {
    if (!user.discordId) continue;
    try {
      const discordUser = await client.users.fetch(user.discordId).catch(() => null);
      if (!discordUser) { failed++; continue; }

      await discordUser.send(
        `🛡️ **SEB Security — Web Panel Update**\n\n` +
        `The web panel has received a major update with new features.\n\n` +
        `**What's new:**\n` +
        `• 🔑 **QR Token Login** — A faster way to log in. Check your original account creation DM for your token, or ask the owner to resend it.\n` +
        `• 🔨 **Web Moderation** — Moderators and admins can now take moderation actions directly from the panel.\n` +
        `• 🔐 **Password Change** — You can now change your password from the Settings page. The bot will DM you to confirm.\n` +
        `• 📖 **How Bot Works** — A new section in the panel explains everything the bot does in detail.\n` +
        `• ⚙️ **Language Setting** — Save your preferred language in Settings.\n\n` +
        `**Action required:**\n` +
        `Please log out of the panel and **log back in** to refresh your session and access all new features.\n\n` +
        `If you have trouble logging in, contact the server owner.`
      );
      sent++;
      console.log(`✅ DM sent to ${discordUser.tag} (${user.username})`);
    } catch (err) {
      failed++;
      console.log(`❌ Failed for ${user.username}: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone. Sent: ${sent}, Failed: ${failed}`);
  process.exit(0);
});

client.login(TOKEN);
