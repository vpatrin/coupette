#!/usr/bin/env python3
# Validates a QA report against ops/CONTRACTS.md §4 and owns the verify skill's exit code:
# 0 every journey passed, 1 a journey failed (or lacks its bug id with --require-bugs),
# 2 the report breaks the contract.
import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

FEATURE = re.compile(r"^EXP-\d+$")
SHA = re.compile(r"^[0-9a-f]{7,40}$")
JOURNEY = re.compile(r"^J\d+$")


def problems(report: dict) -> list[str]:
    errs = []
    if not FEATURE.match(str(report.get("feature", ""))):
        errs.append("feature: expected EXP-NN")
    if not SHA.match(str(report.get("sha", ""))):
        errs.append("sha: expected a git sha")
    try:
        datetime.fromisoformat(str(report.get("started", "")).replace("Z", "+00:00"))
    except ValueError:
        errs.append("started: expected an ISO time")
    journeys = report.get("journeys")
    if not isinstance(journeys, list) or not journeys:
        return errs + ["journeys: expected a non-empty list"]
    for j in journeys:
        jid = j.get("id", "?")
        if not JOURNEY.match(str(jid)):
            errs.append(f"{jid}: id must look like J1")
        if not isinstance(j.get("title"), str) or not j["title"]:
            errs.append(f"{jid}: title missing")
        if j.get("status") not in ("pass", "fail"):
            errs.append(f"{jid}: status must be pass or fail")
        bug = j.get("bug")
        if bug is not None and not FEATURE.match(str(bug)):
            errs.append(f"{jid}: bug must be null or EXP-NN")
        if j.get("status") == "pass" and bug is not None:
            errs.append(f"{jid}: a passed journey has no bug")
        steps = j.get("steps")
        if not isinstance(steps, list) or not steps:
            errs.append(f"{jid}: steps must be a non-empty list")
            continue
        for n, s in enumerate(steps, 1):
            for key in ("do", "expect", "observed"):
                if not isinstance(s.get(key), str) or not s[key].strip():
                    errs.append(f"{jid} step {n}: {key} missing")
            shot = s.get("screenshot")
            if shot is not None and not Path(shot).expanduser().is_file():
                errs.append(f"{jid} step {n}: screenshot {shot} not found")
    summary = report.get("summary") or {}
    passed = sum(1 for j in journeys if j.get("status") == "pass")
    failed = sum(1 for j in journeys if j.get("status") == "fail")
    if summary.get("pass") != passed or summary.get("fail") != failed:
        errs.append(f"summary: expected pass={passed} fail={failed}")
    return errs


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    parser.add_argument("--require-bugs", action="store_true", help="every failed journey must name its bug ticket")
    args = parser.parse_args(argv)
    try:
        report = json.loads(args.report.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"report unreadable: {exc}", file=sys.stderr)
        return 2
    errs = problems(report) if isinstance(report, dict) else ["the report is not a JSON object"]
    if errs:
        print("report breaks ops/CONTRACTS.md §4:\n- " + "\n- ".join(errs), file=sys.stderr)
        return 2
    failed = [j["id"] for j in report["journeys"] if j["status"] == "fail"]
    print(f"{report['feature']}: {report['summary']['pass']} pass, {len(failed)} fail" + (f" ({', '.join(failed)})" if failed else ""))
    missing = [j["id"] for j in report["journeys"] if j["status"] == "fail" and j["bug"] is None]
    if args.require_bugs and missing:
        print(f"no bug ticket yet for: {', '.join(missing)}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
