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
  alone too. A session everyone has left ends after a full work phase plus a
  break, and the next visit starts at the top of work.
- **Who is here.** Every member shows at the top of the side column, above the
  ledger, with their name, their intention, and whether they are here or away.
  Hiding the ledger leaves the members in place.
- **One shared clock.** Start, pause, jump a minute either way, make a phase a
  minute longer or shorter, start over, and skip. Any member can press
  anything, and everyone sees it, with a line under the clock saying who did
  it. Pausing or playing the video counts as pressing pause or start.
- **The break vote.** Under the members list, each member picks dance or yap
  for the break this pomo ends in. Not picking counts as dance. The losing
  kind banks its votes for next time, so a 50-50 duo takes turns and a lone
  holdout gets their way now and then. Picks clear when the break starts.
- **Yap breaks** play no music and have no dance floor. Voice comes later.
- **The phase lengths** belong to the session. Changing them in Settings
  changes them for everyone.
- **The soundtrack.** Each phase has its own YouTube playlist, as in pomodance.
  Your own press moves your video at once, and everyone else's video moves
  once when the press reaches them. Joining, and every new phase, put each
  member's playlist at the same place, so videos that drifted line up again.
- **The ledger** is pomodance's: each member files their own pomos, with an
  intention, a review, and a history of past days. A pomo's length is the time
  the clock actually ran, without the pauses. The ledger lives on the device.

## Not yet

Voice, chat, identity beyond a typed name on each device, and a ledger that
follows you across devices. Each of these is in the tree.

## Differences from pomodance

- The "pick your last pomo back up?" prompt is gone. The session's clock keeps
  running on the server, so a reload finds it where it was.
