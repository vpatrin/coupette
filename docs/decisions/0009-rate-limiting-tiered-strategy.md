# ADR 0009: Tiered API Rate Limiting Strategy

**Date:** 2026-04-05
**Status:** Accepted

## Context

The API has two exposure risks: brute-force on auth endpoints and unbounded Claude API spend on LLM endpoints. Redis is already running for OAuth state. A rate limiting layer is needed before the app scales beyond a small waitlist.

## Options considered

1. **Nginx/Caddy rate limiting** — reverse proxy handles it, no app code needed.
2. **Custom Redis middleware** — roll our own sliding window in FastAPI.
3. **slowapi + Redis** — library wrapping `limits`, integrates with FastAPI decorators.

## Decision

slowapi with Redis storage, three tiers: global IP ceiling (100/min), stricter per-route limits on auth (10/min) and waitlist (3/min), and per-user limits on LLM endpoints (20/min) using JWT `sub` as key.

## Rationale

- **Not Caddy (yet):** can't do per-user limits at the proxy layer without JWT awareness. IP-based limits will migrate to Caddy later (see ENGINEERING.md backlog) — app keeps only the per-user LLM tier long-term.
- **Not custom middleware:** slowapi is minimal (~500 LOC), well-tested, and saves the sliding-window implementation.
- **Per-user on LLM, per-IP elsewhere:** auth/waitlist abuse is IP-based (credential stuffing, spam bots); LLM abuse is account-based (one user hammering Claude). Different threat models need different keys.
- **Bot-secret callers exempt from per-user LLM limits via fallback:** bot callers have no JWT so they fall back to IP key. The bot runs on the internal Docker network (distinct IP) and enforces its own per-user throttling in `middleware.py`.

## Consequences

- slowapi uses sync Redis internally (no `AsyncRedisStorage` support via `storage_uri`). Rate-limit checks block the event loop for ~0.1ms — acceptable at current scale.
- Adding a new LLM endpoint requires `@limiter.limit(RATE_LIMIT_LLM, key_func=get_user_or_ip)` — easy to forget; check during PR review.
- `/health` and `/metrics` are explicitly exempt to avoid false positives from Docker healthchecks and Prometheus scraping.
