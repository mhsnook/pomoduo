# pomoduo

A pomodoro timer for coworking with a friend. It grew out of
[pomodance](https://emju.in/pomodance): the same timer and ledger, and the
same dance break, with one clock shared by everyone in a session.

This folder describes what the app does today. The theory and the open
questions live in [`tree/`](../tree/readme.md), and the vocabulary lives in
[`CONTEXT.md`](../CONTEXT.md).

## What works today

- **Sessions.** "Start a session" makes a session at `/s/<id>`. The address is
  the invite: anyone with the link joins the same session. A session works
  alone too.
- **One shared clock.** Start, pause, jump ±10 seconds, make a phase a minute
  longer or shorter, start over, and skip. Any member can press anything, and
  everyone sees it, with a line under the clock saying who did it.
- **The phase lengths** belong to the session. Changing them in Settings
  changes them for everyone.
- **The soundtrack.** Each phase has its own YouTube playlist, as in pomodance.
  Your own press moves your video at once, and everyone else's video moves
  once when the press reaches them. Every new phase starts each member's
  playlist at the same place, so videos that drifted line up again.
- **The ledger** is pomodance's: each member files their own pomos, with an
  intention, a review, and a history of past days. It lives on the device.

## Not yet

Voice, the break vote, chat, seeing your friend's intention, identity beyond a
typed name, and a ledger that follows you across devices. Each of these is in
the tree.

## Differences from pomodance

- The jump controls move 10 seconds, not a minute.
- Pressing play or pause on a YouTube video does not start or stop the clock.
  In a session that would stop everyone's clock by accident. The video follows
  the clock, and only the clock's own controls change it.
- The "pick your last pomo back up?" prompt is gone. The session's clock keeps
  running on the server, so a reload finds it where it was.
