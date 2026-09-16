# Architecture

How pomoduo works today. For why, and for what is not decided yet, see
[`tree/architecture.md`](../tree/architecture.md) and
[`tree/rules.md`](../tree/rules.md).

## One Worker

A single Cloudflare Worker, `src/server/index.ts`, serves everything:

- `/parties/session/<id>/...` goes to that session's Durable Object.
- `/partytracks/*` is the call, passed on to the Cloudflare Realtime SFU. It
  goes through the Worker because only the Worker holds the Realtime app's
  token. A deployment without one answers 503 here, and nothing else changes.
- Every other path is the single-page app, built by Vite into `dist/client`
  and served as static assets. A path that is not a file gets `index.html`.

## The session room

`src/server/session.ts` is one Durable Object per session, built on party-db's
`PartyDbServer`. It keeps three tables in its own SQLite:

| Table     | Rows                                                                      | Written by                                         |
| --------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| `clock`   | One: the shared clock, and the last change made to it                     | Commands, and the room's alarm                     |
| `members` | One per member: name, intention, here or not, and their place on the call | The member's device, and the room from its sockets |
| `tracks`  | One per video: its length                                                 | The first member whose player loads it             |

Members read all three through party-db's socket. They never write through
party-db: the room refuses party-db's write path, and changes only through
its own endpoints.

| Endpoint           | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `GET .../time`     | Answers with server time, for a device's first sync       |
| `POST .../command` | Applies one clock command and answers with the new row    |
| `POST .../member`  | Sets a member's name and intention                        |
| `POST .../voice`   | Sets a member's place on the call, and where their mic is |
| `POST .../track`   | Records a video's length, if nobody has yet               |

**Presence.** A device's member id rides on its socket as the `pomoduo-member`
cookie. The room marks a member here when one of their sockets opens and away
when the last one closes. Away holds their place for ten minutes, then they
come off the roster; ending the session clears it entirely. Someone who comes
back after either joins again as a new member of the same session.

**One alarm, three jobs.** The room sets its alarm for the earliest of the end
of a running phase, the moment the member who has been away longest comes off
the roster, and the end of an empty session. When a phase ends, it flips the
phase. When the last socket closes, it notes the time; if nobody is back a
full work phase plus a break later, it ends the session: the clock goes back
to the top of work, stopped.

Every change runs one at a time.

## The clock

`src/shared/clock.ts` is the whole clock model, and both the room and the
client run it. A command is applied with `apply(clock, command, now)`:

- The room applies it when it arrives, and stamps the row with server time and
  the member who sent it. Everything that follows from a change — the row, the
  vote clearing, the call emptying — happens in the room's `settle`, so a new
  consequence is written once rather than once per command.
- The device that pressed applies it at the press, so the press shows at once.
- A rollover chains from the exact end time, so the room and every device
  land on the same next phase without talking to each other.

**The break vote** (`src/shared/vote.ts`) runs inside `apply`: when a command
or a rollover ends work, `apply` takes one vote per member who is here and
decides the break's kind from the votes and the banks in the clock row. The
room counts the members it has marked here; a device predicting the same
change counts the members it has. The room clears every pick after the vote.

## The call

The call is one thing the session shares and three things each member decides.

The session's part is `callOpen`, a column of the clock row, so `apply` settles
it along with the phase and every device reaches the same answer at the same
moment. `src/shared/clock.ts` says when it opens and closes.

A member's part is three columns of their `members` row, written through
`POST .../voice`: whether they have picked up, whether they are muted, and
where the SFU carries their mic for the others to pull, or null when there is
nothing to pull. `src/client/session/call.tsx` holds the connection and says
what those three mean together.

When the call closes, each device comes off it as its own clock reaches the
same place, and the room clears the call columns for anyone who did not. A
member who leaves the session comes off the call with them.

## A device

`src/client/session/connection.ts` is one device's connection to a session.

- **Server time.** The device counts with `performance.now()` and keeps an
  offset to server time (`src/client/lib/server-time.ts`). It measures the
  offset once on joining, and corrects it from the messages it already gets
  when it is more than 100 ms off. It never reads the wall clock.
- **What it shows.** The room's clock, except that the device's own press
  shows at once. Its timer keeps that prediction until every press it made is
  answered, then takes the room's version.
- **Joining.** The device waits for the clock, the members, and the track
  lengths, then puts both playlists where the clock says: the current one at
  the clock's place, the other where it stopped.
- **The video** moves once per command: at the press on the presser's device,
  and when the command arrives everywhere else. A change of phase starts the
  new playlist at the clock's place for it, mapped onto tracks through the
  lengths in `tracks` (`src/client/lib/playlist.ts`). Nothing corrects a video
  between changes.
- **Clicks on the video** are commands: a player's own pause or play becomes a
  `pause` or `start` for the whole session.
- **Its own rollover.** The device flips the phase when its own timer reaches
  zero, without waiting for the room.

## On the device only

The session room holds nothing personal. A member's ledger, their settings and
their id live in `localStorage` under `pomoduo:`, so they belong to one browser
and reach no other device.
