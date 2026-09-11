# User stories

The stories pomoduo exists to serve. Solo first, because it is the floor; duo
second, because it is the point.

## Solo

Everything pomodance does today, unchanged in spirit:

- You type an intention and press start. A 25 minute pomo runs with a work
  playlist. When it ends, a 5 minute break runs with a break playlist and the
  page turns into a dance floor.
- When a pomo ends you review it: keep the intention or say you are done with
  it, and add a note. Pomos file into a ledger under a work day that rolls over
  at 4am.
- The timer survives a reload. You can nudge and scrub the clock, and the
  soundtrack follows.

## Duo

You have friends. You click to invite one. It starts as a call: they have to
pick up. You talk. At some point one of you says "okay, let's start" and
presses start. The video and the timer start for both of you. Now you are in a
session together: talking, then working, then a break, then again.

While you work you can see your friend's intention. That is the body-double:
you each know what the other is on. You can open voice at any time to talk
something through, even mid-pomo. Chat you send mid-pomo waits until the pomo
ends so it does not interrupt them.

At the end of each pomo the session picks the break type. See
[rules.md](rules.md#break-types).

### Session lifecycle

A session exists as soon as you start anything, solo included. An invite rings
a friend into your session. If they do not pick up, you keep working, and they
can join later, mid-pomo, and get the clock mid-flight. Any member can invite
another friend into a running session. The session ends when the last member
leaves and a grace window passes: one full work phase plus one break, the same
window pomodance uses to offer a resume.

### What you see of your friend

For each other member, live: their intention, their mic state (muted or
live), and coarse presence (here or gone). Nothing else. No tab-hidden or idle
detection, and no typing indicator: those read as surveillance, and the
body-double works on trust.

### Ledger in a duo

Each member files their own pomos, with their own intention, note, and review,
exactly as in solo. Nothing about a pomo is shared between members except the
intention shown live during a session. The clock is shared; the ledger is not.

The ledger and a person's settings are theirs across devices and browsers.
They live in a user-owned table in the general room, not in the session room
and not only on the device. See [architecture](architecture.md#the-general-room).
