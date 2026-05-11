# Memory Management Rules v3

> Redesigned from v2. Consolidated from 14 files to 6 files — each with a single, clear responsibility.

---

## 1. File Types and Responsibility Boundaries

| Type | File | Purpose | Update frequency |
|---|---|---|---|
| **decision** | `decision_task_rules.md` | Hard rules automated tasks must obey unconditionally | When rules change |
| **feedback** | `feedback_job_search_strategy.md` | Soft strategy preferences — evolves with evidence | Weekly cadence |
| **project** | `project_candidate_profile.md` | Full candidate snapshot — resume, comp, roles, narratives | On resume / comp change |
| **project** | `project_company_targets.md` | Target company execution status (Track A/B) | On each outreach action |
| **project** | `project_job_search_current_state.md` | Operational snapshot — overwritten nightly | Nightly (by evening-retro) |
| **meta** | `memory_management_rules.md` | This file — system rules | On architecture change |

---

## 2. Frontmatter: 3 Fields Only

```yaml
---
name: short name
description: one-line purpose (used to judge relevance)
type: decision | feedback | project
---
```

**Do NOT add:** `originSessionId` / `importance` / `last_referenced` / `expires_at` / `links`

Exception: if a rule has a clear expiry date, put it in the body as "**Valid until YYYY-MM-DD**" — not in frontmatter.

---

## 3. SSOT (Single Source of Truth)

Before creating a new memory file, grep for the fact:

```bash
grep -r "keyword" memory/
```

| Information type | Only location |
|---|---|
| Candidate facts (name, resume, compensation, role targets) | `project_candidate_profile.md` |
| Job search strategy preferences | `feedback_job_search_strategy.md` |
| Automated task hard rules | `decision_task_rules.md` |
| Full target company list | `[your authoritative list file]` |
| Company outreach execution status | `project_company_targets.md` |
| Daily application records | `job_search/applications.jsonl` |
| Daily retros | `job_search/logs/retro_YYYYMMDD.md` |

On SSOT violation: merge to the SSOT location, change other files to reference.

---

## 4. What Goes in Memory vs What Doesn't

**✅ Goes in memory** (cross-session persistent facts / rules / strategy)
- Hard rules tasks must follow at runtime
- Strategy preferences learned from conversation / interviews / market feedback
- Candidate profile and company status
- Nightly operational snapshot

**❌ Does not go in memory** (operational data / ephemeral observations)
- Daily application records → `applications.jsonl`
- Daily retro logs → `logs/retro_YYYYMMDD.md`
- One-off company observations (interview feel, specific HR chat) → `logs/retro_YYYYMMDD.md`
  → Only graduate to `feedback_job_search_strategy.md` when the observation becomes a reusable pattern
- Weekly / quarterly summaries → `logs/weekly_*.md`
- One-shot instructions, conversation fragments

---

## 5. Archival Rules

| Trigger | Action |
|---|---|
| `logs/retro_*.md` older than 4 weeks | Move to `logs/archive/` |
| `project_candidate_profile.md` has a newer version | Move old to `memory/archive/` |
| A `decision_task_rules.md` rule hasn't triggered in 30+ days | Flag for monthly audit — do not auto-delete |
| `feedback_job_search_strategy.md` contradicted by recent evidence | Flag for user decision |

Archive directory: `memory/archive/`

---

## 6. Auto vs Manual Maintenance

**Automated (scheduled tasks)**
- `daily-learnings-review` (nightly): scans today's conversations → extracts new feedback/decisions → updates memory files
- `evening-retro` (nightly): overwrites `project_job_search_current_state.md` with today's funnel + pending items

**Manual (user-driven)**
- Monthly: audit `decision_task_rules.md` — is each rule still being triggered? still valid?
- Quarterly: audit `feedback_job_search_strategy.md` — any evidence contradicting current strategy?
- On outreach actions: update `project_company_targets.md` status column

> Monthly / quarterly audits don't need cron. Review them during your `job-search-review` session.
