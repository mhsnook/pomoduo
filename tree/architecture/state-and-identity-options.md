# State and identity options: party-db and Cloudflare Access

Research note, 2026-09-10. Local sources only: `/Users/em/code/party-db` (README, `docs/architecture.md`, `docs/unspecified.md`, `docs/CHANGELOG.md`, `docs/collection-types.md`, cookbooks 03, 04, 06, 07, 09; `src/server/auth.ts` and `src/client/party-db.ts` for two API facts) and `/Users/em/code/faustinajohnson.com/docs/auth.md`.

## Questions this answers

1. How a party-db room maps onto a session; what a client needs; can one client hold a personal room and a session room.
2. How the auth hook takes a JWT; does a Cloudflare Access JWT fit unchanged; what WorkOS changes.
3. Which parts of the session state fit collections and which do not.
4. How cookbook 06 models friendship and whether it fits "have friends, invite one".
5. Hard limits and open problems that would bite this app.

## Findings

1. **Room = session.** A room is one Durable Object with its own SQLite and `_oplog`, one hibernating socket per client for reads, and `POST /write` for writes (`architecture.md` s1, s8, s9). A client needs `partyTransport({ host, room, token? })` plus `createPartyDb(transport, collections)`; a transport names exactly one `room` (README 89-107; `src/client/party-db.ts` 16-24). Two rooms is two transports and two sockets; nothing forbids it, but the docs do not show or test it. Rooms never see each other's writes; cross-room data is deferred to the Postgres WAL story (`architecture.md` Roadmap).

2. **Auth hook.** `authorize(req, { kind, party, room })` runs in the worker lobby before the DO wakes and gates both `connect` and `write` (`architecture.md` s10). The token rides in `?token=` on the upgrade and `Authorization: Bearer` on the POST; `getTokenFromRequest` reads both (`src/server/auth.ts` 86). The library verifies nothing. Cookbook 03 does `jose` `jwtVerify` against a remote JWKS and compares `payload.org_id` to `room`. An Access JWT fits with no library change: JWKS at `<team>.cloudflareaccess.com/cdn-cgi/access/certs`, check `aud` against the AUD tag, identity from `email`. That is the same verification `auth.md` describes, moved from Astro build config to worker runtime config. One wrinkle: Access delivers the JWT as the `CF_Authorization` cookie, and `getTokenFromRequest` reads only header and query, so the client must obtain a token string or the worker must read the cookie. WorkOS later changes only the JWKS URL and claim names (cookbook 03: "the same three lines with a different `jwtVerify`").

3. **Fit by item.** Fits: member roster, intention text, per-pomo votes (weight as a column), chat rows, and the personal ledger. All are plain CRUD with client UUIDs, optimistic apply, `seq` ack, delta reconnect (`architecture.md` s6-s8). Timer: the DO can own it and write phase changes via `this.commit()` (cookbook 09, s14), but the room hibernates (`party-db-server.ts` 33) and the docs say nothing about alarms, so ticking is your own code. Presence and mic: no presence primitive; every row is durable, logged, and broadcast to every socket (`unspecified.md`, Subscription/filtering). Delayed chat: fan-out happens on commit (s9) and per-socket read filtering (cookbooks 05, 06) is proposed, not shipped, so delay means holding messages in the DO and committing them at pomo end; client-side hiding is not a guarantee. Not yet done per the docs: subscription filtering, read slicing, per-user reads on SQLite, conflict resolution, offline queues (`unspecified.md`).

4. **Cookbook 06** stores a `friendships(user_id, friend_id)` table read by `friendsOf(uid)` in the DO and says the graph "populates some other way". It models post visibility, not invites or membership, and relies on `loadViewer`, `refreshViewer`, and expression `access.read`, all marked "Proposed, not shipped". The shipped tool for "only these two may enter" is room-level `authorize` comparing the JWT identity to a member list (cookbook 03 shape); the docs call it coarse.

5. **Limits.** Oplog retention 10,000 rows, then reconnect is a re-snapshot with `reset: true` (s8); heartbeat presence rows would burn that fast. `maxWriteBytes` 1 MiB, `maxWriteOps` 1,000. No rate limiting (put it in `authorize`). A 1008 close is terminal and needs `onAuthError` (README). D1 and Postgres are one room per database, so no cross-session ledger view for free (Roadmap v1 trade-offs). Changelog has one entry (v0.0.2, 2026-08-26); README says "incubating", so API churn is likely.

## Trade-offs

- party-db for the session: free optimistic sync, ordering, deltas, typed schemas; cost is writing timer, presence, and hold-until-end yourself, on an incubating API.
- Hand-rolled PartyServer socket messages: presence, timer, and delay are trivial broadcasts with no oplog growth; no durable log or optimistic apply.
- Cloudflare Access: no login UI, fits `authorize` today; everyone must be in the policy (invite = policy edit, `auth.md`), and the JWT is a cookie the socket handshake cannot send as a header.
- WorkOS: real signup and invites, client token flow and SDK; same three lines in `authorize`.

## Recommendation (researcher's opinion, not a decision)

Use party-db for the row-shaped durable state (members, intentions, votes, chat rows, ledger), one room per session, and keep presence, mic, and timer ticks as host-owned socket traffic in the same DO via the `PartyDbCore` composition pattern (README, "A Server that can't subclass"; `architecture.md` s15), which is exactly the shape the docs offer for mixed traffic. Have the DO commit phase transitions and released chat through `this.commit()` so they get a `seq`. Start with Cloudflare Access verified in `authorize` against team domain and AUD with identity from `email`, and treat WorkOS as a JWKS URL and claim-name change. Do not build on cookbooks 05 or 06 yet.
