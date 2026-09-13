# Architecture

How pomoduo is built. Settled sections are decisions; open sections are not.
`docs/architecture.md` will say what the code actually does once there is code.

## Stack

A fresh app in this repo on TanStack Start (React 19) and Cloudflare Workers,
the same stack as emju-site. The pomodance timer, pomo, and ledger model is
the starting point and gets lifted, not rewritten. Its `-lib.ts` layout was a
convention for living inside another site's router and does not carry over:
files go where a stock TanStack Start app puts them (`src/lib`, `src/routes`,
`src/server`). Cloudflare's Durable Objects are the natural home for a
session, one object per session.

## Identity

Cloudflare Access for now, the way Emdash uses it for identity:
authenticates at the edge and issues a JWT, and the app verifies it against a
team domain and an AUD tag. This can move to WorkOS later. Either way, a person
is the same person on every device.

## Realtime layer

Party-db, and the room is the session. Everything shared is a row in the
session's collections:

- the clock, as one row (phase, end time, remaining time, who, when);
- members, with intention, mic state, presence, and vote weight;
- votes for the current pomo;
- chat messages, with a held flag the client honours;
- the call, as one row (open or closed, and who is on it).

The DO writes presence itself on socket open and close, which is party-db's
server-originated write path, so no heartbeat rows and no oplog churn. Held
chat is enforced by the recipient's client, not the server: the row arrives
and stays hidden until the phase or the call changes. Between friends that
is enough.

Cloudflare Access verifies in party-db's authorize hook, with the JWT read
from the Access cookie, which is a small change inside party-db.

Research: [architecture/state-and-identity-options.md](architecture/state-and-identity-options.md).

## The general room

A second party-db room that every user connects to alongside any session:
the general room. It holds user-owned tables, where a row belongs to one user
and only that user can read and write it. Pomos and user settings live here,
which is what gives a person the same ledger and playlists on every device
and browser. Volume is low: a handful of rows per user per pomo.

Each client holds two transports, one for the general room and one for the
session room. A solo user holds only the general room.

### User-owned tables in party-db

One general room, and a collection is user-owned when it has an `owner`
column: party-db's authorize hook stamps the owner on every write, and the
DO filters the snapshot and the fan-out per socket so a user only ever
receives their own rows. This is cookbook 05 in the party-db repo, built for
real. It is party-db work before it is pomoduo work, and it is the first
ticket that lives partly in another repo. One room per user was the cheaper
option and was ruled out, because a shared general room is where a friends
list will eventually live.

## Voice transport

Cloudflare Realtime SFU, driven from the session's PartyServer Durable Object
over its HTTPS API, with partytracks on the client. The free egress tier
covers a pair working daily many times over, TURN comes with it, and there is
no signalling server to run because the DO already holds the socket. Mute
keeps a silent track flowing so the SFU's 30 second no-packet timeout never
fires, which partytracks handles. Peer-to-peer mesh is the fallback if the
SFU disappoints, and Daily if shipping speed wins.

Ringing someone who is not on the page is a browser problem shared by every
option (Web Push from the DO, iOS only for Home Screen web apps), so it did
not pick the transport. It stays in the fog.

Research: [architecture/voice-options.md](architecture/voice-options.md).
