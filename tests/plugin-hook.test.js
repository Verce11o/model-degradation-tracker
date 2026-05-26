const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const repo = path.resolve(__dirname, "..");
const trackerHtml = `
<div class="mb-4 text-sm"><span class="font-semibold text-white">Last updated:</span> <span class="text-neutral-400 ml-1">May 18, 2026</span></div>
<div class="border-b border-neutral-800 px-4 py-4 sm:px-5"><div><span>Status</span></div><div class="flex items-start gap-2 sm:items-center text-emerald-400"><svg></svg><span class="font-display text-xl font-bold sm:text-2xl"> Nominal </span></div></div>
<script>
const dailyChartData = [{"date":"2026-05-14","passRate":48.98},{"date":"2026-05-18","passRate":51.019999999999996}];
const baselinePercent = 56.00000000000001;
</script>
`;

test("session start payload uses plugin data cache", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "model-tracker-codex-"));
  const source = path.join(root, "tracker.html");
  const pluginData = path.join(root, "plugin-data");
  fs.writeFileSync(source, trackerHtml);

  const payload = runPluginHook(source, pluginData);
  assert.equal(payload.systemMessage, "Today's performance: Nominal, ↓ 5% No degradation expected today");
  assert.equal(payload.systemMessage.includes("\n"), false);
  assert.equal(Object.hasOwn(payload.hookSpecificOutput, "additionalContext"), false);
  assert.equal(fs.existsSync(path.join(pluginData, "codex.json")), true);

  fs.unlinkSync(source);
  assert.deepEqual(runPluginHook(source, pluginData), payload);
});

test("manifest and marketplace reference plugin hook", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, "plugins/model-degradation-tracker/.codex-plugin/plugin.json"), "utf8"));
  const hooks = JSON.parse(fs.readFileSync(path.join(repo, "plugins/model-degradation-tracker/hooks/hooks.json"), "utf8"));
  const marketplace = JSON.parse(fs.readFileSync(path.join(repo, ".agents/plugins/marketplace.json"), "utf8"));

  assert.equal(manifest.hooks, "./hooks/hooks.json");
  assert.equal(hooks.hooks.SessionStart[0].matcher, "startup|resume");
  assert.equal(hooks.hooks.SessionStart[0].hooks[0].command, "node \"$PLUGIN_ROOT/hooks/session_start.js\"");
  assert.equal(marketplace.plugins[0].source.path, "./plugins/model-degradation-tracker");
});

function runPluginHook(source, pluginData) {
  const script = path.join(repo, "plugins/model-degradation-tracker/hooks/session_start.js");
  const result = childProcess.spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      MODEL_DEGRADATION_TRACKER_CODEX_SOURCE_URL: pathToFileURL(source).href,
      MODEL_DEGRADATION_TRACKER_HTTP_TIMEOUT: "1",
      MODEL_DEGRADATION_TRACKER_CACHE_TTL: "900",
      PLUGIN_DATA: pluginData,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
