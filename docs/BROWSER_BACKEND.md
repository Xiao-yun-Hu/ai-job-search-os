# Browser Backend — chrome-devtools-mcp

> Version: v3.1 (introduced 2026-05-19)
> Status: required for any browser-driven mode of the `ai-job-search` skill

This document explains how the skill drives the browser, the three-layer architecture that keeps it safe, and what limitations remain.

## TL;DR

```
┌─────────────────────────────────────────────────┐
│  SKILL.md (cognition / intent layer)            │
│  - Step 0 bootstrap from L3                     │
│  - Score JDs / write outreach / retro           │
│  - Expresses WHAT to do, never HOW fast         │
└─────────────┬───────────────────────────────────┘
              │ intent
              ▼
┌─────────────────────────────────────────────────┐
│  Action Governor (runtime/policy.yaml)          │
│  - Per-platform pacing, stop-conditions,        │
│    confirmation requirements                    │
│  - Enforced by the skill at call boundaries     │
└─────────────┬───────────────────────────────────┘
              │ MCP tool calls (mcp_chrome_devtools_*)
              ▼
┌─────────────────────────────────────────────────┐
│  chrome-devtools-mcp (npx, MIT, open source)    │
│  --browser-url=http://127.0.0.1:9222            │
└─────────────┬───────────────────────────────────┘
              │ Chrome DevTools Protocol
              ▼
┌─────────────────────────────────────────────────┐
│  Your real Chrome (already running)             │
│  --remote-debugging-port=9222                   │
│  ★ your real cookies / history / trust          │
│  ★ already logged in to BOSS / LinkedIn / etc.  │
└─────────────────────────────────────────────────┘
```

The skill attaches to your **already-running Chrome** — no profile copy, no launcher script.
From any job board's perspective, the traffic is a normal user on their own laptop.

---

## Why this design

### What doesn't work

Spawning a fresh Chrome and trying to look human ("stealth mode") loses to industry-strength anti-bot every time. Tested exhaustively on BOSS直聘 (2026-05-18). Every variation triggered `_security_check`:

- Fresh CDP-controlled Chrome — blocked
- `--disable-blink-features=AutomationControlled` — blocked
- Fresh profile + trusted cookies copied in — verification loads but rapid actions re-trigger
- Direct JSON API with referer headers — `code: 37 您的环境存在异常`
- `document.cookie` via JS — HttpOnly cookies invisible

The lesson: **the anti-bot signal you can't fake is "this user has been browsing here for months on this exact device"**. So we stop trying to fake it — we attach to the device.

### What works

Attach to the user's already-trusted Chrome. The browser is identical to what BOSS / LinkedIn / 猎聘 see every other day. The only difference is an AI reading the screen and suggesting what to do next.

This is the same pattern Augment Code's Browser MCP, Cursor's browser tools, and most production AI-browser products converge on. We use [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp) (Chrome team, MIT) as the MCP implementation.

---

## Three-layer architecture

```
Skill (SKILL.md)       →  cognition: what to look for, how to score, what to write
Action Governor        →  policy:    how fast, when to stop, what needs user confirmation
chrome-devtools-mcp    →  mechanics: actual DOM reads, clicks, navigation
```

**SKILL.md** expresses intent only. It does not contain pacing delays, hard-coded "never click X" rules, or platform-specific workarounds. Those live in `runtime/policy.yaml`.

**`runtime/policy.yaml`** ships with safe defaults and is the single place to tune behavior per platform:

```yaml
# runtime/policy.yaml (excerpt — see full file for all fields)
platforms:
  www.zhipin.com:
    mode: beside_user          # AI reads; user clicks and sends
    inter_action_min_ms: 2000
    autonomous_navigate: false
    autonomous_submit: false
  www.linkedin.com:
    mode: ai_driven
    inter_action_min_ms: 800
    autonomous_navigate: true
    autonomous_submit: false   # final send always human
  default:
    mode: ai_driven
    inter_action_min_ms: 1000
    autonomous_submit: false
```

**`chrome-devtools-mcp`** is stateless. It takes a tool call, executes it against Chrome, and returns. It has no knowledge of job-search logic.

---

## Setup

### Prerequisites

- macOS or Linux (Windows: untested)
- Chrome 116+ (CDP required; Chrome 144+ for `--auto-connect` flag support)
- `npx` available in PATH (Node 18+)
- Hermes ≥ 0.10 (`hermes --version`)

### First-time setup

```bash
git clone https://github.com/Xiao-yun-Hu/ai-job-search-os.git
cd ai-job-search-os
bash scripts/install.sh
```

`install.sh` does **two** things relevant to the browser backend:

1. Registers `chrome-devtools-mcp` with Hermes:
   ```bash
   hermes mcp add chrome-devtools \
     --command npx \
     --args "-y,chrome-devtools-mcp@latest,--browser-url=http://127.0.0.1:9222"
   ```
2. Creates the `~/.ai-job-search/` directory structure (L1/L2/L3 persona files).

That's it. No profile copy. No launcher script.

> **Hermes tool prefix note:** Hermes v0.10 normalizes the registered server name `chrome-devtools` to `mcp_chrome_devtools_` (hyphens → underscores, single-underscore separators). SKILL.md uses these Hermes-normalized names. Other MCP clients (Cursor, Claude Desktop) expose the same server as `mcp__chrome-devtools__*`.

### Starting Chrome with remote debugging

Every time you want the skill to drive the browser, start Chrome with `--remote-debugging-port=9222`. The simplest approach: just add the flag to however you already launch Chrome.

