import assert from "node:assert/strict";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import type { StreamMessage } from "../../server/adapters/paseo/stream.ts";
import type { Rules } from "../../server/runtime/watch/facts.ts";
import { again, editCall, fixture, kinds, opening, piRow, play, rules, watchOver } from "./seat-replay.ts";

/** An edit of `filePath` at `seq`, its detail set as each row needs. */
const edit = (callId: string, seq: number, detail: Record<string, unknown>) =>
  again(editCall(), callId, seq, (given) => Object.assign(given, detail));

/** An edit as Codex records one, a unified diff and nothing else. */
const patch = (unifiedDiff: string) =>
  again(editCall(), "p", 2, (detail) => {
    for (const key of Object.keys(detail)) if (key !== "type") delete detail[key];
    Object.assign(detail, { type: "edit", filePath: "test/a.test.ts", unifiedDiff });
  });

/** A whole-file call on test/a.test.ts, as Claude records a Read or a Write. */
const file = (name: string, seq: number, detail: Record<string, unknown>) =>
  ({
    event: {
      type: "timeline",
      item: {
        type: "tool_call",
        callId: `${name}${seq}`,
        name,
        status: "completed",
        detail: { filePath: "/work/test/a.test.ts", ...detail },
      },
      turnId: "t",
    },
    seq,
    epoch: fixture("pi")[1]!.epoch,
  }) as StreamMessage;

const shell = (callId: string, seq: number, command: string, exitCode?: number) =>
  again(piRow(11), callId, seq, (detail) =>
    Object.assign(detail, { command, ...(exitCode === undefined ? {} : { exitCode }) }),
  );

const turn = (...messages: StreamMessage[]): StreamMessage[] => [
  { event: { type: "turn_started", turnId: "t" } },
  fixture("pi")[1]!,
  ...messages,
  { event: { type: "turn_completed", turnId: "t" } },
];

