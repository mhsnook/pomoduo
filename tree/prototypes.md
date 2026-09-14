# Prototypes

The destination is the tree plus a rough prototype. These are the questions
that close by building something and reacting to it. Each names the rule it
tests, so a prototype that disagrees with the tree sends us back to the rule,
not quietly around it.

### Open: A shared clock in two browsers

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
them, real time, and seven guided walkthroughs. The pure module inside it,
`PomoClock`, is the part worth lifting.

Version 1 surfaced these, and each is now a rule:

- A wall clock that moved after joining left a stale offset. The laptop read
  3.5 s wrong, a pause hid it, and the next break counted down from 23.5 s.
  See [Keeping clocks in step](rules.md#keeping-clocks-in-step).
- The video followed the time into the phase, so every phase restarted the
  song. See [Playlists keep their place](rules.md#playlists-keep-their-place).
- Nobody had said when videos seek. See
  [Videos seek only at changes](rules.md#videos-seek-only-at-changes).
- Nobody had said who flips the phase. The DO does, from its alarm.

A display cap at the phase length was considered and dropped. Pomodance's
"longer" button makes a phase legitimately longer than its length, and with
the offset corrected the cap has nothing left to hide.

Still open in version 2:

- Devices apply nothing locally. They show only the row the DO sent back, so
  on a slow link your own press lags by a round trip. The walkthrough "Pause
  and nudge cross in the post" is where to feel whether that is fine.
- The real transport is not tested here. That is the first implementation,
  not a prototype.

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

Blocked by: [A shared clock in two browsers](#open-a-shared-clock-in-two-browsers).
