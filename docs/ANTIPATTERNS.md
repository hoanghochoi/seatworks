# Anti-patterns of a coding-agent team

A reference for the Human, not content any seat reads. Nothing here is in a prompt, and adding
something here costs no context and no tokens.

Each entry is a rule, the words that give it away, and where this plugin stands on it today. The
examples are only on the rules that cannot be stated in one sentence.

**Where a thing can be caught** — four answers, used throughout:

| | Meaning |
|---|---|
| **caught** | A code fact fires on it today. |
| **asked** | A model is asked one condition about it when it shows, and a yes is booked as a fact is. |
| **desk** | In the ledger, and nothing reads it for this yet. |
| **outside** | This plugin cannot see it, and saying why is the useful part. |

Of the thirty-five rules below, **twelve are caught**, five more in part, three of those with a
model asked the rest, and one in half its cases. Six are asked. One is desk-shaped. Ten are outside
what the plugin can observe, and for those the entry says why, because that is the part worth
knowing.

The thirty-five come from one list. Section 8 holds one that does not, kept here because the watch
now catches it and everything the watch catches belongs in this file.

The code reads three things. From a seat's timeline: a destructive command, a secret added or read,
data sent off the machine, a new dependency, a guard or a check changed, a seat repeating itself or
not recovering from a failure, a weakened test or a silenced check, a hand-back after edits the gate
never ran on or called complete over a failed check, and a turn running far longer than usual. From
the lane's own record, the shapes no window can hold because a letter restarts the window: a task
sent back again and again, a lane patching several tasks at once, reviews piling up with nothing
accepted or fanned out with none reconciled, a review told to report only what it is certain of, a
brief that writes the work out instead of setting an outcome, a detour opened late, and a task taken
in although its Peer never said it was finished. And at each decision a seat makes through the desk,
from its own record: an accept with nothing read since the hand-back, a sending-back on a review
that ran nothing, far more test than source, a lane ready with no push-back or over a gate growing
slower, a brief carrying a pasted history, and a review's accept with nothing run.

The watch also asks a model, as `attention.brain` sets it: `sensor`, `seat`, `both` or `off`. The
questions are the patterns in `catalog/patterns.json`, one condition each, put to a seat's words at
each look and at the decisions it makes through the desk. With `both`, the sensor asks each item
first and the Watcher seat judges only what it said yes to, and in a decision what it was unsure of.
Every question and answer is kept in `assessments.log`. Review asks its own checks, in
`catalog/checks.json`, as evidence for the review, not the watch.

Everything goes into one incident book and is read and marked the one way: every incident goes to
the Supervisor, and none ever reaches the seat it is about. The watch only sees and reports; what to
do about it is the Supervisor's.

One thing is worth knowing before trusting it: a condition read from the ledger stands still — a task sent
back three times stays sent back three times — so it is raised once and then only when the record
says something new; the book itself is that memory, so a restart does not raise it again.

Two facts explain most of the blindness, and each is a design choice rather than a defect:

- A letter arrives as a `user_message`, which clears what the watch had noted and restarts its
window (`server/runtime/watch/watches.ts`). No pattern survives a rework round — which is why the
fourth group below is read from the ledger instead, in `server/runtime/watch/history.ts`.
- The window is eighty steps from the last instruction. A lane's history is not in it and never will
be.

---

## 1. Architecture — patching the symptom instead of the foundation

The group signature: the count of "temporary" layers, adapters and exceptions grows faster than what
the system can actually do.

### Architecture Fog
**Rule.** A brief that needs a mechanism nobody has built must say so; a worker that discovers the
hole stops and names it, and does not invent a private stand-in.
**Signs.** "there is no X here", "I'll add a minimal", "for now I'll", "simple version of",
"placeholder until", a new file whose name ends in `-stub`, `-mock`, `-simple`.
**Here.** *asked* — `stand-in`: whether a Peer's words say it builds a stub, mock, placeholder or
simplified version in place of something missing. In code, `architecture` notes a Lead widening a
task past the paths it held. The remedy stays the desk's: a detour lane with its own Lead.

