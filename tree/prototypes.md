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
One file, double-click to open. Two simulated devices with adjustable clock
skew and network delay, a simulated Durable Object between them, real time,
and six guided walkthroughs. The pure module inside it, `PomoClock`, is the
part worth lifting.

Found while building, not yet decided:

- The video follows the clock by target position (how far into the phase we
  are), not by a delta per command. One rule covers nudge, skip, join
  mid-phase, and rollover, and it needs no seek bookkeeping. The tree's
  wording of "seek by the same delta" should change to this.
- Rollover is the DO's job. When the end time passes, the DO flips the phase
  from its alarm and chains the next end time from the exact old end, not
  from "now". The tree never said who flips the phase.
- Devices apply nothing locally. They show only the row the DO sent back, so
  on a slow link your own press lags by a round trip. Scenario two is where
  to feel whether that is fine or whether commands need to apply
  optimistically. If they do, the DO's row still wins on arrival.
- A device that reconnects measures its offset again and trusts nothing from
  before. A phone that slept is the case.
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
