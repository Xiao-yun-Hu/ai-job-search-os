---
name: evening-retro
description: Daily 22:00 retro — Match-Reward separation, only search-side signals modify keywords
---

# Task: Daily Evening Retro (Analyst)

> **Critical rule**: Strict Match (strategic judgment) vs Reward (market feedback) separation. **Reward signals do not modify Match rules directly.** See `docs/SYSTEM.md` Section 4.7-4.8.

## Pre-flight
- Verify browser automation connectivity + job-board login
- Read `[/path/to]/applications.jsonl`
- Read `[/path/to]/config.yaml`

## Phase 1: Data Collection

### 1.1 Today's applications
Filter from `applications.jsonl` records with today's `ts` field (local time).

### 1.2 Job board chat list state
Navigate to chat list URL (e.g., `https://[job_board]/chat`), JS iterate friend-list elements, extract per conversation:
- `hr_name`, `company`, `role`
- Last message text + status tag (sent/read/no-tag)
- Timestamp

**Match** to today's applications by `company` field.

### 1.3 Funnel stage classification (ordinal, no reward score)

Each application maps to a stage:
```
sent < read < reply < deep_chat < interview < final < offer
```

Mapping rules:
- `sent`: application submitted, not yet delivered
- `read`: [delivered] / [read] tag, no HR new message
- `reply`: HR sent text reply (generic)
- `deep_chat`: HR reply contains "resume / phone / WeChat / time / interview"
- `interview`: confirmed interview time or formal resume submission
- `rejected`: HR reply contains "not a fit / already filled / not needed" or "[gender/age] requirement"

## Phase 2: Dimensional slicing (Observation Only — NOT for Match update)

Slice today's funnel-stage distribution by:
1. By keyword (search source)
2. By scale (company size)
3. By stage (funding round)
4. By time-of-day (send time)
5. By JD-feature score range (cardinal input score)
6. **By Match tier** (A/B/C/D — newer schema)

> ⚠️ **Sample size annotation required.** Any slice with `sample < 10` → mark "noisy, do not act".
> ⚠️ **Slices are not used for direct Match modification** — see Phase 4 constraints.

## Phase 3: Pattern Observation (2-3 findings)

Format: (count, ratio) — **no conclusive verdict**.

Examples:
- "Keyword X today returned 0 qualified JDs (search-side signal)" ✅ usable for keyword adjust
- "Keyword Y batch on day Z had 2 applications → 2 deep-chats (n=2 outcome)" ⚠️ sample too small to act on Match
- "09:30 sends had 80% read rate vs 10:30+ had 50% (n=15)" ✅ usable for policy adjust (timing)

## Phase 4: Auto-optimization — strict Match-Reward separation

### 4a. Search Efficiency (✅ allowed to modify keyword priority)

Use ONLY **search-side signals** (input-side):

| Trigger | Action |
|---|---|
| Keyword has 0 qualified JDs for ≥3 consecutive days | Demote priority. Comment reason: "0 search yield 3+ days" |
| Keyword has ≥5 qualified JDs for ≥3 consecutive days | Promote / maintain priority |
| New keyword has strong external signal (e.g., recruiter proactively asked) | Add to end of list as exploration |

### 4b. Policy Adjustment (✅ allowed — outreach behavior, not Match)

Use **outcome signals** to adjust **policy**, not Match:

| Signal | Adjustment |
|---|---|
| Time-slot read-rate diff (sample ≥15) | Adjust morning task start time |
| Message version A/B diff (if implemented) | Adjust message rotation |
| Channel progression diff | Adjust channel mix |

### 4c. ❌ Forbidden (violates Match-Reward separation)

- ❌ **Do NOT** modify keyword priority based on "X applications got 0 replies" (sample <100 — never modify Match)
- ❌ **Do NOT** modify keyword based on deep-chat rate (this is outcome → match violation)
- ❌ **Do NOT** demote a role-type in Match because some apps to that type didn't reply — could be resume / channel / timing problem

> 🐛 **Anti-pattern warning**: A retro that demotes keyword X from #2 to #5 based on (a) 0 candidates today (search-side, OK) AND (b) historical 2 apps with 0 replies (n=2 outcome reward, **violation**) is mixing reward into match. Don't do this.

### 4d. config.yaml modification rules

- Snapshot before changes: `logs/config_snapshots/config_YYYYMMDD.yaml`
- Comment format: `# updated by retro YYYYMMDD: <search-side reason | policy reason>`
- Forbidden comments: `# 0 replies` / `# low deep-chat rate` / `# poor conversion` (these are outcome signals)

## Phase 5: Retro file

Write `logs/retro_YYYYMMDD.md`:

```markdown
# Retro YYYY-MM-DD

## Today's data (Observable Funnel)
> ⚠️ Observable funnel ≠ true funnel — user-handled-offline (phone, DM, email) is invisible to system. **Default assume: already handled offline.**

- Sent X (Tier A: x / B: y / C-saved: z / pending m / D skipped n)
- Funnel: sent N1 → read N2 → reply N3 → deep_chat N4 → interview N5 → offer N6

## Dimensional slicing (with sample size)
| Dimension | Slice | sample | Stage distribution | Note |
...

## Pattern Observation (no conclusion)
1. ... (sample, count, ratio)

## Auto-optimization (Match-Reward separated)
### Search-side (keyword adjust) — based ONLY on search efficiency
- ...

### Policy-side (outreach behavior adjust) — based on outcome
- ...

### ❌ NOT adjusted (sample insufficient / outcome → match violation)
- ...

## Pending User Input Queue
- Company X (signals missing: vibe + founder + company_stage), waiting for user reply
- ...

## Pool status
- Today's candidates: X
- JSONL cumulative: Y
- ⚠️ Pool-thin: yes/no

## User-action items (manual)
- Deep-chat opportunities: ...
- Inbound HR (assume offline-handled by default; flag only if user mentions miss)
```

## Phase 6: Phone Push (≤200 chars)

```
Job board today X (A:x B:y), deep-chat Z, interview W. {pool-thin / pending alert}. retro_YYYYMMDD.md written.
```

If deep-chat / interview progress: prioritize that.
If `pending_user_input` queue: prompt "X candidates need your input on signals — review tonight".

## Phase 7: Pending User Input Queue

If today's morning task flagged JDs as `tier: pending_user_input`:
1. List them (company / title / which signals are unknown)
2. Write to `logs/pending_match_review_YYYYMMDD.json`
3. In phone push, prompt user to reply in chat
4. After user responds:
   - Provide info → recompute match → output new tier
   - "Downgrade" → apply with reason
   - "Trust default" → keep tier
5. User unresponsive >48h → silent downgrade one tier with reason "user did not provide signal within 48h"

See `memory/feedback_unknown_signals_ask_user.md`.

## Observable Funnel Principle

- **Observable funnel ≠ true funnel**
- User-handled-offline (phone, DM, email) is invisible to system
- **Default trust user**: silent "unanswered" inbound is **not penalized**
- Only count "miss" cost when user explicitly logs it

## Hard prohibitions
- ❌ Don't modify keyword based on outcome (reply rate / deep-chat rate) — violates 4.7 Match-Reward separation
- ❌ Don't auto-reply to HR messages
- ❌ Don't modify applications.jsonl (read-only)
- ❌ sample <10: no conclusion. sample <100: no Match modification.
- ❌ Don't penalize "unanswered" inbound (assume offline-handled)
