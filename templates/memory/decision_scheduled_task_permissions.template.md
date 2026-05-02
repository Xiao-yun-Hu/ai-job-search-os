---
name: scheduled tasks must not pop permission prompts
description: All permissions for autonomous/scheduled tasks must be pre-set in the allowlist; never block on user prompts
type: decision
---

For autonomous tasks (cron-driven, fire-and-forget), all permissions must be pre-declared in `settings.local.json`. **Never** rely on interactive permission prompts — by definition, the user is not present.

**Why**: A scheduled task that pops a permission prompt at 22:00 when the user is asleep = wasted run.

**How to apply**: Whenever adding a new tool call or Bash command to a scheduled task, immediately add the corresponding rule to `.claude/settings.local.json` `permissions.allow`:

- Use wildcards to cover future variants (dates, file suffixes, etc.) — don't write hard-coded specific values
- Cover: Edit / Write target directories, Bash command prefixes, MCP tool names, PushNotification, ToolSearch
- The settings.local.json edit-permission itself should also be pre-allowed (`Edit(/.claude/*)`)

**Anti-pattern**: scheduling a task, having it run, having it pop a prompt, having no one there to approve it. This is silent failure.