**macOS — from Terminal:**
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 &
```

**macOS — persistent via Login Items / launchd:** add `--remote-debugging-port=9222` to your existing Chrome launch entry.

**Chrome 136+ constraint:** Chrome refuses `--remote-debugging-port` when the `--user-data-dir` is the OS default profile path. If you hit this, launch Chrome with an explicit `--user-data-dir` pointing to any non-default path:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.ai-job-search/chrome-profile" &
```
This separate profile will need a one-time login to each platform, but it's otherwise identical to your real Chrome.

**Verify Chrome is reachable:**
```bash
curl -s http://127.0.0.1:9222/json/version | python3 -c \
  "import json,sys; print(json.load(sys.stdin).get('Browser'))"
# Expected: Chrome/148.x.x.x
```

---

## Operating modes

The mode per platform is read from `runtime/policy.yaml` at session start (Step 0 bootstrap). Two built-in modes:

### `beside_user` — for aggressive anti-bot platforms

Default for: BOSS直聘, 智联招聘, 前程无忧, 猎聘, any Chinese-mainland job board.

- User pages, clicks, scrolls.
- Skill reads the current visible snapshot (`take_snapshot` / `take_screenshot`).
- Skill scores JDs and generates outreach text.
- User copies text into the message box and clicks send.

The skill does **not** navigate, paginate, or click action buttons on `beside_user` platforms.

### `ai_driven` — for toleration-level platforms

Default for: LinkedIn, company careers pages, most ATS portals.

- Skill navigates, scrolls, reads JDs.
- Skill fills forms when asked.
- User confirms before any send/submit action (final click is always human).

**Override:** edit `runtime/policy.yaml` to change any platform's mode. Changes take effect on next session start.

---

## Tool reference (chrome-devtools-mcp, Hermes-exposed names)

Full upstream list: https://github.com/ChromeDevTools/chrome-devtools-mcp

| Tool | Purpose | Old Hermes built-in equivalent |
|------|---------|-------------------------------|
| `mcp_chrome_devtools_navigate_page` | Open a URL in the active tab | `browser_navigate` |
| `mcp_chrome_devtools_list_pages` | List open tabs | n/a |
| `mcp_chrome_devtools_new_page` | Open a new tab | n/a |
| `mcp_chrome_devtools_close_page` | Close a tab | n/a |
| `mcp_chrome_devtools_take_snapshot` | Accessibility tree of current tab (text, cheap) | `browser_snapshot` |
| `mcp_chrome_devtools_take_screenshot` | Page screenshot (image, for vision model) | `browser_vision` |
| `mcp_chrome_devtools_click` | Click element by UID from snapshot | `browser_click` |
| `mcp_chrome_devtools_fill` | Fill an input field | `browser_type` |
| `mcp_chrome_devtools_type_text` | Type text at current focus | `browser_type` |
| `mcp_chrome_devtools_press_key` | Press a key | `browser_press` |
| `mcp_chrome_devtools_scroll_page` | Scroll the page | `browser_scroll` |
| `mcp_chrome_devtools_evaluate_script` | Run JS in the page | `browser_console` / `browser_cdp` |
| `mcp_chrome_devtools_wait_for` | Wait for element / URL / network idle | n/a |

---

## Failure modes and recovery

### CDP not reachable (`curl http://127.0.0.1:9222/json/version` fails)

Chrome is not running with `--remote-debugging-port=9222`. Start it with the flag (see Setup above).

### "No current page" error from MCP tools

Chrome started but has no open tab. Open any tab manually (Cmd+T) and retry.

### `_security_check` page appears on BOSS

Cause: BOSS heuristics decided activity is bot-like — possibly IP-level flag or actions too fast.

Recovery:
1. Stop all skill-driven actions immediately.
2. Complete the CAPTCHA manually in Chrome.
3. Wait 1–24 hours before resuming browser-driven mode on BOSS.
4. Confirm `policy.yaml` has `www.zhipin.com: mode: beside_user`.
5. If it keeps recurring: set BOSS to pure manual — paste JD text into chat, AI scores it, no browser contact.

### Clash/Surge fake-IP proxy interferes

Symptom: MCP tools fail with errors mentioning `198.18.x.x` or `127.0.0.1` as remote.

Cause: Clash/Surge fake-IP mode resolves hostnames to private IPs. `chrome-devtools-mcp` itself doesn't enforce IP guards, but downstream connections can fail.

Recovery: disable fake-IP mode for target domains, or disable proxy temporarily.

### MCP server not loading in Hermes

Check registration:
```bash
hermes mcp list
# Should show: chrome-devtools (stdio)
```

Re-register if missing:
```bash
hermes mcp add chrome-devtools \
  --command npx \
  --args "-y,chrome-devtools-mcp@latest,--browser-url=http://127.0.0.1:9222"
```

---

## What this design does not solve

- ❌ **BOSS IP-level rate limits.** If BOSS flagged your home IP, no browser tooling helps. Wait it out.
- ❌ **Headless / cloud automation.** Cloud IPs are more bot-suspicious than residential. Use this on your laptop.
- ❌ **Multi-account.** One trusted Chrome, one profile. Multi-identity is anti-detect territory and out of scope.
- ❌ **"Apply to 100 jobs while you sleep."** Not the goal. Quality of fit and outreach, not application volume.

---

## References

- `chrome-devtools-mcp` upstream: https://github.com/ChromeDevTools/chrome-devtools-mcp
- Chrome remote-debugging security policy: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/security/remote-debugging.md
- Action Governor config: [`runtime/policy.yaml`](../runtime/policy.yaml)
- Memory layer architecture: [`docs/MEMORY_LAYERS.md`](MEMORY_LAYERS.md)
- Runtime Governor design: [`docs/RUNTIME_GOVERNOR.md`](RUNTIME_GOVERNOR.md)
- Architecture decision log: `~/.claude/plans/whimsical-finding-milner.md`
