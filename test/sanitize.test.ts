import { describe, expect, test } from "bun:test";
import {
  extractIssueIds,
  sanitizeBody,
  sanitizeTitle,
  sanitizeBranch,
  sanitizePayload,
} from "../src/sanitize";

describe("extractIssueIds", () => {
  test("extracts standalone issue IDs", () => {
    const result = extractIssueIds("Working on ENG-123 and LIN-456");
    expect(result.plain).toEqual(["ENG-123", "LIN-456"]);
    expect(result.closes).toEqual([]);
    expect(result.contributes).toEqual([]);
  });

  test("extracts issue IDs with closing keywords", () => {
    const result = extractIssueIds("This fixes ENG-123 and closes LIN-456");
    expect(result.closes).toEqual(["ENG-123", "LIN-456"]);
    expect(result.plain).toEqual([]);
  });

  test("extracts issue IDs with contributing keywords", () => {
    const result = extractIssueIds("Part of ENG-123, refs LIN-456");
    expect(result.contributes).toEqual(["ENG-123", "LIN-456"]);
    expect(result.plain).toEqual([]);
  });

  test("handles mixed keywords", () => {
    const result = extractIssueIds(
      "Fixes ENG-123, part of ENG-456, also ENG-789"
    );
    expect(result.closes).toEqual(["ENG-123"]);
    expect(result.contributes).toEqual(["ENG-456"]);
    expect(result.plain).toEqual(["ENG-789"]);
  });

  test("ignores issue IDs in markdown comments", () => {
    const result = extractIssueIds("Fixes ENG-123 <!-- ignore ENG-456 -->");
    expect(result.closes).toEqual(["ENG-123"]);
    expect(result.plain).toEqual([]);
  });

  test("deduplicates issue IDs", () => {
    const result = extractIssueIds("Fixes ENG-123 and also fixes ENG-123");
    expect(result.closes).toEqual(["ENG-123"]);
  });

  test("handles Linear URLs", () => {
    const result = extractIssueIds(
      "See https://linear.app/myteam/issue/ENG-123"
    );
    expect(result.plain).toEqual(["ENG-123"]);
  });

  test("handles empty text", () => {
    const result = extractIssueIds("");
    expect(result.closes).toEqual([]);
    expect(result.contributes).toEqual([]);
    expect(result.plain).toEqual([]);
  });

  test("handles text with no issue IDs", () => {
    const result = extractIssueIds("Just a regular PR description");
    expect(result.closes).toEqual([]);
    expect(result.contributes).toEqual([]);
    expect(result.plain).toEqual([]);
  });

  test("handles various keyword forms", () => {
    const result = extractIssueIds(
      "fixed ENG-1, closing ENG-2, resolved ENG-3, completing ENG-4"
    );
    expect(result.closes).toEqual(["ENG-1", "ENG-2", "ENG-3", "ENG-4"]);
  });
});

describe("sanitizeBody", () => {
  test("replaces body with extracted issue IDs", () => {
    const body = `
      This PR fixes ENG-123 and resolves ENG-456.

      Also adds logging for debug@company.com

      Customer: ACME Corp
    `;
    const result = sanitizeBody(body);
    expect(result).toBe("Fixes ENG-123, ENG-456");
  });

  test("includes contributing issues", () => {
    const body = "Part of ENG-123, fixes ENG-456";
    const result = sanitizeBody(body);
    expect(result).toBe("Fixes ENG-456. Part of ENG-123");
  });

  test("includes plain issue IDs", () => {
    const body = "Working on ENG-123";
    const result = sanitizeBody(body);
    expect(result).toBe("ENG-123");
  });

  test("returns empty string for null", () => {
    expect(sanitizeBody(null)).toBe("");
  });

  test("returns empty string for text with no issues", () => {
    expect(sanitizeBody("Just a description")).toBe("");
  });
});

describe("sanitizeTitle", () => {
  test("returns generic PR title with org/repo format", () => {
    expect(sanitizeTitle("acme/webapp", 123)).toBe("acme/webapp#123");
    expect(sanitizeTitle("org/repo", 1)).toBe("org/repo#1");
    expect(sanitizeTitle("my-org/my-repo", 99999)).toBe("my-org/my-repo#99999");
  });
});

describe("sanitizeBranch", () => {
  test("returns generic branch name", () => {
    expect(sanitizeBranch(123)).toBe("pr-123");
    expect(sanitizeBranch(1)).toBe("pr-1");
    expect(sanitizeBranch(99999)).toBe("pr-99999");
  });
});