### Brake Pattern
**Rule.** When several defects share one missing mechanism, build the mechanism. Fixing them one by
one is fitting a parachute, a weight and a reverse thruster to a car that has no brakes.
**Signs.** three or more sendings-back in one lane, each fix in a different file; "also fixes",
"same root cause" appearing after the third round.
**Here.** *caught* — `patched-not-fixed`, when a lane has sendings-back over two or more tasks
adding up to `attention.reworksAt` (3). The quote names each task and its count, so the Supervisor
can see whether they share a cause.

### Balloon Pattern
**Rule.** Change the thing and the callers it breaks. A wrapper around a weak foundation is a second
foundation.
**Signs.** "compat", "adapter", "shim", "legacy path", "fallback", "for backward compatibility", a
second copy of state, a mutex added to make two copies agree.
**Here.** *asked* — `wrapper`: whether a Peer's words say it adds a compat layer, adapter, shim,
fallback or a second copy of state. `PEER.md` forbids it in words, and `outside-scope` cannot check
it because that fact fires on where a file is, not on what it is for.
At the plan, *asked* — `staged-plan`, at `add_tasks` and `amend_task`: whether the Lead's tasks
build a stage the end state does not need, a temporary layer, a transition flag or the old and new
ways side by side, with no constraint named that forces it.

### Architecture lock-in
**Rule.** The first design is a proposal. A worker that cannot say what would make it wrong has not
checked it.
**Signs.** absence — no push-back at all across a long lane; "as designed", "per the plan",
"following the existing pattern" as the whole reason.
**Here.** *caught* — `no-pushback`, when a Lead reports its lane ready after
`attention.quietLaneTasks` (4) code tasks with no ask from any of its seats. The ask record is every
push-back a seat made.
In words, *asked* — `unchecked-assumption`: whether a Lead or a Peer builds on a belief about how
the domain or the system behaves that it has not read, run or asked about.

### Priority myopia
**Rule.** Order by what unblocks, not by label. A P2 that is the foundation of a P0 is done first.
**Signs.** a detour lane opened late; a lane whose tasks already have sendings-back when the detour
appears; "we'll come back to", "blocked on, working around it meanwhile".
**Here.** *caught* — `detour-late`, when a detour is opened for a lane whose tasks were already sent
back: `Lane.detourOf` is the record of "this should have come first", and the sendings-back before
it opened are its lateness.

---

## 2. Delegation — turning a capable agent into a confirmation machine

### Pre-solve delegation
**Rule.** Give the goal, the constraints and the evidence required. Do not give the answer and ask
for a yes.
**Example.** The difference is not length. "Move the session store to Redis; the acceptance is that
a restart keeps sessions alive, and you decide the client and the key shape" is a goal. "Use
ioredis, put it in `src/session/redis.ts`, key `sess:<id>`, TTL 3600 — confirm this is right" is an
answer wearing a goal's clothes, and what comes back is agreement, not engineering.
**Signs.** in a brief: "just", "simply", "confirm", "verify that", "the approach is", a file path
and a function name the worker was not asked to choose.
**Here.** *caught in part, and asked* — `brief-prewritten` catches the form that writes the work
out, steps and file names and all. At `add_tasks` and `amend_task` a model is asked the rest:
`pre-solves`, whether the brief tells the Peer which files, functions or approach to use, and
`closed-choice`, whether it offers a fixed set of options.

### Authority gradient
**Rule.** A worker may refuse the framing. A bounded task is not a gag.
**Signs.** "the task says to, so I will", "not in scope to question", shipping something the worker
said was wrong in the same turn.
**Here.** *asked* — `obeys-against-judgement`: whether a Peer's words say it does what the task says
although it said the task is wrong.

