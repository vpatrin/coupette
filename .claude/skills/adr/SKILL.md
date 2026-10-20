---
name: adr
description: Draft an Architecture Decision Record in docs/adrs/ after checking it passes the 4-test gate; otherwise route the decision to the commit body and the journal's Decisions line. Use when a decision with real alternatives, hard to reverse, needs recording, or when asked for an ADR.
argument-hint: "<the decision>"
---

# /adr

Decision: $ARGUMENTS

1. Apply the 4-test gate in [`rules/docs.md`](../../rules/docs.md) → ADRs, test by test, one line of evidence each. Count the ADRs dated in the last 30 days for test 4.
2. **Any test fails** → no ADR. Say which test failed, and write the decision as a commit-body line, and in the journal's Decisions line, instead.
3. **All pass** → copy `docs/adrs/TEMPLATE.md` to `docs/adrs/NNNN-<slug>.md` with the next number. Fill Context, Options (each with the reason it lost), Decision, Rationale, Consequences — 30-50 lines, the *why* not the *how*. Status `Proposed` until the PR merges.
4. Add the row to `docs/adrs/README.md`. If it supersedes an ADR, change only the old one's status line to `Superseded by [NNNN](NNNN-<slug>.md)`.
5. The ADR lands in the same PR as the change it records.
