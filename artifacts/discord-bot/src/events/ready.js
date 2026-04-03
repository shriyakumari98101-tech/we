import { Events, ActivityType, EmbedBuilder } from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import { readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getData, saveData } from "../modules/storage.js";
import { APPEAL_GUILD_ID, APPEAL_CHANNEL_ID, buildAppealStartRow } from "../modules/appealSystem.js";

export const name = Events.ClientReady;
export const once = true;

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function execute(client) {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity("Survive Events for Brainrots | Offical", { type: ActivityType.Watching });

  const commandsPath = join(__dirname, "../commands");
  const commandFiles = (await readdir(commandsPath)).filter((f) => f.endsWith(".js"));

  const slashCommands = [];
  for (const file of commandFiles) {
    const cmd = await import(join(commandsPath, file));
    if (cmd.data) slashCommands.push(cmd.data.toJSON());
  }

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);

  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), {
        body: slashCommands,
      });
      console.log(`Registered ${slashCommands.length} commands in guild ${guild.name}`);
    } catch (err) {
      console.error(`Failed to register commands in guild ${guild.name}:`, err.message);
    }
  }

  await ensureAppealMessage(client);
}

async function ensureAppealMessage(client) {
  try {
    const appealGuild = client.guilds.cache.get(APPEAL_GUILD_ID);
    if (!appealGuild) {
      console.log("Bot is not in the appeal server — skipping appeal message setup.");
      return;
    }

    const channel = await appealGuild.channels.fetch(APPEAL_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.log("Appeal channel not found.");
      return;
    }

    const data = getData();

    if (data.appealMessageId) {
      const existing = await channel.messages.fetch(data.appealMessageId).catch(() => null);
      if (existing) {
        console.log("Appeal message already exists — skipping.");
        return;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Ban Appeals")
      .setDescription(
        "If you have been banned and wish to appeal, click the appropriate button below.\n\n" +
        "**Server Ban** — Banned from the Discord server.\n" +
        "**In-Game Ban** — Banned in-game.\n\n" +
        "⚠️ Please make sure your DMs are open before clicking. Answer all questions **honestly and in your own words** — AI-generated responses will be automatically rejected."
      )
      .setFooter({ text: "Survive Events for Brainrots | Ban Appeal System" })
      .setTimestamp();

    const msg = await channel.send({
      embeds: [embed],
      components: [buildAppealStartRow()],
    });

    data.appealMessageId = msg.id;
    await saveData();
    console.log("Appeal message posted.");
  } catch (err) {
    console.error("Failed to post appeal message:", err.message);
  }
}
