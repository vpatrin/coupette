.PHONY: help install \
	dev dev-backend dev-frontend dev-bot seed types types-check \
	scrape-stores scrape-products scrape-enrich scrape-availability scrape-all embed-sync \
	eval load \
	migrate create-admin revision \
	lint lint-backend lint-scraper lint-core lint-bot lint-frontend \
	format format-backend format-scraper format-core format-bot format-frontend \
	test test-backend test-scraper test-bot test-frontend \
	coverage coverage-backend coverage-scraper coverage-bot coverage-frontend \
	audit audit-core audit-backend audit-scraper audit-bot audit-frontend \
	build build-backend build-scraper build-bot build-frontend \
	scan scan-backend scan-scraper scan-bot \
	start-db stop-db \
	clean

# Load root .env and export to all child processes (bare-metal dev).
# -include: don't fail if .env is missing (CI, fresh clone).
# export: make vars available to commands (poetry run, scripts/create_admin.py, etc.).
-include .env
export

# --- Help ---

help:
	@echo "Setup:     install"
	@echo "Dev:       dev  dev-backend  dev-frontend  dev-bot  seed  types  types-check"
	@echo "Scraper:   scrape-stores  scrape-products  scrape-enrich  scrape-availability  scrape-all  embed-sync"
	@echo "Benchmarks: eval  load  load SKIP_CHAT=1  load VUS=5"
	@echo "Database:  migrate  create-admin  revision"
	@echo "Lint:      lint  lint-{backend,scraper,core,bot,frontend}"
	@echo "Format:    format  format-{backend,scraper,core,bot,frontend}"
	@echo "Test:      test  test-{backend,scraper,bot,frontend}"
	@echo "Coverage:  coverage  coverage-{backend,scraper,bot,frontend}"
	@echo "Audit:     audit  audit-{core,backend,scraper,bot,frontend}"
	@echo "Build:     build  build-{backend,scraper,bot,frontend}"
	@echo "Scan:      scan  scan-{backend,scraper,bot}"
	@echo "Docker:    start-db  stop-db"
	@echo "Cleanup:   clean"

# --- Setup ---

install:
	git config core.hooksPath .githooks
	cd backend && poetry lock && poetry install
	cd scraper && poetry lock && poetry install
	cd core && poetry lock && poetry install
	cd bot && poetry lock && poetry install
	cd frontend && yarn install

# --- Dev servers ---

# One command from a fresh workspace to a running app with data.
# Sub-makes, not prerequisites, so the order holds even under `make -j`.
#! By default `migrate` runs on the database every workspace shares: a branch with a new
#! migration migrates all of them. A workspace can opt into its own DB (VPA-52 slice 5).
dev:
	$(MAKE) start-db
	$(MAKE) migrate
	$(MAKE) seed
	./.superset/run.sh

dev-backend:
	cd backend && poetry run uvicorn backend.app:app --reload --port 8001

dev-frontend:
	cd frontend && yarn dev

dev-bot:
	cd bot && poetry run python -m bot

# Frontend API types from the backend's OpenAPI schema. Commit the result; CI runs types-check.
API_TYPES := src/lib/api.gen.ts
types:
	cd backend && poetry run python ../scripts/dump_openapi.py ../frontend/openapi.json
	cd frontend && yarn -s openapi-typescript openapi.json -o $(API_TYPES) --root-types --root-types-no-schema-prefix; \
		status=$$?; rm -f openapi.json; exit $$status

types-check: types
	@git diff --exit-code -- frontend/$(API_TYPES) \
		|| (echo "❌ frontend/$(API_TYPES) is stale. Run make types and commit the result." && exit 1)

# --- Scraper tasks ---

scrape-stores:
	cd scraper && poetry run python -m scraper stores

scrape-products:
	cd scraper && poetry run python -m scraper

scrape-enrich:
	cd scraper && poetry run python -m scraper enrich

scrape-availability:
	cd scraper && poetry run python -m scraper availability

scrape-all: scrape-stores scrape-products scrape-enrich scrape-availability

embed-sync:
	cd scraper && poetry run python -m scraper embed

# Synthetic dev catalog (no live scraping). No-op when the products table already has rows.
seed:
	cd scraper && poetry run python -m scraper seed

# --- Eval ---
# HAIKU_TEMPERATURE=0 forces deterministic intent/curation for reproducible scores.

eval:
	cd backend && HAIKU_TEMPERATURE=0 poetry run python -m backend.benchmarks.eval $(if $(QUERY),--query "$(QUERY)",) $(if $(SPLIT),--split $(SPLIT),) $(if $(JUDGE_RUNS),--judge-runs $(JUDGE_RUNS),) $(if $(JUDGE_TEMP),--judge-temp $(JUDGE_TEMP),) $(if $(PIPELINE_RUNS),--pipeline-runs $(PIPELINE_RUNS),)

