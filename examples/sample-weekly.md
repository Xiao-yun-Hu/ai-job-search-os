# Sample Weekly Summary (anonymized)

> Output of `weekly-summary` task (Sunday 21:00).

# Week WW (date_start - date_end)

## Volume Summary
| Metric | This week | Prev week | Change |
|---|---|---|---|
| Apps sent | 22 | 18 | +22% |
| Inbound HR | 4 | 2 | +100% |
| Deep-chats | 5 | 3 | +67% |
| Interviews | 1 | 0 | +1 (first interview!) |
| Offers | 0 | 0 | — |

## Conversion Summary
| Transition | This week | Sample size | Notes |
|---|---|---|---|
| Apply → Read | 14/22 = 64% | n=22, OK | Above target (≥40%) |
| Read → Reply | 6/14 = 43% | n=14, OK | Above target (≥30%) |
| Reply → Deep-chat | 5/6 = 83% | n=6, marginal | High |
| Deep-chat → Interview | 1/5 = 20% | n=5, noisy | Sample too small |
| Interview → Offer | 0/1 | n=1 | Too early |

## 4 Diagnosis Questions

### 1. Which (tier × role × channel) combinations advanced furthest?
- **Tier A + LinkedIn DM**: 2 sent, 2 reached read, 1 reached deep_chat → 50% reach deep_chat (n=2, noisy)
- **Tier B + apply-only**: 14 sent, 8 reached read, 3 reached deep_chat → 21% (n=14, OK signal)
- **Tier C + apply-only**: 6 sent, 4 reached read, 1 reached deep_chat → 17% (n=6, marginal)

### 2. Did Tier A + DM outperform Tier B + apply-only?
- A+DM: 50% deep-chat reach (n=2)
- B+apply: 21% (n=14)
- **Apparent advantage for Tier A + DM**, but n=2 too small for confident claim. Continue tracking.

### 3. Did role-title X outperform role-title Y in reply rate?
- "AI Solutions Architect": 4 sent, 2 replies → 50% (n=4)
- "AI Agent 架构师": 6 sent, 3 replies → 50% (n=6)
- "Applied AI Lead": 3 sent, 0 replies → 0% (n=3, noisy)
- No confident signal yet. **Don't change keyword priority.**

### 4. Did channel X outperform channel Y in funnel progression?
- Job board: 18 sent, 5 deep_chats → 28% (n=18, OK)
- LinkedIn DM (Tier A): 2 sent, 1 deep_chat → 50% (n=2, noisy)
- Inbound (algorithmic): 4 contacts, 2 deep_chats → 50% (n=4, marginal)
- **Inbound contributing real value** — supports keeping daily job-board activity.

## Bottleneck

**Pick: Apply → Reply rate is acceptable (43%), but Reply → Deep-chat is high (83%) — suggests funnel is healthy in early stages. Bottleneck is volume → conversion to interview.**

Working theory: Tier A + DM is producing higher quality conversations but volume is small (only 2 attempts this week). Need to scale Tier A outreach.

## Experiments next week

| Experiment | Variable | Metric | Sample target |
|---|---|---|---|
| A | Increase Tier A LinkedIn DM volume from 2/week to 5/week | Track Tier A → deep_chat % | 5 attempts |
| B | A/B message version (current `v1` vs new `v2_eval-focused`) | Reply rate per version | 5 sends per version |

## Match-Reward Separation Check

- ✅ No keyword priority changes despite slice variations (all sample sizes too small)
- ✅ No role-type Match modification despite "Applied AI Lead 0/3 reply" (n=3 too small)
- ⚠️ Feedback rule "vibe > money" needs validation — track in next 2-3 weeks: are we accepting/rejecting offers along this axis when sample exists?

## Archived
- Moved 4 retros (2026-MM-AA through 2026-MM-DD) to `logs/archive/`

PushNotification:
> Week: 22 apps, 6 replies (27%), 5 deep-chats, 1 first interview! Bottleneck: Tier A volume (n=2 only). Next week: scale Tier A LinkedIn DM 5/week + A/B message versions.
