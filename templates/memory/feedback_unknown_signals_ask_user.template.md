---
name: Match — when signals unknown, ask user before downgrading
description: Match Function should not silently downgrade tier when ≥3 signals are unknown; ask user first
type: feedback
---

When Match Function evaluates a JD and ≥ 3 of the 6 signals are marked `unknown`, **do not silently downgrade** the tier.

**Why**: User often has tacit knowledge the system can't see (heard of company, friend's network, knows founder's blog). Silent downgrade distorts Tier output — you might miss a real Tier A by mistakenly demoting it.

**How to apply**:

| Context | Action |
|---|---|
| Interactive (user present) | Ask in chat: "Do you know company X's vibe? Have you heard of the founder?" — finalize tier after response |
| Autonomous task (cron) | Don't interrupt user — flag JD as `tier: pending_user_input`, queue for evening retro batch review |
| User responds | Provides info → recompute Match; "downgrade" → apply with reason; "trust default" → keep tier |
| User unresponsive > 48h | **Then** silently downgrade one tier with reason "user did not provide signal within 48h" |

**Exceptions** (don't trigger ask protocol):
- 2 unknowns AND neither is Role Alignment / AI Systems Relevance → keep tier
- 1 unknown → no impact

**Critical**: Downgrading is a user-authorized action, not a system unilateral move.
