const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const repo = path.resolve(__dirname, "..");
const ansiGreen = "\x1b[38;2;183;216;180m";
const ansiOrange = "\x1b[38;2;255;216;176m";
const ansiReset = "\x1b[0m";
const trackerHtml = `
<div class="mb-4 text-sm"><span class="font-semibold text-white">Last updated:</span> <span class="text-neutral-400 ml-1">May 18, 2026</span></div>
<div class="border-b border-neutral-800 px-4 py-4 sm:px-5"><div><span>Status</span></div><div class="flex items-start gap-2 sm:items-center text-emerald-400"><svg></svg><span class="font-display text-xl font-bold sm:text-2xl"> Nominal </span></div></div>
<script>
const dailyChartData = [{"date":"2026-05-14","passRate":48.98},{"date":"2026-05-18","passRate":51.019999999999996}];
const baselinePercent = 56.00000000000001;
</script>
`;

test("session start hook installs statusline and wraps existing command", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "model-tracker-installer-"));
  const home = path.join(root, "home");
  const pluginData = path.join(root, "plugin-data");
  const baseScript = path.join(root, "base.js");
  fs.writeFileSync(baseScript, "process.stdin.resume(); process.stdin.on('end', () => console.log('base status'));\n");
  const settingsPath = path.join(home, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({
      statusLine: {
        type: "command",
        command: `node ${baseScript}`,
        padding: 2,
      },
    }),
  );

  runInstaller(home, pluginData);

  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.equal(settings.statusLine.type, "command");
  assert.equal(settings.statusLine.command.includes("CLAUDE_PLUGIN_DATA="), true);
  assert.equal(settings.statusLine.command.includes("claude-code-statusline.js"), true);
  assert.equal(settings.statusLine.command.includes("node "), true);
  assert.equal(settings.statusLine.padding, 2);
  assert.equal(settings.statusLine.refreshInterval, 60);
  const base = JSON.parse(fs.readFileSync(path.join(pluginData, "base-statusline.json"), "utf8"));
  assert.equal(base.command, `node ${baseScript}`);
  assert.equal(base.statusLine.command, `node ${baseScript}`);
  const resilientBase = JSON.parse(fs.readFileSync(path.join(home, ".claude", "model-degradation-tracker", "base-statusline.json"), "utf8"));
  assert.equal(resilientBase.command, `node ${baseScript}`);
  assert.equal(resilientBase.statusLine.padding, 2);
});

test("installer repairs old wrapper command without losing saved base", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "model-tracker-repair-"));
  const home = path.join(root, "home");
  const pluginData = path.join(root, "plugin-data");
  const settingsPath = path.join(home, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({
      statusLine: {
        type: "command",
        command: "node /tmp/model-degradation-tracker/bin/claude-code-statusline.js",
        padding: 0,
        refreshInterval: 60,
      },
    }),
  );
  fs.mkdirSync(pluginData, { recursive: true });
  fs.writeFileSync(path.join(pluginData, "base-statusline.json"), JSON.stringify({ command: "node /Users/vercello/.claude/statusline.mjs" }));

  runInstaller(home, pluginData);

  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.equal(settings.statusLine.command.includes("CLAUDE_PLUGIN_DATA="), true);
  assert.equal(settings.statusLine.command.includes("claude-code-statusline.js"), true);
  const base = JSON.parse(fs.readFileSync(path.join(pluginData, "base-statusline.json"), "utf8"));
  assert.equal(base.command, "node /Users/vercello/.claude/statusline.mjs");
});

test("statusline uses plugin data cache and preserves base line", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "model-tracker-statusline-"));
  const home = path.join(root, "home");
  const pluginData = path.join(root, "plugin-data");
  const source = path.join(root, "tracker.html");
  const baseScript = path.join(root, "base.js");
  fs.writeFileSync(source, trackerHtml);
  fs.writeFileSync(baseScript, "process.stdin.resume(); process.stdin.on('end', () => console.log('base status'));\n");
  fs.mkdirSync(pluginData, { recursive: true });
  fs.writeFileSync(path.join(pluginData, "base-statusline.json"), JSON.stringify({ command: `node ${baseScript}` }));

  const line = runStatusline(home, pluginData, source);
  assert.equal(line, `base status | ${ansiGreen}Nominal${ansiReset}, ↓ 5%`);
  assert.equal(fs.existsSync(path.join(pluginData, "claude-code.json")), true);

  fs.unlinkSync(source);
  assert.equal(runStatusline(home, pluginData, source), line);
});

