# Sample Evening Retro (anonymized)

> Output of `evening-retro` task. All names / companies are placeholders.

# Retro YYYY-MM-DD

## Today's data (Observable Funnel)

> ⚠️ Observable funnel ≠ true funnel — user-handled-offline (phone, DM, email) is invisible. Default assume: already handled.

- Sent: **5** (Tier A: 2 / B: 3 / C-saved: 2 / pending: 1 / D-skipped: 2)
- Funnel today:
  - sent: 5
  - read: 2 (from today's batch, ~14:30 reads)
  - reply: 0 (today's batch — too early)
  - deep_chat: 1 (Co_X — manual follow-up from yesterday's batch advanced today)
  - interview: 0
  - offer: 0
- Inbound HR (today): 1 (Co_Y proactively contacted user — offline-handled, no system action)

## Dimensional slicing (with sample size)

### By keyword
| Keyword | Sent | Read | Reply | Sample flag |
|---|---|---|---|---|
| AI Solutions Architect | 2 | 1 | 0 | n=2: noisy |
| Applied AI Lead | 1 | 1 | 0 | n=1: noisy |
| AI Agent 架构师 | 2 | 0 | 0 | n=2: noisy |

### By send-time
| Time slot | Sent | Read | Sample flag |
|---|---|---|---|
| 09:30-10:30 | 4 | 2 | n=4: noisy |
| 14:00+ | 1 | 0 | n=1: noisy |

### By Match tier
| Tier | Sent | Read | Reply | Note |
|---|---|---|---|---|
| A | 2 | 1 | 0 | Both Tier A advanced to read; expected next 24-48h reply |
| B | 3 | 1 | 0 | Mixed read rate |

> All slices today are sample <10 → no action taken.

## Pattern Observation (no conclusion)

1. "Today batch (5 sent) showed 40% read rate within 4h (n=5, noisy)" — typical morning-batch behavior, no signal yet
2. "Co_X (yesterday's Tier B batch) advanced to deep_chat today via manual follow-up" — supports pattern that Tier B + manual follow-up after 24-48h is high-leverage
3. "Co_Y inbound HR contacted user proactively — Tier C company, suggests broader algorithmic recommendation working from sustained daily activity"

## Auto-optimization (Match-Reward separated)

### Search-side (keyword adjust) — based ONLY on search efficiency

No changes today. All keywords returned ≥5 qualified JDs, none in 0-yield streak.

### Policy-side (outreach behavior adjust) — based on outcome

No changes today (sample insufficient). Will revisit at weekly retro with 7-day data.

### ❌ NOT adjusted (sample insufficient / outcome → match violation)

- Did NOT demote "AI Agent 架构师" despite 2/2 = 0% read today (n=2 too small)
- Did NOT promote "AI Solutions Architect" despite 2/2 = 100% read today (n=2 too small)

## Pending User Input Queue

- **Co_H**: signals missing role_alignment, company_context, vibe — see morning report `pending_match_review_YYYYMMDD.json`
  - Asks: have you heard of Co_H? founder background? team size?

## Pool status
- Today's candidates: 10 → 5 sent → healthy
- JSONL cumulative: ~150 entries since start
- Pool-thin: no

## User-action items (manual, non-automated)

- 🔥 Tier A LinkedIn DM tonight: Co_A, Co_B (cold outreach to founder/CTO)
- 📞 Co_X deep-chat scheduled tomorrow (already arranged offline)
- 🔔 Inbound: Co_Y reached out — user already replied via phone (no system action needed)
- 🟡 Pending input: Co_H — provide signals via chat or skip
