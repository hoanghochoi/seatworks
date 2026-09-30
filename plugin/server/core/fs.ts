import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Something that is not a link stands where one should go: it is left alone, since deleting it would lose what it holds. */
export class LeftAlone extends Error {}

/** The first folder under `root` that `path` lies in, however this platform separates folders; none when it lies outside. */
export function firstUnder(root: string, path: string): string | undefined {
  const rest = relative(root, path);
  return rest && rest !== ".." && !rest.startsWith(`..${sep}`) && !isAbsolute(rest) ? rest.split(sep)[0] : undefined;
}

/** The one spelling of a folder: absolute, through its links and junctions, and on Windows without regard to case. */
function canonical(path: string): string {
  let real = resolve(path);
  try {
    real = realpathSync.native(real);
  } catch {
    // A path that is not there yet has no links to follow: its resolved spelling is all it has.
  }
  return process.platform === "win32" ? real.toLowerCase() : real;
}

/** Whether two spellings name one folder, whichever separators, case or trailing separator each was written with. */
export function samePath(a: string, b: string): boolean {
  return canonical(a) === canonical(b);
}

export function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Whether anything is at `path`, a dangling link included. */
export function present(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Points `path` at `target`; false when it already did. Throws LeftAlone over anything else at `path`. */
export function ensureLink(path: string, target: string): boolean {
  if (isLink(path)) {
    if (readlinkSync(path) === target) return false;
    unlinkSync(path);
  } else if (present(path)) {
    throw new LeftAlone(`${path} exists and is not a link, so it was left alone`);
  }
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path);
  return true;
}

export function writeIfChanged(path: string, text: string): boolean {
  if (isLink(path)) unlinkSync(path);
  if (present(path) && readFileSync(path, "utf-8") === text) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return true;
}

/** A short hash of every file under each source, in order: the same content hashes the same wherever it lies. */
export function digest(sources: string[]): string {
  const hash = createHash("sha256");
  for (const [index, source] of sources.entries()) {
    if (!existsSync(source)) continue;
    const files = statSync(source).isDirectory()
      ? readdirSync(source, { recursive: true })
          .map(String)
          .filter((file) => statSync(join(source, file)).isFile())
          .sort()
      : [""];
    for (const file of files)
      hash
        .update(`${index}/${file}\0`)
        .update(readFileSync(join(source, file)))
        .update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}
