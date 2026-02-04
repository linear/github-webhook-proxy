/**
 * Payload sanitization for GitHub webhooks.
 * Extracts Linear issue IDs and replaces sensitive content.
 */

import {
  CLOSING_WORDS,
  CONTRIBUTING_WORDS,
  ISSUE_ID_PATTERN,
  LINEAR_URL_PATTERN,
  EVENTS_REQUIRING_SANITIZATION,
} from "./config";

/**
 * Result of extracting issue IDs from text.
 */
export interface ExtractedIssueIds {
  /** Issue IDs that should be closed on merge */
  closes: string[];
  /** Issue IDs that are related but not closed */
  contributes: string[];
  /** Issue IDs with no magic word prefix */
  plain: string[];
}

/**
 * Extracts Linear issue IDs from text, categorized by their magic word prefix.
 *
 * @param text - The text to extract issue IDs from
 * @returns Categorized issue IDs
 */
export function extractIssueIds(text: string): ExtractedIssueIds {
  const closes: string[] = [];
  const contributes: string[] = [];
  const plain: string[] = [];

  // Strip markdown comments which may contain issue IDs we should ignore
  const cleaned = text.replace(/<!--.*?-->/gs, "");

  // Build patterns for magic words followed by issue IDs
  const closingPattern = new RegExp(
    `(${CLOSING_WORDS.join("|")})\\s+([A-Z]{1,7}-\\d{1,9})`,
    "gi"
  );
  const contributingPattern = new RegExp(
    `(${CONTRIBUTING_WORDS.join("|")})\\s+([A-Z]{1,7}-\\d{1,9})`,
    "gi"
  );

  // Extract issue IDs with closing magic words
  for (const match of cleaned.matchAll(closingPattern)) {
    closes.push(match[2].toUpperCase());
  }

  // Extract issue IDs with contributing magic words
  for (const match of cleaned.matchAll(contributingPattern)) {
    contributes.push(match[2].toUpperCase());
  }

  // Extract issue IDs from Linear URLs
  for (const match of cleaned.matchAll(LINEAR_URL_PATTERN)) {
    const id = match[1].toUpperCase();
    if (!closes.includes(id) && !contributes.includes(id)) {
      plain.push(id);
    }
  }

  // Extract standalone issue IDs (no magic word)
  const allIds = [...cleaned.matchAll(ISSUE_ID_PATTERN)].map((m) =>
    m[1].toUpperCase()
  );
  for (const id of allIds) {
    if (!closes.includes(id) && !contributes.includes(id) && !plain.includes(id)) {
      plain.push(id);
    }
  }

  return {
    closes: [...new Set(closes)],
    contributes: [...new Set(contributes)],
    plain: [...new Set(plain)],
  };
}

/**
 * Merges multiple ExtractedIssueIds results, deduplicating across categories.
 * Priority: closes > contributes > plain (an ID in a higher-priority category won't appear in lower ones)
 */
function mergeExtractedIssueIds(...results: ExtractedIssueIds[]): ExtractedIssueIds {
  const closes = new Set<string>();
  const contributes = new Set<string>();
  const plain = new Set<string>();

  // Process all closes first (highest priority)
  for (const result of results) {
    for (const id of result.closes) {
      closes.add(id);
    }
  }

  // Process all contributes (skip if already in closes)
  for (const result of results) {
    for (const id of result.contributes) {
      if (!closes.has(id)) {
        contributes.add(id);
      }
    }
  }

  // Process all plain (skip if already in closes or contributes)
  for (const result of results) {
    for (const id of result.plain) {
      if (!closes.has(id) && !contributes.has(id)) {
        plain.add(id);
      }
    }
  }

  return {
    closes: [...closes],
    contributes: [...contributes],
    plain: [...plain],
  };
}

/**
 * Builds a sanitized body string from extracted issue IDs.
 */
function buildSanitizedBody(ids: ExtractedIssueIds): string {
  const parts: string[] = [];

  if (ids.closes.length > 0) {
    parts.push(`Fixes ${ids.closes.join(", ")}`);
  }
  if (ids.contributes.length > 0) {
    parts.push(`Part of ${ids.contributes.join(", ")}`);
  }
  if (ids.plain.length > 0) {
    parts.push(ids.plain.join(", "));
  }

  return parts.join(". ") || "";
}

