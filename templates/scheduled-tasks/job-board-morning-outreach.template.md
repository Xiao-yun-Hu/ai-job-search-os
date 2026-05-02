---
name: job-board-morning-outreach
description: Weekday 09:30 — search job board, run Match Function v0, send applications for Tier A/B
---

# Task: Job Board Morning Outreach (Scout + Match + Sender Pipeline)

> Generic template. Adapt to your specific job board (BOSS Zhipin / LinkedIn Easy Apply / SEEK / Greenhouse / etc.) by editing Phase 1 / 3 mechanics.
> Cron: `30 9 * * 1-5` (weekdays 09:30 local time)

## Pre-flight checks
- Read `[/path/to]/config.yaml` (keywords / scale / thresholds)
- Read `[/path/to]/applications.jsonl` (deduplicate against already-applied companies)
- Read `[/path/to]/company_blacklist.json`
- Read candidate profile from memory (`memory/project_candidate_profile_*.md`) — Match Function input
- Verify browser automation connectivity (per `decision_chrome_pretest.md` rule). If fail, push notification + halt.

## Reliability priority

User cannot tolerate "click miss" causing silent send failures. Therefore:
- Every "send / submit" click must be followed by `screenshot` verification
- If verification fails, retry up to 2 times with 2s delay
- Final fallback: alternative send mechanism (e.g., search-page sidebar)
- Post-send: JS verification that input field is cleared (proof of send)

## Phase 1: Scout (target 10 candidates; pool-thin allows 3-5)

### Keyword rotation (per config.yaml `search.keywords`)
For each keyword, navigate the job board search URL with the configured filters (city / scale / etc.).

### For each result page (~15 cards typical)
Batch JS extract: title + company + experience requirement + URL.

**Hard Gate first pass** (skip these):
- Anonymous postings ("某大型/某中型/某 large/medium-sized") — typically agency/recruiter listings
- Already applied (cross-check against applications.jsonl)
- Company in blacklist
- Experience requirement mismatch (1-3 years if you're senior; "students/new grad")
- Title contains: "Partner / CTO / Chief / Co-founder / Part-time" (level mismatch)

### Detail page + JD reading
JS read: funding stage + recruiter tag + JD body text.

**Hard Gate second pass**:
- "(Recruiter posting)" tag → skip
- Funding stage in {Angel / Seed / Pre-A} (configurable) → skip
- JD contains: "outsourcing / staffing / [gender requirement]" → skip
- Direction in blacklist (model training / vision / robotics / content safety / etc.) → skip

### Input-side cardinal scoring (deterministic feature detection — OK)
Apply `config.yaml` `jd_scoring.dimensions` weights. Threshold (e.g., 7) → enter Phase 2.

> Note: This is deterministic feature detection at input, NOT outcome reward. Cardinal here is fine.

### Output: candidates.json
Sorted by score, max 10 entries.

## Phase 2: Match Function v0 (NEW — see SYSTEM.md Section 4.3)

For each candidate, run the 5-step Match:

### 2.1 Hard Gates final check (mostly redundant with Phase 1 but covers)
- Compensation: `salary_max < floor` → tier=D, skip Phase 3
- Compensation undisclosed but high-quality company → don't gate, negotiate
- Compensation undisclosed AND company unknown → downgrade one tier

### 2.2 6-Signal Classification (ordinal: strong / medium / weak / negative / unknown)

For each candidate, evaluate based on JD text + company info:

| Signal | What to look for |
|---|---|
| `role_alignment` | Title + responsibilities → AI systems / agent workflow / decision logic? |
| `ai_systems_relevance` | JD mentions multi-agent / RAG / eval / orchestration / reasoning? |
| `business_workflow_relevance` | Enterprise workflow / decision support / customer-facing AI? |
| `seniority_scope_fit` | Senior / lead / architect with design authority? |
| `company_context_fit` | AI-native / applied / early-mid stage (per Phase 1 funding info)? |
| `vibe_culture_fit` | Often `unknown` from JD alone — default unknown unless JD mentions "996/flexible/remote" etc. |

### 2.3 Tier Assignment (see SYSTEM.md Section 4.3 Step 3)

```
Tier A: hard_gate_pass + role_alignment=strong + ai_systems≥medium + business_workflow=strong
        + seniority≥medium + company_context≥medium + vibe ≥medium (researched)
Tier B: hard_gate_pass + role_alignment≥medium + ai_systems≥medium + ≥2 other strong
Tier C: hard_gate_pass + partial relevance + 1+ key signal weak
Tier D: hard_gate fail or clearly off-target
pending_user_input: ≥3 signals=unknown (axis role_alignment + ai_systems must have ≥1 unknown)
```

### 2.4 Fast Paths
- Hard gate fail → straight to D
- Title is "AI Solutions Architect" + company on top-tier list + vibe researched ≥medium → straight to A
- Company on `company_blacklist.json` → straight to D

### 2.5 Output (extended candidate metadata)

Per candidate, add fields:
- `tier` (A | B | C | D | pending_user_input)
- `signals` (6 ordinal values)
- `main_strengths` / `main_risks`
- `outreach_angle`
- `market_learning_value`

## Phase 3: Sender (Tier-aware)

| tier | Action |
|---|---|
| **A** | Send + flag `requires_linkedin_dm_followup: true` (user manually DMs founder/CTO in evening) |
| **B** | Send |
| **C** | **Don't send**, save to `logs/candidates_saved_YYYYMMDD.json` (manual review later) |
| **D** | Skip + log reason |
| **pending_user_input** | **Don't send**, save to `logs/pending_match_review_YYYYMMDD.json` (evening retro batch review) |

### Send execution (A/B common flow)

Custom message (per candidate's narrative pillars — adapt for region):
```
[YOUR CUSTOM OUTREACH MESSAGE — 100-300 chars, narrative-pillar-based]
```

Per-candidate steps:
1. `navigate(url)` to detail page
2. Wait 1-2s for page load
3. `find` send/apply button → `click`
4. Wait 2s
5. `screenshot` to verify modal / form appeared
6. If not: retry 1x → fallback alternative flow
7. Modal mode: input field execCommand insertText + Enter dispatch
8. Inline mode: textarea value + dispatch input + click "Send"
9. JS verify input cleared (proof of send)
10. Record success in memory: full Match Phase 2 output

**Cap: 10 candidates** (A + B combined). If pool < 10, send all; flag pool-thin in report.

## Phase 4: Mini Report

Write `logs/morning_YYYYMMDD.md`:
- Phase 1 candidate count / hard-gate filter counts
- Phase 2 tier distribution (A: x, B: y, C-saved: z, D-skipped: w, pending: m)
- Phase 3 actual sends (with A flagged for LinkedIn DM)
- Pending list: companies + missing signals

Batch-append to `applications.jsonl` (full schema with new fields).

PushNotification (≤200 chars):
```
Job board today X applications (A:x B:y), C saved z, pending m, D skipped n. {Pool-thin / Tier A list / pending alert}.
```

If Tier A applications + pending exist: prioritize "Tier A: company1, company2 — DM tonight" message.

## Hard prohibitions
- ❌ No OS-level type/key actions (browser keyboard event accidents)
- ❌ No re-applying to applied / blacklisted companies
- ❌ Stop immediately + push if encountering anti-bot challenge / "operation too frequent"
- ❌ **Don't send** to `pending_user_input` candidates (wait for user input)
- ❌ Don't send to Tier C/D
