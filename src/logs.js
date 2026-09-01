const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "logs.json");

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "{}", "utf8");
  }
}

function readConfig() {
  ensureDataFile();

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(config, null, 2), "utf8");
}

function getLogChannelId(guildId) {
  if (!guildId) {
    return null;
  }

  return readConfig()[guildId] || null;
}

function setLogChannelId(guildId, channelId) {
  if (!guildId || !channelId) {
    return;
  }

  const config = readConfig();
  config[guildId] = channelId;
  writeConfig(config);
}

module.exports = {
  getLogChannelId,
  setLogChannelId,
};

