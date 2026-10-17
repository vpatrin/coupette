"""Write the backend's OpenAPI schema to a JSON file. Input for `make types`.

Usage:
    make types                                              # regenerate frontend types
    cd backend && poetry run python ../scripts/dump_openapi.py out.json
"""

import json
import os
import sys

#! Forced, not setdefault: `make types` exports the root .env, CI has none. The schema must
#! not depend on who generates it — production is the API the frontend talks to.
os.environ.update(
    ENVIRONMENT="production",
    DB_USER="openapi",
    DB_PASSWORD="openapi",
    DB_HOST="localhost",
    DB_PORT="5432",
    DB_NAME="openapi",
)

from backend.app import app  # noqa: E402 — settings read env vars at import time


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Usage: dump_openapi.py <output.json>")
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        json.dump(app.openapi(), f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
