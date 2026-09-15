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
A yap break plays no music, so its playlist does not move on.

## The call

A session has one call, open or closed for everyone at once. `callOpen` is a
column of the clock row, so it changes only through `apply`, like every other
part of the clock:

- A session starts with the call open, and starting work closes it.
- Entering a break opens the call if the break is a yap one and closes it
  otherwise, however the phase changed: a skip, a rollover, or a jump either
  way.

Whether a member is on the call is their own, and `members` carries it in three
columns: `onCall` once they have picked up, `muted`, and `mic`, the SFU session
and track name the others pull their voice from. A device that has picked the
call up before joins a break's call by itself; before that it waits for a
click, because the first mic prompt needs one.

`src/client/session/call.tsx` is this device's end of the call: `useCall` holds
whether you are on it, your mute, and the notices, and the connection inside it
exists only while you are on the call, so hanging up takes the peer connection
and the mic with it. partytracks pushes the mic to the SFU and pulls every other
member's, each into an audio element of its own. Muting swaps a silent track in
rather than stopping the stream, because the SFU collects a track that has sent
nothing for thirty seconds. `components/CallPanel.tsx` only draws it.

When the call closes, each device comes off it as its own clock reaches the
same place, and the room clears `onCall` and `mic` for anyone who did not. A
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
- **Clicks on the video** are commands. The page remembers what it last told
  each player, and a player's own pause or play counts as a click only when it
  goes against that, and not within 800 ms of it.
- **Its own rollover.** The device flips the phase when its own timer reaches
  zero, without waiting for the room.

## On the device only

`localStorage`, under `pomoduo:`: the ledger of pomos with the time each one
ran, the current intention and work day, settings (playlists, name, ledger and
motion toggles), this device's member id, and whether it has ever picked the
call up.
