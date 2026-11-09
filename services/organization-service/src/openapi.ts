export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "TeamFlow Organization Service",
    version: "1.0.0",
    description: "Organizations and owner/admin/member role enforcement. Other services verify membership through internal endpoints."
  },
  servers: [{ url: `http://localhost:${process.env.PORT || 4002}` }],
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": { get: { summary: "Service health", security: [], responses: { "200": { description: "Healthy" } } } },
    "/organizations": {
      get: { summary: "List organizations I belong to", responses: { "200": { description: "Organizations" } } },
      post: {
        summary: "Create an organization",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, description: { type: "string" } } } } }
        },
        responses: { "201": { description: "Created" }, "400": { description: "Validation error" } }
      }
    },
    "/organizations/{id}": {
      get: {
        summary: "Get an organization",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Organization" }, "404": { description: "Not found" } }
      },
      patch: {
        summary: "Update an organization (admin or owner)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" }, "403": { description: "Insufficient role" } }
      }
    },
    "/organizations/{id}/members": {
      get: {
        summary: "List members",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Members" } }
      },
      post: {
        summary: "Add a registered user by email (admin or owner)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Member added" }, "409": { description: "Already a member" } }
      }
    },
    "/organizations/{id}/members/{userId}": {
      patch: {
        summary: "Change member role",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "userId", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { "200": { description: "Updated" }, "403": { description: "Insufficient role" } }
      },
      delete: {
        summary: "Remove a member or leave",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "userId", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { "204": { description: "Removed" }, "403": { description: "Insufficient role" } }
      }
    }
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }
  }
};
