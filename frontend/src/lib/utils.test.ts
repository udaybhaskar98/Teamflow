import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cn,
  formatBytes,
  formatDate,
  humanize,
  initials,
  isOverdue,
  timeAgo
} from "./utils";

afterEach(() => {
  vi.useRealTimers();
});

describe("frontend utilities", () => {
  it("joins truthy class names", () => {
    expect(cn("base", false, null, "active", undefined)).toBe("base active");
  });

  it("derives up to two initials", () => {
    expect(initials("  Ada   Lovelace ")).toBe("AL");
    expect(initials("Grace")).toBe("G");
    expect(initials("")).toBe("");
  });

  it("formats byte sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("humanizes enum-style labels", () => {
    expect(humanize("IN_PROGRESS")).toBe("In Progress");
  });

  it("detects overdue open tasks only", () => {
    const past = "2020-01-01T00:00:00.000Z";
    const future = "2999-01-01T00:00:00.000Z";
    expect(isOverdue(past, "TODO")).toBe(true);
    expect(isOverdue(past, "DONE")).toBe(false);
    expect(isOverdue(future, "IN_PROGRESS")).toBe(false);
    expect(isOverdue(null, "TODO")).toBe(false);
  });

  it("handles missing and invalid dates", () => {
    expect(formatDate(null)).toBe("No date");
    expect(formatDate("not-a-date")).toBe("Invalid date");
    expect(formatDate("2025-01-01T12:00:00.000Z")).toContain("2025");
  });

  it("renders relative times", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-02T00:00:00.000Z"));
    expect(timeAgo("2025-01-01T23:59:30.000Z")).toBe("30s ago");
    expect(timeAgo("2025-01-01T23:55:00.000Z")).toBe("5m ago");
    expect(timeAgo("2025-01-01T22:00:00.000Z")).toBe("2h ago");
    expect(timeAgo("2024-12-30T00:00:00.000Z")).toBe("3d ago");
  });
});