describe("sanitizePayload", () => {
  test("sanitizes pull_request event", () => {
    const payload = {
      action: "opened",
      repository: {
        full_name: "acme/webapp",
      },
      pull_request: {
        number: 456,
        title: "Fix auth bug for ACME Corp",
        body: "This fixes ENG-123 and resolves ENG-456.\nCC: john@company.com",
        head: {
          ref: "fix/eng-123-auth-bug-for-acme",
        },
      },
    };

    const result = sanitizePayload("pull_request", payload);

    expect(result.pull_request?.title).toBe("acme/webapp#456");
    expect(result.pull_request?.body).toBe("Fixes ENG-123, ENG-456");
    expect(result.pull_request?.head?.ref).toBe("pr-456");
  });

  test("does not modify non-PR events", () => {
    const payload = {
      action: "deleted",
      installation: {
        id: 12345,
      },
    };

    const result = sanitizePayload("installation", payload);
    expect(result).toEqual(payload);
  });

  test("does not modify original payload", () => {
    const payload = {
      action: "opened",
      repository: {
        full_name: "acme/webapp",
      },
      pull_request: {
        number: 123,
        title: "Original title",
        body: "Original body",
        head: { ref: "original-branch" },
      },
    };

    sanitizePayload("pull_request", payload);

    expect(payload.pull_request.title).toBe("Original title");
    expect(payload.pull_request.body).toBe("Original body");
  });

  test("handles missing PR number gracefully", () => {
    const payload = {
      action: "opened",
      repository: {
        full_name: "acme/webapp",
      },
      pull_request: {
        title: "Some title",
      },
    };

    const result = sanitizePayload("pull_request", payload);
    expect(result.pull_request?.title).toBe("Some title");
  });

  test("handles missing repository gracefully", () => {
    const payload = {
      action: "opened",
      pull_request: {
        number: 123,
        title: "Some title",
      },
    };

    const result = sanitizePayload("pull_request", payload);
    expect(result.pull_request?.title).toBe("Some title");
  });

  test("extracts issue ID from branch name when body is empty", () => {
    const payload = {
      action: "opened",
      repository: {
        full_name: "acme/webapp",
      },
      pull_request: {
        number: 123,
        title: "Some title",
        body: "",
        head: {
          ref: "jori/jdm-71-joris-great-issue",
        },
      },
    };

    const result = sanitizePayload("pull_request", payload);
    // Branch issue IDs are treated as closing issues
    expect(result.pull_request?.body).toBe("Fixes JDM-71");
  });

  test("extracts issue ID from branch name when body is null", () => {
    const payload = {
      action: "opened",
      repository: {
        full_name: "acme/webapp",
      },
      pull_request: {
        number: 123,
        title: "Some title",
        body: null,
        head: {
          ref: "feature/eng-456-add-login",
        },
      },
    };

    const result = sanitizePayload("pull_request", payload);
    // Branch issue IDs are treated as closing issues
    expect(result.pull_request?.body).toBe("Fixes ENG-456");
  });

  test("extracts issue ID from title when body is empty", () => {
    const payload = {
      action: "opened",
      repository: {
        full_name: "acme/webapp",
      },
      pull_request: {
        number: 123,
        title: "[ENG-789] Add new feature",
        body: "",
        head: {
          ref: "feature/add-new-feature",
        },
      },
    };

    const result = sanitizePayload("pull_request", payload);
    expect(result.pull_request?.body).toBe("ENG-789");
  });

  test("merges issue IDs from body, title, and branch", () => {
    const payload = {
      action: "opened",
      repository: {
        full_name: "acme/webapp",
      },
      pull_request: {
        number: 123,
        title: "[ENG-100] Feature title",
        body: "Fixes ENG-200",
        head: {
          ref: "jori/eng-300-feature-branch",
        },
      },
    };

    const result = sanitizePayload("pull_request", payload);
    // ENG-200 and ENG-300 are in closes (body "Fixes" and branch), ENG-100 is plain (title)
    expect(result.pull_request?.body).toBe("Fixes ENG-200, ENG-300. ENG-100");
  });

  test("deduplicates issue IDs across body, title, and branch", () => {
    const payload = {
      action: "opened",
      repository: {
        full_name: "acme/webapp",
      },
      pull_request: {
        number: 123,
        title: "[ENG-123] Feature title",
        body: "Working on ENG-123",
        head: {
          ref: "jori/eng-123-feature-branch",
        },
      },
    };

    const result = sanitizePayload("pull_request", payload);
    // ENG-123 appears in body (plain), title (plain), and branch (closes)
    // Branch promotes it to closes, so it should appear as "Fixes"
    expect(result.pull_request?.body).toBe("Fixes ENG-123");
  });

  test("body closes keyword takes priority over title/branch plain IDs", () => {
    const payload = {
      action: "opened",
      repository: {
        full_name: "acme/webapp",
      },
      pull_request: {
        number: 123,
        title: "[ENG-123] Feature title",
        body: "Fixes ENG-123",
        head: {
          ref: "jori/eng-123-feature-branch",
        },
      },
    };

    const result = sanitizePayload("pull_request", payload);
    // ENG-123 should be in "Fixes" not duplicated as plain
    expect(result.pull_request?.body).toBe("Fixes ENG-123");
  });

  test("does not add body field if it was not present in original payload", () => {
    const payload = {
      action: "opened",
      repository: {
        full_name: "acme/webapp",
      },
      pull_request: {
        number: 123,
        title: "Some title",
        head: {
          ref: "jori/eng-123-feature-branch",
        },
      },
    };

    const result = sanitizePayload("pull_request", payload);
    // Body field was not present, so we don't add it
    expect(result.pull_request?.body).toBeUndefined();
  });

  test("sanitizes head.label preserving org prefix", () => {
    const payload = {
      action: "opened",
      repository: {
        full_name: "acme/webapp",
      },
      pull_request: {
        number: 456,
        title: "Some title",
        body: "",
        head: {
          ref: "jori/jdm-71-joris-great-issue",
          label: "linear:jori/jdm-71-joris-great-issue",
        },
      },
    };

    const result = sanitizePayload("pull_request", payload);
    expect(result.pull_request?.head?.ref).toBe("pr-456");
    expect(result.pull_request?.head?.label).toBe("linear:pr-456");
  });

  test("sanitizes head.label without org prefix", () => {
    const payload = {
      action: "opened",
      repository: {
        full_name: "acme/webapp",
      },
      pull_request: {
        number: 123,
        title: "Some title",
        body: "",
        head: {
          ref: "feature-branch",
          label: "feature-branch",
        },
      },
    };

    const result = sanitizePayload("pull_request", payload);
    expect(result.pull_request?.head?.label).toBe("pr-123");
  });
});
