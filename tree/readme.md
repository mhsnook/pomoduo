# pomoduo tree

This folder is the theory of pomoduo: what is valuable, why, and what we have
not decided yet. Think of it as a skill tree. Every file describes one part of
the product, nests when it outgrows a section, and carries its open questions
in place. Nothing here is a promise about current behaviour: `docs/` holds what
the code does today, and `CONTEXT.md` holds the vocabulary we have settled.

How to read it:

- A section headed `## Open: <title>` is an undecided question. It states the
  question, our current lean, and a `Blocked by` line naming any open question
  that has to close first.
- When a question closes, the section becomes settled prose in place and gets
  one line under "Decisions so far" below.
- The "frontier" is every open question with no open blocker. Work one at a
  time. Anything we can see coming but cannot phrase sharply yet goes under
  "Not yet specified".

## Destination

The tree and a rough prototype together describe pomoduo well enough that any
leaf of this tree can be built, or the prototype extended, in one session
without a new decision. The tree is not the product and the prototype is not
the product; the pair is.

## Notes

- Domain: a pomodoro timer for coworking with a friend, grown from
  [pomodance](https://emju.in/pomodance) (source: `src/routes/(projects)/pomodance/`
  in the emju-site repo, on origin/main). Pomodance's file layout was shaped
  by living inside another site and is not a convention here.
- Bog-standard, self-documenting, stock approaches to everything: file
  layout, tooling, libraries, naming. When a choice is not the stock one,
  ask before making it.
- Skills for every session here: `grilling`, `domain-modeling`, and
  `prototype` when a question is about how something should look or feel.
- This map carries prototype work, not only decisions. A question may close by
  building a thing and reacting to it.
- The solo story must keep working. Duo is the fun; solo is the floor.
- `docs/readme.md` and `docs/architecture.md` describe current state and actual
  rules only, and grow on a long tail as questions here close.
- Word pairs (work/break, dance/yap) are skinnable, and "grind" is out. Write rules in terms of the
  concept, never the current word.

## Decisions so far

- [Stack](architecture.md#stack): a fresh app in this repo on TanStack Start
  and Cloudflare Workers, lifting the pomodance timer and ledger model.
- [Identity](architecture.md#identity): Cloudflare Access for now, WorkOS or
  party-db auth later.
- [How a duo starts](user-stories.md#duo): you invite a friend, it rings, they
  pick up, you talk, then someone presses start.
- [Break types](rules.md#break-types): dance or yap, per pomo, dance by
  default. Mics come back on for yap; music comes on for dance.
- [Chat holds until the break](rules.md#chat): a message sent during a pomo is
  delivered when the pomo ends.
- [Tree mechanics](#pomoduo-tree): this file describes them.
- [Session lifecycle](user-stories.md#session-lifecycle): a session exists as
  soon as you start anything; friends join mid-pomo; it ends when the last
  member leaves and the resume window passes.
- [Who controls the clock](rules.md#who-controls-the-clock): any member, and
  every change says who did it.
- [What you see of your friend](user-stories.md#what-you-see-of-your-friend):
  intention, mic state, coarse presence. No idle or tab detection.
- [The knock](rules.md#opening-voice-mid-pomo-the-knock): mid-work voice
  starts with a quiet knock the other side accepts or ignores.
- [The break vote](rules.md#the-break-vote-and-its-decay): weighted vote,
  winners decay by 0.7, losers reset, weights visible, reset per session.
- [Chat](rules.md#chat): live in any break and whenever the call is open;
  held otherwise, editable until it delivers.
- [Ledger in a duo](user-stories.md#ledger-in-a-duo): pomos stay personal.
  The clock is shared; the ledger is not.
- [Realtime layer](architecture.md#realtime-layer): party-db, the room is the
  session, everything shared is a row.
- [The general room](architecture.md#the-general-room): a second room of
  user-owned tables holds pomos and settings, so a person is the same on
  every device.
- [Commands are relative or fresh](rules.md#commands-are-relative-or-fresh):
  the goal is that timers finish together, because that is when the call
  changes. Videos may drift.
- [Keeping clocks in step](rules.md#keeping-clocks-in-step): the presser
  applies a command at once; the DO applies it on arrival and everyone's
  timer settles to the DO's end time. Devices count with a steady timer and
  correct drift over 100 ms from messages they already get. No ping.
- [Playlists keep their place](rules.md#playlists-keep-their-place): each
  playlist carries on across pomos, and the clock row holds its place.
- [A shared clock in two browsers](prototypes.md#a-shared-clock-in-two-browsers):
  the prototype that produced the clock rules above, on the
  `prototype/shared-clock` branch.
- [A video moves once per command](rules.md#a-video-moves-once-per-command):
  on each device, at the press or on arrival, and is never corrected. It
  lines up again at the next phase.
- [The call](rules.md#voice): opens at session start, on a yap break, and on
  a knock; closes when work starts; cuts on "3, 2, 1, beep" at the end of a
  break.
- [Voice transport](architecture.md#voice-transport): Cloudflare Realtime
  SFU from the session DO, partytracks on the client, mesh as fallback.
- [User-owned tables](architecture.md#user-owned-tables-in-party-db): one
  general room, an owner column, party-db filters per socket. Cookbook 05,
  built.

## Open questions

The frontier, in the order to take them. Every decision that could be made in
prose is made; what is left closes by building. See
[prototypes.md](prototypes.md).

1. [A shared clock over the real transport](prototypes.md#open-a-shared-clock-over-the-real-transport),
   the first build of the real app
2. [User-owned tables, built](prototypes.md#open-user-owned-tables-built),
   in the party-db repo, and independent of 1
3. [A yap break end to end](prototypes.md#open-a-yap-break-end-to-end).
   Blocked by 1.

## Not yet specified

- Friends: how two people become friends, and whether a friend list is a real
  thing or "anyone you have a link for".
- Ringing when the friend is not on the page: notifications, mobile, PWA.
  Web Push from the DO is the only route, and on iOS only for Home Screen
  web apps, which also lose the mic in the background. This one has a real
  tension in it.
- Friends list in the general room, once user-owned tables can also be
  shared rows.
- Whose playlist plays in a dance break, and whether settings sync at all.
- What a dance break looks like with two people: the same video, or each their
  own.
- How solo users discover duo, and how a solo pomo becomes a session.
- The easter-egg UI for swapping word pairs.
- History across sessions: does a pair have a shared past.
- The share card and page chrome, carried from pomodance.

## Out of scope

- Camera video. Voice only.
- Migrating pomodance localStorage data into pomoduo.
- The emju.in marketing site. Pomodance stays where it is.
