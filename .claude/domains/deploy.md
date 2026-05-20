# Deploy & Infrastructure

> Business context for anything that touches the VPS, infra repo, or deploy pipeline. Read before editing `docker-compose.yml`, Caddy config, or deploy scripts.

## Infrastructure Context

- VPS: Hetzner CX22 (4GB RAM, 40GB SSD, Debian 13)
- Swap: 2GB configured at /swapfile, swappiness=10
- LlamaFile is NOT viable on this VPS — 4GB RAM insufficient, using Claude API instead
- Existing services sharing the VPS: Uptime Kuma, Umami, URL shortener — do not touch these

## Infra repo boundary

Two repos are coupled through shared infrastructure on the VPS. Source: [`empire/infra`](https://github.com/vpatrin/infra).

|   | coupette/ | infra/ |
| --- | --------- | ------ |
| **Owns** | App containers, docker-compose.yml, app config, CI, Alembic migrations, deploy process | Caddy config, DNS, shared-postgres container, `internal` Docker network, VPS-level services, backups |
| **Deploys** | Build images → push to GHCR → restart app containers | `git pull` + `docker compose up -d` (or `make reload` for Caddy-only) |

**Shared Docker network:** `internal` (external, defined in infra's compose). All containers communicate by name on this network.

**Caddy routing** (infra's `services/caddy/Caddyfile`):

- `coupette.club/api/*` → `coupette-backend:8001`
- `coupette.club/*` → static SPA from `/srv/coupette`

**Cross-repo changes requiring coordination:**

- New app route or subdomain → Caddyfile PR in infra
- Container name or port change → update both compose files + Caddyfile
- New systemd timer → infra owns the timer inventory (SERVICE_CATALOG.md)
- Pre-deploy backups call infra's `services/postgres/backups/backup.sh`

**Infra documentation:** `empire/infra/docs/` — SERVICE_CATALOG.md (port mappings, network contract), INFRASTRUCTURE.md (VPS setup, security, backups), SECURITY.md, decisions/ (ADRs).
