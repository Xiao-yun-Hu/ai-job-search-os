---
name: salary floor rule
description: Hard salary filter — how to evaluate "below floor" given salary range syntax
type: decision
---

**Rule**: When evaluating a salary range like "X-Y[unit]", compare **Y (max)** to the floor, not X.

Example: floor = 30K monthly. JD says "25-50K". Max = 50K ≥ 30K → **pass**, not skip.

**Why**: A range's max is what's actually achievable for a strong candidate. Using min would falsely reject many qualified roles.

**How to apply**: In Phase 1 candidate filtering, parse `salary_max` from the JD page, compare to floor. Skip only when `salary_max < floor`.

**Edge cases**:
- Salary undisclosed but company quality is high → don't gate, negotiate later
- Salary undisclosed and company unknown → downgrade one tier (don't skip)
- Range expressed as "annual base" vs "monthly × N salaries": normalize before compare
