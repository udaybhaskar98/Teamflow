import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { asyncHandler, corsOrigins, errorHandler, HttpError, notFoundHandler, requireAuth } from "./lib";
import { openapiSpec } from "./openapi";
import { prisma } from "./prisma";
import { assertProjectAccess } from "./projectClient";

export const app = express();
app.use(helmet());
app.use(cors({ origin: corsOrigins(), credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", asyncHandler(async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "notification-service", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "degraded", service: "notification-service" });
  }
}));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

const listQuerySchema = z.object({
  unreadOnly: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

app.get("/notifications", requireAuth, asyncHandler(async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid notification query", parsed.error.flatten());
  }
  const notifications = await prisma.notification.findMany({
    where: {
      userId: req.user!.id,
      ...(parsed.data.unreadOnly === "true" ? { readAt: null } : {})
    },
    orderBy: { createdAt: "desc" },
    take: parsed.data.limit
  });
  res.json({ data: notifications });
}));

app.get("/notifications/unread-count", requireAuth, asyncHandler(async (req, res) => {
  const count = await prisma.notification.count({
    where: { userId: req.user!.id, readAt: null }
  });
  res.json({ data: { count } });
}));

app.patch("/notifications/:id/read", requireAuth, asyncHandler(async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.userId !== req.user!.id) {
    throw new HttpError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  }
  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: { readAt: notification.readAt ?? new Date() }
  });
  res.json({ data: updated });
}));

app.post("/notifications/read-all", requireAuth, asyncHandler(async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() }
  });
  res.json({ data: { updated: result.count } });
}));

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

app.get("/projects/:projectId/activity", requireAuth, asyncHandler(async (req, res) => {
  const parsed = activityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid activity query", parsed.error.flatten());
  }
  await assertProjectAccess(req.params.projectId, req.user!.id);
  const activities = await prisma.activity.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { createdAt: "desc" },
    take: parsed.data.limit
  });
  res.json({ data: activities });
}));

app.use(notFoundHandler);
app.use(errorHandler);
