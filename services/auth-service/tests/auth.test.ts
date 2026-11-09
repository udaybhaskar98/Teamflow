import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { signAccessToken, verifyAccessToken } from "../src/lib";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret";
});

describe("auth service", () => {
  it("signs and verifies access tokens with the expected claims", () => {
    const user = { id: "user-1", email: "ada@example.com", name: "Ada Lovelace" };
    const token = signAccessToken(user);
    expect(verifyAccessToken(token)).toEqual(user);
  });

  it("rejects malformed login input before touching the database", async () => {
    const response = await request(app).post("/auth/login").send({ email: "not-an-email" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication for /auth/me", async () => {
    const response = await request(app).get("/auth/me");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("returns the authenticated user for a valid token", async () => {
    const token = signAccessToken({ id: "user-1", email: "ada@example.com", name: "Ada Lovelace" });
    const response = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: "user-1",
      email: "ada@example.com",
      name: "Ada Lovelace"
    });
  });

  it("rejects an invalid token", async () => {
    const response = await request(app).get("/auth/me").set("Authorization", "Bearer nope");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_TOKEN");
  });
});
