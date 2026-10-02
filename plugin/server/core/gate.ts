import { spawn, spawnSync } from "node:child_process";
import { closeSync, fstatSync, mkdirSync, openSync, readSync, statSync, writeSync } from "node:fs";
import { dirname } from "node:path";

type GateResult = {
  ok: boolean;
  code: number | null;
  timedOut: boolean;
  stopped: boolean;
  seconds: number;
  tail: string;
};

const WINDOWS = process.platform === "win32";
const TAIL_LINES = 40;
const TAIL_CHARS = 3000;

function tailOf(text: string): string {
  const kept = text.trimEnd().split(/\r?\n/).slice(-TAIL_LINES).join("\n");
  return kept.length > TAIL_CHARS ? kept.slice(-TAIL_CHARS) : kept;
}

/**
 * Kills the gate's whole process group, or on Windows its process tree: a leftover watcher, dev server or `&` job would
 * keep writing into the lane's copy and the log.
 */
function killGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    if (WINDOWS) spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    else process.kill(-pid, "SIGKILL");
  } catch {
    // Nothing of the group was left to kill.
  }
}

/** Reads only the tail: a gate log can grow past what a whole-file read survives. Drops a partial first line. */
export function lastBytes(file: string, limit = 64 * 1024): string {
  try {
    const size = statSync(file).size;
    const from = Math.max(0, size - limit);
    const buffer = Buffer.alloc(Math.min(size, limit));
    const fd = openSync(file, "r");
    try {
      readSync(fd, buffer, 0, buffer.length, from);
    } finally {
      closeSync(fd);
    }
    const text = buffer.toString("utf-8");
    return from === 0 ? text : text.slice(text.indexOf("\n") + 1);
  } catch {
    return "";
  }
}

/** Runs `command` in its own process group, killed whole on timeout, on `stop`, or once the command itself exits. */
export function runGate(
  command: string,
  cwd: string,
  logFile: string,
  timeoutMs: number,
  stop?: AbortSignal,
  env: Record<string, string> = {},
): Promise<GateResult> {
  mkdirSync(dirname(logFile), { recursive: true });
  const started = Date.now();
  const fd = openSync(logFile, "w");
  const head = `$ ${command}\n`;
  writeSync(fd, head);
  return new Promise((resolve) => {
    // Straight to the log fd: a pipe would be inherited by leftover processes and hold "close" open indefinitely.
    const child = spawn(command, {
      cwd,
      env: { ...process.env, CI: "1", ...env },
      shell: true,
      detached: !WINDOWS,
      windowsHide: true,
      stdio: ["ignore", fd, fd],
    });
    const ended = { timedOut: false, stopped: false };
    const kill = (why: keyof typeof ended) => {
      ended[why] = true;
      killGroup(child.pid);
    };
    const timer = setTimeout(() => kill("timedOut"), timeoutMs);
    const onStop = () => kill("stopped");
    let answered = false;
    const finish = (code: number | null, said?: string) => {
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      stop?.removeEventListener("abort", onStop);
      killGroup(child.pid);
      // A red gate's tail is all its reader sees: one that printed nothing says so, rather than showing nothing.
      if (said) note(fd, `${said}\n`);
      else if (code !== 0 && logSize(fd) <= Buffer.byteLength(head))
        note(fd, `(the command printed nothing and exited ${code ?? "on a signal"})\n`);
      closeLog(fd);
      resolve(verdict(code, ended, started, logFile));
    };
    if (stop?.aborted) onStop();
    else stop?.addEventListener("abort", onStop, { once: true });
    child.on("error", (error) => finish(127, `the command could not be started: ${error.message}`));
    // exit, not close: the command's own answer, whatever it left running behind it.
    child.on("exit", (code, signal) => finish(code ?? (signal ? null : 0)));
  });
}

function verdict(
  code: number | null,
  { timedOut, stopped }: { timedOut: boolean; stopped: boolean },
  started: number,
  logFile: string,
): GateResult {
  const seconds = Math.round((Date.now() - started) / 1000);
  return {
    ok: code === 0 && !timedOut && !stopped,
    code,
    timedOut,
    stopped,
    seconds,
    tail: tailOf(lastBytes(logFile)),
  };
}

function logSize(fd: number): number {
  try {
    return fstatSync(fd).size;
  } catch {
    // A log that cannot be read is no proof the command printed nothing.
    return Infinity;
  }
}

function note(fd: number, text: string): void {
  try {
    writeSync(fd, text);
  } catch {
    // The log is closed already: the verdict still carries the exit code.
  }
}

function closeLog(fd: number): void {
  try {
    closeSync(fd);
  } catch {
    // Closed already: the log holds what was written.
  }
}
