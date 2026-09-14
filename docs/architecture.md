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
`PartyDbServer`. It keeps two tables in its own SQLite:

| Table    | Rows                                                  | Written by                             |
| -------- | ----------------------------------------------------- | -------------------------------------- |
| `clock`  | One: the shared clock, and the last change made to it | Commands, and the room's alarm         |
| `tracks` | One per video: its length                             | The first member whose player loads it |

Members read both tables through party-db's socket. They never write through
party-db: the room refuses party-db's write path, and changes only through
its own endpoints.

| Endpoint           | What it does                                           |
| ------------------ | ------------------------------------------------------ |
| `GET .../time`     | Answers with server time, for a device's first sync    |
| `POST .../command` | Applies one clock command and answers with the new row |
| `POST .../track`   | Records a video's length, if nobody has yet            |

Commands and alarms run one at a time. The room sets an alarm for the end of
every running phase, and flips the phase itself when it fires.

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
- **The video** moves once per command: at the press on the presser's device,
  and when the command arrives everywhere else. A change of phase starts the
  new playlist at the clock's place for it, mapped onto tracks through the
  lengths in `tracks` (`src/client/lib/playlist.ts`). Nothing corrects a video
  between changes.
- **Its own rollover.** The device flips the phase when its own timer reaches
  zero, without waiting for the room.

## On the device only

`localStorage`, under `pomoduo:`: the ledger of pomos, the current intention
and work day, and settings (playlists, name, ledger and motion toggles).
