# Runtime Governor

> Version: v3.1 (introduced 2026-05-19)

## Why this layer exists

Earlier versions of this skill embedded execution rules directly in SKILL.md: hardcoded delays, per-platform "must not" clauses, and specific action sequences. This created two problems:

1. **Brittle maintenance.** Any change to pacing or platform behavior required editing the skill prompt — a document that's hard to diff and easy to break.
2. **Wrong separation of concerns.** A skill should express *what* to accomplish (score this JD, write this outreach). It should not contain *how fast* to click or *which buttons* are off-limits on which site.

The Runtime Governor is the missing middle layer.

---

## Four-layer model

```
┌──────────────────────────────┐
│  Skill (SKILL.md)            │  "What": intent, reasoning, scoring, writing
│                              │  Reads policy at session start via Step 0 bootstrap
└──────────────┬───────────────┘
               │ reads runtime/policy.yaml on session init
               │ checks policy before each MCP call boundary
               ▼
┌──────────────────────────────┐
│  Action Governor             │  "How": pacing, stop-conditions, confirmation gates
│  (runtime/policy.yaml)       │  Declarative YAML — soft constraint (skill follows by design)
└──────────────┬───────────────┘
               │ tool call request
               ▼
┌──────────────────────────────┐
│  Executor Guard              │  Hard enforcement — blocks actions at dispatch time
│  (runtime_guard.py)          │  Independent of prompts and skills
│  config.yaml:                │  Even if skill ignores policy, guard catches it
│    runtime_governance:       │
│      enabled: true           │
│      site: boss              │
│      mode: read_only         │
└──────────────┬───────────────┘
               │ allowed tool calls only
               ▼
┌──────────────────────────────┐
│  chrome-devtools-mcp         │  "Mechanics": DOM reads, clicks, navigation
│  (MCP server, stateless)     │  Only reached if guard passes
└──────────────────────────────┘
```

Each layer has one job. **`policy.yaml`** is the skill's view of policy — it shapes proactive behavior (planning, pacing, mode selection). **`runtime_guard.py`** is the enforcement backstop — it blocks violations at dispatch time regardless of what the prompt said.

The two are complementary:
- If the skill follows policy.yaml perfectly, the guard never fires.
- If the skill hallucinates a click on a `beside_user` platform, the guard blocks it before the tool executes.
- If a future skill version introduces a bug that auto-navigates BOSS, the guard catches it.

---

## Executor Guard (runtime_guard.py)

The guard lives in Hermes at `hermes_cli/runtime_guard.py`. It is called from two enforcement points in the executor chain:
1. `model_tools.py` — before the tool handler is selected
2. `tools/registry.py` — before final dispatch

When a tool call is blocked, the executor returns a JSON error immediately. **The real tool is never invoked.**

### Configuration (`~/.hermes/config.yaml`)

```yaml
runtime_governance:
  enabled: true
  site: boss          # which platform's policy to enforce
  mode: read_only     # enforcement mode
```

### Currently implemented modes

| `site` | `mode` | Blocked | Allowed |
|--------|--------|---------|---------|
| `boss` | `read_only` | All browser action tools: `navigate_page`, `click`, `fill`, `type_text`, `press_key`, `scroll_page`, `evaluate_script`; also `browser_console` with `expression` | Read-only: `take_snapshot`, `take_screenshot`, `list_pages`, `wait_for`, console/network reads |
| (any) | (disabled or omitted) | Nothing blocked | Everything allowed |

### Changing the guard for a different platform

When switching from BOSS to LinkedIn:
```yaml
runtime_governance:
  enabled: true
  site: linkedin
  mode: ai_driven     # or disable entirely for full autonomy
```

Or disable entirely when automation is appropriate:
```yaml
runtime_governance:
  enabled: false
```

> Note: `site: linkedin / mode: ai_driven` is not yet implemented in the guard — it would be a no-op (nothing blocked). Add a new mode to `runtime_guard.py` when LinkedIn-specific constraints are needed.

---

## What the Governor controls

### Per-platform settings (`runtime/policy.yaml`)

