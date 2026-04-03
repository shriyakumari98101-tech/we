import { Events } from "discord.js";
import { isWhitelistedBot, isWhitelistedOwner } from "../modules/permissions.js";
import { sendLog, modEmbed } from "../modules/logger.js";
import { getData, saveData } from "../modules/storage.js";

const FAQ_CHANNEL_ID = "1488578572405702787";
const RULES_URL = "https://discord.com/channels/1480339629465927680/1488559705646170464";
const MAIN_GUILD_ID = "1480339629465927680";

export const name = Events.GuildMemberAdd;
export const once = false;

export async function execute(member) {
  const { guild, user } = member;

  if (user.bot) {
    if (isWhitelistedBot(user.id)) {
      await sendLog(
        guild,
        modEmbed(0x00cc00, "Whitelisted Bot Joined", `Bot <@${user.id}> (**${user.tag}**) joined — it is whitelisted.`)
      );
      return;
    }

    let addedById = null;
    try {
      const auditLogs = await guild.fetchAuditLogs({ limit: 5, type: 28 });
      const entry = auditLogs.entries.find((e) => e.targetId === user.id);
      if (entry) addedById = entry.executor?.id;
    } catch {}

    try {
      await member.kick("Anti-nuke: unauthorized bot added");
    } catch (err) {
      console.error("Failed to kick bot:", err.message);
    }

    let addedByText = addedById ? `<@${addedById}>` : "Unknown user";
    await sendLog(
      guild,
      modEmbed(
        0xff0000,
        "Unauthorized Bot Kicked",
        `Bot <@${user.id}> (**${user.tag}**) was kicked. Added by ${addedByText}.\n\nTo whitelist a bot, use \`/whitelist\`.`
      )
    );

    if (addedById && !isWhitelistedOwner(addedById)) {
      const adder = await guild.members.fetch(addedById).catch(() => null);
      if (adder) {
        await adder
          .send(
            `You added an unauthorized bot (**${user.tag}**) to **${guild.name}**. The bot was kicked. Ask the server owner to whitelist it using \`/whitelist\`.`
          )
          .catch(() => {});
      }
    }
    return;
  }

  if (guild.id === MAIN_GUILD_ID) {
    const faqLink = `https://discord.com/channels/${MAIN_GUILD_ID}/${FAQ_CHANNEL_ID}`;
    await user
      .send(
        `Welcome to **${guild.name}**!\nThis is an automated message.\n\nFor any questions check faq - ${faqLink}\nRules - ${RULES_URL}`
      )
      .catch(() => {});
  }
}
