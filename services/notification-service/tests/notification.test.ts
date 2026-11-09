import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMany: vi.fn()
}));

vi.mock("../src/prisma", () => ({
  prisma: {
    notification: {
      createMany: mocks.createMany
    }
  }
}));

import { handleNotificationEvent } from "../src/consumer";

const baseEvent = {
  id: randomUUID(),
  version: 1 as const,
  occurredAt: new Date().toISOString(),
  actor: { id: "user-1", name: "Ada Lovelace" },
  organizationId: "org-1",
  projectId: "project-1",
  data: {}
};

beforeEach(() => {
  mocks.createMany.mockReset();
  mocks.createMany.mockResolvedValue({ count: 1 });
});

describe("notification event handler", () => {
  it("creates a notification for the new assignee", async () => {
    const count = await handleNotificationEvent({
      ...baseEvent,
      type: "task.assigned",
      data: {
        task: {
          id: "task-1",
          title: "Ship the release",
          projectId: "project-1",
          assigneeId: "user-2"
        }
      }
    });

    expect(count).toBe(1);
    const rows = mocks.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "user-2",
      type: "TASK_ASSIGNED",
      entityType: "TASK",
      entityId: "task-1",
      projectId: "project-1"
    });
    expect(rows[0].message).toContain("Ship the release");
  });

  it("does not notify an actor about assigning a task to themselves", async () => {
    const count = await handleNotificationEvent({
      ...baseEvent,
      type: "task.assigned",
      data: {
        task: {
          id: "task-1",
          title: "Ship the release",
          projectId: "project-1",
          assigneeId: "user-1"
        }
      }
    });

    expect(count).toBe(0);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("notifies task creator and assignee about new comments", async () => {
    mocks.createMany.mockResolvedValue({ count: 2 });
    await handleNotificationEvent({
      ...baseEvent,
      type: "comment.created",
      actor: { id: "user-3", name: "Grace Hopper" },
      data: {
        task: {
          id: "task-1",
          title: "Ship the release",
          assigneeId: "user-2",
          creatorId: "user-1"
        },
        comment: { id: "comment-1" }
      }
    });

    const rows = mocks.createMany.mock.calls[0][0].data;
    expect(rows.map((row: { userId: string }) => row.userId).sort()).toEqual(["user-1", "user-2"]);
    expect(rows[0]).toMatchObject({ type: "TASK_COMMENT", entityId: "task-1" });
  });

  it("ignores events that do not produce notifications", async () => {
    const count = await handleNotificationEvent({ ...baseEvent, type: "project.updated" });
    expect(count).toBe(0);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});
