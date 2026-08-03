---
paths:
  - "docker-compose.yml"
  - "**/Dockerfile"
  - ".github/workflows/**"
  - "Makefile"
  - "scripts/**"
---

# Deploy & Infrastructure

> Read whenever editing `docker-compose.yml`, Dockerfiles, CI workflows, the Makefile, or deploy scripts.

## VPS context

- Hetzner CX22 (4GB RAM, 40GB SSD, Debian 13)
- Swap: 2GB at /swapfile, swappiness=10
- LlamaFile is NOT viable — 4GB RAM insufficient, using Claude API instead
- Existing services sharing the VPS: Uptime Kuma, Umami, URL shortener — do not touch

## Infra repo boundary

Two repos coupled through shared infra. Source: [`empire/infra`](https://github.com/vpatrin/infra).

|   | coupette/ | infra/ |
| --- | --------- | ------ |
| **Owns** | App containers, docker-compose.yml, app config, CI, Alembic migrations, deploy | Caddy config, DNS, shared-postgres, `internal` Docker network, VPS services, backups |
| **Deploys** | Build images → push to GHCR → restart app containers | `git pull` + `docker compose up -d` (or `make reload` for Caddy-only) |

**Shared Docker network:** `internal` (external, defined in infra). All containers communicate by name.

**Caddy routing** (infra's `services/caddy/Caddyfile`):
- `coupette.club/api/*` → `coupette-backend:8001`
- `coupette.club/*` → static SPA from `/srv/coupette`

## Cross-repo changes requiring coordination

- New app route or subdomain → Caddyfile PR in infra
- Container name or port change → update both compose files + Caddyfile
- New systemd timer → infra owns the timer inventory (SERVICE_CATALOG.md)
- Pre-deploy backups call infra's `services/postgres/backups/backup.sh`

## Hard rule (per CLAUDE.md)

Never run deploy commands, prod docker commands, or migrations without Victor's explicit instruction.
