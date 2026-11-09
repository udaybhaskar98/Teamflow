import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  userByEmail: vi.fn()
}));

vi.mock("../src/prisma", () => ({
  prisma: {
    membership: {
      findMany: mocks.findMany
    }
  }
}));

vi.mock("../src/userClient", () => ({
  findUserByEmail: mocks.userByEmail
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
});

describe("organization service", () => {
  it("lists organizations with the caller's role and member count", async () => {
    mocks.findMany.mockResolvedValue([
      {
        role: "OWNER",
        organization: {
          id: "org-1",
          name: "Acme",
          description: "Product team",
          ownerId: "user-1",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
          updatedAt: new Date("2025-01-02T00:00:00.000Z"),
          _count: { memberships: 3 }
        }
      }
    ]);

    const response = await request(app).get("/organizations").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: "org-1",
      name: "Acme",
      role: "OWNER",
      memberCount: 3
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } })
    );
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/organizations");
    expect(response.status).toBe(401);
  });

  it("validates organization creation", async () => {
    const response = await request(app)
      .post("/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "x" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
