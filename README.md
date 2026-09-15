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

## The call

Voice needs a Cloudflare Realtime app. Make an
[SFU app](https://dash.cloudflare.com/?to=/:account/realtime/sfu/create), and a
[TURN app](https://dash.cloudflare.com/?to=/:account/realtime/turn/create) if
you want a fallback for networks that will not carry the audio directly. Copy
`.dev.vars.example` to `.dev.vars` and fill it in for local work, and give a
deployment the same four with `wrangler secret put`. Everything else works
without them, and the call says it is not set up.
