---
name: daily-learnings-review
description: Daily 22:00 — extract memory updates from today's conversations, classify by 5-type taxonomy
---

# Task: Daily Learnings Review

> Cron: `0 22 * * *` (every day 22:00 local)
> Purpose: Scan today's conversations, extract memory-worthy facts, classify into 5-type taxonomy.

## What to extract

### Identity (`user_*`)
- Stable user background (career region, language, education) — RARE updates only
- Trigger: user mentions "I worked in X for Y years" or similar persistent self-fact

### Decision rules (`decision_*`)
- Hard rules user has set ("don't do X", "always Y")
- Trigger: "Stop doing X", "Always do Y", "Never Z"
- Convert from feedback to decision when: rule used at task-runtime, must obey

### Feedback / preferences (`feedback_*`)
- Soft preferences, strategy preferences, learned heuristics
- Trigger: "I prefer", "Better to", "Going forward..."
- Includes "What worked" AND "What did not work" (record both)

### Project / state (`project_*`)
- Current ongoing work context
- Trigger: "We're freezing X by Y date", "the X project is now Y"

## What NOT to extract

❌ One-off conversation context (won't be needed in next session)
❌ Daily application records (those go to `applications.jsonl`)
❌ Daily retro details (those stay in `logs/retro_*.md`)
❌ Code patterns / file paths / project structure (derivable from current code)
❌ Anything already documented in CLAUDE.md / other memory files

## Process

1. Scan today's conversation transcripts
2. For each candidate fact, determine type (identity / decision / feedback / project)
3. Check SSOT: does this fact already exist in another memory file? If yes, **update** that file, don't create new
4. If new: write file with proper frontmatter (3 fields: name, description, type)
5. Update `MEMORY.md` index with one-line entry (≤150 chars)

## SSOT Check (before writing)

```bash
grep -r "keyword" /path/to/memory/
```

If duplicate found, update existing instead of creating new.

## Output

- New / updated memory files
- Updated `MEMORY.md` index
- One-line summary (optional push notification): "Today added/updated N memories: [titles]"

## Hard prohibitions
- ❌ Don't add `importance` / `last_referenced` / `expires_at` / `links` to frontmatter (over-engineering)
- ❌ Don't create duplicate facts (run SSOT check first)
- ❌ Don't promote feedback → decision without explicit user signal
- ❌ Don't write project state into `feedback_*` (project is for current state, feedback is for soft rules)
