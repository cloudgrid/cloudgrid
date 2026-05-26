#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { spawn } from "bun";
import { devStackPorts, mergedEnv, parseDotEnv } from "./dev-all.mjs";

const defaultGraceMs = 2_000;

export async function main() {
  const args = new Set(process.argv.slice(2));
  const force = args.has("--force") || args.has("-f");
  const env = mergedEnv(parseDotEnvFile(".env"), process.env);
  const repoRoot = process.cwd();
  const ports = devStackPorts(env);
  const listeners = await listenersForPorts(ports);
  const candidates = uniqueListeners(listeners);

  if (candidates.length === 0) {
    console.log("No CloudGrid dev listeners found.");
    return;
  }

  const targets = [];
  const skipped = [];
  for (const listener of candidates) {
    const cwd = await processCwd(listener.pid);
    const processInfo = { ...listener, cwd };
    if (shouldKillProcess({ cwd, repoRoot, force })) {
      targets.push(processInfo);
    } else {
      skipped.push(processInfo);
    }
  }

  if (skipped.length > 0) {
    console.log("Skipping listeners outside this repository. Use --force to terminate them too:");
    for (const item of skipped) {
      console.log(
        `  - ${item.name}: ${item.port}, ${item.command} pid ${item.pid}, cwd ${item.cwd || "unknown"}`,
      );
    }
  }

  if (targets.length === 0) {
    console.log("No CloudGrid dev processes to stop.");
    return;
  }

  console.log("Stopping CloudGrid dev processes:");
  for (const item of targets) {
    console.log(`  - ${item.name}: ${item.port}, ${item.command} pid ${item.pid}`);
  }

  await terminateTargets(targets);
}

export function shouldKillProcess({ cwd, repoRoot, force }) {
  return force || isInsideRepo(cwd, repoRoot);
}

export function isInsideRepo(cwd, repoRoot) {
  if (!cwd || !repoRoot) {
    return false;
  }
  const resolvedCwd = resolve(cwd);
  const resolvedRoot = resolve(repoRoot);
  return resolvedCwd === resolvedRoot || resolvedCwd.startsWith(`${resolvedRoot}${sep}`);
}

export function plannedSignalSteps() {
  return ["SIGTERM", "SIGKILL"];
}

async function listenersForPorts(ports) {
  const listeners = [];
  for (const [name, port, envName] of ports) {
    for (const listener of await portListeners(port)) {
      listeners.push({ ...listener, name, port, envName });
    }
  }
  return listeners;
}

async function portListeners(port) {
  const proc = spawn(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return output
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [command, pid] = line.trim().split(/\s+/, 2);
      return { command, pid: Number(pid) };
    })
    .filter((item) => Number.isInteger(item.pid) && item.pid > 0);
}

function uniqueListeners(listeners) {
  const seen = new Set();
  const result = [];
  for (const listener of listeners) {
    if (seen.has(listener.pid)) {
      continue;
    }
    seen.add(listener.pid);
    result.push(listener);
  }
  return result;
}

async function processCwd(pid) {
  const proc = spawn(["lsof", "-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  const cwdLine = output.split(/\r?\n/).find((line) => line.startsWith("n"));
  return cwdLine ? cwdLine.slice(1) : "";
}

async function terminateTargets(targets) {
  for (const signal of plannedSignalSteps()) {
    for (const target of targets) {
      try {
        process.kill(target.pid, signal);
      } catch (error) {
        if (error?.code !== "ESRCH") {
          console.error(`Failed to send ${signal} to pid ${target.pid}: ${error}`);
        }
      }
    }
    if (signal === "SIGTERM") {
      await Bun.sleep(defaultGraceMs);
      const remaining = [];
      for (const target of targets) {
        try {
          process.kill(target.pid, 0);
          remaining.push(target);
        } catch (error) {
          if (error?.code !== "ESRCH") {
            remaining.push(target);
          }
        }
      }
      targets = remaining;
      if (targets.length === 0) {
        console.log("Stopped CloudGrid dev processes.");
        return;
      }
    }
  }
  console.log("Stopped CloudGrid dev processes.");
}

function parseDotEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }
  return parseDotEnv(readFileSync(path, "utf8"));
}

if (import.meta.main) {
  await main();
}
