import { Events } from "discord.js";
import { handleDangerousRole } from "../modules/antinuke.js";

export const name = Events.GuildRoleCreate;
export const once = false;

export async function execute(role) {
  await handleDangerousRole(role);
}
