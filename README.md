# pomoduo

A pomodoro timer for coworking with a friend. One shared clock, your own
ledger, and a dance break. Grown from [pomodance](https://emju.in/pomodance).

- What it does: [`docs/readme.md`](docs/readme.md)
- How it works: [`docs/architecture.md`](docs/architecture.md)
- Where it is going: [`tree/readme.md`](tree/readme.md)

## Run it

```sh
pnpm install
pnpm dev      # the app and the session rooms, on one origin
pnpm check    # format, lint, types, and unit tests; the pre-commit hook runs this
pnpm deploy   # build and deploy the Worker
```
