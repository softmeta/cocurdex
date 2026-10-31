import type { SkillManifestIssue } from "@cocurdex/shared";
import { parse } from "yaml";

export const SKILL_FILE_NAME = "SKILL.md";
export const SKILL_NAME_MAX_LENGTH = 64;
export const SKILL_DESCRIPTION_MAX_LENGTH = 1024;

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONTMATTER_PATTERN = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export interface SkillManifest {
  name: string | null;
  description: string | null;
  license: string | null;
  issues: SkillManifestIssue[];
}

function readFrontmatter(content: string): Record<string, unknown> | null {
  const match = FRONTMATTER_PATTERN.exec(content);
  if (!match) {
    return null;
  }
  try {
    const value = parse(match[1] ?? "");
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function trimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isValidSkillName(name: string) {
  return name.length <= SKILL_NAME_MAX_LENGTH && SKILL_NAME_PATTERN.test(name);
}

function nameIssues(
  name: string | null,
  directoryName: string,
): SkillManifestIssue[] {
  if (!name) {
    return ["missingName"];
  }
  if (name.length > SKILL_NAME_MAX_LENGTH) {
    return ["nameTooLong"];
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    return ["invalidName"];
  }
  return name === directoryName ? [] : ["nameMismatch"];
}

function descriptionIssues(description: string | null): SkillManifestIssue[] {
  if (!description) {
    return ["missingDescription"];
  }
  return description.length > SKILL_DESCRIPTION_MAX_LENGTH
    ? ["descriptionTooLong"]
    : [];
}

export function parseSkillManifest(
  content: string,
  directoryName: string,
): SkillManifest {
  const frontmatter = readFrontmatter(content);
  if (!frontmatter) {
    return {
      name: null,
      description: null,
      license: null,
      issues: ["missingFrontmatter"],
    };
  }
  const name = trimmedString(frontmatter.name);
  const description = trimmedString(frontmatter.description);
  return {
    name,
    description,
    license: trimmedString(frontmatter.license),
    issues: [
      ...nameIssues(name, directoryName),
      ...descriptionIssues(description),
    ],
  };
}
