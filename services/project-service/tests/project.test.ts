import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getUserOrganizations: vi.fn()
}));

vi.mock("../src/prisma", () => ({
  prisma: {
    project: {
      findMany: mocks.findMany
    }
  }
}));

vi.mock("../src/orgClient", () => ({
  getOrganizationMembership: vi.fn(),
  getUserOrganizations: mocks.getUserOrganizations
}));

import { app } from "../src/app";

const token = jwt.sign(
  { email: "ada@example.com", name: "Ada Lovelace" },
  "test-secret",
  { subject: "user-1", issuer: "teamflow-auth", expiresIn: "1h" }
);

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret";
  mocks.findMany.mockReset();
  mocks.getUserOrganizations.mockReset();
});

describe("project service", () => {
  it("lists projects from the organizations the caller belongs to", async () => {
    mocks.getUserOrganizations.mockResolvedValue([{ id: "org-1", name: "Acme", role: "MEMBER" }]);
    mocks.findMany.mockResolvedValue([
      {
        id: "project-1",
        organizationId: "org-1",
        name: "Website",
        description: null,
        ownerId: "user-1",
        deadline: null,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        updatedAt: new Date("2025-01-02T00:00:00.000Z")
      }
    ]);

    const response = await request(app).get("/projects").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data[0].name).toBe("Website");
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: { in: ["org-1"] } } })
    );
  });

  it("rejects unauthenticated project creation", async () => {
    const response = await request(app)
      .post("/projects")
      .send({ organizationId: "00000000-0000-4000-8000-000000000000", name: "Website" });
    expect(response.status).toBe(401);
  });

  it("validates project creation payloads", async () => {
    const response = await request(app)
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ organizationId: "not-a-uuid", name: "x" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
