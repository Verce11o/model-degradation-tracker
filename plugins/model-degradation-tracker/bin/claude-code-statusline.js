const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  cacheTtlSeconds,
  claudePluginData,
  currentStatus,
  httpTimeoutSeconds,
} = require("../lib/tracker");

const DEFAULT_SOURCE_URL = "https://marginlab.ai/trackers/claude-code/";
const ANSI_GREEN = "\x1b[38;2;183;216;180m";
const ANSI_ORANGE = "\x1b[38;2;255;216;176m";
const ANSI_RESET = "\x1b[0m";

async function main() {
  const sessionInput = await readStdin();
  const base = runBaseStatusline(sessionInput);
  const status = await currentStatus({
    tracker: "claude-code",
    sourceUrl: process.env.MODEL_DEGRADATION_TRACKER_CLAUDE_CODE_SOURCE_URL || DEFAULT_SOURCE_URL,
    cacheFile: "claude-code.json",
    cacheDir: claudePluginData,
    cacheTtlSeconds,
    timeoutSeconds: httpTimeoutSeconds,
  });
  process.stdout.write(`${combineStatuslines(base, terminalDisplayStatus(status))}\n`);
}

function readStdin() {
  return new Promise((resolve) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
  });
}

function terminalDisplayStatus(status) {
  return status.display.replace(status.status, coloredStatus(status.status));
}

function coloredStatus(status) {
  if (status.toLowerCase() === "nominal") {
    return `${ANSI_GREEN}${status}${ANSI_RESET}`;
  }
  return `${ANSI_ORANGE}${status}${ANSI_RESET}`;
}

function combineStatuslines(base, addition) {
  const trimmedBase = base.trimEnd();
  const trimmedAddition = addition.trim();
  if (!trimmedBase) {
    return trimmedAddition;
  }
  const lines = trimmedBase.split(/\r?\n/);
  lines[lines.length - 1] = `${lines[lines.length - 1]} | ${trimmedAddition}`;
  return lines.join("\n");
}

function runBaseStatusline(sessionInput) {
  const command = baseStatuslineCommand();
  if (!command) {
    return "";
  }
  try {
    return childProcess.execSync(command, {
      input: sessionInput,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 5000,
    });
  } catch {
    return "";
  }
}

function baseStatuslineCommand() {
  for (const filePath of baseStatuslinePaths()) {
    try {
      const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const command = typeof value.command === "string" ? value.command : value.statusLine && typeof value.statusLine === "object" ? value.statusLine.command : null;
      if (typeof command === "string" && command.trim()) {
        return command;
      }
    } catch {
    }
  }
  return null;
}

function baseStatuslinePaths() {
  return [
    path.join(claudePluginData(), "base-statusline.json"),
    path.join(os.homedir(), ".claude", "model-degradation-tracker", "base-statusline.json"),
  ];
}

main().catch(() => process.exit(1));
