import type { Fact } from "../../domain/incident.ts";
import type { Project } from "../project/project.ts";
import type { DeskServices } from "../services.ts";
import { WATCH, askKept, holds } from "../store/assessments.ts";
import type { Placed } from "./notice.ts";

type Clearing = Pick<DeskServices, "kit" | "teamFor" | "sensorFor">;

/**
 * The facts left once the watch's sensor has been asked each check that clears one of their kind about its own words: a
 * sure no books none, and any other answer, or none, books it as the code saw it.
 */
export async function uncleared(
  services: Clearing,
  project: Project,
  seat: { id: string },
  place: Placed,
  facts: Fact[],
): Promise<Fact[]> {
  const checks = Object.entries(services.kit.checks).flatMap(([id, check]) =>
    check.type === "condition" && check.clears ? [{ id, check, clears: check.clears }] : [],
  );
  const sensor = services.teamFor(project).brains.sensor;
  const judge = sensor?.key ? services.sensorFor(sensor.sensor, sensor.key) : undefined;
  if (!sensor || !judge || !facts.some((found) => checks.some(({ clears }) => clears.includes(found.kind))))
    return facts;
  const { task, lane } = place;
  const work = task
    ? { goal: task.goal, out_of_scope: task.outOfScope }
    : lane
      ? { goal: lane.outcome, out_of_scope: lane.outOfScope }
      : {};
  const kept = await Promise.all(
    facts.map(async (found) => {
      const asked = checks.filter(({ clears }) => clears.includes(found.kind));
      if (asked.length === 0) return found;
      const questions = Object.fromEntries(
        asked.map(({ id, check }) => [
          id,
          { type: "condition" as const, instructions: check.instructions as string, criteria: check.criteria },
        ]),
      );
      const about = { subject: task?.id ?? lane?.id ?? seat.id, episode: found.kind, by: sensor.id };
      const state = { quote: found.quote, ...work };
      const judged = await askKept(project, WATCH, { ...about, state }, judge, questions);
      const clear = judged && asked.some(({ id, check }) => holds(check, judged.answers[id]) === "no");
      return clear ? undefined : found;
    }),
  );
  return kept.filter((found): found is Fact => found !== undefined);
}
