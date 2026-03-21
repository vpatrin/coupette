# Production

Deployment process and app-level production concerns for Coupette.
VPS-level infrastructure (firewall, SSH, TLS, networking) is documented in the [infra repo](https://github.com/vpatrin/infra/blob/main/docs/INFRASTRUCTURE.md).

- **Deployed**: v1.5.0
- **Services**: backend, frontend, bot, scraper (systemd timer), shared-postgres

---

## Deploying

Two deploy paths via [cd.yml](../.github/workflows/cd.yml):

### Feature release (tag push)

For user-facing changes. Tag on main, push the tag.

```bash
git tag -a v1.6.0 -m "v1.6.0"
git push origin main --tags
```

**Flow:** tag push → build + scan + push to GHCR → GitHub Release (from CHANGELOG) → deploy to VPS

Tags are semver, reflect user-facing releases only. Internal changes (CI, observability, infra) don't get tags.

### Infra deploy (workflow dispatch)

For CI/CD, observability, deploy script, or config changes that don't affect users.

```bash
gh workflow run CD -f commit=<SHA>
```

**Flow:** dispatch → build from commit + push to GHCR (tagged `sha-<SHA>`) → deploy to VPS (no GitHub Release)

### What the deploy does

`deploy_backend.sh`: decrypt secrets → pull GHCR images → sync systemd units → migrate → bootstrap admin → restart → health check

Frontend: `yarn build` with version as `VITE_APP_VERSION`, SCP to `/srv/coupette`

### Verify

```bash
curl -s localhost:8001/health     # backend responds
# message the bot on Telegram    # bot responds
systemctl status coupette-scraper.timer   # timer active, next run scheduled
systemctl status coupette-availability.timer   # timer active, next run scheduled
```

### Rollback

```bash
# Tag release — redeploy previous tag (images already in GHCR)
cd /opt/coupette && git checkout vPREVIOUS && IMAGE_TAG=vPREVIOUS SOPS_AGE_KEY=... ./deploy/deploy_backend.sh

# Dispatch deploy — redeploy previous commit
gh workflow run CD -f commit=<previous-SHA>
```

Migrations are forward-only — never run `downgrade()` in production. Write a new migration to fix mistakes. See [OPERATIONS.md](OPERATIONS.md#forward-only-in-production).

---

## Security, backups, and observability

See [infra INFRASTRUCTURE.md](https://github.com/vpatrin/infra/blob/main/docs/INFRASTRUCTURE.md) — these are managed at the VPS level, not per-project.