test("statusline falls back to resilient base statusline backup when plugin data is gone", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "model-tracker-resilient-base-"));
  const home = path.join(root, "home");
  const pluginData = path.join(root, "plugin-data");
  const source = path.join(root, "tracker.html");
  const baseScript = path.join(root, "base.js");
  fs.writeFileSync(source, trackerHtml);
  fs.writeFileSync(baseScript, "process.stdin.resume(); process.stdin.on('end', () => console.log('base status'));\n");
  fs.mkdirSync(path.join(home, ".claude", "model-degradation-tracker"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "model-degradation-tracker", "base-statusline.json"),
    JSON.stringify({
      command: `node ${baseScript}`,
      statusLine: {
        type: "command",
        command: `node ${baseScript}`,
        padding: 1,
        refreshInterval: 30,
      },
    }),
  );

  const line = runStatusline(home, pluginData, source);
  assert.equal(line, `base status | ${ansiGreen}Nominal${ansiReset}, ↓ 5%`);
});

test("statusline colors non nominal status orange", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "model-tracker-color-"));
  const home = path.join(root, "home");
  const pluginData = path.join(root, "plugin-data");
  const source = path.join(root, "tracker.html");
  fs.writeFileSync(source, trackerHtml.replace(" Nominal ", " Degraded "));
  fs.mkdirSync(pluginData, { recursive: true });

  assert.equal(runStatusline(home, pluginData, source), `${ansiOrange}Degraded${ansiReset}, ↓ 5%`);
});

test("claude manifest and marketplace reference plugin hook", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, "plugins/model-degradation-tracker/.claude-plugin/plugin.json"), "utf8"));
  const hooks = JSON.parse(fs.readFileSync(path.join(repo, "plugins/model-degradation-tracker/hooks/claude-hooks.json"), "utf8"));
  const marketplace = JSON.parse(fs.readFileSync(path.join(repo, ".claude-plugin/marketplace.json"), "utf8"));
  const command = hooks.hooks.SessionStart[0].hooks[0].command;

  assert.equal(manifest.hooks, "./hooks/claude-hooks.json");
  assert.equal(hooks.hooks.SessionStart[0].matcher, "startup|resume");
  assert.equal(command.includes("process.env.CLAUDE_PLUGIN_ROOT"), true);
  assert.equal(command.includes("installed_plugins.json"), true);
  assert.equal(command.includes("install-statusline.js"), true);
  assert.equal(marketplace.plugins[0].source, "./plugins/model-degradation-tracker");
});

test("claude hook command falls back to installed plugin path when plugin root is missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "model-tracker-hook-fallback-"));
  const home = path.join(root, "home");
  const settingsPath = path.join(home, ".claude", "settings.json");
  const installedPath = path.join(home, ".claude", "plugins", "installed_plugins.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.mkdirSync(path.dirname(installedPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({}));
  fs.writeFileSync(
    installedPath,
    JSON.stringify({
      version: 2,
      plugins: {
        "model-degradation-tracker@model-degradation-tracker": [
          {
            installPath: path.join(repo, "plugins/model-degradation-tracker"),
          },
        ],
      },
    }),
  );

  const hooks = JSON.parse(fs.readFileSync(path.join(repo, "plugins/model-degradation-tracker/hooks/claude-hooks.json"), "utf8"));
  const env = { ...process.env, HOME: home };
  delete env.CLAUDE_PLUGIN_ROOT;
  delete env.CLAUDE_PLUGIN_DATA;
  const result = childProcess.spawnSync("/bin/sh", ["-lc", hooks.hooks.SessionStart[0].hooks[0].command], {
    encoding: "utf8",
    env,
  });

  assert.equal(result.status, 0, result.stderr);
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.equal(settings.statusLine.command.includes("CLAUDE_PLUGIN_DATA="), true);
  assert.equal(settings.statusLine.command.includes(path.join(home, ".claude", "plugins", "data", "model-degradation-tracker-model-degradation-tracker")), true);
  assert.equal(settings.statusLine.command.includes("claude-code-statusline.js"), true);
});

function runInstaller(home, pluginData) {
  const script = path.join(repo, "plugins/model-degradation-tracker/scripts/install-statusline.js");
  const result = childProcess.spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: path.join(repo, "plugins/model-degradation-tracker"),
      CLAUDE_PLUGIN_DATA: pluginData,
    },
  });
  assert.equal(result.status, 0, result.stderr);
}

function runStatusline(home, pluginData, source) {
  const script = path.join(repo, "plugins/model-degradation-tracker/bin/claude-code-statusline.js");
  const result = childProcess.spawnSync(process.execPath, [script], {
    input: JSON.stringify({ model: { display_name: "Claude" } }),
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_DATA: pluginData,
      MODEL_DEGRADATION_TRACKER_CLAUDE_CODE_SOURCE_URL: pathToFileURL(source).href,
      MODEL_DEGRADATION_TRACKER_HTTP_TIMEOUT: "1",
      MODEL_DEGRADATION_TRACKER_CACHE_TTL: "900",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
