# Rules of a session

What a session does on its own, once people are in it. Written in terms of
concepts, never the current word for them: see the word pairs at the end.

## The clock

One shared clock per session. It has a phase (work or break), and either an
end time (running) or a remaining time (stopped), exactly as pomodance models
its timer. The commands (start, pause, nudge, scrub, skip) are shared; each
member's device follows them on its own, and every member's clock finishes at
the same moment.

### Keeping clocks in step

Every command passes through the session's Durable Object, which stamps it
with server time and the member who sent it. Each device measures its offset
from server time once per connection and applies commands against that.
Pause stores the remaining time as computed at the stamped moment. Nothing is
negotiated between members, because everyone reads one clock.

The video follows the clock. When a command moves the clock, every device
seeks its video by the same delta, the way pomodance's scrub already seeks
the soundtrack. A device that joins mid-phase seeks to where the clock is.

### Who controls the clock

Any member can start, pause, nudge, scrub, or skip. Every change is broadcast
with who did it, so a nudge reads as "Em pushed the clock forward a minute".
There is no host. Pomoduo is peers.

## Break types

Every break is one of two kinds:

- **dance**: the break playlist plays. This is the pomodance break.
- **yap**: no music, and every member's mic comes back on.

Dance is the default. Each pomo, each member holds the default or picks the
other one. When the pomo ends, the kind with more weight wins, and the break
runs that way. You can always mute yourself in a yap break; nobody is obliged
to yap.

### The break vote and its decay

- Each member has a weight. Everyone starts a session at weight 1.
- Not choosing counts as choosing the default, at your full weight.
- When the pomo ends, each kind's weight is the sum of its members' weights.
  The heavier kind wins. On a tie, the kind that lost last time wins.
- After each decision, every member on the winning side has their weight
  multiplied by the decay factor. Every member on the losing side goes back
  to 1.
- The decay factor is 0.7, and it is a tunable. With four members against one
  and nobody changing their vote, the one gets their way on the fifth pomo.
- Weights reset when a session ends. They do not carry across sessions.
- Each member can see their own weight and everyone else's, so the decay is
  legible and reads as fair rather than random.

## Chat

A session has a text chat. Chat is live whenever the phase is break, of either
kind, and whenever the call is open. During work with the call closed, a
message you send is held: the sender sees it as held, and it delivers the
moment the phase turns to break or the call opens, however that happened. A
held message can be edited or withdrawn until it delivers. Voice is the
override for anything urgent, so chat has none.

## Voice

A session has one call, and the call is open or closed. Whether the call is
open is separate from each member's mute: a member can mute themselves at any
time, and mute says nothing about the call. It works like a phone call: you
can pick it up and you can hang up, and picking it back up is allowed.

When the call opens:

- A session starts with the call open. An invite rings a friend into it.
- A yap break opens the call. Every present member is on it with their mic
  live, unless they mute or hang up.
- A knock opens the call mid-work for the members who accepted.

When the call closes:

- Starting work closes the call for everyone.
- A dance break leaves the call closed. The music is the point. A member can
  knock during a dance break the same as during work.
- A call opened by a knock stays open until everyone on it hangs up or the
  work phase ends.

The end of a break is a moment. The clock counts "3, 2, 1", beeps, the call
cuts, and the work playlist starts. The end of work is the mirror: the clock
beeps, the break kind is announced, held chat delivers, and for a yap break
the call opens.

### Opening voice mid-work: the knock

To talk something through mid-work, you knock. Your friend sees a quiet
indicator and no sound. They accept, and both mics open; or they ignore it,
and nothing happens. Unmuting alone is not enough to be heard during work.
An unanswered knock has no timeout rule yet; if one is needed later it folds
into held chat.

## Word pairs

The concepts above have current words, and the words are skinnable:

| Concept | Default word |
| --- | --- |
| The work phase | work |
| The break kind with mics on | yap |
| The break kind with music on | dance |

Swapping a pair is an easter egg, not a setting page. Not yet specified: see
the readme.
