import { errorText } from "../../core/errors.ts";
import type { Answer, Judge, Judgement, Question } from "../../core/ports.ts";
import type { Project } from "../project/project.ts";
import { recordEvent } from "./event-log.ts";
import { appendRecord } from "./records.ts";

/** Where a judge's answers are kept, and the event saying one could not be asked: the watch's apart from review's. */
export type Assessments = { log: "assessments" | "reviews"; unasked: "watch.unasked" | "review.unasked" };

export const WATCH: Assessments = { log: "assessments", unasked: "watch.unasked" };

/** What an answer is kept beside: about whom and which of theirs, by which judge, and what it read. */
type About = { subject: string; episode: string; by: string; state: Record<string, unknown> } & Record<string, unknown>;

/** A question folded into a newer case that asks it again: the newer keeps the answer, so this one keeps nothing. */
export class Folded extends Error {}

/** Whether a condition holds: at or above `yes` it does, at or below `no` it does not, and between is unclear. */
export function holds(spec: { yes: number; no: number }, answer: Answer | undefined): "yes" | "no" | "unclear" {
  const yes = answer && "likely" in answer ? answer.likely : undefined;
  return yes === undefined ? "unclear" : yes >= spec.yes ? "yes" : yes <= spec.no ? "no" : "unclear";
}

export function keepUnasked(project: Project, where: Assessments, about: About, why: string): void {
  appendRecord(
    project.state,
    where.log,
    `${JSON.stringify({ at: new Date().toISOString(), ...about, unasked: why })}\n`,
  );
  recordEvent(project, { kind: where.unasked, subject: about.subject, by: about.by, error: why });
}

/** Asks `judge` and keeps what it answered for labels, with what `read` makes of it, or why it could not answer. */
export async function askKept(
  project: Project,
  where: Assessments,
  about: About,
  judge: Judge,
  questions: Record<string, Question>,
  read: (judged: Judgement) => Record<string, unknown> = () => ({}),
): Promise<Judgement | undefined> {
  const at = new Date().toISOString();
  try {
    const judged = await judge.ask(about.state, questions);
    const { model, tokens, answers, why } = judged;
    appendRecord(
      project.state,
      where.log,
      `${JSON.stringify({ at, ...about, questions, model, tokens, answers, why, ...read(judged) })}\n`,
    );
    return judged;
  } catch (error) {
    if (!(error instanceof Folded)) keepUnasked(project, where, { ...about, questions }, errorText(error));
    return undefined;
  }
}
