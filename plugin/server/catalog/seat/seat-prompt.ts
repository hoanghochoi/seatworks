import { type PromptPaths, renderPrompt, renderText } from "../kit/content.ts";
import type { Kit, RoleSpec } from "../kit/kit.ts";
import { type Team, rulesFor } from "../team/team.ts";

/** The role's prompt on its harness, then what the seat is told of its servers and the Human's rules. */
export function seatPrompt(kit: Kit, team: Team, role: RoleSpec, harness: string, paths: PromptPaths): string {
  return [renderPrompt(kit, role, harness, paths), renderText(role, rulesFor(team, role.role), paths)]
    .map((part) => part.trimEnd())
    .filter(Boolean)
    .join("\n\n");
}