test("an edit is read for weakened tests, silenced checks and writes outside the seat's scope", () => {
  const weakened = edit("e1", 2, {
    filePath: "test/strings.test.ts",
    oldString: "assert.equal(a, 1);\nassert.equal(b, 2);",
    newString: "assert.equal(a, 1);",
  });
  const silenced = edit("e2", 3, {
    filePath: "src/a.ts",
    oldString: "const x = f();",
    newString: "// @ts-ignore\nconst x = f();",
  });
  assert.deepEqual(
    play([...opening(), weakened, silenced], rules())
      .filter((fact) => fact.level === "attend")
      .map((fact) => [fact.kind, fact.quote]),
    [
      ["test-weakened", "test/strings.test.ts: 2 assertions become 1"],
      ["suppressed", "src/a.ts: adds @ts-ignore"],
    ],
  );
  const renamed = edit("e", 2, {
    filePath: "test/a.test.ts",
    oldString: 'it("should add", () => { assert.equal(add(1, 1), 2); });',
    newString: 'it("adds", () => { assert.equal(add(1, 1), 2); });',
  });
  assert.deepEqual(kinds(play([...opening(), renamed], rules())), [], "a test's title saying should is no assertion");

  const header = "--- a/test/a.test.ts\n+++ b/test/a.test.ts\n";
  const unified = `${header}@@ -1,3 +1,2 @@\n assert.equal(a, 1);\n-assert.equal(b, 2);\n+// later\n`;
  assert.deepEqual(kinds(play([...opening(), patch(unified)], rules())), ["test-weakened"]);
  const cut = `${header}@@ -1,2 +1,2 @@\n assert.equal(a, 1);\n-assert.equal(b, 2);\n...[truncated 900 chars]`;
  assert.deepEqual(
    kinds(play([...opening(), patch(cut)], rules())),
    [],
    "a Codex diff cut short is not read as assertions removed",
  );

  const read = file("Read", 2, {
    type: "read",
    content: "assert.equal(a, 1);\nassert.equal(b, 2);\n// eslint-disable-next-line\n",
  });
  const rewrite = file("Write", 3, { type: "write", content: "assert.equal(a, 1);\n// eslint-disable-next-line\n" });
  assert.deepEqual(
    kinds(play([...opening(), read, rewrite], rules())),
    ["test-weakened"],
    "a whole-file rewrite is read against what the seat last read, and the eslint-disable it had is not new",
  );
  assert.deepEqual(kinds(play([...opening(), rewrite], rules())), [], "a write with no before weakens nothing");

  const prose = edit("d", 2, { filePath: "README.md", oldString: "", newString: "Add // @ts-ignore above it." });
  const second = edit("e", 3, {
    filePath: "src/b.ts",
    oldString: "// eslint-disable-next-line\nf();",
    newString: "// eslint-disable-next-line\nf();\n// Pass it as any other value.\n// @ts-ignore\ng();",
  });
  assert.deepEqual(
    play([...opening(), prose, second], rules()).map((fact) => [fact.kind, fact.quote]),
    [["suppressed", "src/b.ts: adds @ts-ignore"]],
    "a suppression in prose is not one, and the one quoted is the one added",
  );

  const scoped = rules({ cwd: "/var/folders/xy/T/work", temp: "/var/folders/xy/T", scope: ["src/pricing"] });
  const writes = [
    edit("m", 2, { filePath: "/var/folders/xy/T/msg" }),
    edit("k", 3, { filePath: "/Users/me/.ssh/config" }),
    edit("o", 4, { filePath: "/var/folders/xy/T/work/src/pricing/rates.ts" }),
    edit("s", 5, { filePath: "/var/folders/xy/T/work/lib/x.ts" }),
  ];
  assert.deepEqual(
    play([...opening(), ...writes], scoped).map((fact) => [fact.kind, fact.quote]),
    [
      ["outside-scope", "/Users/me/.ssh/config"],
      ["outside-scope", "/var/folders/xy/T/work/lib/x.ts"],
    ],
    "temp scratch and a directory of its scope are in; elsewhere, and a copy lying in temp outside its scope, are out",
  );

  const checkers = [
    edit("c1", 2, { filePath: "/work/vitest.config.ts", oldString: "a", newString: "b" }),
    edit("c2", 3, { filePath: "/work/.github/workflows/ci.yml", oldString: "a", newString: "b" }),
    edit("c3", 4, { filePath: "/work/AGENTS.md", oldString: "a", newString: "b" }),
    edit("c4", 5, { filePath: "/work/src/config.ts", oldString: "a", newString: "b" }),
  ];
  assert.deepEqual(
    play([...opening(), ...checkers], rules({ cwd: "/work" }))
      .filter((fact) => fact.kind === "checker-touched")
      .map((fact) => fact.quote),
    [
      "vitest.config.ts: a file the gate or the instructions read",
      ".github/workflows/ci.yml: a file the gate or the instructions read",
      "AGENTS.md: a file the gate or the instructions read",
    ],
    "a change to what checks the work, or to what tells agents how, is a fact; the code the checks read is not",
  );

  // A Peer's first turn starts before start_task places it, so an empty first read must not be kept.
  let placed = false;
  const told = watchOver(() => ({
    rules: rules({ cwd: "/work", scope: placed ? ["src/a.ts"] : undefined }),
    handedBack: () => undefined,
    heard: () => true,
    placed,
  }));
  assert.deepEqual(kinds(told([...opening(), edit("b1", 2, { filePath: "/work/src/b.ts" })])), []);
  placed = true;
  assert.deepEqual(
    told([edit("b2", 3, { filePath: "/work/src/b.ts" })]).map((fact) => [fact.kind, fact.quote]),
    [["outside-scope", "/work/src/b.ts"]],
    "what a seat is watched against is read again until the ledger has placed it",
  );
});