load:
	./backend/benchmarks/load/runners/tier1-baseline.sh $(if $(SKIP_CHAT),--skip-chat,) $(if $(VUS),--virtual-users $(VUS),)

# --- Database ---

migrate:
	cd core && poetry run alembic upgrade head
	$(MAKE) create-admin

# Backend startup refuses to boot without an active admin (ADMIN_EMAIL).
create-admin:
	cd core && poetry run python ../scripts/create_admin.py

# Generate migration against a clean, ephemeral Postgres (no dev DB drift).
# Spins up a temporary container, runs all existing migrations, autogenerates,
# then tears down. The result only contains real model changes.
# DATABASE_URL is blanked: core settings prefer it over DB_*, and .env is exported.
REVISION_CONTAINER := coupette-revision-tmp
REVISION_PORT := 5433
revision:
	@test -n "$(msg)" || (echo "Usage: make revision msg=\"description\"" && exit 1)
	@docker rm -f $(REVISION_CONTAINER) 2>/dev/null || true
	@echo "▶ Starting ephemeral Postgres on port $(REVISION_PORT)..."
	@docker run -d --name $(REVISION_CONTAINER) \
		-e POSTGRES_USER=migration \
		-e POSTGRES_PASSWORD=migration \
		-e POSTGRES_DB=migration \
		-p 127.0.0.1:$(REVISION_PORT):5432 \
		pgvector/pgvector:pg16 >/dev/null
	@echo "▶ Waiting for Postgres to be ready..."
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		docker exec $(REVISION_CONTAINER) pg_isready -U migration >/dev/null 2>&1 && break; \
		if [ $$i -eq 10 ]; then echo "❌ Postgres failed to start"; docker rm -f $(REVISION_CONTAINER) >/dev/null; exit 1; fi; \
		sleep 1; \
	done
	@echo "▶ Installing extensions..."
	@docker exec $(REVISION_CONTAINER) psql -U migration -d migration \
		-c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null \
		|| (docker rm -f $(REVISION_CONTAINER) >/dev/null; exit 1)
	@echo "▶ Running existing migrations..."
	cd core && DATABASE_URL= DB_HOST=localhost DB_PORT=$(REVISION_PORT) DB_USER=migration \
		DB_PASSWORD=migration DB_NAME=migration \
		poetry run alembic upgrade head || (docker rm -f $(REVISION_CONTAINER) >/dev/null; exit 1)
	@echo "▶ Autogenerating migration..."
	cd core && DATABASE_URL= DB_HOST=localhost DB_PORT=$(REVISION_PORT) DB_USER=migration \
		DB_PASSWORD=migration DB_NAME=migration \
		poetry run alembic revision --autogenerate -m "$(msg)" || (docker rm -f $(REVISION_CONTAINER) >/dev/null; exit 1)
	@echo "▶ Tearing down ephemeral Postgres..."
	@docker rm -f $(REVISION_CONTAINER) >/dev/null
	make format
	@echo "✅ Migration generated cleanly."

# --- Lint ---

lint-backend:
	@echo "\n▶ Linting backend/"
	cd backend && poetry run ruff check . && poetry run ruff format --check .

lint-scraper:
	@echo "\n▶ Linting scraper/"
	cd scraper && poetry run ruff check . && poetry run ruff format --check .

lint-core:
	@echo "\n▶ Linting core/"
	cd core && poetry run ruff check . && poetry run ruff format --check .

lint-bot:
	@echo "\n▶ Linting bot/"
	cd bot && poetry run ruff check . && poetry run ruff format --check .

lint-frontend:
	@echo "\n▶ Linting frontend/"
	cd frontend && yarn lint && yarn typecheck && yarn format:check

lint: lint-backend lint-scraper lint-core lint-bot lint-frontend

# --- Format ---

format-backend:
	@echo "\n▶ Formatting backend/"
	cd backend && poetry run ruff format . && poetry run ruff check --fix .

format-scraper:
	@echo "\n▶ Formatting scraper/"
	cd scraper && poetry run ruff format . && poetry run ruff check --fix .

format-core:
	@echo "\n▶ Formatting core/"
	cd core && poetry run ruff format . && poetry run ruff check --fix .

format-bot:
	@echo "\n▶ Formatting bot/"
	cd bot && poetry run ruff format . && poetry run ruff check --fix .

format-frontend:
	@echo "\n▶ Formatting frontend/"
	cd frontend && yarn format

format: format-backend format-scraper format-core format-bot format-frontend

