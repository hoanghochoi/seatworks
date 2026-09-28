import { existsSync } from "node:fs";
import { join } from "node:path";
import { type HarnessSpec, type Kit, type RoleSpec, ownOrShipped } from "./kit.ts";
import { seatedAs } from "./roles.ts";

/** A harness's file for `role`, the state root's own copy first, so a role the owner adds seats without a fork. */
export function harnessFile(kit: Kit, harness: string, source: string, role: RoleSpec): string {
  const path = join("harness", harness, source.replaceAll("ROLE", seatedAs(role)));
  return ownOrShipped(kit.own && join(kit.own, path), join(kit.dir, path));
}

export function roleSettingsFile(kit: Kit, harness: HarnessSpec, role: RoleSpec): string | undefined {
  return harness.settings && harnessFile(kit, harness.id, harness.settings.roleSource, role);
}

export function harnessFileSources(kit: Kit, harness: HarnessSpec, role: RoleSpec): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(harness.files ?? {}).map(([path, sources]) => [
      path,
      sources.map((source) => harnessFile(kit, harness.id, source, role)),
    ]),
  );
}

export function supportsRole(kit: Kit, harness: HarnessSpec, role: RoleSpec): boolean {
  const settings = roleSettingsFile(kit, harness, role);
  return (
    (settings === undefined || existsSync(settings)) &&
    Object.values(harnessFileSources(kit, harness, role)).every((sources) =>
      sources.every((source) => existsSync(source)),
    )
  );
}

/** `allow` disables each of Paseo's tools it omits, so a tool Paseo adds that `catalog/paseo.json` lacks stays on: keep the list in step. */
export function paseoToolsPolicy(
  kit: Kit,
  role: RoleSpec,
): { enabled?: boolean; disabledTools?: string[] } | undefined {
  const policy = role.paseoTools;
  if (!policy) return undefined;
  if (policy.allow) return { disabledTools: kit.paseoTools.filter((tool) => !policy.allow!.includes(tool)) };
  const { allow: _allow, ...rest } = policy;
  return rest;
}
