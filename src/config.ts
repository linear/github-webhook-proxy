/**
 * Configuration for the GitHub webhook sanitization proxy.
 */

/**
 * Event whitelist - only these event/action combinations are forwarded to Linear.
 * All other events return 200 (to prevent GitHub retries) but are not forwarded.
 */
export const ALLOWED_EVENTS: Record<string, string[]> = {
  pull_request: [
    "opened",
    "reopened",
    "closed",
    "converted_to_draft",
    "ready_for_review",
    "review_requested",
    "review_request_removed",
    "assigned",
    "unassigned",
    "edited",
    "synchronize",
    "enqueued",
    "dequeued",
  ],
  pull_request_review: ["submitted", "edited", "dismissed"],
  installation: ["created", "deleted"],
  installation_repositories: ["added", "removed"],
  repository: ["renamed", "archived", "unarchived", "transferred"],
  check_suite: ["completed"],
};

/**
 * Events that require payload sanitization.
 * Other whitelisted events are passed through without modification.
 */
export const EVENTS_REQUIRING_SANITIZATION = new Set([
  "pull_request",
  "pull_request_review",
]);

/**
 * Magic words that indicate the PR should close the linked issue on merge.
 */
export const CLOSING_WORDS = [
  "close",
  "closes",
  "closed",
  "closing",
  "fix",
  "fixes",
  "fixed",
  "fixing",
  "resolve",
  "resolves",
  "resolved",
  "resolving",
  "complete",
  "completes",
  "completed",
  "completing",
];

/**
 * Magic words that indicate the PR contributes to an issue without closing it.
 */
export const CONTRIBUTING_WORDS = [
  "ref",
  "refs",
  "references",
  "part of",
  "related to",
  "relates to",
  "contributes to",
  "towards",
  "toward",
];

/**
 * Pattern to match Linear issue IDs (e.g., ENG-123, LIN-456).
 * Team key: 1-7 alphanumeric characters
 * Number: 1-9 digits
 */
export const ISSUE_ID_PATTERN = /\b([A-Z]{1,7}-\d{1,9})\b/gi;

/**
 * Pattern to match Linear URLs containing issue IDs.
 */
export const LINEAR_URL_PATTERN =
  /https:\/\/linear\.app\/[\w-]+\/issue\/([A-Z]{1,7}-\d{1,9})/gi;
