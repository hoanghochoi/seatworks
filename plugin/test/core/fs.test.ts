import assert from "node:assert/strict";
import { mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { join, sep } from "node:path";
import { test } from "node:test";
import { samePath } from "../../server/core/fs.ts";
import { tempDir } from "../tempdir.ts";

test("a seat's folder is the copy whichever way Paseo spells it, and a folder beside or inside it never is", () => {
  const copy = join(realpathSync(tempDir("sw2-same-")), "copy");
  mkdirSync(join(copy, "src"), { recursive: true });
  const windows = process.platform === "win32";

  assert.ok(samePath(copy, copy + sep), "a trailing separator");
  assert.ok(samePath(copy, join(copy, "src", "..")), "a step back out");
  if (windows) {
    assert.ok(samePath(copy.replaceAll("\\", "/"), copy), "forward slashes where Windows writes backslashes");
    assert.ok(samePath(copy.toUpperCase(), copy.toLowerCase()), "another case, which Windows does not tell apart");
    const missing = join(copy, "not-yet");
    assert.ok(
      samePath(missing.toUpperCase(), missing),
      "and of a folder not made yet, which has no real spelling to read",
    );
  } else assert.ok(!samePath(copy.toUpperCase(), copy), "another case names another folder where case counts");

  const link = join(copy, "..", "link");
  symlinkSync(copy, link, windows ? "junction" : "dir");
  assert.ok(samePath(link, copy), "a junction or link to the copy");

  assert.ok(!samePath(join(copy, "src"), copy), "a folder inside the copy");
  assert.ok(!samePath(join(copy, "..", "other"), copy), "a folder beside it, there or not");
  assert.ok(!samePath(`${copy}-old`, copy), "a folder whose name only starts the same");
});