### Sycophancy
**Rule.** Agreement that cost nothing is not a check. An answer must name what was read or run.
**Example.** A Lead asks "are you sure the rounding is right?" and the Peer changes the rounding.
The change is the tell: no new command, no new read, no new file between the question and the edit.
The Peer did not check; it deferred. This is why the Supervisor's prompt forbids a question that
carries its own answer, and why "Are you sure?" is banned outright.
**Signs.** "you're right", "good catch", "I'll change it" with no command or read between the
challenge and the change.
**Here.** *asked* — `edit-before-look` notes, without an incident, a turn that changed a file after
an instruction before it read, searched or ran anything, and only on such a turn is a model asked
`defers`: whether the words agree the work was wrong, as in "you're right". Whether the instruction
doubted the work or ordered a change, `instruction_kind`, is asked as review's evidence, not the
watch's.

### Reflexive contrarianism
**Rule.** The opposite failure. A reviewer that never approves is as useless as one that always
does.
**Signs.** every verdict is "changes requested"; findings that are restatements of taste; "I would
have done this differently" as a blocking reason.
**Here.** *caught in part* — the watch reads no Reviewer's turns, but the desk reads a verdict at
the decision it feeds: `rework-unrun`, when a Lead sends a task back on a review that ran nothing. A
reviewer that never approves is in its verdicts, in the hand-back files and on
`Task.handback.outcome`, and nothing counts them.

### Scout-as-Judge
**Rule.** A cheap search finds candidates. It does not decide. Whoever decides must read the
evidence.
**Signs.** "the scan found", "flagged by", a verdict quoting a tool's output and no source.
**Here.** *caught* — `accepted-unread`, when a Lead accepts with nothing read, searched or run since
the task's last hand-back or its review's verdict. The plugin's own shape is the opposite of the
anti-pattern and worth keeping straight: a fact is the scout, whoever marks it reads the record
before judging, and the Supervisor still decides.

---

## 3. Test and proof — the evidence deforms the product

### Legacy-negation debt
**Rule.** Test the contract that holds now. A test whose purpose is to prove an old behaviour is
gone pins history and outlives its reason.
**Signs.** "should no longer", "must not still", "removed in", a test named after a bug number.
**Here.** *asked* — `legacy-test`: whether a Peer's words say a test checks that an old behaviour no
longer happens.

### Proof distorts product
**Rule.** A proof observes the system. It does not reshape it. Logging added to make a demo work, an
interface widened so a test can reach it, a check relaxed so a run goes green — all change the
product to serve the evidence.
**Signs.** "so the test can see it", "exporting for testability", "temporarily disable", a non-test
file edited in the same breath as a failing check.
**Here.** *caught in part, and asked* — `suppressed` fires when an edit adds a suppression such as
`@ts-ignore` or `eslint-disable`, `test-weakened` when a test loses assertions or gains a skip, and
`checker-touched` when an edit changes what checks the work or instructs the agents; `asked_for`
asks, as review's evidence, whether the work asked for it. A model is asked `proof-bends-product`,
whether the words say a product file changes so a test can see or pass it, and `gaming`, whether a
check is made to pass without the behaviour working.

### Flaky false-red
**Rule.** A red that two runs disagree about is not a defect in the code. Find the contention before
changing anything.
**Signs.** the same command passing and failing with no edit between; "retry", "flaky", "timing", a
port or a fixture path in the failure.
**Here.** *desk* — one lane-mode task holds the working copy at a time and parallel tasks get their
own, which removes most of the cause; what remains is two gates contending, recorded in the gate
logs, each named for when it began.

### Test/proof debt
**Rule.** A proof too expensive to run is not a proof. A test that no longer protects the current
contract is a liability that reads as an asset.
**Signs.** gate seconds climbing run over run; "only run this in CI"; a suite nobody ran before
handing back.
**Here.** *caught* — `gate-slowing`, when a lane is reported ready over a gate whose last three runs
each took longer, the last at least `attention.gateSlowerTimes` (2) times the first. The other half,
a test that no longer protects the current contract, has a skill (`test-proof-debt-audit`) and no
detection.

---

## 4. Review — each round makes it worse

This whole group lives on a span the watch cannot see: a rework letter arrives as a message, which
clears what the watch noted and restarts its window.

