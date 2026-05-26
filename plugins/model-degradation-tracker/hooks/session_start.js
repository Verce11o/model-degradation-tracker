const {
  cacheTtlSeconds,
  codexCacheDir,
  currentStatus,
  httpTimeoutSeconds,
} = require("../lib/tracker");

const DEFAULT_SOURCE_URL = "https://marginlab.ai/trackers/codex/";

async function main() {
  const status = await currentStatus({
    tracker: "codex",
    sourceUrl: process.env.MODEL_DEGRADATION_TRACKER_CODEX_SOURCE_URL || DEFAULT_SOURCE_URL,
    cacheFile: "codex.json",
    cacheDir: codexCacheDir,
    cacheTtlSeconds,
    timeoutSeconds: httpTimeoutSeconds,
  });
  const line = status.display;
  const payload = {
    systemMessage: `Today's performance: ${line} ${codexStatusMessage(line)}`,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
    },
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function codexStatusMessage(line) {
  const status = line.split(",", 1)[0].trim().toLowerCase();
  if (status === "nominal") {
    return "No degradation expected today";
  }
  if (status === "unknown" || status === "status: unknown") {
    return "Performance data unavailable";
  }
  return "Performance may be degraded today";
}

main().catch(() => process.exit(1));
