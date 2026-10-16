---
name: review
description: Review the current branch against main in a fresh-context reviewer subagent — invariants, domain checklists, TDD and evidence checks; returns APPROVE, WARN, or BLOCK with checklist IDs. Use before opening a PR; `/review security|data|ai` for an in-depth audit; --full for the whole repo.
argument-hint: "[security | data | ai | <topic>] [--full]"
context: fork
agent: reviewer
background: false
---

Review the current branch.

Arguments: $ARGUMENTS
