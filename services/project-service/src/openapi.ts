export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "TeamFlow Project Service",
    version: "1.0.0",
    description: "Projects belong to organizations. Every route checks organization membership and management permissions."
  },
  servers: [{ url: `http://localhost:${process.env.PORT || 4003}` }],
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": { get: { summary: "Service health", security: [], responses: { "200": { description: "Healthy" } } } },
    "/projects": {
      get: {
        summary: "List accessible projects",
        parameters: [{ name: "organizationId", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "Projects" } }
      },
      post: {
        summary: "Create a project",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["organizationId", "name"],
                properties: {
                  organizationId: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  description: { type: "string", nullable: true },
                  deadline: { type: "string", format: "date-time", nullable: true }
                }
              }
            }
          }
        },
        responses: { "201": { description: "Created" }, "404": { description: "Organization membership missing" } }
      }
    },
    "/projects/{id}": {
      get: {
        summary: "Get a project",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Project" }, "404": { description: "Not found" } }
      },
      patch: {
        summary: "Update a project",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" }, "403": { description: "Insufficient role" } }
      },
      delete: {
        summary: "Delete a project",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "Deleted" }, "403": { description: "Insufficient role" } }
      }
    }
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }
  }
};
