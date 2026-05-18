# Memory Layers — 4-Tier Architecture

> Version: v1.0  
> Influenced by: [Tencent TencentDB-Agent-Memory](https://github.com/Tencent/TencentDB-Agent-Memory) (4-tier hierarchical memory design)

This document explains how AI Job Search OS persists state across agent sessions, so a new conversation never starts from a blank slate.

## TL;DR

```
┌─────────────────────────────────────────────────────────────────┐
│ L0  Raw dialogue            ~/.hermes/sessions/*.json            │
│         │                   (managed by Hermes — we just read it)│
│         ▼                                                        │
│ L1  Atomic facts            ~/.ai-job-search/atoms.jsonl         │
│         │                   (append-only, one fact per line)     │
│         ▼                                                        │
│ L2  Scenario blocks         ~/.ai-job-search/L2_scenarios/*.md   │
│         │                   (daily reports, retros, weekly)      │
│         ▼                                                        │
│ L3  Persona / state         ~/.ai-job-search/L3_persona/*.md     │
│                             (loaded at every session start)      │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                       SKILL.md bootstrap step reads L3 first
```

## Why layers (instead of one big file)?

A flat memory file has two problems:
1. **Grows unbounded** — every session adds context until the file is too big to load
2. **Lossy on compression** — summarizing the file loses traceability back to specific events

The 4-layer model separates **persistence** from **distillation**:

| Layer | Time horizon | Format | Write pattern | Read pattern |
|---|---|---|---|---|
| L0 | Per-session | JSON (Hermes native) | Per-turn append | Distillation job only |
| L1 | 90 days | JSONL (one atom/line) | Append-only | Grep on demand |
| L2 | 4 weeks | Markdown | Daily overwrite per file | Read recent 3-7 days |
| L3 | Permanent | Markdown | Promotion-triggered append/overwrite | Every session start |

Old data ages out: L0 → kept by Hermes, L1 → archived yearly, L2 → moved to `archive/` after 4 weeks. L3 is permanent (with old versions in `memory/archive/`).

## Mapping to existing files

If you already have a v3 setup from this repo, here's the layer mapping:

| Existing file | Layer | Reason |
|---|---|---|
| `applications.jsonl` | L1 | Atomic facts of "I applied to X" — same role as `atoms.jsonl` for `type:application` |
| `logs/retro_YYYYMMDD.md` | L2 | Daily aggregate report |
| `logs/morning_YYYYMMDD.md` | L2 | Daily aggregate report |
| `project_candidate_profile.md` | L3 | Permanent identity |
| `project_company_targets.md` | L3 | Permanent target list with status |
| `project_job_search_current_state.md` | L3 | Persistent operational snapshot |
| `feedback_job_search_strategy.md` | L3 | Persistent learned strategy |
| `decision_task_rules.md` | L3 | Persistent hard rules |

**v4 introduces `atoms.jsonl`** as a more general L1 store — `applications.jsonl` becomes just one type (`type:application`) of atom. The two coexist for backward compat.

## How the layers stay in sync

### Distillation pipeline (nightly cron at 23:30)

`scripts/distill.py` runs at 23:30 daily:

1. **L0 → L1**: Scans today's Hermes sessions, extracts atoms, appends to `atoms.jsonl`
2. **L1 → L2**: Aggregates today's atoms into `L2_scenarios/retro_YYYY-MM-DD.md`
3. **L1 → L3 (promotion)**: Applies promotion rules — repeat decisions become hard rules, repeat learnings become strategy items
4. **L3 overwrite**: Rebuilds `current_state.md` from latest funnel data

### Session bootstrap (every Hermes session)

At the start of every `ai-job-search` skill invocation, SKILL.md mandates a bootstrap step:

```
0. Read all L3 files:
   - L3_persona/candidate_profile.md
   - L3_persona/current_state.md
   - L3_persona/strategy.md
   - L3_persona/decision_rules.md
   - L3_persona/company_targets.md
1. Read recent 3-day L2 retros for context continuity
2. Now the agent has full context — proceed with user request
```

This bootstrap is what solves "agent forgets between sessions" — L3 is always loaded fresh, and recent L2 fills in the last week of activity.

## What goes in vs. what doesn't

Use the [memory management rules](../templates/memory/memory_management_rules.template.md) — same rules apply:

- ✅ **In L3**: stable facts about you, hard rules, target companies, learned strategies
- ✅ **In L2**: daily/weekly reports, what happened today
- ✅ **In L1**: every job applied, every reply, every decision moment
- ❌ **Not in memory**: tool-call traces, casual chat, one-off context, code

## Open questions / future work

- **Vector search at L1**: Currently L1 is plain JSONL — grep is enough for thousands of atoms. If you exceed ~10k atoms, consider migrating L1 to SQLite + sqlite-vec (like the Tencent reference design).
- **L2 grouping by topic, not date**: Today L2 files are time-bucketed (`retro_YYYY-MM-DD.md`). For users with long active conversations (e.g., 6-week interview process), topic-bucketed L2 files (`thread_anthropic.md`) may be more useful — TBD.
- **Cross-session linking**: When a conversation in session B references a company first introduced in session A, the atom in B should `entities.references_atom_id: <atom-id-from-A>`. Schema supports this; promotion script does not yet enforce.
