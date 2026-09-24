#!/usr/bin/env bash
# Collect normalised static-check output into $1, one sorted line per issue, so
# the diff engine can treat a head run and a base run as comparable sets.

# Deliberately no `-e`: every check here exits non-zero when it finds issues,
# which is the normal case, not a script failure.
set -uo pipefail

OUT="${1:?usage: collect-static.sh <output-dir>}"
mkdir -p "$OUT"

# Byte-order sorting, so the two trees produce comparable lists even if the two
# runners ever differ in locale. `sort` under a UTF-8 locale ignores leading
# punctuation, which would order `.oxfmtrc.json` after `AGENTS.md`.
export LC_ALL=C

# `tsconfig.worker.json` includes `worker-configuration.d.ts`, which the
# `postinstall` script generates. The typecheck must work on a tree that does
# not build, so regenerate it here rather than depending on the build step.
[ -f worker-configuration.d.ts ] || pnpm exec wrangler types >/dev/null 2>&1

# Read-only checks run concurrently. The typechecker is the long pole and the
# linter finishes underneath it, so this is close to free.
(
	# The TOOL, not the `typecheck` package script. The base tree is the base
	# branch, and on the pull request that first adds or renames a script, the
	# base tree does not have it. Every command here is `pnpm exec <tool>` for
	# that reason; the scripts stay in package.json for humans.
	#
	# Keep the grep: it drops anything that is not a diagnostic, which would
	# otherwise diff as noise.
	#
	# `sort -u`, not plain `sort`: `src/shared` is included by both
	# `tsconfig.client.json` and `tsconfig.worker.json`, so every error in shared
	# code is printed once per project. Identical file, line, column and message
	# is one error, and counting it twice would double every shared-code delta.
	pnpm exec tsc --build 2>&1 | grep ': error TS' | sort -u >"$OUT/typecheck.txt"
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
	# `-f unix` gives `file:line:col: message`, which is what the diff engine's
	# `unix` parser reads.
	pnpm exec oxlint . -f unix 2>&1 |
		grep -E '^[^:[:space:]][^:]*:[0-9]+:[0-9]+:' |
		sort -u >"$OUT/lint.txt"
) &
wait

# `--list-different`, not `oxfmt .`: the write mode would reformat the tree and
# need `git checkout -- .` to put it back, which silently discards a developer's
# uncommitted edits when this script is run locally.
#
# Its paths are repo-root-relative with no `./` prefix, the same shape the
# workflow's `touched.txt` step produces. The formatter gate intersects the two
# lists, and a shape mismatch would make that intersection empty on every PR.
pnpm exec oxfmt --list-different . 2>/dev/null | sort >"$OUT/format.txt"

wc -l "$OUT"/*.txt
