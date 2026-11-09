import { Prisma, Role } from "@prisma/client";
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
import { prisma } from "./prisma";
import { findUserByEmail } from "./userClient";

export const app = express();
app.use(helmet());
app.use(cors({ origin: corsOrigins(), credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", asyncHandler(async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "organization-service", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "degraded", service: "organization-service" });
  }
}));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

const roleRank: Record<Role, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1 };

async function getMembership(organizationId: string, userId: string) {
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true }
  });
  if (!membership) {
    throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found or you are not a member");
  }
  return membership;
}

function assertRole(role: Role, minimum: Role) {
  if (roleRank[role] < roleRank[minimum]) {
    throw new HttpError(403, "INSUFFICIENT_ROLE", `This action requires the ${minimum.toLowerCase()} role`);
  }
}

async function publishMemberEvent(
  type: string,
  organization: { id: string; name: string },
  member: { id: string; userId: string; email: string; name: string; role: Role },
  actor: { id: string; name: string }
) {
  await eventBus.publish({
    type,
    actor,
    organizationId: organization.id,
    data: {
      organization: { id: organization.id, name: organization.name },
      member: { id: member.id, userId: member.userId, email: member.email, name: member.name, role: member.role }
    }
  });
}

const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullable().optional()
});

app.post("/organizations", requireAuth, validateBody(createOrgSchema), asyncHandler(async (req, res) => {
  const input = req.body as z.infer<typeof createOrgSchema>;
  const user = req.user!;
  const organizationId = randomUUID();
  const organization = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        id: organizationId,
        name: input.name,
        description: input.description ?? null,
        ownerId: user.id
      }
    });
    await tx.membership.create({
      data: {
        id: randomUUID(),
        organizationId,
        userId: user.id,
        email: user.email,
        name: user.name,
        role: Role.OWNER
      }
    });
    return org;
  });
  res.status(201).json({ data: { ...organization, role: Role.OWNER } });
}));

app.get("/organizations", requireAuth, asyncHandler(async (req, res) => {
  const memberships = await prisma.membership.findMany({
    where: { userId: req.user!.id },
    include: { organization: { include: { _count: { select: { memberships: true } } } } },
    orderBy: { createdAt: "asc" }
  });
  res.json({
    data: memberships.map((membership) => ({
      ...membership.organization,
      role: membership.role,
      memberCount: membership.organization._count.memberships,
      _count: undefined
    }))
  });
}));

app.get("/organizations/:id", requireAuth, asyncHandler(async (req, res) => {
  const membership = await getMembership(req.params.id, req.user!.id);
  const memberCount = await prisma.membership.count({ where: { organizationId: req.params.id } });
  res.json({ data: { ...membership.organization, role: membership.role, memberCount } });
}));

const updateOrgSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional()
}).refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

app.patch("/organizations/:id", requireAuth, validateBody(updateOrgSchema), asyncHandler(async (req, res) => {
  const membership = await getMembership(req.params.id, req.user!.id);
  assertRole(membership.role, Role.ADMIN);
  const organization = await prisma.organization.update({
    where: { id: req.params.id },
    data: req.body as z.infer<typeof updateOrgSchema>
  });
  res.json({ data: { ...organization, role: membership.role } });
}));

app.get("/organizations/:id/members", requireAuth, asyncHandler(async (req, res) => {
  await getMembership(req.params.id, req.user!.id);
  const members = await prisma.membership.findMany({
    where: { organizationId: req.params.id },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }]
  });
  res.json({ data: members });
}));

const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER")
});

app.post("/organizations/:id/members", requireAuth, validateBody(addMemberSchema), asyncHandler(async (req, res) => {
  const membership = await getMembership(req.params.id, req.user!.id);
  assertRole(membership.role, Role.ADMIN);
  const { email, role } = req.body as z.infer<typeof addMemberSchema>;
  const profile = await findUserByEmail(email);

  let member;
  try {
    member = await prisma.membership.create({
      data: {
        id: randomUUID(),
        organizationId: membership.organizationId,
        userId: profile.id,
        email: profile.email,
        name: profile.name,
        role: role === "ADMIN" ? Role.ADMIN : Role.MEMBER
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "ALREADY_A_MEMBER", "That user is already a member of this organization");
    }
    throw error;
  }

  await publishMemberEvent("org.member.added", membership.organization, member, req.user!);
  res.status(201).json({ data: member });
}));

const updateMemberSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"])
});

app.patch("/organizations/:id/members/:userId", requireAuth, validateBody(updateMemberSchema), asyncHandler(async (req, res) => {
  const actorMembership = await getMembership(req.params.id, req.user!.id);
  assertRole(actorMembership.role, Role.ADMIN);
  const target = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: req.params.id, userId: req.params.userId } }
  });
  if (!target) throw new HttpError(404, "MEMBER_NOT_FOUND", "Member not found");
  if (target.role === Role.OWNER) throw new HttpError(403, "OWNER_PROTECTED", "The owner role cannot be changed");
  if (actorMembership.role === Role.ADMIN && target.role === Role.ADMIN) {
    throw new HttpError(403, "INSUFFICIENT_ROLE", "Only the owner can change another admin's role");
  }
  const updated = await prisma.membership.update({
    where: { id: target.id },
    data: { role: req.body.role === "ADMIN" ? Role.ADMIN : Role.MEMBER }
  });
  res.json({ data: updated });
}));

app.delete("/organizations/:id/members/:userId", requireAuth, asyncHandler(async (req, res) => {
  const actorMembership = await getMembership(req.params.id, req.user!.id);
  const target = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: req.params.id, userId: req.params.userId } }
  });
  if (!target) throw new HttpError(404, "MEMBER_NOT_FOUND", "Member not found");
  if (target.role === Role.OWNER) throw new HttpError(403, "OWNER_PROTECTED", "The organization owner cannot be removed");
  const isSelf = target.userId === req.user!.id;
  if (!isSelf) {
    assertRole(actorMembership.role, Role.ADMIN);
    if (actorMembership.role === Role.ADMIN && target.role === Role.ADMIN) {
      throw new HttpError(403, "INSUFFICIENT_ROLE", "Only the owner can remove another admin");
    }
  }
  await prisma.membership.delete({ where: { id: target.id } });
  await publishMemberEvent("org.member.removed", actorMembership.organization, target, req.user!);
  res.status(204).send();
}));

app.get("/internal/users/:userId/organizations", asyncHandler(async (req, res) => {
  const memberships = await prisma.membership.findMany({
    where: { userId: req.params.userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" }
  });
  res.json({
    data: memberships.map((membership) => ({ ...membership.organization, role: membership.role }))
  });
}));

app.get("/internal/organizations/:organizationId/members/:userId", asyncHandler(async (req, res) => {
  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: req.params.organizationId,
        userId: req.params.userId
      }
    },
    include: { organization: true }
  });
  if (!membership) throw new HttpError(404, "MEMBERSHIP_NOT_FOUND", "User is not a member of this organization");
  res.json({ data: { organization: membership.organization, membership } });
}));

app.use(notFoundHandler);
app.use(errorHandler);
