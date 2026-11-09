import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import {
  asyncHandler,
  corsOrigins,
  errorHandler,
  HttpError,
  notFoundHandler,
  requireAuth,
  signAccessToken,
  validateBody
} from "./lib";
import { openapiSpec } from "./openapi";
import { prisma } from "./prisma";

export const app = express();

app.use(helmet());
app.use(cors({ origin: corsOrigins(), credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", asyncHandler(async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "auth-service", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "degraded", service: "auth-service" });
  }
}));

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
  name: z.string().trim().min(2).max(80)
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(72)
});

app.post(
  "/auth/register",
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body as z.infer<typeof registerSchema>;
    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const passwordHash = await bcrypt.hash(password, rounds);

    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { id: randomUUID(), email, name, passwordHash }
        });
        await tx.profile.create({
          data: { id: created.id, email: created.email, name: created.name }
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "EMAIL_IN_USE", "An account with this email already exists");
      }
      throw error;
    }

    const token = signAccessToken({ id: user.id, email: user.email, name: user.name });
    res.status(201).json({
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name }
      }
    });
  })
);

app.post(
  "/auth/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }
    const token = signAccessToken({ id: user.id, email: user.email, name: user.name });
    res.json({
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name }
      }
    });
  })
);

app.get("/auth/me", requireAuth, (req, res) => {
  res.json({ data: req.user });
});

app.post("/auth/logout", requireAuth, (_req, res) => {
  res.status(204).send();
});

const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    title: z.string().trim().max(100).nullable().optional(),
    preferences: z.record(z.string(), z.unknown()).optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

app.get("/users/me", requireAuth, asyncHandler(async (req, res) => {
  const profile = await prisma.profile.findUnique({ where: { id: req.user!.id } });
  if (!profile) throw new HttpError(404, "PROFILE_NOT_FOUND", "Profile not found");
  res.json({ data: profile });
}));

app.patch("/users/me", requireAuth, validateBody(profileUpdateSchema), asyncHandler(async (req, res) => {
  const input = req.body as z.infer<typeof profileUpdateSchema>;
  const data: Prisma.ProfileUpdateInput = {
    name: input.name,
    bio: input.bio,
    title: input.title
  };
  if (input.preferences !== undefined) {
    data.preferences = input.preferences as Prisma.InputJsonValue;
  }
  const profile = await prisma.profile.update({
    where: { id: req.user!.id },
    data
  });
  res.json({ data: profile });
}));

app.get("/users/:id", requireAuth, asyncHandler(async (req, res) => {
  const profile = await prisma.profile.findUnique({ where: { id: req.params.id } });
  if (!profile) throw new HttpError(404, "PROFILE_NOT_FOUND", "Profile not found");
  res.json({ data: profile });
}));

app.get("/internal/users/by-email", asyncHandler(async (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!email) throw new HttpError(400, "EMAIL_REQUIRED", "An email query parameter is required");
  const profile = await prisma.profile.findUnique({ where: { email } });
  if (!profile) throw new HttpError(404, "PROFILE_NOT_FOUND", "No user with that email exists");
  res.json({ data: profile });
}));

app.use(notFoundHandler);
app.use(errorHandler);
