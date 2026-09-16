# pomoduo

A pomodoro timer for coworking with a friend. It grew out of
[pomodance](https://emju.in/pomodance): the same timer and ledger, and the same
dance break, with one clock shared by everyone in a session.

## What it does

- Do a pomodoro with your friends, to chill work music. The clock is shared:
  anyone can start, pause, stretch or skip it, and everyone's timer and music
  move together. The address is the invite.
- Go on break and either the music switches to dance music, or you get a
  yapping break on a call with your buddies. You vote on which.
- When the break is over there is no awkward "we should get back to work now":
  the call cuts, and the work track picks up where it left off.
- Set an intention for each pomo, and get back a ledger at the end of the day
  of how you actually spent your time.

## Where it runs

Desktop Chromium browsers: Chrome, Edge, Arc, Brave. Nothing stops you opening
it elsewhere and most of it will work, but the call is only tested here. The
call needs a Cloudflare Realtime app on the server; without one the page says
so rather than pretending. The ledger lives on the device it was filed on.

---

This folder describes what the app does today.
[`architecture.md`](architecture.md) is how. The theory, the open questions,
and everything not built yet live in [`tree/`](../tree/readme.md), and the
vocabulary lives in [`CONTEXT.md`](../CONTEXT.md).
