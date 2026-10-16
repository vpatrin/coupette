#!/usr/bin/env bash
# /feature Stop hook: lint + test (+ frontend build) for the services this branch touches.
# Exit 2 blocks the stop and feeds the failure tail back to Claude. Results are cached by
# diff hash: an unchanged green diff passes instantly, and an unchanged red diff is let
# through with a warning instead of looping.
set -o pipefail

cat >/dev/null  # hook input is not needed
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
base=$(git merge-base origin/main HEAD 2>/dev/null) || exit 0
state="$(git rev-parse --git-dir)/feature-stop-check"

changed=$({ git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u)
touches() { grep -q "^$1/" <<<"$changed"; }

targets=()
touches backend && targets+=(lint-backend test-backend)
touches bot && targets+=(lint-bot test-bot)
touches scraper && targets+=(lint-scraper test-scraper)
# core/ is installed into every Python service
touches core && targets+=(lint-core test-backend test-bot test-scraper)
touches frontend && targets+=(lint-frontend test-frontend build-frontend)
[ ${#targets[@]} -eq 0 ] && exit 0

hash=$({
  git diff "$base"
  git ls-files --others --exclude-standard -z | xargs -0 cat 2>/dev/null
} | shasum | cut -d' ' -f1)
last=$(cat "$state" 2>/dev/null || true)
[ "$last" = "green $hash" ] && exit 0
if [ "$last" = "red $hash" ]; then
  echo '{"systemMessage": "feature stop-check: lint/tests still failing on an unchanged diff. Stopping anyway; treat the feature as BLOCKED."}'
  exit 0
fi

log=$(mktemp)
for t in $(printf '%s\n' "${targets[@]}" | awk '!seen[$0]++'); do
  if [ "$t" = build-frontend ]; then
    (cd frontend && yarn -s build) >"$log" 2>&1
  else
    make -s "$t" >"$log" 2>&1
  fi
  if [ $? -ne 0 ]; then
    echo "red $hash" >"$state"
    {
      echo "feature stop-check: \`$t\` failed. Fix it before stopping (last 40 lines):"
      tail -n 40 "$log"
    } >&2
    rm -f "$log"
    exit 2
  fi
done
rm -f "$log"
echo "green $hash" >"$state"
exit 0