### Review–fix–review loop
**Rule.** After the second round, stop fixing findings and ask what one mechanism produced them.
**Signs.** round three; each fix local and in a new file; the diff growing every round while the
finding count stays flat.
**Here.** *caught* — `rework-loop`, when one task reaches `attention.reworksAt` (3) sendings-back.
Reported once, and again only when the count moves: the condition stands where an episode would end.

### Non-converging findings
**Rule.** Ten reports of ten symptoms are one question: what is the shared cause? Converge before
fixing.
**Signs.** several reviews on one task, each with its own vocabulary; findings fixed in the order
received.
**Here.** *caught* — `reviews-unconverged`, when `attention.reviewsAt` (3) reviews name one target
that is still neither merged nor cut. Converging is still the Lead's job, and the `council` skill
is where the plugin says how.

### Overengineering edge case
**Rule.** Weigh a finding by impact times probability before building for it. A low-probability P3
does not earn an abstraction.
**Signs.** "to be safe", "in case", "future-proof", a new interface with one implementation, an
option nobody asked for.
**Here.** *caught in part, and asked* — `overbuilt`, at an accept whose change has at least
`attention.testToSourceAt` (5) test lines for each source line, or no source at all; a model is
asked `builds-for-maybe`, whether a Peer's words say it builds for a case nobody asked for.
`Lane.appetite`, what the outcome is worth, is printed in the Lead's directive and read by no code,
and that is the number that would make proportion a judgement rather than a guess.

### False-positive intolerance
**Rule.** Telling a reviewer to report only what it is certain of buys precision with recall, and
the bugs it drops are real.
**Signs.** in a review's focus line: "only if you are certain", "no speculation", "high confidence
only".
**Here.** *caught* — `certainty-only`, on the review task's own focus line. Only then is a model
asked `steered-review`: whether the Lead's own words name a gap the review is not briefed on. The
plugin's own `ultra-review` content pushes the other way, so this fires on a Lead overriding it.

---

## 5. Multi-agent — more of them is not more right

### Debate framing capture
**Rule.** The better-argued position is not the better position.
**Here.** *outside*, and prevented by shape: Peers and Reviewers hold only `done` and `ask`, and a
Lead's message reaches only its own lane, so two workers have no channel in which to capture a
framing from each other.

### Reviewer bias
**Rule.** Judge a verdict by the checks behind it, not by how sharply it is written.
**Signs.** a review hand-back whose `Ran:` line says "nothing", followed by a sending-back.
**Here.** *caught* — `rework-unrun`, when a Lead sends a task back on a review that ran nothing, and
`review-unchecked`, when a review accepts with no command run or with files its change touched never
read, as the Reviewer's own calls show at its `done`. As review's evidence, a model is asked whether
a review that accepts a change under a risk rule ran that rule's invariant. A Lead or the Supervisor
can read a reviewer's turns with `record`.

### Naive chat-room debate
**Rule.** Two models arguing freely is not a council. A council needs sealed positions, a rubric and
someone who reconciles.
**Here.** *outside*, and prevented: every message is a typed letter to one seat, routed by
capability. There is no room and no thread to be naive in.

### Context fan-out
**Rule.** Do not hand every worker the whole history. Give each one the field-shaped brief it needs.
**Signs.** a brief that pastes a transcript; a context field longer than the goal it serves.
**Here.** *caught* — `brief-pasted`, when a brief's context runs past `attention.briefContextChars`
(4000). No transcript is ever forked; each seat is a fresh session with a shaped brief.

### Sub-agent explosion
**Rule.** Every fan-out needs a reconciler named before it starts.
**Signs.** several reviews open on one task with no convergence step; a lane whose running count
climbs while nothing is accepted.
**Here.** *caught in part* — `reviews-fanned`, when `attention.reviewsAt` (3) reviews are open at
once in a lane with none handed back. Only `lead` and `supervise` can seat anyone, which bounds the
shape; within a lane nothing else caps the count.

