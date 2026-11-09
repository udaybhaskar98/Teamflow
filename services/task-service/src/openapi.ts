export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "TeamFlow Task Service",
    version: "1.0.0",
    description:
      "Task CRUD, subtasks, assignments, status changes, overdue calculations, and durable task events. Access is checked through Project Service and organization membership."
  },
  servers: [{ url: `http://localhost:${process.env.PORT || 4004}` }],
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": { get: { summary: "Service health", security: [], responses: { "200": { description: "Healthy" } } } },
    "/tasks": {
      post: {
        summary: "Create a task",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["projectId", "title"],
                properties: {
                  projectId: { type: "string", format: "uuid" },
                  title: { type: "string" },
                  description: { type: "string", nullable: true },
                  status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE"] },
                  priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
                  dueDate: { type: "string", format: "date-time", nullable: true },
                  assigneeId: { type: "string", format: "uuid", nullable: true },
                  parentTaskId: { type: "string", format: "uuid", nullable: true }
                }
              }
            }
          }
        },
        responses: { "201": { description: "Created" }, "400": { description: "Validation error" }, "404": { description: "Project not accessible" } }
      }
    },
    "/projects/{projectId}/tasks": {
      get: {
        summary: "List project tasks with optional filters",
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE"] } },
          { name: "priority", in: "query", schema: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] } },
          { name: "assigneeId", in: "query", schema: { type: "string" } }
        ],
        responses: { "200": { description: "Tasks" } }
      }
    },
    "/tasks/{id}": {
      get: {
        summary: "Get task with subtasks",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Task" }, "404": { description: "Not found" } }
      },
      patch: {
        summary: "Update task, assignment, priority, due date, or status",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" }, "400": { description: "Invalid assignee or parent" } }
      },
      delete: {
        summary: "Delete a task",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "Deleted" } }
      }
    }
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }
  }
};
