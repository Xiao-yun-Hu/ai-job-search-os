# Sample Morning Outreach Report (anonymized)

> Output of `job-board-morning-outreach` task. All names / companies / specifics are placeholders.

## Phase 1: Scout Summary

- Keywords searched: 7 (per config.yaml `search.keywords`)
- Total raw cards encountered: ~95
- Hard-gate filter results:
  - Anonymous postings filtered: 12
  - Already-applied filtered: 8
  - Blacklisted companies filtered: 3
  - Experience mismatch (1-3 years / new grad): 18
  - Title-level mismatch (Partner / CTO / etc.): 5
  - Detail-page filter (recruiter postings, blocked stages, blocked categories): 24
- Cards passing all hard gates: 25
- After cardinal JD scoring (threshold ≥7): **10 candidates** entered Phase 2

## Phase 2: Match Function v0 Results

| # | Company | Title | role_alignment | ai_systems | business | seniority | company_ctx | vibe | Tier |
|---|---|---|---|---|---|---|---|---|---|
| 1 | [Co_A] | AI Solutions Architect | strong | strong | strong | strong | strong | medium | **A** |
| 2 | [Co_B] | Applied AI Lead | strong | strong | strong | medium | strong | unknown | **A** (vibe researched) |
| 3 | [Co_C] | AI Agent 架构师 | strong | medium | medium | strong | medium | unknown | **B** |
| 4 | [Co_D] | AI Product Engineer | medium | medium | strong | medium | strong | medium | **B** |
| 5 | [Co_E] | Senior AI Engineer | medium | strong | weak | medium | strong | unknown | **C** |
| 6 | [Co_F] | AI 解决方案专家 | weak | medium | medium | medium | medium | unknown | **C** |
| 7 | [Co_G] | (blacklist hit, fast-skipped) | — | — | — | — | — | — | **D** |
| 8 | [Co_H] | LLM 应用架构师 | medium | strong | medium | medium | unknown | unknown | **pending_user_input** (3 unknowns) |
| 9 | [Co_I] | (compensation gate fail) | — | — | — | — | — | — | **D** |
| 10 | [Co_J] | AI Workflow Designer | medium | medium | strong | medium | medium | unknown | **B** |

## Phase 3: Sender Actions

| Action | Count | Companies |
|---|---|---|
| Sent (Tier A + B) | 5 | Co_A, Co_B, Co_C, Co_D, Co_J |
| Saved (Tier C) | 2 | Co_E, Co_F |
| Pending user input | 1 | Co_H (3 signals unknown — see review queue) |
| Skipped (Tier D) | 2 | Co_G (blacklist), Co_I (salary < floor) |

### Tier A flagged for LinkedIn DM follow-up (manual user action this evening):
- [Co_A] — DM founder/CTO via LinkedIn, hook: their recent X thread on multi-agent specialization
- [Co_B] — DM hiring manager (research VP via LinkedIn), hook: their podcast on eval methodology

## Phase 4: Mini Report (logs/morning_YYYYMMDD.md)

- Total raw → applied: 95 → 5 (5.3%)
- Tier A:B:C:D ratio = 2:3:2:2 (with 1 pending)
- Pool status: healthy (>5 candidates)

PushNotification sent:
> "Morning: 5 sent (A:2 B:3), 2 saved, 1 pending review, 2 skipped. Tier A: Co_A, Co_B — DM tonight."

## Pending User Input Queue (for evening retro)

```json
{
  "company": "Co_H",
  "title": "LLM 应用架构师",
  "missing_signals": ["seniority_scope_fit", "company_context_fit", "vibe_culture_fit"],
  "ask": "Have you heard of Co_H? Founder background known? Team size?"
}
```
