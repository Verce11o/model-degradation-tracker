# Model Degradation Tracker

<img width="1880" height="405" alt="codex-claude-plugin" src="https://github.com/user-attachments/assets/7e631def-639b-45bb-a89a-14e01456c5d7" />



Codex and Claude Code plugins for showing current Marginlab tracker performance.

The plugins fetch Marginlab tracker pages directly from the user's machine, parse the summary fields, and display compact output like:

```text
Nominal, ↓ 5%
```

No server is required. The plugins do not run evals and do not spend model tokens.

Supported integrations:

| Integration | Source | Delivery |
| --- | --- | --- |
| Codex | `https://marginlab.ai/trackers/codex/` | Codex plugin |
| Claude Code | `https://marginlab.ai/trackers/claude-code/` | Claude Code plugin |


## Prerequisites

- Codex CLI for the Codex plugin.
- Claude Code for the Claude Code plugin.
- `node` available on `PATH`. Both plugins run bundled Node.js scripts and use only the Node.js standard library.
- Network access from the local machine to `https://marginlab.ai/trackers/codex/` and `https://marginlab.ai/trackers/claude-code/`.

## Codex Installation

```bash
codex plugin marketplace add Verce11o/model-degradation-tracker
codex plugin add model-degradation-tracker@model-degradation-tracker
```

After installation, restart Codex and trust the plugin hook in `/hooks` when prompted.

Expected Codex startup output:

```text
warning: Today's performance: Nominal, ↓ 5% No degradation expected today
```

## Claude Code Installation

```bash
claude plugin marketplace add Verce11o/model-degradation-tracker
claude plugin install model-degradation-tracker@model-degradation-tracker
```

After installation, restart Claude Code. The plugin installs its bundled `statusLine.command` on session start and preserves an existing status line by appending the Marginlab segment.

Expected Claude Code status line when there was no previous status line:

```text
Nominal, ↑ 1%
```

Expected Claude Code status line when a previous status line existed:

```text
existing status line | Nominal, ↑ 1%
```

## License

TBD.
