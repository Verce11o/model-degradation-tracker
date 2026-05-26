const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const APP_NAME = "model-degradation-tracker";

function main() {
  const root = pluginRoot();
  const data = pluginData();
  const settingsPath = claudeSettingsPath();
  const statuslineScript = path.join(root, "bin", "claude-code-statusline.js");
  const command = `CLAUDE_PLUGIN_DATA=${quoteShell(data)} node ${quoteShell(statuslineScript)}`;

  const settings = readJsonFile(settingsPath);
  const current = settings.statusLine;
  const currentCommand = current && typeof current === "object" ? current.command : null;
  const currentPadding = current && typeof current === "object" ? current.padding : null;
  const currentRefresh = current && typeof current === "object" ? current.refreshInterval : null;

  if (typeof currentCommand === "string" && currentCommand.trim() && !isOwnCommand(currentCommand)) {
    writeBaseStatusline(data, current);
  }

  if (typeof currentCommand === "string" && currentCommand.trim() && isOwnCommand(currentCommand) && currentCommand === command) {
    return;
  }

  settings.statusLine = {
    type: "command",
    command,
    padding: Number.isInteger(currentPadding) ? currentPadding : 0,
    refreshInterval: Number.isInteger(currentRefresh) ? currentRefresh : 60,
  };
  writeJsonFile(settingsPath, settings);
}

function pluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, "..");
}

function pluginData() {
  const directory = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), ".claude", "plugins", "data", "model-degradation-tracker-model-degradation-tracker");
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function writeBaseStatusline(data, statusLine) {
  const backup = {
    command: statusLine.command,
    statusLine,
  };
  writeJsonFile(path.join(data, "base-statusline.json"), backup);
  writeJsonFile(resilientBaseStatuslinePath(), backup);
}

function resilientBaseStatuslinePath() {
  return path.join(os.homedir(), ".claude", "model-degradation-tracker", "base-statusline.json");
}

function claudeSettingsPath() {
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  return settingsPath;
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  } catch {
  }
  return {};
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function isOwnCommand(command) {
  return command.includes(APP_NAME) && command.includes("claude-code-statusline");
}

function quoteShell(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

main();
