#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { parse as parseYaml } from "yaml";

const root = process.cwd();
const skillsRoot = join(root, "skills");
const errors = [];

for (const entry of readdirSync(skillsRoot).sort()) {
  const skillDir = join(skillsRoot, entry);
  if (!statSync(skillDir).isDirectory()) {
    continue;
  }
  const skillFile = join(skillDir, "SKILL.md");
  if (!existsSync(skillFile)) {
    continue;
  }
  validateSkill(entry, skillFile);
}

validateSkillEvals(join(skillsRoot, "evals", "evals.json"));

if (errors.length > 0) {
  console.error(`Skill check failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Skill check passed");

function validateSkill(directoryName, skillFile) {
  const relativeFile = relative(skillFile);
  const content = readFileSync(skillFile, "utf8");
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    errors.push(`${relativeFile} must start with YAML frontmatter`);
    return;
  }

  const frontmatter = parseYaml(match[1]);
  const body = match[2];
  const name = frontmatter?.name;
  const description = frontmatter?.description;

  if (!/^[a-z0-9-]{1,64}$/.test(name ?? "")) {
    errors.push(
      `${relativeFile} frontmatter name must be 1-64 lowercase letters, numbers, or hyphens`,
    );
  }
  if (name !== directoryName) {
    errors.push(`${relativeFile} frontmatter name must match directory name ${directoryName}`);
  }
  if (/\b(anthropic|claude)\b/.test(name ?? "")) {
    errors.push(`${relativeFile} frontmatter name must not use reserved provider/model words`);
  }
  if (!description || typeof description !== "string") {
    errors.push(`${relativeFile} frontmatter description must be non-empty`);
  } else {
    if (description.length > 1024) {
      errors.push(`${relativeFile} description must be at most 1024 characters`);
    }
    if (/[<>]/.test(description)) {
      errors.push(`${relativeFile} description must not contain XML-like tags`);
    }
    if (!/\bUse when\b/.test(description)) {
      errors.push(`${relativeFile} description must include concrete \"Use when\" trigger context`);
    }
    if (/\b(I can|You can|Use this skill to)\b/.test(description)) {
      errors.push(`${relativeFile} description must be third-person discovery metadata`);
    }
  }

  const bodyLines = body.trimEnd().split("\n").length;
  if (bodyLines > 500) {
    errors.push(`${relativeFile} body has ${bodyLines} lines; keep SKILL.md under 500 lines`);
  }
  if (/\\/.test(body)) {
    errors.push(`${relativeFile} must use forward slash paths, not Windows-style backslashes`);
  }
  if (!/^# /m.test(body)) {
    errors.push(`${relativeFile} body must start with a title heading`);
  }
  if (!/^## /m.test(body)) {
    errors.push(`${relativeFile} body must include clear workflow sections`);
  }
  if (/\blatest\b/i.test(body) && !/mutable `latest`|old patterns/i.test(body)) {
    errors.push(
      `${relativeFile} should avoid time-sensitive \"latest\" guidance unless framed as a forbidden or old pattern`,
    );
  }

  validateMarkdownLinks(relativeFile, skillFile, body);
}

function validateMarkdownLinks(relativeFile, skillFile, body) {
  const links = body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g);
  for (const [, target] of links) {
    if (/^(https?:|mailto:|#)/.test(target)) {
      continue;
    }
    if (target.includes("\\")) {
      errors.push(`${relativeFile} link ${target} must use forward slashes`);
      continue;
    }
    const cleanTarget = target.split("#")[0];
    if (!cleanTarget) {
      continue;
    }
    const normalized = normalize(cleanTarget);
    if (normalized.startsWith("..")) {
      errors.push(`${relativeFile} link ${target} must stay inside the skill directory`);
      continue;
    }
    const depth = normalized.split(sep).length;
    if (depth > 2) {
      errors.push(
        `${relativeFile} link ${target} is too deeply nested; keep references one level from SKILL.md`,
      );
    }
    const resolved = join(skillFile, "..", normalized);
    if (!existsSync(resolved)) {
      errors.push(`${relativeFile} link ${target} does not resolve`);
    }
  }
}

function validateSkillEvals(evalFile) {
  const relativeFile = relative(evalFile);
  if (!existsSync(evalFile)) {
    errors.push(`${relativeFile} must exist with real skill evaluation prompts`);
    return;
  }
  const evals = JSON.parse(readFileSync(evalFile, "utf8"));
  if (!Array.isArray(evals.evals) || evals.evals.length < 3) {
    errors.push(`${relativeFile} must contain at least three skill evaluation prompts`);
    return;
  }
  for (const item of evals.evals) {
    if (!Number.isInteger(item.id)) {
      errors.push(`${relativeFile} eval is missing an integer id`);
    }
    if (!item.prompt || typeof item.prompt !== "string") {
      errors.push(`${relativeFile} eval ${item.id ?? "unknown"} is missing a prompt`);
    }
    if (!item.expected_output || typeof item.expected_output !== "string") {
      errors.push(`${relativeFile} eval ${item.id ?? "unknown"} is missing expected_output`);
    }
    if (!Array.isArray(item.files)) {
      errors.push(`${relativeFile} eval ${item.id ?? "unknown"} files must be an array`);
    }
    if (!Array.isArray(item.assertions) || item.assertions.length === 0) {
      errors.push(`${relativeFile} eval ${item.id ?? "unknown"} must include objective assertions`);
    }
  }
}

function relative(file) {
  return file.slice(root.length + 1);
}
