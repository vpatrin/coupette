# Scaling Plan

Expands the [scaling path table](ARCHITECTURE.md#scaling-path) into actionable tiers. Each tier defines the bottleneck, concrete actions, cost impact, dependencies, and signals that you've outgrown it.

Design principle: **add infrastructure when a bottleneck is measured, not when it's imagined.**

---

## Current Baseline

| Component | Configuration | Notes |
|-----------|--------------|-------|
| VPS | Hetzner CX22 — 4GB RAM, 40GB SSD, 2GB swap | Shared with Uptime Kuma, Umami, observability stack (~600MB for Alloy/Loki/Prometheus) |
| Database | Shared Postgres 16 + pgvector, `max_connections=100` | SQLAlchemy async, pool defaults (size=5, overflow=10) |
| Backend | Single uvicorn async worker, 512MB mem limit | Stateless, horizontally scalable by design |
| Bot | 256MB mem limit, long polling | Stock alerts triggered by scraper `--availability-check`, not bot polling |
| Scraper | 512MB mem limit, weekly + 6h availability check | 2s rate limit between SAQ requests |
| Vector store | ~14k vectors, exact scan (no index) | OpenAI `text-embedding-3-large` |
| LLM | Claude Haiku (intent + curation + sommelier) | OpenAI embeddings for query + product vectors |
| Monthly infra cost | ~€7 (CX22 VPS share) | Excludes domain, LLM API |

---

## Tier 1: 20 Users (Current)

**Bottleneck:** None — everything works.

**What to monitor** (observability stack is in place):

- API p95 latency (baseline: sub-500ms for search, 5-6s for recommendations — dominated by embedding + LLM calls)
- DB connection count (should stay well under pool_size=5 per service)
- VPS memory usage (target: keep ~1GB free — observability stack claims ~600MB, leaving less app headroom than the raw 4GB suggests)
- Claude API monthly spend

**Cost:** ~$10/mo total (VPS share + LLM APIs)

**Signals you've outgrown Tier 1:**

- API p95 consistently > 500ms on search/filter endpoints
- DB connection pool saturation warnings in logs
- VPS available memory regularly < 500MB (swap pressure)

---

## Tier 2: 200 Users — Query Performance

**Bottleneck:** Slow queries, connection exhaustion, single worker throughput.

### Actions

#### 1. Tune connection pool
Explicit `pool_size`, `max_overflow`, `pool_timeout` in `core/db/base.py`. Three services share one Postgres — total connections = 3 × (pool_size + max_overflow). Shared Postgres serves other databases too (Umami, URL shortener), so coordinate max_connections.

Suggested starting point: `pool_size=10, max_overflow=5` per service = 45 max connections from Coupette.

**Effort:** 1h. **Owner:** coupette repo.

#### 2. PgBouncer
Connection pooler in front of shared Postgres. Multiplexes application connections → fewer real Postgres connections. Critical when multiple services compete for connections.

**Effort:** 2-4h. **Owner:** infra repo. **Mode:** transaction pooling.

#### 3. Analyze and add missing indexes
Enable `pg_stat_statements` to identify slow queries. Likely candidates:
- Composite index on `products(category, country)` for filtered search
- Partial index on `watches` for active watches with availability joins
- Index on `chat_messages(session_id, created_at)` for conversation loading

**Effort:** 2-4h per index round. **Owner:** coupette repo (model + migration).

#### 4. pgvector index
Exact scan is fine at 14k vectors. At ~50k+ vectors, add an HNSW index on `products.embedding`:
```sql
CREATE INDEX ON products USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
```
HNSW over IVFFlat — no retraining needed when rows change, better recall at comparable speed.

**Effort:** 1h (migration). **Owner:** coupette repo. **Trigger:** vector count > 30k or similarity search p95 > 200ms.

#### 5. API rate limiting

Protect Claude API costs from abusive or runaway usage. Per-user rate limits on chat/recommendation endpoints. Options: `slowapi` (app-level, easy) or Caddy rate limiting (infra-level, no code change).

Start simple: N requests/minute per user on `/api/chat`. Adjust based on real usage patterns from Prometheus metrics.

**Effort:** 1-2h. **Owner:** coupette repo (slowapi) or infra repo (Caddy).

#### 6. Embedding cache

Cache OpenAI embedding API calls for repeated query strings. Same query text → same embedding vector. In-memory dict or Redis with 24h TTL.

Not about cost — about latency. The embedding call adds ~1.5-2s to every recommendation pipeline run. Caching eliminates that for repeated queries.

**Effort:** 1-2h. **Owner:** coupette repo.

#### 7. Multiple backend workers
Either multiple uvicorn workers (`--workers 4`) or multiple container replicas behind Caddy. Container replicas are cleaner — each gets its own memory limit and crash isolation. k3s makes this trivial later (replica sets), but Docker Compose can do it with `deploy.replicas` in the meantime.

**Effort:** 1-2h. **Owner:** coupette repo (compose) + infra repo (Caddy upstream).

#### 8. Separate metrics port
Move `/metrics` to a dedicated internal port (e.g. `:9090`) so Prometheus scraping doesn't mix with user traffic and the endpoint isn't publicly reachable via Caddy's `/api/*` route. Currently exposed on the main app via `prometheus-fastapi-instrumentator` — works fine, but at scale scraping adds noise to request metrics and exposes operational data publicly.

Options: run a second uvicorn app on a metrics-only port, or use `prometheus-fastapi-instrumentator`'s built-in support for a separate ASGI app.

**Effort:** 1-2h. **Owner:** coupette repo + infra repo (firewall/network config).

### Cost at Tier 2

| Item | Monthly | Notes |
|------|---------|-------|
| VPS | €7-15 | May need CX32 upgrade (8GB RAM) for replicas |
| LLM (Claude) | ~$6 | 10× users, roughly linear |
| LLM (OpenAI) | ~$2 | Embeddings don't scale with users (product count stays ~14k) |
| **Total** | ~$25/mo | |

### Dependencies
- PgBouncer → infra repo PR
- Backend replicas → Caddy upstream config in infra repo
- k3s migration simplifies replicas but is **not required**

### Signals to advance to Tier 3
- Same queries repeated by different users (cache hit ratio would save > 50% of DB reads)
- Read latency p95 > 500ms despite indexes
- LLM cost growing faster than acceptable (> $20/mo on Claude)

---

## Tier 3: 2,000 Users — Caching & Read Scaling

**Bottleneck:** Repeated identical queries hitting Postgres, single DB writer, LLM costs.

### Actions

#### 1. Redis cache layer
Cache frequently repeated data with TTL-based invalidation:

| Cache target | TTL | Invalidation |
|-------------|-----|--------------|
| Product search results | 15 min | On scraper run |
| Facet counts (category, country, price ranges) | 1h | On scraper run |
| Store data | 24h | On store scrape |
| Product detail by SKU | 1h | On scraper run |

Use a thin cache-aside pattern in repository layer — check Redis first, fall through to Postgres, populate cache on miss.

**Effort:** 4-8h (Redis container + cache layer + invalidation). **Owner:** infra repo (Redis container) + coupette repo (cache logic).

#### 2. LLM response cache
Cache Claude recommendation responses by normalized query hash. Short TTL (1-4h) — wine preferences are personal, but "wines under $20 for pasta" is universal enough to cache.

Key: `hash(normalized_query + intent + filter_params)`. Don't include user-specific context in the cache key (taste profile will make this user-specific in Phase 12).

**Effort:** 2-4h. **Owner:** coupette repo.

#### 3. Read replica
Postgres streaming replication — route read-only queries (search, facets, product detail, chat history reads) to replica. Write queries (watches, chat messages, recommendation logs) stay on primary.

Implementation: second `engine` in `core/db/base.py` with a `read_only` session factory. Repository methods declare whether they're read or write. Needs careful handling of read-after-write consistency (e.g., creating a watch then immediately listing watches).

**Effort:** 2-3 days (replica setup in infra + read/write routing across all repositories + testing). **Owner:** both repos.

#### 4. Bot webhook migration
Replace long polling with Telegram webhooks. Eliminates periodic backend polling — Telegram pushes updates directly. Requires a public HTTPS endpoint (Caddy already provides this).

Notification delivery also shifts: instead of the bot polling for stock events every 6h, the backend pushes notifications via a task queue or direct bot API call when events are detected.

**Effort:** 4-8h. **Owner:** coupette repo (bot) + infra repo (Caddy route for webhook).

### Cost at Tier 3

| Item | Monthly | Notes |
|------|---------|-------|
| VPS | €15-30 | CX32 or CX42 for replica + Redis headroom |
| Redis | €0 | Self-hosted container on same VPS |
| LLM (Claude) | ~$30-60 | 2k users, partially offset by response caching |
| LLM (OpenAI) | ~$2-5 | Embedding cache (from Tier 2) reduces repeat calls |
| **Total** | ~$50-100/mo | |

### Dependencies
- Redis container → infra repo
- Read replica → infra repo (Postgres config, possibly second container)
- Webhook endpoint → infra repo (Caddy route)
- k3s simplifies Redis + replica deployment (StatefulSets, services) but **not required**

### Signals to advance to Tier 4
- Claude API costs > $50/mo despite response caching
- Recommendation p95 latency dominated by LLM round-trip (> 3s)
- Request queue depth growing (more concurrent recommendations than the async worker can handle)
- VPS CPU consistently > 80% during peak hours

---

## Tier 4: 10,000+ Users — Async Processing & Horizontal Scale

**Bottleneck:** Claude API latency as the synchronous bottleneck, single-region, compute limits.

### Actions

#### 1. Async task queue
Decouple recommendation requests from LLM calls. User sends message → backend returns immediately with a task ID → worker processes recommendation asynchronously → client polls or receives SSE update.

Options:
- **ARQ** (Redis-backed, async-native, lightweight) — fits the stack, minimal overhead
- **Celery** (battle-tested, heavier) — overkill unless you need complex routing/priorities

ARQ recommended for solo dev context. Redis is already in place from Tier 3.

**Effort:** 8-16h (queue setup + worker + API refactor + client polling/SSE). **Owner:** coupette repo.

#### 2. SSE streaming
Already spec'd as Phase 9 item (#427). Stream LLM responses token-by-token instead of waiting for the full response. Reduces perceived latency significantly — first token arrives in ~200ms vs waiting 5-6s for the full pipeline.

At this tier it's no longer optional — users won't tolerate synchronous 5-6s waits at scale.

**Effort:** 8-16h (backend SSE endpoint + frontend streaming renderer). **Owner:** coupette repo.

#### 3. Response pre-computation

Batch-generate recommendations for popular query patterns during off-peak hours. "Red wines under $20", "wines for BBQ", "Bordeaux recommendations" — cache warm responses so peak-time requests are instant.

Run as a scheduled job (like the scraper). Populate the LLM response cache proactively.

**Prerequisite:** analytics on actual query patterns (which queries are popular enough to pre-compute). Requires Tier 3's LLM response cache to be in place, plus query logging with aggregation.

**Effort:** 4-8h. **Owner:** coupette repo.

#### 4. Horizontal backend scaling
Multiple backend replicas behind a load balancer. With k3s: Deployment with HPA (Horizontal Pod Autoscaler) scaling on CPU/memory or custom metrics (request queue depth). Without k3s: multiple containers behind Caddy upstream with health checks.

The backend is already stateless — no code changes needed, just orchestration.

**Effort:** 2-4h with k3s, 4-8h with Docker Compose. **Owner:** infra repo primarily.

#### 5. VPS upgrade or multi-node
CX22 (4GB) won't cut it at 10k users. Options:
- **Vertical:** CX42 (16GB, €15.90/mo) or CX52 (32GB, €29.90/mo)
- **Multi-node:** k3s cluster across 2-3 CX22s (~€21/mo) — better fault tolerance, horizontal capacity

k3s multi-node is the natural path if the k3s migration has happened by now.

**Effort:** Varies. **Owner:** infra repo.

#### 6. LLM provider redundancy
Fallback chain: Claude Haiku (primary) → Claude Haiku (retry with backoff) → degraded response (cached/pre-computed result). Consider Sonnet for high-value queries if budget allows.

Monitor per-provider latency and error rates. Circuit breaker pattern: if Claude p95 > 5s for 5 min, fall back to cached responses.

**Effort:** 4-8h. **Owner:** coupette repo.

#### 7. CDN for frontend

Cloudflare free tier in front of `coupette.club` — caches static SPA assets at the edge. Not a capacity concern at earlier tiers (Hetzner bandwidth is unmetered), but reduces global latency for geographically distributed users.

**Effort:** 1-2h. **Owner:** infra repo (DNS + Caddy config).

#### 8. Database partitioning considerations

Products table doesn't grow fast (~14k, bounded by SAQ catalog). But user-generated data (chat_messages, recommendation_logs, tasting_notes at Phase 11) grows linearly with users.

At 10k users with active chat: estimate ~1M chat messages/year. Postgres handles 10M+ row tables fine with proper indexing — partitioning (range partition on `created_at`) only when query performance degrades despite indexes.

**Effort:** 2-4h for time-based partitioning. **Owner:** coupette repo.

### Cost at Tier 4

| Item | Monthly | Notes |
|------|---------|-------|
| VPS/Infra | €30-90 | Multi-node k3s or larger VPS |
| LLM (Claude) | $100-300 | 10k users, offset by aggressive caching + pre-computation |
| LLM (OpenAI) | $5-10 | Embeddings stable, embedding cache (from Tier 2) handles repeats |
| CDN | €0 | Cloudflare free tier |
| Monitoring | €0 | Self-hosted observability stack |
| **Total** | ~$150-400/mo | |

### Dependencies
- Task queue → Redis (from Tier 3)
- SSE → Phase 9 #427
- HPA → k3s migration (infra repo)
- Multi-node → infra repo

---

## k3s Migration: Impact on Each Tier

k3s is an **enabler, not a prerequisite** — every tier can be achieved with Docker Compose. k3s makes Tiers 3-4 significantly easier to operate.

| Tier | Docker Compose Path | k3s Path |
|------|-------------------|----------|
| 2 | `deploy.replicas` + Caddy upstream | Deployment + Service (built-in) |
| 3 | Manual Redis container + compose networking | Helm chart, StatefulSet for Postgres replica |
| 4 | Complex compose with multiple workers, hard to auto-scale | HPA, rolling deploys, multi-node cluster |

**When to migrate:** before Tier 3 is ideal — Redis, replicas, and multiple services are where Compose starts getting painful. But don't block scaling work on the migration.

---

## Decision Points Summary

| Action | Tier | Trigger Metric | Effort | Owner |
| -------- | ------ | --------------- | -------- | ------- |
| Tune connection pool | 2 | Pool saturation warnings | 1h | coupette |
| PgBouncer | 2 | > 30 total connections | 2-4h | infra |
| Add DB indexes | 2 | Slow query log shows > 100ms queries | 2-4h | coupette |
| pgvector HNSW index | 2 | Vector count > 30k or similarity p95 > 200ms | 1h | coupette |
| API rate limiting | 2 | Any non-trivial user count (cost protection) | 1-2h | coupette or infra |
| Embedding cache | 2 | Pipeline p95 dominated by embed step | 1-2h | coupette |
| Backend replicas | 2 | Single worker CPU > 70% sustained | 2-4h | both |
| Separate metrics port | 2 | `/metrics` publicly reachable or scraping noise in request metrics | 1-2h | both |
| Redis cache | 3 | Repeated query ratio > 50% | 4-8h | both |
| LLM response cache | 3 | Claude spend > $20/mo | 2-4h | coupette |
| Read replica | 3 | Write contention or read p95 > 500ms | 2-3 days | both |
| Bot webhooks | 3 | Polling load visible in backend metrics | 4-8h | both |
| Async task queue | 4 | Recommendation queue depth > 10 concurrent | 8-16h | coupette |
| SSE streaming | 4 | Synchronous pipeline latency unacceptable | 8-16h | coupette |
| Response pre-computation | 4 | Cache miss rate > 50% on popular queries | 4-8h | coupette |
| CDN | 4 | Global latency or bandwidth concerns | 1-2h | infra |
| HPA (k3s) | 4 | Manual scaling becomes a weekly chore | 4-8h | infra |
| VPS upgrade / multi-node | 4 | Available memory regularly < 500MB | varies | infra |
| LLM fallback chain | 4 | Claude error rate > 1% or p95 > 5s | 4-8h | coupette |
| Table partitioning | 4 | Query degradation despite indexes (10M+ rows) | 2-4h | coupette |

---

## Cost Projection Summary

| Tier | Users | Monthly Cost | Biggest Cost Driver |
|------|-------|-------------|-------------------|
| 1 | 20 | ~$10 | VPS |
| 2 | 200 | ~$25 | VPS upgrade |
| 3 | 2,000 | ~$50-100 | LLM API calls |
| 4 | 10,000+ | ~$150-400 | LLM API calls |

LLM costs dominate from Tier 3 onward. Caching and pre-computation are the primary cost controls. The infrastructure itself stays cheap on Hetzner.

---

## Benchmarks

Each tier should be validated with load tests before and after changes. Tooling, scripts, and roadmap live in [ENGINEERING.md](ENGINEERING.md#benchmarks).

### Per-tier test plan

| Tier | VUs | Scenarios | What you're measuring |
| ---- | --- | --------- | --------------------- |
| 1 (baseline) | 1-5 | Search, chat, watches | Latency baselines, where time goes |
| 1→2 break | 10-50 ramp | Mixed workload | Find the actual break point |
| 2 (after fixes) | 50 sustained | Same scenarios | Prove the fix worked |
| 2→3 break | 100-200 ramp | Heavy on chat | Find the next bottleneck |

### Considerations

- **LLM costs:** high-VU chat tests burn Claude credits. Use a mock LLM endpoint for infra stress testing, real LLM for latency profiling at low VU
- **Auth:** k6 scripts need valid JWTs — use a dedicated test user
- **Rate limiting:** if rate limits are in place (Tier 2+), either exempt the test user or measure the limiter behavior itself

---

## Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, scaling path summary table
- [ADR 0001: Modular Monolith](decisions/0001-modular-monolith.md) — why the architecture supports horizontal scaling
- [ADR 0005: RAG Pipeline](decisions/0005-rag-pipeline.md) — LLM and vector search performance characteristics
- [ENGINEERING.md](ENGINEERING.md#sre) — SRE backlog (SLOs, health endpoints)
- [Infra ROADMAP](https://github.com/vpatrin/infra/blob/main/docs/ROADMAP.md) — k3s migration, platform infrastructure
