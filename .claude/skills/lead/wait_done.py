#!/usr/bin/env python3
# Bounded wait for a worker's .crew/DONE, so the lead never sleeps past the Bash time cap.
# Exit 0 when the file exists, 1 when the wait ends without it.
import argparse
import sys
import time
from pathlib import Path


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("worktree", type=Path)
    parser.add_argument("--seconds", type=int, default=540, help="at most 570, under the 10-minute Bash cap")
    args = parser.parse_args(argv)
    done = args.worktree.expanduser() / ".crew" / "DONE"
    deadline = time.monotonic() + min(args.seconds, 570)
    while time.monotonic() < deadline:
        if done.exists():
            print(f"DONE: {done}")
            return 0
        time.sleep(15)
    print(f"still waiting: {done}")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
