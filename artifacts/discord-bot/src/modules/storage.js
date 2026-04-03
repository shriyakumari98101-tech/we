import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR
  ? process.env.DATA_DIR
  : join(__dirname, "../../data");

const DATA_FILE = join(DATA_DIR, "botdata.json");

let _data = null;

const DEFAULT_LOG_CHANNEL_ID = "1484747550505308302";

const defaultData = {
  whitelistedBots: [],
  whitelistedOwners: [],
  warns: {},
  prefixes: {},
  deletedMessages: {},
  channelDeletions: {},
  strippedRoles: {},
  logChannelId: DEFAULT_LOG_CHANNEL_ID,
  appealMessageId: null,
  _profanityStrikes: {},
  users: {},
  appeals: [],
  recentLogs: [],
};

export { DEFAULT_LOG_CHANNEL_ID };

export async function loadData() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    _data = { ...defaultData, ...JSON.parse(raw) };
  } catch {
    _data = { ...defaultData };
    await saveData();
  }
  return _data;
}

export async function saveData() {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(_data, null, 2), "utf-8");
}

export function getData() {
  if (!_data) throw new Error("Data not loaded yet. Call loadData() first.");
  return _data;
}
