import type { PluginTheme } from "@getpaseo/plugin";
import {
  SettingsAction,
  SettingsInput,
  type SettingsInputHandle,
  SettingsRow,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import { type ReactElement, type RefObject, useRef, useState } from "react";
import { Text } from "react-native";
import { KEPT, type Layer } from "../../../shared/settings.ts";
import type { CatalogView, TeamView } from "../../../shared/views.ts";
import { sourceLabel } from "./source.ts";
import { setAttention, setSensorProvider, sourceOf, withKey } from "../../model/layer.ts";
import { Rows } from "../kit/card.tsx";
import { TabBar } from "../kit/tab-bar.tsx";
import { FONT, SPACE } from "../kit/theme.ts";

type Props = {
  catalog: CatalogView;
  team: TeamView;
  values: Layer;
  machine: Layer;
  layer: "machine" | "project";
  theme: PluginTheme;
  disabled: boolean;
  role: CatalogView["roles"][number];
  rows: ReactElement[];
  save: (change: (values: Layer) => Layer) => Promise<boolean>;
};

type Sensor = CatalogView["sensors"][number];
type ProviderCatalog = NonNullable<CatalogView["sensorProviders"]>[string];

type Draft = { typed: string; setDraft: (text: string) => void; field: RefObject<SettingsInputHandle | null> };

/** Rows, not a component, since the card borders each child it gets; `asks` says what a paid call is spent on. */
export function keyRows(
  {
    catalog,
    sensor,
    values,
    machine,
    layer,
    theme,
    disabled,
    save,
    role,
  }: Pick<Props, "catalog" | "values" | "machine" | "layer" | "theme" | "disabled" | "save" | "role"> & {
    sensor: Sensor;
  },
  { typed, setDraft, field }: Draft,
  asks: string,
): ReactElement[] {
  const providers = catalog.sensorProviders?.[sensor.id];
  const providerId = activeProviderId(sensor, values, machine, providers);
  const provider = providers?.options.find((option) => option.id === providerId);
  const key = provider?.key ?? sensor.key;
  const selectedModel = provider?.model ?? sensor.model;
  const selectedTerms = provider?.terms ?? sensor.terms;
  const keptFor = (entry: { key?: string; keyProvider?: string } | undefined) =>
    entry?.key === KEPT && (entry.keyProvider ?? providers?.default) === providerId;
  const kept = keptFor(values.sensor?.[sensor.id]) || keptFor(machine.sensor?.[sensor.id]);
  const write = (key: string | null) => {
    void save((current) => withKey(current, sensor.id, key, providerId)).then((saved) => {
      // The typed key is the owner's only copy, so it is cleared only once saved.
      if (!saved) return;
      setDraft("");
      field.current?.replaceText("");
    });
  };
  const model = (
    <SettingsRow key="sensor" label="Sensor" hint={`From catalog/sensor. ${selectedTerms}`}>
      <Text style={{ color: theme.colors.foreground, fontSize: 14 }}>{selectedModel}</Text>
    </SettingsRow>
  );
  if (layer === "project") {
    return [
      <SettingsRow
        key="key"
        label={key}
        hint={`Kept on this machine for every project. Add, replace or forget it under Machine defaults, on the ${role.label}.`}
      >
        <Text style={{ color: kept ? theme.colors.foreground : theme.colors.statusWarning, fontSize: 14 }}>
          {kept ? "set" : "not set"}
        </Text>
      </SettingsRow>,
      model,
    ];
  }
  return [
    <SettingsInput
      key="key"
      ref={field}
      label={key}
      hint={
        kept
          ? "Kept on this machine and never shown again. Type another to replace it."
          : `${sensor.label} asks nothing without one.`
      }
      secureTextEntry
      onChangeText={setDraft}
      disabled={disabled}
    />,
    <SettingsAction
      key="save"
      label={kept ? "Replace the key" : "Save the key"}
      hint={`A key starts paid calls, ${asks}.`}
      actionLabel="Save key"
      onPress={() => write(typed)}
      disabled={disabled || typed.length === 0}
    />,
    ...(kept
      ? [
          <SettingsAction
            key="forget"
            label="Forget the key"
            hint={`${sensor.label} asks nothing more until there is a key again.`}
            actionLabel="Forget key"
            onPress={() => write(null)}
            disabled={disabled}
          />,
        ]
      : []),
    model,
  ];
}

/** Inside a judging role's line: which brains read what the watch sees, then the sensor's key and this seat's agent. */
export function JudgeRows(props: Props) {
  const { catalog, team, values, machine, layer, theme, disabled, role, rows, save } = props;
  const [draft, setDraft] = useState("");
  const field = useRef<SettingsInputHandle>(null);
  const { brain } = team.attention;
  const sensor = catalog.sensors.find((entry) => entry.id === team.attention.sensor);
  const providers = sensor ? catalog.sensorProviders?.[sensor.id] : undefined;
  const providerId = sensor ? activeProviderId(sensor, values, machine, providers) : undefined;
  const selectedProvider = providers?.options.find((option) => option.id === providerId);
  const named = sensor?.label ?? "The sensor";
  const options = [
    { id: "off", label: "Off" },
    { id: "sensor", label: named },
    { id: "seat", label: `${role.label} seat` },
    { id: "both", label: "Both" },
  ];
  const reads = brain === "sensor" || brain === "both";
  const judges = brain === "seat" || brain === "both";
  const note = judges
    ? `One ${role.label} per project, seated under the Supervisor when it first has something to judge, and let go once no lane is open.${brain === "both" ? ` It judges only what ${named} flags or leaves unsure.` : ""}`
    : `No ${role.label} is seated. What is set for the ${role.label} seat is kept for when it judges again.`;
  return (
    <Rows theme={theme}>
      <SettingsRow
        label="Brains"
        hint={`Which brains read what the watch's eye sees. Both: ${named} sifts, the ${role.label} judges. ${sourceLabel(
          sourceOf(values, machine, (entry) => entry.attention?.brain, layer),
          layer,
        )}.`}
      >
        <TabBar
          theme={theme}
          active={brain}
          disabled={disabled}
          onPick={(next) => void save((current) => setAttention(current, { brain: next as typeof brain }))}
          tabs={options}
        />
      </SettingsRow>
      {sensor && providers && providers.options.length > 1 ? (
        layer === "machine" ? (
          <SettingsSelect
            label="Provider"
            hint={`Where ${sensor.label} sends the watch's decision request. The API key is kept per machine.`}
            value={providerId ?? providers.default}
            options={providers.options.map((option) => ({ label: option.label, value: option.id }))}
            onValueChange={(next) => void save((current) => setSensorProvider(current, sensor.id, next))}
            disabled={disabled}
          />
        ) : (
          <SettingsRow label="Provider" hint="Choose this under This machine → Defaults for new projects.">
            <Text style={{ color: theme.colors.foreground, fontSize: 14 }}>{selectedProvider?.label ?? "Unknown"}</Text>
          </SettingsRow>
        )
      ) : null}
      {reads && sensor
        ? keyRows(
            { ...props, sensor },
            { typed: draft.trim(), setDraft, field },
            "one at each moment the watch asks about",
          )
        : null}
      {judges ? rows : null}
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: FONT.small, padding: SPACE.lg }}>{note}</Text>
    </Rows>
  );
}

function activeProviderId(
  sensor: Sensor,
  values: Layer,
  machine: Layer,
  providers?: ProviderCatalog,
): string | undefined {
  const chosen = values.sensor?.[sensor.id]?.provider ?? machine.sensor?.[sensor.id]?.provider ?? providers?.default;
  return providers?.options.some((option) => option.id === chosen) ? chosen : providers?.default;
}
