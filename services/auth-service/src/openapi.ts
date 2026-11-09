export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "TeamFlow Auth Service",
    version: "1.0.0",
    description:
      "Registration, login, logout, JWT issuance, and user profiles. Access tokens are validated independently by every service using the shared JWT secret."
  },
  servers: [{ url: `http://localhost:${process.env.PORT || 4001}` }],
  tags: [{ name: "Auth" }, { name: "Profiles" }, { name: "Internal" }],
  paths: {
    "/health": {
      get: {
        summary: "Service health",
        responses: { "200": { description: "Healthy" }, "503": { description: "Database unavailable" } }
      }
    },
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Create an account and receive an access token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "name"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                  name: { type: "string", minLength: 2 }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Registered" },
          "400": { description: "Validation error" },
          "409": { description: "Email already registered" }
        }
      }
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Authenticate with email and password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Access token" }, "401": { description: "Invalid credentials" } }
      }
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        summary: "Return the identity in the current access token",
        responses: { "200": { description: "Current user" }, "401": { description: "Unauthenticated" } }
      }
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        summary: "Log out (the client discards its stateless access token)",
        responses: { "204": { description: "Logged out" } }
      }
    },
    "/users/me": {
      get: {
        tags: ["Profiles"],
        security: [{ bearerAuth: [] }],
        summary: "Return the current user's profile",
        responses: { "200": { description: "Profile" }, "401": { description: "Unauthenticated" } }
      },
      patch: {
        tags: ["Profiles"],
        security: [{ bearerAuth: [] }],
        summary: "Update the current user's profile",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 2 },
                  bio: { type: "string", nullable: true },
                  title: { type: "string", nullable: true },
                  preferences: { type: "object", additionalProperties: true }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Updated profile" }, "400": { description: "Validation error" } }
      }
    },
    "/users/{id}": {
      get: {
        tags: ["Profiles"],
        security: [{ bearerAuth: [] }],
        summary: "Return a profile by user id",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Profile" }, "404": { description: "Profile not found" } }
      }
    },
    "/internal/users/by-email": {
      get: {
        tags: ["Internal"],
        summary: "Look up a profile by email (cluster-internal)",
        parameters: [{ name: "email", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Profile" }, "404": { description: "Profile not found" } }
      }
    }
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }
  }
};