# --- Test ---

test-backend:
	@echo "\n▶ Testing backend/"
	cd backend && poetry run pytest -v

test-scraper:
	@echo "\n▶ Testing scraper/"
	cd scraper && poetry run pytest -v

test-bot:
	@echo "\n▶ Testing bot/"
	cd bot && poetry run pytest -v

test-frontend:
	@echo "\n▶ Testing frontend/"
	cd frontend && yarn test

test: test-backend test-scraper test-bot test-frontend

# --- Coverage ---

coverage-backend:
	@echo "\n▶ Coverage backend/"
	cd backend && poetry run pytest --cov --cov-branch --cov-report=xml --cov-report=term -v

coverage-scraper:
	@echo "\n▶ Coverage scraper/"
	cd scraper && poetry run pytest --cov --cov-branch --cov-report=xml --cov-report=term -v

coverage-bot:
	@echo "\n▶ Coverage bot/"
	cd bot && poetry run pytest --cov --cov-branch --cov-report=xml --cov-report=term -v

coverage-frontend:
	@echo "\n▶ Coverage frontend/"
	cd frontend && yarn test:coverage
	cp frontend/coverage/cobertura-coverage.xml frontend/coverage.xml

coverage: coverage-backend coverage-scraper coverage-bot coverage-frontend
	@echo "\n▶ Generating badges"
	python scripts/generate_badges.py

# --- Audit ---

PIP_AUDIT_IGNORE := $(shell grep -v '^\#' .pip-audit-ignore 2>/dev/null | sed '/^$$/d' | sed 's/^/--ignore-vuln /')
# yarn 1 audit has no ignore flag — IDs from frontend/.yarn-audit-ignore go to a jq filter as a JSON array
YARN_AUDIT_IGNORE := [$(shell grep -v '^\#' frontend/.yarn-audit-ignore 2>/dev/null | sed '/^$$/d' | paste -sd, -)]

audit-core:
	@echo "\n▶ Auditing core/"
	cd core && poetry run pip-audit $(PIP_AUDIT_IGNORE)

audit-backend:
	@echo "\n▶ Auditing backend/"
	cd backend && poetry run pip-audit $(PIP_AUDIT_IGNORE)

audit-scraper:
	@echo "\n▶ Auditing scraper/"
	cd scraper && poetry run pip-audit $(PIP_AUDIT_IGNORE)

audit-bot:
	@echo "\n▶ Auditing bot/"
	cd bot && poetry run pip-audit $(PIP_AUDIT_IGNORE)

audit-frontend:
	@echo "\n▶ Auditing frontend/"
	cd frontend && yarn audit --json | jq -rs --argjson ignore '$(YARN_AUDIT_IGNORE)' -f ../scripts/yarn_audit_filter.jq

audit: audit-core audit-backend audit-scraper audit-bot audit-frontend

# --- Build ---

build-backend:
	docker compose build backend

build-scraper:
	docker compose build scraper

build-bot:
	docker compose build bot

build-frontend:
	cd frontend && yarn build

build: build-backend build-scraper build-bot build-frontend

# --- Scan (Trivy CVE scan on built images) ---

TRIVY_FLAGS := --exit-code 1 --severity LOW,MEDIUM,HIGH,CRITICAL --ignore-unfixed --ignorefile .trivyignore

scan-backend: build-backend
	@echo "\n▶ Scanning coupette-backend"
	trivy image $(TRIVY_FLAGS) coupette-backend

scan-scraper: build-scraper
	@echo "\n▶ Scanning coupette-scraper"
	trivy image $(TRIVY_FLAGS) coupette-scraper

scan-bot: build-bot
	@echo "\n▶ Scanning coupette-bot"
	trivy image $(TRIVY_FLAGS) coupette-bot

scan: scan-backend scan-scraper scan-bot

# --- Docker ---

#! Gated on .env: the dev overlay sets POSTGRES_USER/PASSWORD/DB from it, and without it
#! compose would recreate the shared postgres container with empty credentials.
start-db:
	@test -f .env || (echo "❌ No .env — copy it from the root checkout first (docs/DEVELOPMENT.md)." && exit 1)
	@docker network inspect internal >/dev/null 2>&1 || docker network create internal
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait postgres redis

stop-db:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down

# --- Cleanup ---

clean:
	@echo "\n▶ Cleaning caches"
	find . -type d -name __pycache__ -exec rm -rf {} +
	rm -rf .pytest_cache backend/.pytest_cache scraper/.pytest_cache bot/.pytest_cache
	rm -rf .ruff_cache backend/.ruff_cache scraper/.ruff_cache core/.ruff_cache bot/.ruff_cache
	rm -rf *.egg-info