test("a hand-back is read against what the turn ran after its last edit", () => {
  const wrote = edit("w", 2, { filePath: "src/a.ts" });
  const gated = rules({ gates: ["npm test"] });
  const claimed = (messages: StreamMessage[], handed?: string) =>
    play(turn(...messages), gated, handed)
      .filter((fact) => fact.kind === "claim-contradicted")
      .map((fact) => [fact.level, fact.quote]);
  const red = shell("g", 3, "npm test", 1);
  assert.deepEqual(claimed([wrote, red], "complete"), [
    ["attend", "handed back as complete, but `npm test` failed the last time it ran, after the last edit"],
  ]);
  assert.deepEqual(claimed([wrote, red], "partial"), [], "a partial hand-back does not say it works");
  assert.deepEqual(claimed([wrote, red]), [], "and a turn that handed nothing back said nothing");
  assert.deepEqual(claimed([wrote, red, shell("g2", 4, "npm test", 0)], "complete"), [], "it passed in the end");
  assert.deepEqual(
    claimed([wrote, red, edit("w2", 4, { filePath: "src/b.ts" })], "complete"),
    [],
    "an edit after it leaves the claim unchecked, not contradicted",
  );

  const unverified = (messages: StreamMessage[], given = gated, handedBack = true) =>
    kinds(play(turn(...messages), given, handedBack ? "complete" : undefined)).filter((kind) => kind === "unverified");
  assert.deepEqual(unverified([wrote]), ["unverified"], "files written and the gate never run after them");
  assert.deepEqual(unverified([wrote, shell("g", 3, "npm test")]), []);
  assert.deepEqual(unverified([wrote], gated, false), [], "a turn that reported nothing claimed nothing");
  // The runner the gate's script starts is the gate too, on one module's tests as on all of them.
  assert.deepEqual(
    unverified(
      [wrote, shell("g", 3, 'node --test "test/text/slug.test.js"')],
      rules({ gates: ["npm test", "node --test"] }),
    ),
    [],
  );

  const inCopy = rules({ gates: ["npm test"], cwd: "/work" });
  const written = edit("w", 2, { filePath: "/work/src/a.ts" });
  const gate = shell("g", 3, "npm test");
  assert.deepEqual(
    unverified([written, gate, edit("m", 4, { filePath: "/var/folders/xy/T/msg" })], inCopy),
    [],
    "a commit message written to the temp directory is not a write the gate has to see",
  );
  // A hand-back that only wrote docs after the gate was told it had not run the tests.
  assert.deepEqual(unverified([written, gate, edit("d", 4, { filePath: "/work/docs/cart.md" })], inCopy), []);

  const secret = "GITHUB_TOKEN=ghp_0123456789abcdefghijklmn npm test";
  const masked = play(turn(wrote), rules({ gates: [secret] }), "complete").find((fact) => fact.kind === "unverified");
  assert.doesNotMatch(masked!.quote, /ghp_0123/, "the gate named in the fact is masked like any other quote");
});

