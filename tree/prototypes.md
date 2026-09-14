# Prototypes

The destination is the tree plus a rough prototype. These are the questions
that close by building something and reacting to it. Each names the rule it
tests, so a prototype that disagrees with the tree sends us back to the rule,
not quietly around it.

### A shared clock in two browsers

Build the smallest session: one party-db room, one clock row, start, pause,
nudge, and skip as commands stamped by the Durable Object, and two browsers
that show the same clock and seek the same work video. No voice, no chat, no
identity beyond a name typed in.

Tests: [The clock](rules.md#the-clock), [Keeping clocks in step](rules.md#keeping-clocks-in-step),
and [Realtime layer](architecture.md#realtime-layer).

Question: does the clock feel shared, and does the video stay with it when
someone nudges? What did the model in the tree get wrong?

Asset: `prototypes/shared-clock.html` on the `prototype/shared-clock` branch.
One file, double-click to open. Two simulated devices with adjustable wall
clocks, timer hiccups, and network delay, a simulated Durable Object between
them, real time, and eight guided walkthroughs. The pure module inside it,
`PomoClock`, is the part worth lifting.

Version 1 surfaced these, and each is now a rule:

- A wall clock that moved after joining left a stale offset. The laptop read
  3.5 s wrong, a pause hid it, and the next break counted down from 23.5 s.
  See [Keeping clocks in step](rules.md#keeping-clocks-in-step).
- The video followed the time into the phase, so every phase restarted the
  song. See [Playlists keep their place](rules.md#playlists-keep-their-place).
- Nobody had said who flips the phase. The DO does, and so does each device,
  from the same end time.

Version 2 surfaced these, and each is now a rule:

- The presser waited a full round trip to see their own press. Now the
  presser applies it at once. See [Keeping clocks in step](rules.md#keeping-clocks-in-step).
- Re-syncing videos on every change would make a video jump twice for one
  press. Now a video moves once per command and is never corrected. See
  [A video moves once per command](rules.md#a-video-moves-once-per-command).

Version 3, checked in headless Chrome: every device reaches zero within
0.05 s of the DO in every walkthrough, and that is the page's own tick.
Double-pressing −10s on a 1.5 s link shows at once, jumps each video once
per press, and settles by 0.00 s. A skip that reaches the phone 1.5 s late
starts its break at 18.5 s.

After version 3, Em asked that +10s with less than ten seconds left start the
next phase fresh instead of a few seconds in. It now works like a skip. See
the walkthrough "+10s near the end".

A display cap at the phase length was considered and dropped. Pomodance's
"longer" button makes a phase legitimately longer than its length.

Closed on 2026-09-14. Em accepted the brief flicker when two people's presses
cross. The real transport was out of reach for a one-file prototype, and it
is the next question: [A shared clock over the real transport](#open-a-shared-clock-over-the-real-transport).

Blocked by: nothing.

### Open: A shared clock over the real transport

The first build of the real app, in this repo: one Worker, one session
Durable Object running party-db, and the prototype's clock module lifted into
`src/shared/clock.ts`. Sessions open by link, share one clock, and play the
pomodance playlists. Clock commands go to the room's own endpoint, which
applies them and commits the clock row with party-db's `commit()`. The
presser's prediction is local state, not a party-db optimistic write, because
a whole-row write would lose crossing presses.

Not in this build: voice, identity, the general room, the break vote, chat.
The ledger stays on the device as in pomodance until the general room exists.

Tests: every rule under [The clock](rules.md#the-clock), over a real socket.

Question: does the model from the prototype hold on real devices and real
networks, and what does the app's skeleton want to look like?

Built on 2026-09-14. [docs/architecture.md](../docs/architecture.md) says how
it works. Checked in local dev, with two and then three separate headless
Chrome profiles on one machine:

- Every press showed on both members with the same clock and the same byline.
- Both members flipped from work to break within 0 ms of each other, and a
  member who joined mid-break flipped back to work within 7 ms of the others.
- Each member got their own review dialog and ledger entry.

Found while building:

- Clients could write the room's tables directly through party-db, which
  would bypass `apply`. The room now refuses party-db's write path.
- Two devices learning the same video's length at once collided. Lengths now
  go through the room, one at a time.
- A device a few milliseconds behind server time showed 01:06 at the top of a
  65 second phase. The clock face now ignores the same 100 ms the offset
  correction tolerates.
- Pressing play or pause inside a YouTube video no longer drives the clock, as
  it did in pomodance. In a session it would stop everyone's clock by accident.

Still open: real devices on real networks. That needs the Worker deployed
and a real session with a friend, which is Em's step.

Blocked by: nothing.

### Open: User-owned tables, built

Build cookbook 05 in the party-db repo: an `owner` column, authorize stamps
it on write, the DO filters snapshot and fan-out per socket. Prove it with a
pomos collection and two users in one room who each see only their own rows.

Tests: [User-owned tables in party-db](architecture.md#user-owned-tables-in-party-db).

Question: what is the smallest change to party-db that makes this true, and
what does it cost the transparent and RDBMS modes that exist today?

Blocked by: nothing. Lives in the party-db repo.

### Open: A yap break end to end

Two browsers in a session, the clock runs work then break, the vote picks
yap, the call opens on the Cloudflare Realtime SFU, and "3, 2, 1, beep" cuts
it. Held chat delivers when the call opens.

Tests: [Voice](rules.md#voice), [Chat](rules.md#chat),
[The break vote](rules.md#the-break-vote-and-its-decay), and
[Voice transport](architecture.md#voice-transport).

Question: does the moment at the end of a break land, and does the SFU mute
trick hold up on a phone?

Blocked by: [A shared clock over the real transport](#open-a-shared-clock-over-the-real-transport).
