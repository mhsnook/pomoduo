# CLAUDE.md

## What this is

pomoduo: a pomodoro timer for coworking with a friend. A Vite + React
single-page app and one Cloudflare Worker with a Durable Object per session,
synced through party-db.

## Where things are

- `tree/` is the theory: what is valuable, what is decided, what is open.
  Read `tree/readme.md` first. Settle questions there before building them.
- `docs/` describes only what the code does today. Update it when behaviour
  changes.
- `CONTEXT.md` is the glossary. Use its words in code, copy, and commits.
- `src/shared/` runs on both sides: the clock model and the wire schemas.
- `src/server/` is the Worker and the session room.
- `src/client/` is the app. `lib/` holds pure modules with co-located tests.

## Conventions

- Bog-standard, self-documenting, stock approaches. Ask before a non-stock
  choice.
- The clock changes only through `apply` in `src/shared/clock.ts`. Never set a
  clock row by hand, on either side.
- Members change the room only through its own endpoints, never party-db's
  write path.
- Unit tests cover pure modules: `*.test.ts` next to the module.

## Gate

`pnpm check` runs format, lint, types, and tests. The pre-commit hook in
`.githooks/` runs it; `pnpm install` turns the hook on.
