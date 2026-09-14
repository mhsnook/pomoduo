# Architecture

How pomoduo works today. For why, and for what is not decided yet, see
[`tree/architecture.md`](../tree/architecture.md) and
[`tree/rules.md`](../tree/rules.md).

## One Worker

A single Cloudflare Worker, `src/server/index.ts`, serves everything:

- `/parties/session/<id>/...` goes to that session's Durable Object.
- Every other path is the single-page app, built by Vite into `dist/client`
  and served as static assets. A path that is not a file gets `index.html`.

## The session room

`src/server/session.ts` is one Durable Object per session, built on party-db's
`PartyDbServer`. It keeps three tables in its own SQLite:

| Table     | Rows                                                  | Written by                                         |
| --------- | ----------------------------------------------------- | -------------------------------------------------- |
| `clock`   | One: the shared clock, and the last change made to it | Commands, and the room's alarm                     |
| `members` | One per member: name, intention, here or not          | The member's device, and the room from its sockets |
| `tracks`  | One per video: its length                             | The first member whose player loads it             |

Members read all three through party-db's socket. They never write through
party-db: the room refuses party-db's write path, and changes only through
its own endpoints.

| Endpoint           | What it does                                           |
| ------------------ | ------------------------------------------------------ |
| `GET .../time`     | Answers with server time, for a device's first sync    |
| `POST .../command` | Applies one clock command and answers with the new row |
| `POST .../member`  | Sets a member's name and intention                     |
| `POST .../track`   | Records a video's length, if nobody has yet            |

**Presence.** A device's member id rides on its socket as the `pomoduo-member`
cookie. The room marks a member here when one of their sockets opens, and
away when the last one closes. Ids are per device for now.

**One alarm, two jobs.** The room sets its alarm for the earlier of the end of
a running phase and the end of an empty session. When a phase ends, it flips
the phase. When the last socket closes, it notes the time; if nobody is back
a full work phase plus a break later, it ends the session: the clock goes
back to the top of work, stopped.

Every change runs one at a time.

## The clock

`src/shared/clock.ts` is the whole clock model, and both the room and the
client run it. A command is applied with `apply(clock, command, now)`:

- The room applies it when it arrives, and stamps the row with server time and
  the member who sent it.
- The device that pressed applies it at the press, so the press shows at once.
- A rollover chains from the exact end time, so the room and every device
  land on the same next phase without talking to each other.

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
- **Clicks on the video** are commands. The page remembers what it last told
  each player, and a player's own pause or play counts as a click only when it
  goes against that, and not within 800 ms of it.
- **Its own rollover.** The device flips the phase when its own timer reaches
  zero, without waiting for the room.

## On the device only

`localStorage`, under `pomoduo:`: the ledger of pomos with the time each one
ran, the current intention and work day, settings (playlists, name, ledger and
motion toggles), and this device's member id.