### Polling waste / lifecycle mismatch
**Rule.** Ask to be woken; do not spin. A worker that says it is done and a supervisor that waits
for idle will wait forever.
**Signs.** repeated status reads with nothing between them; a turn that ends without speaking.
**Here.** *caught, in half its cases* — a turn that ends with no desk call is counted silent, so a
Peer or Reviewer that only polls is nudged, and after two such turns its task stalls and is reported.
But that machinery runs only for seats that work tasks: a Lead or a Supervisor that polls is not
counted at all. It is turned away instead: `sleep` is denied to it wherever its agent can deny it,
and a `status` asked again with nothing changed says only that, and to end the turn.

### Nested protocol confusion
**Rule.** One orchestrator owns lifecycle and authority. Two is neither.
**Here.** *outside* for the nested case — a second framework inside a seat's own harness has its own
lifecycle, for which this plugin has no event. What the kit can refuse, it does: Claude, Codex,
OpenCode and Oh My Pi seats have their subagents off and refuse to start, from their shell, any agent
the kit can seat; Pi has no command rules. The in-plugin case is prevented instead: a Supervisor
reaching past a Lead must emit the letter that tells that Lead.

---

## 6. Harness and planning — the process outweighs the problem

### Planning implement-on-paper
**Rule.** A plan states the outcome, the constraints, the risks and the checkpoints. A plan that
writes the code in Markdown has removed the worker's judgement and still not tested the design.
**Signs.** a brief with numbered implementation steps, function signatures, or file trees; "then
create", "then add a method".
**Here.** *caught* — `brief-prewritten`, on a code task whose goal and context carry a code fence,
or numbered build steps together with a file and a member name, or with a "then create". The tool
description states the intent; this is what notices when a brief ignored it.

### Vague long goal
**Rule.** A goal names something observable. If nobody can say what would show it was met, no agent
can either, and it will burn a budget producing plausible work.
**Signs.** "improve", "clean up", "make it better", "handle edge cases", a goal with no noun a test
could name.
**Here.** *asked* — `vague-goal`, at `add_tasks` and `amend_task`: whether the goal names no outcome
a test or a person could observe. In code, `goal-turned` notes a Lead changing what a task is for.

### Ceremony attention dilution
**Rule.** Every step in a checklist spends attention that the problem needed. Count what the process
asks before adding to it.
**Here.** *outside* — nothing at runtime reads how many steps a seat was told to follow. At build
time, `test/catalog/lint.test.ts` holds each tool description to 60 words and each parameter to 25.
Role prompts have no budget: a prompt is judged by whether its seat works, not by its length.

### Conflicting instruction debt
**Rule.** One rule, one home. A rule in a prompt and again in a tool description will drift, and the
agent will follow whichever it read last.
**Signs.** the same rule in two files; a skill that repeats its prompt; a doc that contradicts a
refusal message.
**Here.** *outside* at runtime, but build-time checks exist: the forbidden-word lint on everything a
role reads; `test/catalog/lint.test.ts`, which fails a skill or delta that names a tool its role
cannot call or a file that is not there, a prompt that names a letter the desk never sends, and seat
text that says mail waits for a turn to end or makes one task a lane's norm; the reference's test,
which holds its tables to the code; and the trigger evaluation that asks a real agent whether each
skill opens on the briefs it should.

### Domain overfitting
**Rule.** A harness built for one domain is a set of assumptions about that domain. Say which,
before using it on another.
**Signs.** a web-shaped gate on an embedded project; a test command that cannot run here; roles
named for a pipeline this project does not have.
**Here.** *outside* — the places domain enters are data: the kit's `catalog/ecosystem.json` (how a
gate is found, the paths kept to one writer, the risk rules and their rehearsals, what counts as a
test or a doc, the watch's patterns) and a project's own gate, one-writer paths and risk rules.
Nothing compares any of it to the project it is used on.

### Black-box workflow
**Rule.** If a bundle changes what an agent does, the person running it must be able to read what it
changed.
**Here.** *outside*, answered by transparency rather than detection: the status page, the event log,
the handbacks, the gate logs and every question put to a model with its answer are all files on
disk. The gap worth naming: the prompt a seat was created with is not among them.

