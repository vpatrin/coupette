# Scaling Plan

Expands the [scaling path table](ARCHITECTURE.md#scaling-path) into actionable tiers. Each tier defines the bottleneck, concrete actions, cost impact, dependencies, and signals that you've outgrown it.

Design principle: **add infrastructure when a bottleneck is measured, not when it's imagined.**

---

## Current Baseline

| Component | Configuration | Notes |
|-----------|--------------|-------|
| VPS | Hetzner CX22 — 4GB RAM, 40GB SSD, 2GB swap | Shared with Uptime Kuma + Umami |
| Database | Shared Postgres 16 + pgvector | SQLAlchemy async, pool defaults (size=5, overflow=10) |
| Backend | Single uvicorn async worker, 512MB mem limit | Stateless, horizontally scalable by design |
| Bot | 256MB mem limit, long polling, 6h notification interval | Polls backend for stock alerts |
| Scraper | 512MB mem limit, weekly one-shot job | 2s rate limit between SAQ requests |
| Vector store | 14k × 1536d ≈ 86MB, exact scan (no index) | OpenAI `text-embedding-3-large` |
| LLM | Claude Haiku (intent + curation), ~$0.60/mo @ 20 users | OpenAI embeddings ~$2/mo |
| Monthly infra cost | ~€7 (CX22 VPS share) | Excludes domain, LLM API |

---

## Tier 1: 20 Users (Current)

**Bottleneck:** None — everything works.

**What to monitor** (observability stack is in place):
- API p95 latency (baseline: sub-500ms for search, 2-3s for recommendations)
- DB connection count (should stay well under pool_size=5 per service)
- VPS memory usage (target: stay under 3GB to avoid swap thrashing)
- Claude API monthly spend

**Cost:** ~$10/mo total (VPS share + LLM APIs)

**Signals you've outgrown Tier 1:**
- API p95 consistently > 500ms on search/filter endpoints
- DB connection pool saturation warnings in logs
- VPS memory usage regularly > 3GB

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

#### 5. Multiple backend workers
Either multiple uvicorn workers (`--workers 4`) or multiple container replicas behind Caddy. Container replicas are cleaner — each gets its own memory limit and crash isolation. k3s makes this trivial later (replica sets), but Docker Compose can do it with `deploy.replicas` in the meantime.

**Effort:** 1-2h. **Owner:** coupette repo (compose) + infra repo (Caddy upstream).

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

#### 3. Embedding cache
Cache OpenAI embedding API calls for repeated query strings. Same query text → same embedding. Redis with 24h TTL.

Saves ~$0.0001 per cached call — not about cost, about latency (avoids 200-500ms round trip to OpenAI).

**Effort:** 1-2h. **Owner:** coupette repo.

#### 4. Read replica
Postgres streaming replication — route read-only queries (search, facets, product detail, chat history reads) to replica. Write queries (watches, chat messages, recommendation logs) stay on primary.

Implementation: second `engine` in `core/db/base.py` with a `read_only` session factory. Repository methods declare whether they're read or write.

**Effort:** 4-8h (replica setup in infra + read/write routing in coupette). **Owner:** both repos.

#### 5. Bot webhook migration
Replace long polling with Telegram webhooks. Eliminates periodic backend polling — Telegram pushes updates directly. Requires a public HTTPS endpoint (Caddy already provides this).

Notification delivery also shifts: instead of the bot polling for stock events every 6h, the backend pushes notifications via a task queue or direct bot API call when events are detected.

**Effort:** 4-8h. **Owner:** coupette repo (bot) + infra repo (Caddy route for webhook).

#### 6. CDN for frontend
If frontend bundle or any static assets become a bottleneck. Cloudflare free tier in front of `coupette.club` — caches static assets at the edge, reduces VPS bandwidth.

**Effort:** 1-2h. **Owner:** infra repo (DNS + Caddy config).

### Cost at Tier 3

| Item | Monthly | Notes |
|------|---------|-------|
| VPS | €15-30 | CX32 or CX42 for replica + Redis headroom |
| Redis | €0 | Self-hosted container on same VPS |
| LLM (Claude) | ~$30-60 | 2k users, partially offset by response caching |
| LLM (OpenAI) | ~$2-5 | Embedding cache reduces repeat calls |
| CDN | €0 | Cloudflare free tier |
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
Already spec'd as Phase 9 item (#427). Stream LLM responses token-by-token instead of waiting for the full response. Reduces perceived latency from 2-3s to first-token-in-200ms.

At this tier it's no longer optional — users won't wait 3-5s for recommendations at scale.

**Effort:** 8-16h (backend SSE endpoint + frontend streaming renderer). **Owner:** coupette repo.

#### 3. Response pre-computation
Batch-generate recommendations for popular query patterns during off-peak hours. "Red wines under $20", "wines for BBQ", "Bordeaux recommendations" — cache warm responses so peak-time requests are instant.

Run as a scheduled job (like the scraper). Populate the LLM response cache proactively.

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

#### 7. Database sharding considerations
Products table doesn't grow fast (~14k, bounded by SAQ catalog). But user-generated data (chat_messages, recommendation_logs, tasting_notes at Phase 11) grows linearly with users.

At 10k users with active chat: estimate ~1M chat messages/year. Postgres handles this fine with proper indexing and partitioning (range partition on `created_at`). True sharding is unlikely to be needed.

**Effort:** 2-4h for time-based partitioning. **Owner:** coupette repo.

### Cost at Tier 4

| Item | Monthly | Notes |
|------|---------|-------|
| VPS/Infra | €30-90 | Multi-node k3s or larger VPS |
| LLM (Claude) | $100-300 | 10k users, offset by aggressive caching + pre-computation |
| LLM (OpenAI) | $5-10 | Embeddings stable, query embedding cache handles repeats |
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

**What changes:**
- `docker-compose.prod.yml` → Kubernetes manifests (Deployments, Services, ConfigMaps)
- Caddy routing → Ingress controller (Caddy adapter exists, or switch to Traefik which k3s bundles)
- Container `mem_limit` → resource requests/limits in pod specs
- Manual restarts → liveness/readiness probes with auto-restart
- Systemd timers → CronJobs

---

## Decision Points Summary

| Action | Trigger Metric | Effort | Owner |
|--------|---------------|--------|-------|
| Tune connection pool | Pool saturation warnings | 1h | coupette |
| PgBouncer | > 30 total connections | 2-4h | infra |
| Add DB indexes | Slow query log shows > 100ms queries | 2-4h | coupette |
| pgvector HNSW index | Vector count > 30k or similarity p95 > 200ms | 1h | coupette |
| Backend replicas | Single worker CPU > 70% sustained | 2-4h | both |
| Redis cache | Repeated query ratio > 50% | 4-8h | both |
| LLM response cache | Claude spend > $20/mo | 2-4h | coupette |
| Read replica | Write contention or read p95 > 500ms | 4-8h | both |
| Bot webhooks | Polling load visible in backend metrics | 4-8h | both |
| CDN | Bandwidth > 100GB/mo or TTFB > 500ms | 1-2h | infra |
| Async task queue | Recommendation queue depth > 10 concurrent | 8-16h | coupette |
| SSE streaming | Perceived latency complaints at scale | 8-16h | coupette |
| Response pre-computation | Cache miss rate > 50% on popular queries | 4-8h | coupette |
| HPA (k3s) | Manual scaling becomes a weekly chore | 4-8h | infra |
| VPS upgrade / multi-node | Memory > 80% on largest available VPS | varies | infra |
| LLM fallback chain | Claude error rate > 1% or p95 > 5s | 4-8h | coupette |
| Table partitioning | chat_messages > 1M rows | 2-4h | coupette |

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

## Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, scaling path summary table
- [ADR 0001: Modular Monolith](decisions/0001-modular-monolith.md) — why the architecture supports horizontal scaling
- [ADR 0005: RAG Pipeline](decisions/0005-rag-pipeline.md) — LLM and vector search performance characteristics
- [ENGINEERING.md](ENGINEERING.md#sre) — SRE backlog (SLOs, health endpoints)
- [Infra ROADMAP](https://github.com/vpatrin/infra/blob/main/docs/ROADMAP.md) — k3s migration, platform infrastructure
