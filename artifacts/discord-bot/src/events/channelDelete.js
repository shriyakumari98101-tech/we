import { Events } from "discord.js";
import { handleChannelDelete } from "../modules/antinuke.js";

export const name = Events.ChannelDelete;
export const once = false;

export async function execute(channel) {
  if (!channel.guild) return;
  await handleChannelDelete(channel);
}
