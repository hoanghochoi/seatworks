import { oneLine } from "../../core/text.ts";
import type { Lane } from "../../domain/lane.ts";
import type { Ledger } from "../../domain/ledger.ts";
import type { Task } from "../../domain/task.ts";
import { SETTLED } from "../../domain/task.ts";
import { type Fact, type FactKind, fact } from "../../domain/incident.ts";

type LaneFact = { seat: string; fact: Fact };

type Reading = {
  reworksAt: number;
  reviewsAt: number;
  certainty: RegExp;
  prewritten: { code: RegExp; step: RegExp; then: RegExp; fileMember: RegExp };
};

const READ_AT_MOST = 4000;

const UNFINISHED = new Set(["partial", "blocked"]);

const MOST_NAMED = 5;

const reworksOf = (task: Task): number => task.reworks ?? 0;
const settled = (task: Task): boolean => SETTLED.includes(task.status);

/** Whether a brief hands over an answer to be typed in rather than an outcome to be reached. */
function prewritten(text: string, { code, step, then, fileMember }: Reading["prewritten"]): boolean {
  const read = text.slice(0, READ_AT_MOST);
  if (!read.trim()) return false;
  if (code.test(read)) return true;
  if (!step.test(read)) return false;
  return then.test(read) || fileMember.test(read);
}

type LaneRecord = { lane: Lane; here: Task[]; ledger: Ledger; reading: Reading };

type Found = [FactKind, string] | undefined;

/**
 * What a lane's history shows that no turn window can. One fact per kind per lane, naming every task: incidents key on
 * seat and kind, and the exact quote is how a standing condition is not raised again.
 */
export function deskFacts(ledger: Ledger, reading: Reading): LaneFact[] {
  const tasks = Object.values(ledger.tasks);
  return Object.values(ledger.lanes)
    .filter((lane) => lane.status === "open" && lane.lead)
    .flatMap((lane) => {
      const record = { lane, here: tasks.filter((task) => task.lane === lane.id), ledger, reading };
      return LANE_FACTS.map((find) => find(record))
        .filter((found): found is [FactKind, string] => found !== undefined)
        .map(([kind, quote]) => ({ seat: lane.lead!, fact: fact(kind, quote) }));
    });
}

/**
 * One task going round: each sending-back is a local fix to what the last one did not settle. The words name the loop,
 * not how far it has gone, so a loop marked noise stays marked as it goes on; another task looping is new.
 */
function reworkLoop({ here, reading }: LaneRecord): Found {
  const looping = here.filter((task) => !settled(task) && reworksOf(task) >= reading.reworksAt);
  if (looping.length === 0) return undefined;
  return [
    "rework-loop",
    looping
      .map((task) => `${task.id} (${task.title}) has been sent back ${reading.reworksAt} times or more`)
      .join("; "),
  ];
}

/** The lane going round: several tasks sent back is one missing foundation patched task by task. */
function patchedNotFixed({ here, reading }: LaneRecord): Found {
  const patched = here.filter((task) => !settled(task) && reworksOf(task) > 0);
  const sendings = patched.reduce((total, task) => total + reworksOf(task), 0);
  if (patched.length < 2 || sendings < reading.reworksAt) return undefined;
  // The tasks, not the count, are the evidence: another sending-back of the same tasks is the same hole.
  return [
    "patched-not-fixed",
    `${patched.length} tasks still open in this lane were sent back, ${reading.reworksAt} times or more between them: ${patched.map((task) => task.id).join(", ")}`,
  ];
}

/** A hand-back that said partial or blocked, accepted all the same: nothing else records the Lead taking it in. */
function acceptedUnfinished({ here }: LaneRecord): Found {
  const unfinished = here.filter((task) => task.status === "merged" && UNFINISHED.has(task.handback?.outcome ?? ""));
  if (unfinished.length === 0) return undefined;
  const named = unfinished.slice(0, MOST_NAMED);
  const rest = unfinished.length - named.length;
  return [
    "accepted-unfinished",
    `${named.map((task) => `${task.id} (${task.title}) was accepted after its Peer handed it back ${task.handback?.outcome}`).join("; ")}${rest > 0 ? `; and ${rest} more in this lane` : ""}`,
  ];
}

function reviewsUnconverged({ here, ledger, reading }: LaneRecord): Found {
  const reviews = new Map<string, Task[]>();
  for (const task of here)
    if (task.kind === "review" && task.of) reviews.set(task.of, [...(reviews.get(task.of) ?? []), task]);
  const unconverged = [...reviews].filter(
    ([target, rounds]) =>
      rounds.length >= reading.reviewsAt && !(ledger.tasks[target] && settled(ledger.tasks[target])),
  );
  if (unconverged.length === 0) return undefined;
  return [
    "reviews-unconverged",
    unconverged
      .map(
        ([target, rounds]) =>
          `${rounds.length} reviews of ${target} (${ledger.tasks[target]?.title ?? "gone"}), which is ${ledger.tasks[target]?.status ?? "gone"}: ${rounds.map((task) => task.handback?.outcome ?? task.status).join(", ")}`,
      )
      .join("; "),
  ];
}

/** A review asked for certainty reports less than it found, and what it drops is real. */
function certaintyOnly({ here, reading }: LaneRecord): Found {
  const timid = here.filter(
    (task) => task.kind === "review" && reading.certainty.test(task.goal.slice(0, READ_AT_MOST)),
  );
  if (timid.length === 0) return undefined;
  return [
    "certainty-only",
    timid
      .map((task) => `${task.id} asks its reviewer for only what it is sure of: ${oneLine(task.goal, 120)}`)
      .join("; "),
  ];
}

/** A brief that carries the answer gets agreement back, not engineering. */
function briefPrewritten({ here, reading }: LaneRecord): Found {
  const typed = here.filter(
    (task) =>
      task.kind === "code" && !settled(task) && prewritten(`${task.goal}\n${task.context ?? ""}`, reading.prewritten),
  );
  if (typed.length === 0) return undefined;
  return [
    "brief-prewritten",
    typed
      .map(
        (task) =>
          `${task.id}'s brief writes the work out rather than setting an outcome: ${oneLine(task.context?.trim() || task.goal, 120)}`,
      )
      .join("; "),
  ];
}

/** A detour opened only after this lane's tasks were sent back: what should have come first came late. */
function detourLate({ lane, here, ledger }: LaneRecord): Found {
  const late = Object.values(ledger.lanes).flatMap((detour) => {
    if (detour.detourOf !== lane.id) return [];
    const before = here.filter((task) => (task.sentBack ?? []).some((sent) => sent.at < detour.openedAt));
    return before.length > 0
      ? [
          `${detour.id} was opened to clear the way for this lane after ${before.map((task) => task.id).join(", ")} had been sent back`,
        ]
      : [];
  });
  return late.length > 0 ? ["detour-late", late.join("; ")] : undefined;
}

/** Reviews fanned out with nobody reconciling them: as many open at once as make a pile, none handed back. */
function reviewsFanned({ here, reading }: LaneRecord): Found {
  const open = here.filter((task) => task.kind === "review" && !task.handback && !settled(task));
  if (open.length < reading.reviewsAt) return undefined;
  return [
    "reviews-fanned",
    `${open.length} reviews open at once, none handed back: ${open.map((task) => task.id).join(", ")}`,
  ];
}

/** Each fact the record can show of a lane, in the order they are raised. */
const LANE_FACTS = [
  reworkLoop,
  patchedNotFixed,
  acceptedUnfinished,
  reviewsUnconverged,
  certaintyOnly,
  briefPrewritten,
  detourLate,
  reviewsFanned,
];
