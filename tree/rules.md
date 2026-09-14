# Rules of a session

What a session does on its own, once people are in it. Written in terms of
concepts, never the current word for them: see the word pairs at the end.

## The clock

One shared clock per session. It has a phase (work or break), and either an
end time (running) or a remaining time (stopped), exactly as pomodance models
its timer. It also holds each playlist's place. The commands (start, pause, nudge, scrub, skip) are shared; each
member's device follows them on its own, and every member's clock finishes at
the same moment.

### Commands are relative or fresh

Every clock command is one of two kinds:

- **Relative**: jump ±10s, pause, resume. It acts on wherever the clock is.
- **Fresh**: skip to the next phase, or a forward jump that would run past
  the end of this one. It starts the next phase from the top.

The goal is that every member's timer finishes a phase at the same moment,
because that is when the call opens or closes. Videos may drift a little
between members, and that is fine.

### Keeping clocks in step

The presser's device applies a command the moment it is pressed. The command
then goes to the session's Durable Object, which applies it when it arrives,
stamps it with server time and the member who sent it, and sends the result
to everyone. The DO also flips the phase itself when the end time passes,
chaining the next end time from the exact old end.

Only the timer settles. When the DO's answer comes back, the presser's timer
takes the DO's end time. For a jump inside the phase that changes nothing,
because such a jump moves the end time by the same amount whenever it is
applied. For a pause, resume, or fresh command it moves the timer by about
the one-way network delay. While
more of the presser's commands are still on the way, the timer keeps showing
the presser's own prediction, and it settles once when the last is answered.
Everyone else's timer reads the DO's end time as soon as the command reaches
them, so a skip that arrives 300 ms late starts the break at 24.7 seconds
instead of 25.

If someone else's command lands between your press and its answer, your
timer shows their change without yours for a moment, then both. This only
happens when two people press within one round trip of each other.

A device never reads its own wall clock for the session. It counts with its
steady timer (`performance.now()` in a browser), which does not jump when the
device corrects its wall clock, and keeps an offset to server time:

- Joining measures the offset from one round trip.
- Every message from the DO carries server time. A reply to something the
  device sent is a fresh round trip. Any other message can only show that the
  device has fallen behind, because the DO stamped it before it arrived.
- The offset moves only when it is more than 100 ms off. That should be rare:
  a tab that was suspended, or a network path slower one way than the other.
- There is no ping. The session's own messages are enough.

Each device also flips its own phase when its own timer reaches zero, without
waiting for the DO. Because both chain from the same end time, they land on
the same next phase.

### Playlists keep their place

Each playlist carries on from where it stopped, across pomos, as in
pomodance. The clock holds each playlist's place: for the current phase,
where it stood when the phase began; for the other phase, where it stopped.
A device's video belongs at the current playlist's place plus the time into
the phase. A skip, or a forward jump past the end, leaves this playlist at
the place it reached and starts the next one at its place. A jump back past
the start carries into the previous phase and rewinds that playlist with the
clock, as pomodance's scrub does.

### A video moves once per command

Each device applies each command to its own video exactly once: the presser
at the press, everyone else when the command reaches them. A jump moves the
video by the jump. Pause and resume stop and start it. A command or rollover
that changes the phase starts the new phase's playlist at its shared place,
at the point the clock has reached. Joining starts the video where the clock
is.

Nothing corrects a video afterwards. A video that started late, fell behind
while buffering, or paused a few hundred milliseconds before the clock did
stays where it is. It lines up again when the next phase starts. Calls
already carry a few hundred milliseconds of delay, so tighter sync would not
be heard, and a video that jumps twice for one press is worse than one that
is a little off.

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
