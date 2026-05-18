---
name: L1 Atoms Schema
description: Schema for atomic facts extracted from L0 raw conversations. Sits between raw dialogue and human-readable retros. Append-only JSONL.
type: meta
---

# L1 Atoms — Atomic Fact Schema

## Purpose

L1 atoms are **atomic facts** distilled from L0 raw conversations. Each line in `atoms.jsonl` is a single discrete fact, machine-readable, append-only.

The reason L1 exists (vs. going directly from L0 → L2 markdown):
- **Re-aggregation**: Re-generate any L2 scenario file from atoms without re-parsing L0
- **Fast grep**: One line per fact → trivially searchable
- **Traceability**: Every L2/L3 statement can point back to a specific atom

## File location

```
~/.ai-job-search/atoms.jsonl
```

Append-only. Never edit existing lines. Old atoms (older than 90 days) move to `atoms_archive_YYYY.jsonl`.

## Line schema (one JSON object per line)

```json
{
  "ts": "2026-05-18T22:30:15+08:00",
  "source": "session_20260518_220557_635607",
  "type": "application | conversation | decision | learning | feedback",
  "entities": { "...": "..." },
  "content": "Plain-text 1-2 sentence statement of the fact",
  "confidence": 0.9
}
```

### Field details

| Field | Required | Description |
|---|---|---|
| `ts` | yes | ISO 8601 timestamp with timezone |
| `source` | yes | Hermes session ID this atom was extracted from |
| `type` | yes | One of 5 types (see below) |
| `entities` | yes | Structured keys, varies by type |
| `content` | yes | Human-readable 1-2 sentence summary |
| `confidence` | no | 0.0-1.0, LLM's confidence in extraction. Omit = 1.0 |

## The 5 atom types

### 1. `application` — A job was applied to

```json
{
  "ts": "2026-05-18T10:42:00+08:00",
  "source": "session_xxx",
  "type": "application",
  "entities": {
    "company": "Anthropic",
    "title": "Forward-Deployed Engineer",
    "platform": "linkedin",
    "tier": "A",
    "salary_range_k": [50, 80],
    "location": "Singapore",
    "url": "https://..."
  },
  "content": "Applied to Anthropic FDE role on LinkedIn, Tier A, salary range 50-80K."
}
```

### 2. `conversation` — A back-and-forth with HR/recruiter/founder

```json
{
  "ts": "2026-05-18T15:20:00+08:00",
  "source": "session_xxx",
  "type": "conversation",
  "entities": {
    "company": "Anthropic",
    "stage": "reply | deep_chat | interview | rejected",
    "channel": "linkedin_dm | email | wechat | phone",
    "counterparty": "Recruiter name or role"
  },
  "content": "Anthropic recruiter replied, asked about Singapore relocation timeline."
}
```

### 3. `decision` — A hard rule the user has stated

```json
{
  "ts": "2026-05-18T11:00:00+08:00",
  "source": "session_xxx",
  "type": "decision",
  "entities": {
    "scope": "filter | salary | platform | role",
    "rule": "exclude_anonymous_companies"
  },
  "content": "User said: never apply to companies posted as '某xxx公司'."
}
```

Decisions get promoted to `L3_persona/decision_rules.md` if they repeat or are explicit.

### 4. `learning` — A new pattern observed but not yet a rule

```json
{
  "ts": "2026-05-18T22:30:00+08:00",
  "source": "session_xxx",
  "type": "learning",
  "entities": {
    "pattern": "linkedin_better_response_rate",
    "evidence_count": 1
  },
  "content": "LinkedIn outreach got 3/5 reply rate today, BOSS got 0/8 — first signal LinkedIn may be higher-leverage for SG roles."
}
```

Learnings get promoted to `L3_persona/strategy.md` after 3+ confirming instances.

### 5. `feedback` — Outcome of an action (interview result, offer, rejection)

```json
{
  "ts": "2026-05-18T18:00:00+08:00",
  "source": "session_xxx",
  "type": "feedback",
  "entities": {
    "company": "Anthropic",
    "outcome": "interview_passed | rejected | ghosted | offer",
    "stage": "phone_screen | technical | onsite | final"
  },
  "content": "Anthropic phone screen passed, advanced to technical round next week."
}
```

## Promotion rules (L1 → L3)

The nightly distillation script applies these rules:

| Trigger | Action |
|---|---|
| Same `decision` atom seen 2+ times | Append rule to `L3_persona/decision_rules.md` |
| Same `learning` pattern seen 3+ times | Append insight to `L3_persona/strategy.md` |
| `feedback.outcome == "rejected"` 3+ times for same company type | Append company-type exclusion to `L3_persona/strategy.md` |
| Any `application` | Update funnel counts in `L3_persona/current_state.md` (overwrite) |
| Any `conversation` | Update conversation table in `L3_persona/current_state.md` (overwrite) |

## What NOT to extract (anti-patterns)

❌ Tool-call traces (search queries, URL clicks)
❌ Casual chat ("how are you", "thanks")
❌ User instructions that didn't result in a stable rule ("do X this one time")
❌ Hermes's own internal reasoning unless it produced a concrete decision
❌ Job listings the user merely viewed but didn't apply to or save

## Example workflow

```
L0: ~/.hermes/sessions/session_20260518_220557_635607.json  (raw turns)
        |
        | distill.py at 23:30
        v
L1: ~/.ai-job-search/atoms.jsonl
    {"ts":"2026-05-18T10:42","type":"application",...}
    {"ts":"2026-05-18T15:20","type":"conversation",...}
    {"ts":"2026-05-18T22:30","type":"learning",...}
        |
        | aggregate today's atoms
        v
L2: ~/.ai-job-search/L2_scenarios/retro_2026-05-18.md   (human-readable)
        |
        | apply promotion rules
        v
L3: ~/.ai-job-search/L3_persona/current_state.md   (overwritten)
    ~/.ai-job-search/L3_persona/strategy.md         (appended if new learning promoted)
    ~/.ai-job-search/L3_persona/decision_rules.md   (appended if new rule promoted)
```
