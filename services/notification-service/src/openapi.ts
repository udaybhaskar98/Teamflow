export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "TeamFlow Notification Service",
    version: "1.0.0",
    description:
      "In-app notifications generated from durable RabbitMQ events. A unique (eventId, userId) constraint makes event reprocessing idempotent."
  },
  servers: [{ url: `http://localhost:${process.env.PORT || 4005}` }],
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": { get: { summary: "Service health", security: [], responses: { "200": { description: "Healthy" } } } },
    "/notifications": {
      get: {
        summary: "List my notifications",
        parameters: [
          { name: "unreadOnly", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: { "200": { description: "Notifications" } }
      }
    },
    "/notifications/unread-count": {
      get: { summary: "Get unread notification count", responses: { "200": { description: "Count" } } }
    },
    "/notifications/{id}/read": {
      patch: {
        summary: "Mark a notification as read",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" }, "404": { description: "Not found" } }
      }
    },
    "/notifications/read-all": {
      post: { summary: "Mark all my notifications as read", responses: { "200": { description: "Updated count" } } }
    }
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }
  }
};
