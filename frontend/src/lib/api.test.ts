import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  authApi,
  getStoredUser,
  getToken,
  storeSession,
  userApi
} from "./api";

const session = {
  token: "token-1",
  user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" }
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("frontend API client", () => {
  it("stores and clears the session", () => {
    storeSession(session);
    expect(getToken()).toBe("token-1");
    expect(getStoredUser()).toEqual(session.user);

    storeSession(null);
    expect(getToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });

  it("ignores corrupted stored user JSON", () => {
    localStorage.setItem("teamflow.user", "{oops");
    expect(getStoredUser()).toBeNull();
  });

  it("sends login credentials and bearer tokens", async () => {
    storeSession(session);
    fetchMock.mockResolvedValue(jsonResponse({ data: session }));

    const result = await authApi.login({ email: "ada@example.com", password: "secret123" });
    expect(result).toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4001/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "ada@example.com", password: "secret123" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer token-1"
        })
      })
    );
  });

  it("uses same-origin gateway paths when VITE_API_BASE_URL is set", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "/");
    const { authApi: gatewayAuthApi } = await import("./api");
    fetchMock.mockResolvedValue(jsonResponse({ data: session }));

    await gatewayAuthApi.login({ email: "ada@example.com", password: "secret123" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/auth/login");
  });

  it("throws structured ApiError values from error envelopes", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "VALIDATION_ERROR", message: "Title is required", details: { field: "title" } } },
        400
      )
    );

    await expect(userApi.me()).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Title is required",
      details: { field: "title" }
    });
  });

  it("reports network failures as ApiError", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(userApi.me()).rejects.toBeInstanceOf(ApiError);
    await expect(userApi.me()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("signals expired sessions on 401 responses", async () => {
    storeSession(session);
    const listener = vi.fn();
    window.addEventListener("teamflow:unauthorized", listener);
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "INVALID_TOKEN", message: "Session expired" } }, 401)
    );

    await expect(userApi.me()).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("teamflow:unauthorized", listener);
  });
});
