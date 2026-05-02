# Memory Management Rules

> Design reference: CoALA (type taxonomy) + Generative Agents (reflection compression) + Claude Code file-based pattern.
> See full rationale in `docs/SYSTEM.md` Section 7.

## 1. 5-Type Taxonomy

| Type | File prefix | Purpose | Example |
|---|---|---|---|
| **identity** | `user_*.md` | User identity / background, rarely changes | `user_about_me.md` |
| **decision** | `decision_*.md` | Hard rules used at task-runtime, must obey | `decision_salary_floor.md`, `decision_geographic_filter.md` |
| **feedback** | `feedback_*.md` | Soft preferences / learned heuristics, evolves over time | `feedback_target_strategy.md` |
| **project** | `project_*.md` | Current context / state, periodic update | `project_candidate_profile.md` |
| **(meta)** | `memory_management_rules.md` | System self-rules | This file |

> ⚠️ **decision vs feedback distinction is critical**: decision is `hard` referenced by tasks (e.g., morning task invokes salary rule); feedback is soft strategy (e.g., target preference), referenced as guidance, can be overridden case-by-case.

## 2. Minimal Frontmatter (3 fields only)

```yaml
---
name: short_name
description: one_line_purpose
type: identity | decision | feedback | project
---
```

**Do NOT add** `importance`, `last_referenced`, `expires_at`, `links`. Research-paper concepts that don't pay off at < 50 memory files.

> Exception: If a rule has a clear expiration (e.g., "before 2026-08-01, respond to recruiter X with template Y"), put it in the body text as "**Valid until YYYY-MM-DD**". Don't put it in frontmatter.

## 3. SSOT (Single Source of Truth)

**Before creating new memory, grep for the fact**:

```bash
grep -r "keyword" memory/
```

Rules:
- Candidate facts (name, education, work history, salary expectations, geography) → only in `project_candidate_profile_*.md`
- Job-search strategies (parallel outreach, overseas focus, etc.) → only in `feedback_*.md`
- Hard filter rules (salary, geographic, browser pretest) → only in `decision_*.md` or `config.yaml`
- Company lists → `project_target_*.md` (index pointing to authoritative source like `Downloads/target_list.md`)

**Resolving SSOT violations**: Find a fact duplicated across files. Pick the SSOT location. Other files reference (don't repeat).

## 4. Archival Mechanism (auto-maintenance)

### What goes in memory vs not

✅ Goes in memory:
- Cross-session-persistent identity / decision / feedback / project (the 4 types above)

❌ Does not go in memory:
- Daily application records → `applications.jsonl`
- Daily retros → `logs/retro_*.md`
- Weekly / quarterly summaries → `logs/weekly_*.md`, `logs/quarterly_*.md`
- Research output (vibe reports, candidate lists) → `research/`
- One-shot conversation snippets

### Archival rules (auto)

| Trigger | Action | Owner |
|---|---|---|
| `logs/retro_*.md` > 4 weeks | Move to `logs/archive/` | Sunday weekly-summary cron |
| `logs/weekly_*.md` > 12 weeks | Move to `logs/archive/` | Quarterly task (TODO) |
| `memory/project_candidate_profile_*.md` old version (newer exists) | Move to `memory/archive/` | User initiated |
| `memory/decision_*.md` not triggered in 30+ days | Flag for audit, don't auto-delete | Monthly review (user) |
| `memory/feedback_*.md` contradicted by recent retro evidence | Flag for user decision | Sunday weekly-summary trigger |

### Weekly Summary Task (Sunday cron 21:00 local)

```
0 21 * * 0  weekly-summary
```

Logic:
1. Read last 7 days `logs/retro_*.md`
2. Synthesize into 1 `logs/weekly_YYYYWW.md` (funnel diagnosis + pattern observation + next-week experiments)
3. Move 4-week-old retros to `logs/archive/`
4. Flag any feedback rule contradicted by this week's evidence
5. Push 1-line summary to phone (≤200 chars)

## 5. MEMORY.md Index Rules

- Each entry ≤ 150 characters
- Group by type (Identity / Decision / Feedback / Project / Meta)
- Cap: ~100 lines (well under any tooling limit)
- If exceeds, promote to two-level index (e.g., split Project into active / historical)

## 6. Auto vs User-driven Maintenance

**Auto** (no user intervention):
- daily-learnings-review (22:00) — extracts memory from conversations, classifies by type
- weekly-summary (Sunday 21:00, optional) — retro synthesis + archival
- evening-retro (22:00) — same-day data review and config update

**User-driven**:
- Monthly audit decision rules (1st of month evening): read all `decision_*.md`, ask "is this still triggered? still valid?"
- Quarterly audit feedback rules: check for contradicting evidence
- Manually archive old `project_candidate_profile_*.md` snapshots after a fresh version

> Monthly / quarterly audits **don't need cron**. Use TodoWrite reminders. Over-automation removes user ownership of the system.
