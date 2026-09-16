#!/usr/bin/env bash
# Collect normalised static-check output into $1.
#
# Runs once on the head tree and once on the base tree, always from that tree's
# own root. Output is one sorted line per issue, so the diff engine can treat
# the two runs as comparable sets.
#
# NOTE: this script ends by restoring the tree with `git checkout -- .`. That is
# correct in CI, where the checkout is clean. Run it against a working tree with
# uncommitted edits and it discards them.

# Deliberately no `-e`: every check here exits non-zero when it finds issues,
# which is the normal case, not a script failure.
set -uo pipefail

OUT="${1:?usage: collect-static.sh <output-dir>}"
mkdir -p "$OUT"

# Byte-order sorting, so the two trees produce comparable lists even if the two
# runners ever differ in locale. `sort` under a UTF-8 locale ignores leading
# punctuation, which would order `.oxfmtrc.json` after `AGENTS.md`.
export LC_ALL=C

# Paths kept out of the lint and formatter deltas. Generated and built code
# produces noise nobody on the PR can act on.
#
# This repeats what `.oxlintrc.json` and `.oxfmtrc.json` already ignore. Each
# tree is measured with its own config until the base job checks the configs out
# from head, so duplicating the list means a PR that edits an ignore rule cannot
# move its own baseline.
#
# `worker-configuration.d.ts` is written by `wrangler types` on every install.
# `dist/`, `.wrangler/`, `*.tsbuildinfo` and `prototypes/` are untracked build
# and scratch output.
#
# `.github/ci/` is excluded for a different reason: the base job checks these
# scripts out from head, so BOTH trees lint head's copy of them and any issue
# here would cancel out to "no change". Better to leave them out of the delta
# than to report a number that cannot move. `pnpm check` still covers them
# locally, which is where an issue in these files does show up.
EXCLUDE='^(dist/|\.wrangler/|prototypes/|\.github/ci/|worker-configuration\.d\.ts$|.*\.tsbuildinfo$)'

# `tsconfig.worker.json` includes `worker-configuration.d.ts`, which the
# `postinstall` script generates. The typecheck must work on a tree that does
# not build, so regenerate it here rather than depending on the build step. The
# install normally did this already; this is the cheap guard for when it did not.
[ -f worker-configuration.d.ts ] || pnpm exec wrangler types >/dev/null 2>&1

# Read-only checks run concurrently. The typechecker is the long pole and the
# linter finishes underneath it, so this is close to free.
(
	# `tsc --build` over four project references. Keep the grep: it drops the
	# `$ tsc --build` banner and pnpm's `[ELIFECYCLE]` line, which carry the exit
	# code and would diff as noise.
	#
	# `sort -u`, not plain `sort`: `src/shared` is included by both
	# `tsconfig.client.json` and `tsconfig.worker.json`, so every error in shared
	# code is printed once per project. Identical file, line, column and message
	# is one error, and counting it twice would double every shared-code delta.
	pnpm typecheck 2>&1 | grep ': error TS' | sort -u >"$OUT/typecheck.txt"
	status=${PIPESTATUS[0]}

	# A typechecker that failed but printed nothing the grep recognises would
	# leave an empty file, which reads as zero errors and merges clean. `tsc
	# --build` can fail on a malformed tsconfig or an unresolvable project
	# reference, neither of which prints `: error TS`. Record the failure instead.
	if [ "$status" -ne 0 ] && [ ! -s "$OUT/typecheck.txt" ]; then
		echo "typecheck:0:0: error TS0000: the typechecker exited $status without recognisable error lines — see the job log" \
			>"$OUT/typecheck.txt"
	fi
) &
(
	# oxlint is the only linter here. `-f unix` gives `file:line:col: message`,
	# which is what the diff engine's `unix` parser reads.
	pnpm exec oxlint . -f unix >"$OUT/.oxlint.raw" 2>&1
	grep -E '^[^:[:space:]][^:]*:[0-9]+:[0-9]+:' "$OUT/.oxlint.raw" |
		grep -Ev "$EXCLUDE" |
		sort -u >"$OUT/lint.txt"
) &
wait

# The formatter REWRITES files, so it runs after the read-only checks. The set
# of files it modified is exactly the formatting debt — no separate --check
# pass needed. Restore the tree afterwards so later steps see a clean checkout.
#
# `git diff --name-only` gives repo-root-relative paths with no `./` prefix,
# which is the same shape the workflow's `touched.txt` step produces. The
# formatter gate intersects the two lists, and a shape mismatch would make that
# intersection empty on every PR.
pnpm exec oxfmt . >/dev/null 2>&1
git diff --name-only | grep -Ev "$EXCLUDE" | sort >"$OUT/format.txt"
git checkout -- .

# Never let a missing file break the render step.
#
# `touched.txt` is deliberately NOT in this list. The workflow writes it into
# the same directory on the head tree only, and the formatter gate reads its
# ABSENCE as "the step that lists this PR's files did not run" — an empty file
# here would turn that failure into a silent pass.
for f in typecheck lint format; do
	[ -f "$OUT/$f.txt" ] || : >"$OUT/$f.txt"
done

rm -f "$OUT/.oxlint.raw"
wc -l "$OUT"/*.txt
