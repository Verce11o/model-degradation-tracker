const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const APP_NAME = "model-degradation-tracker";
const DEFAULT_CACHE_TTL_SECONDS = 900;
const DEFAULT_HTTP_TIMEOUT_SECONDS = 5;
const DEGRADED_DELTA_THRESHOLD_POINTS = -15;

function currentStatus(options) {
  const cached = readCachedStatus(options);
  if (cached) {
    return Promise.resolve(cached);
  }

  return fetchSource(options.sourceUrl, options.timeoutSeconds())
    .then((contents) => {
      const status = parseTrackerHtml(contents, options.sourceUrl, options.tracker);
      writeCachedStatus(options, status);
      return status;
    })
    .catch(() => unknownStatus(options.sourceUrl, options.tracker));
}

function fetchSource(sourceUrl, timeoutSeconds) {
  if (sourceUrl.startsWith("file://")) {
    return Promise.resolve(fs.readFileSync(fileURLToPath(sourceUrl), "utf8"));
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(sourceUrl);
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.get(
      parsed,
      {
        headers: {
          "User-Agent": `${APP_NAME}/0.1`,
        },
        timeout: timeoutSeconds * 1000,
      },
      (response) => {
        if ((response.statusCode || 0) >= 400) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        response.setEncoding("utf8");
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error("request timed out"));
    });
    request.on("error", reject);
  });
}

function parseTrackerHtml(contents, sourceUrl, tracker) {
  const lastUpdated = parseSummaryText(contents, /Last updated:\s*<\/span>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>/s);
  const baseline = parseFloatConst(contents, "baselinePercent");
  const today = parseLatestDailyPassRate(contents);
  const delta = today - baseline;
  const deltaPoints = roundHalfAwayFromZero(delta);
  const direction = directionForDelta(delta);
  const status = statusForDeltaPoints(deltaPoints);

  return {
    tracker,
    available: true,
    status,
    severity: severityForStatus(status),
    baseline_pass_rate: baseline,
    today_pass_rate: today,
    delta_points: deltaPoints,
    direction,
    display: displayStatus(status, direction, deltaPoints),
    last_updated: lastUpdated,
    source_url: sourceUrl,
  };
}

function parseSummaryText(contents, pattern) {
  const match = contents.match(pattern);
  if (!match) {
    throw new Error("summary field not found");
  }
  const value = unescapeHtml(match[1]).trim();
  if (!value) {
    throw new Error("summary field is empty");
  }
  return value;
}

function parseFloatConst(contents, name) {
  const pattern = new RegExp(`const\\s+${escapeRegExp(name)}\\s*=\\s*([0-9]+(?:\\.[0-9]+)?);`);
  const match = contents.match(pattern);
  if (!match) {
    throw new Error(`${name} not found`);
  }
  return Number.parseFloat(match[1]);
}

function parseLatestDailyPassRate(contents) {
  const match = contents.match(/const\s+dailyChartData\s*=\s*(\[.*?\]);/s);
  if (!match) {
    throw new Error("dailyChartData not found");
  }
  const points = JSON.parse(match[1]);
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error("dailyChartData is empty");
  }
  const latest = points.reduce((best, point) => (String(point.date) > String(best.date) ? point : best), points[0]);
  return Number.parseFloat(latest.passRate);
}

function displayStatus(status, direction, deltaPoints) {
  if (status.toLowerCase() === "unknown" || !Number.isFinite(deltaPoints)) {
    return status;
  }
  if (direction === "up") {
    return `${status}, ↑ ${Math.abs(deltaPoints)}%`;
  }
  if (direction === "down") {
    return `${status}, ↓ ${Math.abs(deltaPoints)}%`;
  }
  return `${status}, 0%`;
}

function statusForDeltaPoints(deltaPoints) {
  return deltaPoints <= DEGRADED_DELTA_THRESHOLD_POINTS ? "Degraded" : "Nominal";
}

function directionForDelta(delta) {
  if (delta > 0) {
    return "up";
  }
  if (delta < 0) {
    return "down";
  }
  return "flat";
}

function severityForStatus(status) {
  const normalized = status.toLowerCase();
  if (normalized === "nominal") {
    return "nominal";
  }
  if (normalized === "unknown") {
    return "unknown";
  }
  return "warning";
}

function unknownStatus(sourceUrl, tracker) {
  return {
    tracker,
    available: false,
    status: "Unknown",
    severity: "unknown",
    baseline_pass_rate: null,
    today_pass_rate: null,
    delta_points: null,
    direction: "unknown",
    display: "Unknown",
    last_updated: null,
    source_url: sourceUrl,
  };
}

function readCachedStatus(options) {
  const cachePath = path.join(options.cacheDir(), options.cacheFile);
  try {
    const payload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (Date.now() / 1000 - Number(payload.cached_at) > options.cacheTtlSeconds()) {
      return null;
    }
    return normalizeCachedStatus(payload.status);
  } catch {
    return null;
  }
}

function normalizeCachedStatus(status) {
  if (!status || typeof status !== "object") {
    return status;
  }
  const deltaPoints = Number(status.delta_points);
  if (!Number.isFinite(deltaPoints)) {
    return status;
  }
  const label = statusForDeltaPoints(deltaPoints);
  const direction = typeof status.direction === "string" ? status.direction : directionForDelta(deltaPoints);
  return {
    ...status,
    status: label,
    severity: severityForStatus(label),
    direction,
    display: displayStatus(label, direction, deltaPoints),
  };
}

function writeCachedStatus(options, status) {
  const directory = options.cacheDir();
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, options.cacheFile),
    `${JSON.stringify({
      cached_at: Date.now() / 1000,
      status,
    })}\n`,
  );
}

function cacheTtlSeconds() {
  const value = Number.parseInt(process.env.MODEL_DEGRADATION_TRACKER_CACHE_TTL || String(DEFAULT_CACHE_TTL_SECONDS), 10);
  if (Number.isNaN(value)) {
    return DEFAULT_CACHE_TTL_SECONDS;
  }
  return Math.max(0, value);
}

function httpTimeoutSeconds() {
  const value = Number.parseFloat(process.env.MODEL_DEGRADATION_TRACKER_HTTP_TIMEOUT || String(DEFAULT_HTTP_TIMEOUT_SECONDS));
  if (Number.isNaN(value)) {
    return DEFAULT_HTTP_TIMEOUT_SECONDS;
  }
  return value;
}

function codexCacheDir() {
  if (process.env.PLUGIN_DATA) {
    return process.env.PLUGIN_DATA;
  }
  if (process.env.CLAUDE_PLUGIN_DATA) {
    return process.env.CLAUDE_PLUGIN_DATA;
  }
  if (process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, APP_NAME);
  }
  return path.join(os.homedir(), ".cache", APP_NAME);
}

function claudePluginData() {
  const directory = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), ".claude", "plugins", "data", "model-degradation-tracker-model-degradation-tracker");
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function roundHalfAwayFromZero(value) {
  if (value >= 0) {
    return Math.floor(value + 0.5);
  }
  return Math.ceil(value - 0.5);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unescapeHtml(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

module.exports = {
  APP_NAME,
  cacheTtlSeconds,
  claudePluginData,
  codexCacheDir,
  currentStatus,
  httpTimeoutSeconds,
};