test("an edit that adds a string shaped like a secret, or a read of a secret file, is paged without quoting it", () => {
  const key = ["sk", "proj", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4"].join("-");
  const facts = play(
    [
      ...opening(),
      edit("e1", 2, {
        filePath: "src/client.ts",
        oldString: "const key = process.env.KEY;",
        newString: `const key = "${key}";`,
      }),
      file("Read", 3, { type: "read", filePath: "/work/.env", content: "KEY=1" }),
      edit("e2", 4, { filePath: "src/other.ts", oldString: "a", newString: "b" }),
      // One already there is not added by an edit beside it.
      edit("e3", 5, {
        filePath: "src/kept.ts",
        oldString: `const key = "${key}";`,
        newString: `export const key = "${key}";`,
      }),
    ],
    rules(),
  ).filter((fact) => fact.kind === "secret");
  assert.deepEqual(
    facts.map((fact) => [fact.level, fact.quote]),
    [
      ["page", "src/client.ts: adds a string shaped like a secret"],
      ["page", "read /work/.env"],
    ],
  );
});

test("an edit that adds an entry to a dependency manifest is noted, and one that changes the rest is not", () => {
  const dependency = (oldString: string, newString: string) =>
    play([...opening(), edit("e1", 2, { filePath: "package.json", oldString, newString })], rules())
      .filter((fact) => fact.kind === "dependency")
      .map((fact) => fact.quote);
  assert.deepEqual(dependency('"zod": "^4.6.4"', '"zod": "^4.6.4",\n    "left-pad": "^1.3.0"'), [
    'package.json: adds "left-pad": "^1.3.0"',
  ]);
  assert.deepEqual(dependency('"version": "1.0.0"', '"version": "2.0.0"'), [], "a version is not a dependency");
  assert.deepEqual(dependency('"test": "node --test"', '"test": "node --test test/"'), [], "nor a script");
});

test("an edit to a file that fences what a seat may do is paged", () => {
  const guards = (filePath: string) =>
    play([...opening(), edit("e1", 2, { filePath, oldString: '"deny"', newString: '"allow"' })], rules())
      .filter((fact) => fact.kind === "guard")
      .map((fact) => fact.quote);
  assert.deepEqual(guards(".claude/settings.local.json"), [
    ".claude/settings.local.json: a file that fences what the seat may do",
  ]);
  assert.deepEqual(guards("src/settings.json"), []);
});

test("a check weakened another way: an expected value changed, a product file told to exit or skip, a runner's own set-up changed", () => {
  const weakened = (filePath: string, oldString: string, newString: string) =>
    play([...opening(), edit("e1", 2, { filePath, oldString, newString })], rules())
      .filter((fact) => fact.kind === "test-weakened" || fact.kind === "checker-touched")
      .map((fact) => `${fact.kind}: ${fact.quote}`);
  assert.deepEqual(weakened("test/cart.test.ts", "assert.equal(total, 2900);", "assert.equal(total, 2899);"), [
    "test-weakened: test/cart.test.ts: an expected value changed in `assert.equal(total, 2899);`",
  ]);
  assert.deepEqual(
    weakened("test/cart.test.ts", "assert.equal(total, 2900);", "assert.equal(cart.total(), 2900);"),
    [],
    "what is checked may change; what it must be is the tell",
  );
  assert.deepEqual(weakened("src/main.py", "run()", "raise SkipTest('later')\nrun()"), [
    "test-weakened: src/main.py: a product file gains `raise SkipTest('later')`",
  ]);
  assert.deepEqual(weakened("src/cli.js", "main();", "process.exit(0);\nmain();"), [
    "test-weakened: src/cli.js: a product file gains `process.exit(0);`",
  ]);
  assert.deepEqual(weakened("tests/conftest.py", "a = 1", "a = 2"), [
    "checker-touched: tests/conftest.py: a file the gate or the instructions read",
  ]);
});

test("a hand-back that names a command as run, when no call since its instruction ran it, is contradicted by the record", () => {
  const claimed = (summary: string, ...messages: StreamMessage[]) =>
    play(turn(edit("w", 2, { filePath: "src/a.ts" }), ...messages), rules(), { outcome: "complete", summary })
      .filter((fact) => fact.kind === "claim-contradicted")
      .map((fact) => fact.quote);
  assert.deepEqual(claimed("Totals fixed; `npm run lint` and `npm test` pass."), [
    "says `npm run lint` ran, and no call since its instruction ran it",
  ]);
  assert.deepEqual(claimed("Totals fixed; `npm test` passes.", shell("g", 3, "npm test")), []);
  assert.deepEqual(
    claimed("Totals fixed; `npm test` passes.", shell("g", 3, "cd pkg && npm test -- --reporter dot")),
    [],
    "a command run as part of a longer one ran",
  );
  assert.deepEqual(claimed("Renamed `totalOf` to `sum`."), [], "a name in backticks that is no command claims no run");
});

test("a write outside what a seat holds asks for attention, and so does any product file a Lead writes", () => {
  const outside = (filePath: string, given: Rules) =>
    play([...opening(), edit("e", 2, { filePath })], given)
      .filter((fact) => fact.kind === "outside-scope")
      .map((fact) => [fact.level, fact.quote]);
  assert.deepEqual(outside("/elsewhere/x.ts", rules({ cwd: "/work" })), [["attend", "/elsewhere/x.ts"]]);
  const lead = rules({ cwd: "/work", lead: true, temp: "/var/folders/xy/T" });
  assert.deepEqual(outside("/work/src/cart.ts", lead), [["attend", "/work/src/cart.ts"]]);
  assert.deepEqual(outside("/work/docs/plan.md", lead), [], "its notes and plans are prose");
  assert.deepEqual(outside("/var/folders/xy/T/probe.mjs", lead), [], "and its scratch is its own");
  const copy = resolve(sep, "work");
  const plans = rules({ cwd: copy, scope: ["docs/plans/active/**"] });
  assert.deepEqual(
    outside(join(copy, "docs", "plans", "active", "master-plan.md"), plans),
    [],
    "a scope written with / holds a path this platform writes with its own separator",
  );
  assert.equal(outside(join(copy, "src", "app.ts"), plans).length, 1);
});