| Field | Type | What it governs |
|-------|------|----------------|
| `mode` | `beside_user` \| `ai_driven` | Whether the skill navigates autonomously or only reads |
| `inter_action_min_ms` | int | Minimum pause between consecutive MCP calls |
| `inter_page_min_ms` | int | Minimum pause between page navigations |
| `autonomous_navigate` | bool | May the skill paginate / open new URLs without asking? |
| `autonomous_submit` | bool | May the skill click send/apply buttons? (default: always false) |
| `stop_on_security_page` | bool | Halt + alert user if security challenge URL detected |
| `security_check_patterns` | list | URL substrings that identify a challenge page |
| `daily_action_cap` | int | Max MCP click/fill/submit calls per session on this platform |
| `notes` | string | Human-readable rationale, shown in evening retro |

### Global settings

| Field | What it governs |
|-------|----------------|
| `session_action_cap` | Hard cap across all platforms per session |
| `always_confirm` | Action types that always require explicit user confirmation |
| `security_check_cooldown_minutes` | How long to pause after detecting a security check |

---

## How the skill consumes the Governor

During **Step 0 bootstrap**, the skill reads `runtime/policy.yaml` and stores the resolved policy for the current platform domain. Before every MCP tool call that touches the browser, the skill checks:

1. **Mode gate**: if `mode: beside_user`, skip any autonomous navigation or action.
2. **Confirmation gate**: if the action type is in `always_confirm`, output a `[CONFIRM REQUIRED]` block and wait for explicit user reply before proceeding.
3. **Pacing gate**: enforce `inter_action_min_ms` / `inter_page_min_ms` by spacing calls.
4. **Cap gate**: if `daily_action_cap` is reached, stop and report in the mini-report.
5. **Security gate**: after every navigation, check if the current URL matches any `security_check_patterns`; if so, halt and surface the recovery procedure.

---

## Operating modes in detail

### `beside_user`

The skill is a **reading and writing assistant**. It never clicks or navigates autonomously.

Typical flow:
1. User opens a job listing page in Chrome.
2. Skill calls `mcp_chrome_devtools_take_snapshot` to read the visible content.
3. Skill scores the JD and generates outreach text.
4. Skill outputs the text to chat — user copies, pastes, and clicks send.

Applies to: BOSS直聘, 猎聘, 智联招聘, 前程无忧, and any site where autonomous clicks trigger anti-bot challenges.

### `ai_driven`

The skill **navigates and reads** autonomously, but never submits without user confirmation.

Typical flow:
1. Skill navigates to the search results page.
2. Skill iterates through JD cards using `take_snapshot` + `click` to open each.
3. Skill scores each JD, saving Tier A/B to the pending queue.
4. For each Tier A, skill fills the outreach form and outputs `[CONFIRM REQUIRED: send to <company>?]`.
5. User replies "yes" → skill calls the submit action.

Applies to: LinkedIn, Greenhouse, Lever, Ashby, most company careers pages.

---

## Tuning the Governor

**Lower aggression on a platform:**
```yaml
www.linkedin.com:
  inter_action_min_ms: 2000   # was 1200
  autonomous_navigate: false  # pause after each page
```

**Add a new platform:**
```yaml
jobs.example.com:
  mode: ai_driven
  inter_action_min_ms: 1000
  inter_page_min_ms: 2000
  autonomous_navigate: true
  autonomous_submit: false
  stop_on_security_page: false
  security_check_patterns: []
  daily_action_cap: 30
  notes: Example Corp careers portal — standard ATS.
```

Changes take effect at the next session start (next Step 0 bootstrap).

---

## Why not put this in search_config.json?

`search_config.json` is **operational state** — which keywords to search, which platforms are active, the user's daily cap on applications. It changes as the job search evolves.

`policy.yaml` is **execution policy** — how the skill behaves mechanically. It changes when the skill's risk model or a platform's anti-bot behavior changes. Keeping them separate means neither file bloats into the other's territory.

---

## References

- Policy file: [`runtime/policy.yaml`](../runtime/policy.yaml)
- Browser backend: [`docs/BROWSER_BACKEND.md`](BROWSER_BACKEND.md)
- Memory layer architecture: [`docs/MEMORY_LAYERS.md`](MEMORY_LAYERS.md)
