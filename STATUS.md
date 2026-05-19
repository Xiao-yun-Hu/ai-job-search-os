# Build Status — v3.1 SHIPPED ✅

**Repo**: https://github.com/Xiao-yun-Hu/ai-job-search-os
**License**: MIT (public)

## Release log

### v3.1 — 2026-05-19
Hermes browser backend migration finalized with four-layer governance architecture.

**What changed:**
- **Browser backend documented**: `docs/BROWSER_BACKEND.md` describes the four-layer model: `SKILL.md` intent → `runtime/policy.yaml` soft policy → `runtime_guard.py` executor enforcement → `chrome-devtools-mcp` mechanics
- **Runtime governor spec added**: `docs/RUNTIME_GOVERNOR.md` — explains all four layers, guard config, and how to tune per-platform policy
- **Policy file added**: `runtime/policy.yaml` — per-platform mode (`beside_user` / `ai_driven`), pacing, stop-conditions, confirmation gates, daily caps
- **Executor guard implemented** in Hermes: `hermes_cli/runtime_guard.py` + enforcement in `model_tools.py` and `tools/registry.py`. When `runtime_governance.site: boss, mode: read_only`, all action tools (`navigate_page`, `click`, `fill`, `type_text`, etc.) are blocked at dispatch — the real tool is never called. Verified by 7 unit tests.
- **Hermes MCP prefix confirmed by smoke test**: `mcp_chrome_devtools_*` (Hermes normalizes `chrome-devtools` → single underscores). Other MCP clients use `mcp__chrome-devtools__*`.
- **Skill upgraded**: `skills/ai-job-search/SKILL.md` bumped to `3.1.0`, all `browser_xxx` calls migrated to `mcp_chrome_devtools_*`, Step 0 bootstrap now loads `runtime/policy.yaml`
- **Installer upgraded**: `scripts/install.sh` now registers `chrome-devtools-mcp` via `hermes mcp add chrome-devtools ...`
- **Launcher removed**: no `aijs-chrome` script; user attaches to their already-running Chrome with `--remote-debugging-port=9222`

### v3.0 — 2026-05-18
Installable Hermes skill + 4-layer memory architecture (L0/L1/L2/L3).

**The problem this solves:** in v1/v2 the skill relied entirely on in-conversation context. When a session was interrupted and reopened, the agent lost everything from previous conversations. The agent had to be re-briefed every time.

**What's new:**
- **Installable skill**: `skills/ai-job-search/SKILL.md` — full Scout / Match / Sender / Retro pipeline with a mandatory **Step 0 bootstrap** that loads every L3 persona file at the start of every session
- **4-layer memory architecture**: `docs/MEMORY_LAYERS.md`
  - L0 (raw dialogue) — `~/.hermes/sessions/*.json`, Hermes-managed
  - L1 (atomic facts) — `~/.ai-job-search/atoms.jsonl`, append-only JSONL
  - L2 (scenario blocks) — `~/.ai-job-search/L2_scenarios/*.md`, daily reports
  - L3 (persona/state) — `~/.ai-job-search/L3_persona/*.md`, loaded at every session start
- **Distillation pipeline**: `scripts/distill.py` runs nightly via cron, extracts L1 atoms from L0 sessions, aggregates into L2 retro, applies promotion rules to L3 strategy/decision_rules
- **One-shot installer**: `scripts/install.sh` creates the data dir, symlinks SKILL.md into Hermes, optionally installs the cron entry
- **L1 atoms schema** (`templates/L1_atoms_schema.md`): 5 atom types (application/conversation/decision/learning/feedback), append-only, grep-friendly
- BOSS直聘 anti-bot guidance updated based on full-session empirical testing (CDP from user's trusted Chrome + conservative pacing)

**Inspired by:** [Tencent TencentDB-Agent-Memory](https://github.com/Tencent/TencentDB-Agent-Memory) (4-tier hierarchical memory). We adopt the layering concept and adapt it to pure local files (no SQLite, no vector store — grep is enough for job-search data scale).



### v1.0 — 2026-05-02 (commit `f448e09`)
Initial release. 27 files, 2768 lines.

- 6-layer system architecture (`docs/SYSTEM.md`)
- 12 memory templates (5-type taxonomy)
- 5 scheduled task templates
- `config.yaml.template`
- 3 anonymized example outputs
- Bilingual README

### v1.0.1 — 2026-05-03 (commit `87095d8`)
README repositioning per maintainer feedback.

- Generalized positioning from "AI / Applied AI / Solutions" specialist to universal job-search OS
- New subtitle: "An AI-powered operating system for improving job-search conversion rates"
- Broadened "Who Is This For": fresh grads / career switchers / mid-career / senior
- Added "What Makes This Different" section
- Added Roadmap (v1.0 / v1.1 / v2.0)
- Moved AI-specialist origin story to bottom section

### v1.0.2 — 2026-05-03
Agent onboarding flow added.

- New `AGENTS.md` at repo root — 5-stage onboarding flow (~50 min) for AI agents helping users
  - Stage 1: Diagnose (career stage, geography, urgency, materials, comp, decision priority)
  - Stage 2: Setup (candidate profile, target list, hard gates, decision memory)
  - Stage 3: Calibrate Match Function (compare Tier output to user intuition)
  - Stage 4: First run (manual review before auto-deploy)
  - Stage 5: Schedule deployment
- README adds "Using with an AI Agent" section pointing to AGENTS.md
- Closes UX gap: previously agents would skip onboarding and run morning task with empty config

### v1.0.3 — 2026-05-03
Fix: removed baked-in "vibe > money" default; decision priority is user-stated.

- Different candidates legitimately rank trade-off dimensions differently (vibe / comp / speed / trajectory / etc.)
- The original maintainer's preference ("vibe > money") was leaking into SYSTEM.md and the candidate profile template as if universal
- Fixes:
  - `docs/SYSTEM.md` Section 1.1 — Target Outcome now lists 6 trade-off dimensions, no default
  - `docs/SYSTEM.md` Section 5.4 — Trade-off Matrix now shows 3 example user profiles (vibe-priority, comp-priority, speed-priority); user's stated priority selects which applies
  - `templates/memory/project_candidate_profile.template.md` — Decision Priority section is now a fill-in step with 4 example priority statements
  - `AGENTS.md` Stage 1 Q6 — explicit prompt for user-ranked priorities, no default assumption

## Stats

| Metric | Value |
|---|---|
| Files | 27 |
| Lines | ~3000 |
| PII leaks | 0 (verified) |
| Languages | EN + CN |
| License | MIT |

## Suggested next steps (optional, for v1.1+)

- `gh repo edit Xiao-yun-Hu/ai-job-search-os --add-topic ai-agents,job-search,claude-code,career-tools`
- `gh release create v1.0.1` to tag the repositioning
- Pin to GitHub profile
- Announcement post on LinkedIn / X
- v1.1 work: job-board adapters (LinkedIn / SEEK / Indeed), resume parsing pipeline
