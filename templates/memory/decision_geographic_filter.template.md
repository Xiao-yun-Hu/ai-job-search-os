---
name: geographic hard filter
description: Cities / regions allowed; reject anything else
type: decision
---

**Rule**: Job location must be in the allow-list. Otherwise, Tier D / Skip.

```python
def passes_geo_filter(company_location):
    if company_location.country == "[YOUR_COUNTRY]":
        return company_location.city in {[YOUR_ALLOWED_CITIES]}
    elif company_location.country in {[YOUR_OVERSEAS_REGIONS]}:
        return True
    elif company_location.is_remote_friendly:
        return True
    else:
        return False
```

**Why**: Geographic preference is a hard constraint, not a learned preference. Don't let "good role in wrong city" leak through and waste interview time.

**How to apply**: Run before any other Match evaluation. Cheapest filter, applied first.

**Edge cases**:
- Role explicitly remote → pass (regardless of HQ location)
- Hybrid with home office in target city → pass
- "Negotiable location" → flag for user review (do not auto-skip)
