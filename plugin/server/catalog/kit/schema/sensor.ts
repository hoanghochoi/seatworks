import { z } from "zod";
import { AttentionChoice } from "../../../../shared/settings.ts";
import { Json, text } from "./fields.ts";

/** `catalog/attention.json`: every watch threshold and pattern with its default, which a settings layer may override. */
export const AttentionFile = AttentionChoice.required().extend({ sensor: z.string() });

const SensorProviderFile = z.strictObject({
  id: text,
  label: text,
  key: text.optional(),
  url: z.url({ protocol: /^https$/, error: "is not an https address" }).optional(),
  model: text.optional(),
  terms: text.optional(),
  body: Json.optional(),
  timeoutSeconds: z.number().min(1).max(30).optional(),
  retries: z.number().int().min(0).max(3).optional(),
});

/** A model the watch may ask over HTTP; `key` names the secret it takes, which the machine settings keep. */
export const SensorFile = z
  .strictObject({
    id: text,
    label: text,
    key: text,
    url: z.url({ protocol: /^https$/, error: "is not an https address" }),
    model: text,
    terms: text,
    body: Json.optional(),
    timeoutSeconds: z.number().min(1).max(30),
    retries: z.number().int().min(0).max(3),
    defaultProvider: text.optional(),
    providers: z.array(SensorProviderFile).min(1).optional(),
  })
  .superRefine((sensor, context) => {
    if (!sensor.providers) return;
    const ids = new Set(sensor.providers.map((provider) => provider.id));
    if (ids.size !== sensor.providers.length)
      context.addIssue({ code: "custom", path: ["providers"], message: "has duplicate provider ids" });
    if (!sensor.defaultProvider || !ids.has(sensor.defaultProvider))
      context.addIssue({ code: "custom", path: ["defaultProvider"], message: "does not name one of its providers" });
  });

/** A field the code fills is null in `instructions` until the moment it is asked at fills it; `question` is the question itself. */
const Instructions = z.union([
  text,
  z
    .record(z.string(), text.nullable())
    .refine((fields) => typeof fields.question === "string", { error: "names no question" }),
]);

const unit = z.number().min(0).max(1);

/** The facts the code raises at a turn's end that open a question about that turn. */
const Facts = z.array(text).min(1).optional();

/**
 * One condition: at or above `yes` it holds, at or below `no` it does not, between is unclear. `acts` names each fact that
 * opens a question about an act, and the act as it asks it, with the fact's own words where `{quote}` is.
 */
const Condition = z
  .strictObject({
    type: z.literal("condition"),
    instructions: Instructions,
    criteria: z.strictObject({ true: text, false: text }),
    acts: z.record(z.string(), text.includes("{quote}")).optional(),
    facts: Facts,
    yes: unit,
    no: unit,
  })
  .refine((check) => check.no < check.yes, { error: "no must sit below yes" });

/** One of several answers, taken at `sure` or more and unclear below; `after` names who an instruction must come from for it to be asked. */
const Pick = z
  .strictObject({
    type: z.literal("pick"),
    instructions: Instructions,
    criteria: z.record(z.string(), text),
    facts: Facts,
    sure: unit,
    after: z.array(text).optional(),
  })
  .refine((check) => Object.keys(check.criteria).length >= 2, { error: "a pick needs two criteria or more" });

/** `catalog/checks.json`: the questions the watch asks a sensor, by name. */
export const ChecksFile = z.record(
  z.string().regex(/^[a-z][a-z_]*$/, { error: "is not a lowercase name" }),
  z.discriminatedUnion("type", [Condition, Pick]),
);

/**
 * What the brains read a seat's own words for: whom it watches, what it reads, the sensor's one-condition question on an
 * item's `text`, the first stage every pattern has, and the seat's on what the sensor flagged, the signs a yes needs, and its
 * level. With `tools` it is judged only at those desk calls, on the call and the words that led to it, and never in a
 * look; `each: "rule"` asks it once for each line of the concept file and of what the work asks, the line in `rule`;
 * `missingFrom: "call"` has a yes on the words hold only where the call itself answers no; and `joins` names a fact
 * whose open incident a yes adds its quote to rather than opening one of its own.
 */
const Pattern = z
  .strictObject({
    title: text,
    watches: z.array(text).min(1),
    reads: z.array(z.enum(["thought", "said", "call"])).min(1),
    instructions: text.includes("`text`"),
    seat: text,
    criteria: z.strictObject({ true: text, false: text }),
    gate: z.array(z.enum(["stuck", "reworked", "handed-back", "edit-before-look", "certainty-only"])).optional(),
    tools: z.array(text).min(1).optional(),
    each: z.literal("rule").optional(),
    missingFrom: z.literal("call").optional(),
    joins: text.optional(),
    level: z.enum(["attend", "note"]).optional(),
    next: text.optional(),
    yes: unit,
    no: unit,
  })
  .refine((pattern) => pattern.no < pattern.yes, { error: "has no that is not below yes" })
  .refine((pattern) => !pattern.reads.includes("call") || pattern.tools, {
    error: "reads a desk call but names no tool it is judged at",
  })
  .refine((pattern) => !pattern.missingFrom || pattern.reads.includes(pattern.missingFrom), {
    error: "weighs its words against a call it does not read",
  })
  .refine((pattern) => !pattern.each || (pattern.tools && pattern.seat.includes("`rule`")), {
    error: "is asked each rule, but only at a decision, naming `rule`",
  });

/** `catalog/patterns.json`: the patterns the watch's brains read for, each by its id, which is also its signal's. */
export const PatternsFile = z.record(z.string().regex(/^[a-z][a-z-]*$/), Pattern);
