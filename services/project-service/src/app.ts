import { randomUUID } from "crypto";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { eventBus } from "./events";
import {
  asyncHandler,
  corsOrigins,
  errorHandler,
  HttpError,
  notFoundHandler,
  requireAuth,
  validateBody
} from "./lib";
import { openapiSpec } from "./openapi";
import { getOrganizationMembership, getUserOrganizations, OrgRole } from "./orgClient";
import { prisma } from "./prisma";

export const app = express();
app.use(helmet());
app.use(cors({ origin: corsOrigins(), credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", asyncHandler(async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "project-service", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "degraded", service: "project-service" });
  }
}));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

const dateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
  .transform((value) => new Date(value));

function canManage(role: OrgRole, ownerId: string, userId: string): boolean {
  return role === "OWNER" || role === "ADMIN" || ownerId === userId;
}

function projectPayload(project: {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  ownerId: string;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...project,
    deadline: project.deadline?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  };
}

async function getAccess(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "PROJECT_NOT_FOUND", "Project not found");
  const access = await getOrganizationMembership(project.organizationId, userId);
  return { project, role: access.membership.role, organization: access.organization };
}

const createProjectSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  deadline: dateSchema.nullable().optional()
});

app.post("/projects", requireAuth, validateBody(createProjectSchema), asyncHandler(async (req, res) => {
  const input = req.body as z.infer<typeof createProjectSchema>;
  const access = await getOrganizationMembership(input.organizationId, req.user!.id);
  const project = await prisma.project.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      name: input.name,
      description: input.description ?? null,
      deadline: input.deadline ?? null,
      ownerId: req.user!.id
    }
  });
  await eventBus.publish({
    type: "project.created",
    actor: req.user!,
    organizationId: project.organizationId,
    projectId: project.id,
    data: { project: projectPayload(project) }
  });
  res.status(201).json({ data: { ...project, role: access.membership.role } });
}));

app.get("/projects", requireAuth, asyncHandler(async (req, res) => {
  const organizationId = typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
  if (organizationId) {
    await getOrganizationMembership(organizationId, req.user!.id);
    const projects = await prisma.project.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" }
    });
    return res.json({ data: projects });
  }
  const organizations = await getUserOrganizations(req.user!.id);
  const projects = await prisma.project.findMany({
    where: { organizationId: { in: organizations.map((organization) => organization.id) } },
    orderBy: { updatedAt: "desc" }
  });
  res.json({ data: projects });
}));

app.get("/projects/:id", requireAuth, asyncHandler(async (req, res) => {
  const { project, role } = await getAccess(req.params.id, req.user!.id);
  res.json({ data: { ...project, role } });
}));

const updateProjectSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  deadline: dateSchema.nullable().optional()
}).refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

app.patch("/projects/:id", requireAuth, validateBody(updateProjectSchema), asyncHandler(async (req, res) => {
  const { project, role } = await getAccess(req.params.id, req.user!.id);
  if (!canManage(role, project.ownerId, req.user!.id)) {
    throw new HttpError(403, "INSUFFICIENT_ROLE", "Only project owners and organization admins can edit projects");
  }
  const updated = await prisma.project.update({
    where: { id: project.id },
    data: req.body as z.infer<typeof updateProjectSchema>
  });
  await eventBus.publish({
    type: "project.updated",
    actor: req.user!,
    organizationId: updated.organizationId,
    projectId: updated.id,
    data: { project: projectPayload(updated) }
  });
  res.json({ data: { ...updated, role } });
}));

app.delete("/projects/:id", requireAuth, asyncHandler(async (req, res) => {
  const { project, role } = await getAccess(req.params.id, req.user!.id);
  if (!canManage(role, project.ownerId, req.user!.id)) {
    throw new HttpError(403, "INSUFFICIENT_ROLE", "Only project owners and organization admins can delete projects");
  }
  await prisma.project.delete({ where: { id: project.id } });
  await eventBus.publish({
    type: "project.deleted",
    actor: req.user!,
    organizationId: project.organizationId,
    projectId: project.id,
    data: { project: projectPayload(project) }
  });
  res.status(204).send();
}));

app.get("/internal/projects/:id/access", asyncHandler(async (req, res) => {
  const userId = String(req.query.userId || "");
  if (!userId) throw new HttpError(400, "USER_REQUIRED", "A userId query parameter is required");
  const access = await getAccess(req.params.id, userId);
  res.json({
    data: {
      project: access.project,
      role: access.role,
      organization: access.organization
    }
  });
}));

app.get("/internal/projects/accessible", asyncHandler(async (req, res) => {
  const userId = String(req.query.userId || "");
  if (!userId) throw new HttpError(400, "USER_REQUIRED", "A userId query parameter is required");
  const organizations = await getUserOrganizations(userId);
  const projects = await prisma.project.findMany({
    where: { organizationId: { in: organizations.map((organization) => organization.id) } },
    orderBy: { updatedAt: "desc" }
  });
  res.json({ data: projects });
}));

app.use(notFoundHandler);
app.use(errorHandler);
