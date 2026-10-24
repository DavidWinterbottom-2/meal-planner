#!/usr/bin/env bash
# Prints code=true|false for the files changed between two commits (default:
# HEAD^1..HEAD — on a pull_request checkout HEAD is the merge commit and HEAD^1
# the base tip, so that is exactly the PR's diff). code=false means every
# changed file is documentation, which ships in neither the image nor the tests,
# so CI can skip test/e2e and version-bumped can skip the bump.
# Keep the docs list in step with "Versioning & CI" in CLAUDE.md.
set -euo pipefail

base="${1:-HEAD^1}"
head="${2:-HEAD}"

code=false
while IFS= read -r path; do
  [ -z "$path" ] && continue
  case "$path" in
    .github/*) code=true ;;              # workflow changes must exercise CI
    src/* | assets/*) code=true ;;       # Dockerfile COPYs src/ and assets/, so
                                         # even src/vendor/README.md ships
    test/* | tests/* | scripts/*) code=true ;; # read or run by tests and builds
    *.md | docs/* | openspec/* | .claude/* | LICENSE) ;;
    *) code=true ;;
  esac
  [ "$code" = true ] && break
done < <(git diff --name-only "$base" "$head")

echo "code=$code"
