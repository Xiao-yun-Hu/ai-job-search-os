---
name: weekly-summary
description: Sunday 21:00 — synthesize last 7 retros, ask 4 funnel-diagnosis questions, archive 4-week-old retros
---

# Task: Weekly Summary (Sunday Funnel Diagnosis)

> Cron: `0 21 * * 0` (every Sunday 21:00 local)
> Purpose: Compress 7 daily retros into 1 weekly insight; identify funnel bottleneck; design experiment for next week.

## Pre-flight
- Read last 7 days `logs/retro_*.md`
- Read `logs/morning_*.md` for the same week (volume context)
- Read `applications.jsonl` (slice this week's records)

## Phase 1: Volume Aggregation

```yaml
this_week:
  apps_sent: X
  inbound_hr: X
  deep_chats: X
  interviews: X
  offers: X
prev_week (for comparison):
  ...
```

## Phase 2: Conversion Rate Aggregation

For each stage transition, compute (with sample annotation):

| Transition | Count | Rate | Sample size flag |
|---|---|---|---|
| Apply → Read | a/b | X% | (sample n; if <10 → noisy) |
| Read → Reply | c/d | X% | ... |
| Reply → Deep-chat | e/f | X% | ... |
| Deep-chat → Interview | g/h | X% | ... |
| Interview → Offer | i/j | X% | ... (likely n=0-1 — don't act) |

## Phase 3: 4 Funnel Diagnosis Questions

Use evidence (count, ratio) **NOT reward scores**:

1. **Which (tier × role_type × channel) combinations advanced furthest?**
   - Group apps by these dimensions, see which group reached deeper stage on average
2. **Did Tier A + DM outperform Tier B + apply-only?**
3. **Did role-title X outperform role-title Y in reply rate?**
4. **Did channel X outperform channel Y in funnel progression?**

Answer each with: count + observed pattern + sample-size caveat.

## Phase 4: Bottleneck Identification (binary checklist)

Pick the most-likely bottleneck (only ONE — don't shotgun):

- [ ] **Targeting** — too many misfit JDs entering funnel (Apply → Read low)
- [ ] **Resume signal** — delivered but not read OR read but not replied (Read → Reply low)
- [ ] **Channel** — only one channel in use (no diversity)
- [ ] **Role mismatch** — deep-chats reveal JD/resume mismatch (Reply → Deep-chat low)
- [ ] **Market timing** — holiday / fiscal year / company freeze
- [ ] **Candidate narrative** — interview-stage friction (Deep-chat → Interview low)

## Phase 5: Hypothesis + Experiment Design

Based on bottleneck, design 1-2 experiments for next week:

| Experiment | Variable | Metric | Sample target |
|---|---|---|---|
| A | [What to change] | [Track which conversion] | [N apps to compare] |
| B | ... | ... | ... |

## Phase 6: Match-Reward Separation Check

> Critical: experiments should adjust **policy**, not Match (until sample ≥ 100).

If a feedback rule contradicts evidence accumulated this week:
- Don't auto-modify the rule
- Flag for user: "Rule X (e.g., 'overseas founder = priority') predicted reply-rate diff, but week shows..."

## Phase 7: Archival

Move retros older than 4 weeks to `logs/archive/`:

```bash
find logs/retro_*.md -mtime +28 -exec mv {} logs/archive/ \;
```

## Phase 8: Output

Write `logs/weekly_YYYYWW.md`:

```markdown
# Week WW (date_start - date_end)

## Volume Summary
| metric | this week | prev week | change |

## Conversion Summary
| transition | rate | sample |

## 4 Diagnosis Questions
1. ...
2. ...
3. ...
4. ...

## Bottleneck
[Pick one]

## Experiments next week
- A: ...
- B: ...

## Match-Reward Separation Check
[Any feedback rules contradicted?]

## Archived
- Moved N retros to archive/
```

PushNotification (≤200 chars):
```
Week WW: X apps, Y replies (Z%), W interviews. Bottleneck: [picked one]. Next-week experiment: [A/B]. weekly_YYYYWW.md written.
```

## Hard prohibitions
- ❌ Don't update Match rules (sample <100)
- ❌ Don't compute "reward score" — use ordinal stages and counts
- ❌ Don't penalize "unanswered" inbound (Observable funnel ≠ true funnel)
