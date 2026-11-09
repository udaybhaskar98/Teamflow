import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getProjectAccess: vi.fn()
}));

vi.mock("../src/prisma", () => ({
  prisma: {
    task: {
      findMany: mocks.findMany
    }
  }
}));

vi.mock("../src/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  assertOrganizationMember: vi.fn()
}));

import { app } from "../src/app";

const token = jwt.sign(
  { email: "ada@example.com", name: "Ada Lovelace" },
  "test-secret",
  { subject: "user-1", issuer: "teamflow-auth", expiresIn: "1h" }
);

const task = {
  id: "task-1",
  projectId: "00000000-0000-4000-8000-000000000001",
  title: "Ship the board",
  description: "Drag and drop works",
  status: "IN_PROGRESS",
  priority: "HIGH",
  dueDate: new Date("2025-02-01T12:00:00.000Z"),
  assigneeId: "user-2",
  creatorId: "user-1",
  parentTaskId: null,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-02T00:00:00.000Z")
};

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret";
  mocks.findMany.mockReset();
  mocks.getProjectAccess.mockReset();
});

describe("task service", () => {
  it("lists project tasks after checking project access", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: task.projectId, organizationId: "org-1", name: "Website" },
      role: "MEMBER",
      organization: { id: "org-1", name: "Acme" }
    });
    mocks.findMany.mockResolvedValue([task]);

    const response = await request(app)
      .get(`/projects/${task.projectId}/tasks`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      id: "task-1",
      title: "Ship the board",
      status: "IN_PROGRESS",
      dueDate: "2025-02-01T12:00:00.000Z"
    });
    expect(mocks.getProjectAccess).toHaveBeenCalledWith(task.projectId, "user-1");
  });

  it("validates task creation bodies", async () => {
    const response = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectId: "not-a-uuid", title: "" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/tasks/task-1");
    expect(response.status).toBe(401);
  });
});