/**
 * Sanitizes a PR body by extracting issue IDs and replacing all other content.
 * Note: When used via sanitizePayload, issue IDs from title and branch are also merged in.
 *
 * @param text - The original PR body
 * @returns Sanitized body containing only issue references
 */
export function sanitizeBody(text: string | null): string {
  if (!text) {
    return "";
  }

  return buildSanitizedBody(extractIssueIds(text));
}

/**
 * Sanitizes a PR title by replacing it with a generic identifier.
 *
 * @param repoFullName - The full repository name (org/repo)
 * @param prNumber - The PR number
 * @returns Generic title in the format "org/repo#<number>"
 */
export function sanitizeTitle(repoFullName: string, prNumber: number): string {
  return `${repoFullName}#${prNumber}`;
}

/**
 * Sanitizes a branch name by replacing it with a generic identifier.
 *
 * @param prNumber - The PR number
 * @returns Generic branch name in the format "pr-<number>"
 */
export function sanitizeBranch(prNumber: number): string {
  return `pr-${prNumber}`;
}

/**
 * GitHub webhook payload with pull request data.
 */
interface GitHubPullRequestPayload {
  action?: string;
  repository?: {
    full_name?: string;
  };
  pull_request?: {
    number?: number;
    title?: string;
    body?: string | null;
    head?: {
      ref?: string;
      label?: string;
    };
  };
}

/**
 * Sanitizes a GitHub webhook payload by replacing sensitive fields.
 * Extracts issue IDs from title, body, and branch name, then merges them into the sanitized body.
 *
 * @param event - The GitHub event type
 * @param payload - The webhook payload
 * @returns Sanitized payload
 */
export function sanitizePayload(
  event: string,
  payload: GitHubPullRequestPayload
): GitHubPullRequestPayload {
  // Only sanitize events that need it
  if (!EVENTS_REQUIRING_SANITIZATION.has(event)) {
    return payload;
  }

  // Deep clone to avoid mutating original
  const sanitized = structuredClone(payload);

  const prNumber = sanitized.pull_request?.number;
  const repoFullName = sanitized.repository?.full_name;
  if (!prNumber || !repoFullName) {
    return sanitized;
  }

  // Sanitize PR fields
  if (sanitized.pull_request) {
    // Extract issue IDs from all sources before sanitizing
    const bodyIds = extractIssueIds(sanitized.pull_request.body ?? "");
    const titleIds = extractIssueIds(sanitized.pull_request.title ?? "");
    const branchIds = extractIssueIds(sanitized.pull_request.head?.ref ?? "");

    // Treat branch issue IDs as closing (intent is to fix when branch contains issue ID)
    const branchIdsAsClosing: ExtractedIssueIds = {
      closes: [...branchIds.closes, ...branchIds.contributes, ...branchIds.plain],
      contributes: [],
      plain: [],
    };

    // Merge all extracted IDs (body takes priority, then title, then branch)
    const mergedIds = mergeExtractedIssueIds(bodyIds, titleIds, branchIdsAsClosing);

    // Build sanitized body from merged issue IDs
    if (sanitized.pull_request.body !== undefined) {
      sanitized.pull_request.body = buildSanitizedBody(mergedIds);
    }
    if (sanitized.pull_request.title !== undefined) {
      sanitized.pull_request.title = sanitizeTitle(repoFullName, prNumber);
    }
    if (sanitized.pull_request.head?.ref !== undefined) {
      sanitized.pull_request.head.ref = sanitizeBranch(prNumber);
    }
    if (sanitized.pull_request.head?.label !== undefined) {
      // Label format is "org:branch-name", replace branch portion with sanitized version
      const label = sanitized.pull_request.head.label;
      const colonIndex = label.indexOf(":");
      if (colonIndex !== -1) {
        const org = label.substring(0, colonIndex);
        sanitized.pull_request.head.label = `${org}:${sanitizeBranch(prNumber)}`;
      } else {
        sanitized.pull_request.head.label = sanitizeBranch(prNumber);
      }
    }
  }

  return sanitized;
}
