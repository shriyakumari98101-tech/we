import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const PLACE_ID = "111794378764078";
const GAME_URL = `https://www.roblox.com/games/${PLACE_ID}`;

export const data = new SlashCommandBuilder()
  .setName("roblox")
  .setDescription("View stats for Survive Events for Brainrots on Roblox");

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    const universeRes = await fetch(
      `https://apis.roblox.com/universes/v1/places/${PLACE_ID}/universe`
    );
    if (!universeRes.ok) throw new Error("Could not fetch universe ID");
    const { universeId } = await universeRes.json();

    const [gameRes, voteRes] = await Promise.all([
      fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`),
      fetch(`https://games.roblox.com/v1/games/votes?universeIds=${universeId}`),
    ]);

    const gameData = await gameRes.json();
    const voteData = await voteRes.json();

    const game = gameData?.data?.[0];
    const votes = voteData?.data?.[0];

    if (!game) throw new Error("Game not found");

    const ccu = game.playing?.toLocaleString() ?? "N/A";
    const favorites = game.favoritedCount?.toLocaleString() ?? "N/A";
    const visits = game.visits?.toLocaleString() ?? "N/A";
    const likes = votes?.upVotes?.toLocaleString() ?? "N/A";
    const dislikes = votes?.downVotes?.toLocaleString() ?? "N/A";

    const embed = new EmbedBuilder()
      .setColor(0x00b2ff)
      .setTitle(game.name || "Survive Events for Brainrots")
      .setURL(GAME_URL)
      .setDescription(game.description?.substring(0, 200) || "A brainrot survival game on Roblox.")
      .addFields(
        { name: "🟢 Playing Now", value: ccu, inline: true },
        { name: "👀 Total Visits", value: visits, inline: true },
        { name: "⭐ Favourites", value: favorites, inline: true },
        { name: "👍 Likes", value: likes, inline: true },
        { name: "👎 Dislikes", value: dislikes, inline: true },
      )
      .setFooter({ text: "Roblox • Survive Events for Brainrots" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Play on Roblox")
        .setStyle(ButtonStyle.Link)
        .setURL(GAME_URL)
        .setEmoji("🎮"),
      new ButtonBuilder()
        .setLabel("Like the Game")
        .setStyle(ButtonStyle.Link)
        .setURL(GAME_URL)
        .setEmoji("👍"),
      new ButtonBuilder()
        .setLabel("Favourite")
        .setStyle(ButtonStyle.Link)
        .setURL(GAME_URL)
        .setEmoji("⭐")
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error("Roblox command error:", err.message);
    await interaction.editReply({
      content: "Could not fetch Roblox game data right now. Try again in a moment.",
    });
  }
}
