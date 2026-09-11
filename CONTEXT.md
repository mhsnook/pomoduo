# pomoduo

A pomodoro timer for coworking with a friend. Solo works; duo is the point.
This file is the vocabulary we have settled. The theory lives in `tree/`.

## Language

**Pomo**:
One work interval, with an intention, a note, and a reviewed flag. Files into a
ledger under a work day.
_Avoid_: pomodoro, timer, block

**Intention**:
The one line a person writes about what they will do in a pomo.
_Avoid_: task, goal

**Ledger**:
A person's list of pomos for a work day. Work days roll over at 4am.
_Avoid_: history, log

**Session**:
A shared clock and the people on it. Starts as a call between friends.
_Avoid_: room, lobby

**Member**:
A person in a session.
_Avoid_: participant, user, peer

**Friend**:
A person you can invite into a session.

**Invite**:
Ringing a friend into your session. They pick up or they do not.
_Avoid_: share link, join code

**Work**:
The phase of the clock a pomo runs in. The word is skinnable; the concept is not.
_Avoid_: grind, focus

**Break**:
The rest phase of the clock. Every break is one kind: dance or yap.

**Dance**:
The break kind where the break playlist plays.
_Avoid_: music break

**Yap**:
The break kind where the music stays off and every member's mic comes on.
_Avoid_: chat break, talk

**Call**:
A session's voice connection. It is open or closed, for everyone at once, and
says nothing about any member's mute.
_Avoid_: voice chat, comms, channel

**Knock**:
A request to open voice during work. The other member accepts or ignores
it, and hears nothing until they accept.
_Avoid_: call, ping, nudge

**Weight**:
How much a member's break vote counts this pomo. Starts at 1, decays after a
win, resets after a loss.
_Avoid_: score, points

**General room**:
The room every user is connected to, holding their own pomos and settings.
Personal, not shared.
_Avoid_: home, profile, account

**Held message**:
A chat message sent during work while the call is closed, delivered when
the work phase ends or the call opens.
_Avoid_: delayed message, queued message
