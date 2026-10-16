---
name: review
description: Review the current branch against main in a fresh-context reviewer subagent — invariants, domain checklists, TDD and evidence checks; returns APPROVE, WARN, or BLOCK with checklist IDs. Use before opening a PR, with a topic for a focused review, or with --full for a repo-wide audit.
argument-hint: "[topic | --full]"
context: fork
agent: reviewer
background: false
---

Review the current branch.

Arguments: $ARGUMENTS