### Teaching discovery
**Rule.** Do not spend a prompt teaching a model to grep. Spend it on what to decide.
**Here.** *outside* and clean — a grep across all six role prompts for search instructions returns
nothing.

### Harness-amplified overengineering
**Rule.** A model already tends to overbuild. A checklist that rewards thoroughness makes it worse.
**Signs.** test lines far above source lines; no source lines changed at all; a diff much larger
than the appetite.
**Here.** *caught* — `overbuilt`, at an accept whose change has at least `attention.testToSourceAt`
(5) test lines for each source line, or no source at all. The lane's appetite, the number that would
make the rest a judgement, is printed once and read by nothing.

---

## 7. Two technical ones

### Tailwind arbitrary-class explosion
**Rule.** Arbitrary values are a missing design system. Count them; when they grow, name the tokens.
**Signs.** `w-[327px]`, `text-[13.5px]`, the same magic value in three files.
**Here.** *outside* — a whole-repository ratio, and the plugin sees one diff at a time.

### ORM N+1
**Rule.** A relation loaded in a loop is one query per row. Load it once.
**Signs.** a query inside a `for`; "it's fine for now, the list is small"; latency proportional to
row count.
**Here.** *outside* — the plugin never runs or profiles the product; its whole view of execution is
a call's exit code and the tail of a gate.

---

## 8. One the list does not have

This one is not from the thirty-five. It is what `paseo-supervision` — a separate Paseo plugin that
watches Lead–Peer communication and nothing else — is built entirely to detect, and reading it made
plain that this plugin had the same hole, and better evidence for it: a named field, not prose.

### Unfinished work accepted, then unwritten
**Rule.** When a worker says it did not finish, taking the work in is a decision, and a decision
needs to be written where the next person will look. Accepting can be the right call — the rest may
be someone else's, or not worth it. What is not right is that the acceptance and what it cost are
recorded in two different places, only one of which anyone reads again.
**Signs.** a hand-back whose first line is `Outcome: partial` or `Outcome: blocked` followed by an
`accept` with no task opened and no note; "we'll come back to it"; "good enough for now"; a lane
reported ready whose tasks each left something.
**Example.** A Peer ends with `Outcome: partial`, and in `leftUndone`: "the retry path has no test —
the only seam that reaches it is private". The Lead accepts, the task merges, the MERGED letter says
the line counts and the gate. The untested retry path now exists only in
`handbacks/L1-T3-1758·.md`, which nothing reads until someone runs the `retrospective` skill — if
anyone ever does.
**Here.** *caught* — `accepted-unfinished`, when a merged task's hand-back says `partial` or
`blocked`. `accept` takes only a task handed back, and the desk refuses an outcome that is not
`complete`, `partial` or `blocked`, so every merged task carries one of the three. `leftUndone` and
`discovered` are deliberately **not** read: what a follow-up would have to establish — that nothing
afterwards carried the raised thing forward — cannot be told from the ledger without a model reading
prose, and no record says it carries on what another left: `Task.of` names only a review's target,
and `Lane.detourOf` only the lane a detour clears the way for. The outcome word is the part that is
structured, so the outcome word is the part that is read.
A model is also asked `withholds-gap` at `done` and `report`: whether the seat's own words say part
of the work does not work, fails or was skipped, when the hand-back or report leaves it out.

---

## What this list is for

The chain these thirty-five share: the framing is wrong or the foundation is missing → the agent is
not allowed to challenge it → it optimises for closing the task → patches, wrappers, tests and
proofs pile up locally → review patches further → the debt grows while the dashboard says done.

So the question to ask before letting an agent fix a list of findings is the one this list was
compiled around: **do these findings share one missing mechanism?**

What the watch detects today is named in `plugin/server/domain/incident.ts` and asked in
`plugin/catalog/patterns.json`; its settings are `attention` in `plugin/shared/settings.ts`.
