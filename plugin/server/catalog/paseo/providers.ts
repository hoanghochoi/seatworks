import { type Json, isRecord, sameJson } from "../../core/json.ts";
import { nodeBin } from "../../core/paths.ts";
import type { ConfigPatch, DaemonConfig } from "../../core/ports.ts";
import { paseoToolsPolicy, supportsRole } from "../kit/harness-files.ts";
import type { HarnessSpec, Kit, RoleSpec } from "../kit/kit.ts";
import { providerId } from "../kit/roles.ts";
import type { RoleSeat } from "../team/role-seats.ts";
import type { Team } from "../team/team.ts";

/** Keys the kit sets on a provider only when it wants them, so one it stops wanting is taken off. */
const PROVIDER_OPTIONAL = ["command", "models", "additionalModels", "paseoTools", "description"];

function labelFor(kit: Kit, role: RoleSpec, harness: HarnessSpec): string {
  const tag = kit.prefix.replace(/[-_]+$/, "");
  const base = `${role.label} · ${harness.label}`;
  return tag ? `${base} (${tag})` : base;
}

export function seatPairs(kit: Kit): { role: RoleSpec; harness: HarnessSpec }[] {
  const pairs: { role: RoleSpec; harness: HarnessSpec }[] = [];
  for (const role of kit.roles) {
    for (const harness of Object.values(kit.harnesses))
      if (supportsRole(kit, harness, role)) pairs.push({ role, harness });
  }
  return pairs;
}

/**
 * Paseo lets a provider extend only an agent of its own or `acp`, so a seat on a provider the owner set up takes what
 * that one extends, runs and is given.
 */
function baseOf(
  held: DaemonConfig["providers"],
  harness: HarnessSpec,
): { extends: string; command?: unknown; env: Json } {
  const own = held?.[harness.baseProvider];
  if (!own || typeof own.extends !== "string") return { extends: harness.baseProvider, env: {} };
  return { extends: own.extends, command: own.command, env: isRecord(own.env) ? own.env : {} };
}

/** A seat's provider as the kit wants it over the providers Paseo holds, starting on the model its team chose. */
export function desiredProvider(kit: Kit, seat: RoleSeat, held: DaemonConfig["providers"] = {}): Json {
  const { role, harness, model } = seat;
  const base = baseOf(held, harness);
  const entry: Json = {
    extends: base.extends,
    label: labelFor(kit, role, harness),
    env: { ...base.env, ...(harness.provider.env ?? {}), SEATWORKS_ROLE: role.role, SEATWORKS_KIT: kit.dir },
  };
  if (role.description) entry.description = role.description;
  // NODE is the daemon's own node, which runs the kit's scripts alike on every platform.
  const command = (harness.provider.command ?? []).map((part) =>
    part === "NODE" ? nodeBin() : part.replaceAll("KIT", kit.dir),
  );
  if (command.length > 0) entry.command = command;
  else if (base.command !== undefined) entry.command = base.command;
  if (model) entry.additionalModels = [{ id: model.id, label: model.label, isDefault: true }];
  const tools = paseoToolsPolicy(kit, role);
  if (tools) entry.paseoTools = tools;
  return entry;
}

/** One provider per role and the agent it has in each team, as the first team to seat it wants it. */
function wantedProviders(kit: Kit, teams: Team[], held: DaemonConfig["providers"]): Map<string, Json> {
  const wanted = new Map<string, Json>();
  for (const team of teams)
    for (const seat of Object.values(team.roles)) {
      const id = providerId(kit, seat.role.role, seat.harness.id);
      if (!wanted.has(id)) wanted.set(id, desiredProvider(kit, seat, held));
    }
  return wanted;
}

function managedEnvKeys(kit: Kit): Set<string> {
  const keys = new Set<string>();
  for (const harness of Object.values(kit.harnesses)) {
    keys.add(harness.configDirEnv);
    for (const key of Object.keys(harness.provider.env ?? {})) keys.add(key);
  }
  return keys;
}

/**
 * The provider as the kit wants it over the one Paseo holds: env the owner added stays, and the env keys the kit
 * manages follow the kit.
 */
function merged(have: Json, want: Json, managed: Set<string>): Json {
  const env = Object.entries(isRecord(have.env) ? have.env : {});
  const kept = Object.fromEntries(env.filter(([key]) => !key.startsWith("SEATWORKS_") && !managed.has(key)));
  const next: Json = { ...have, ...want, env: { ...kept, ...(want.env as Json) } };
  for (const key of PROVIDER_OPTIONAL) if (!(key in want)) delete next[key];
  return next;
}

/** Whether `next` holds every key `have` does, at every depth, as a patch must for Paseo's merge to leave `next`. */
function covers(next: Json, have: Json): boolean {
  return Object.entries(have).every(
    ([key, value]) => key in next && (!isRecord(value) || !isRecord(next[key]) || covers(next[key], value)),
  );
}

/**
 * The patches, in order, that give Paseo the providers the attached projects' teams seat on, and no profile of the
 * kit's. `keep` names providers a live seat still runs on, left as they are; `stale` is what would go without it.
 */
export function providerPatches(
  config: DaemonConfig,
  kit: Kit,
  teams: Team[],
  keep: Set<string> = new Set(),
): { patches: ConfigPatch[]; changed: string[]; stale: string[] } {
  const held = config.providers ?? {};
  const wanted = wantedProviders(kit, teams, held);
  const changed: string[] = [];
  const ours = (id: unknown): id is string =>
    Boolean(kit.prefix) && typeof id === "string" && id.startsWith(kit.prefix);
  const stale = Object.keys(held).filter((id) => ours(id) && !wanted.has(id));
  const removed = stale.filter((id) => !keep.has(id));
  for (const id of removed) changed.push(`provider ${id} removed`);
  const managed = managedEnvKeys(kit);
  const providers: Record<string, Json> = {};
  for (const [id, want] of wanted) {
    const have = held[id];
    const next = merged(have ?? {}, want, managed);
    if (have && sameJson(next, have)) continue;
    // A held key the kit does not want cannot be patched away, so the provider is removed and added again whole.
    if (have && !covers(next, have)) removed.push(id);
    providers[id] = next;
    changed.push(`provider ${id}`);
  }
  const profiles = config.agentProfiles ?? [];
  const kept = profiles.filter((profile) => !ours(profile.id));
  for (const profile of profiles) if (ours(profile.id)) changed.push(`profile ${profile.id} removed`);
  const patches: ConfigPatch[] = [];
  const dropping = kept.length < profiles.length;
  if (removed.length > 0 || dropping)
    patches.push({
      ...(removed.length > 0 ? { removeProviders: removed } : {}),
      ...(dropping ? { agentProfiles: kept } : {}),
    });
  // One provider a patch: Paseo refuses a whole patch for one provider it cannot hold, such as one on an agent it lacks.
  for (const [id, next] of Object.entries(providers)) patches.push({ providers: { [id]: next } });
  return { patches, changed, stale };
}
