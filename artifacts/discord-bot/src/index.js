import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} from "discord.js";
import { readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadData } from "./modules/storage.js";
import { startWebServer } from "./modules/webserver.js";
import { setClient } from "./modules/clientRef.js";
import { getBaseUrl } from "./modules/urlHelper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.commands = new Collection();
client.prefixCommands = new Collection();
setClient(client);

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.warn("DISCORD_BOT_TOKEN is not set. Web panel will run, but Discord features will be disabled.");
}

async function loadCommands() {
  const commandsPath = join(__dirname, "commands");
  const commandFiles = (await readdir(commandsPath)).filter((f) =>
    f.endsWith(".js")
  );
  for (const file of commandFiles) {
    const cmd = await import(join(commandsPath, file));
    if (cmd.data && cmd.execute) {
      client.commands.set(cmd.data.name, cmd);
    }
    if (cmd.prefixName) {
      client.prefixCommands.set(cmd.prefixName, cmd);
    }
  }
  console.log(`Loaded ${client.commands.size} slash commands.`);
}

async function loadEvents() {
  const eventsPath = join(__dirname, "events");
  const eventFiles = (await readdir(eventsPath)).filter((f) =>
    f.endsWith(".js")
  );
  for (const file of eventFiles) {
    const event = await import(join(eventsPath, file));
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
  console.log(`Loaded ${eventFiles.length} events.`);
}

async function main() {
  // Start the web server first so health checks and the panel
  // are available immediately — before Discord connects.
  // This prevents 502 errors on Replit, Render, and Railway.
  const server = startWebServer();
  console.log(`Panel URL: ${getBaseUrl()}/panel`);

  // Wire up graceful shutdown for Render / Railway SIGTERM
  const shutdown = () => {
    console.log("Shutting down gracefully...");
    server.close(() => {
      client.destroy();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Load bot data and Discord internals in the background
  await loadData();
  console.log("Data loaded.");
  await loadCommands();
  await loadEvents();

  // Connect to Discord — non-fatal startup failure keeps the
  // web server running so the panel stays accessible
  if (TOKEN) {
    try {
      await client.login(TOKEN);
    } catch (err) {
      console.error("Discord login failed:", err.message);
      console.error("Web panel is still running — fix the token and restart.");
    }
  } else {
    console.warn("Skipping Discord login — no token provided. Set DISCORD_BOT_TOKEN to enable.");
  }
}

main().catch((err) => {
  console.error("Fatal error starting bot:", err);
  process.exit(1);
});
