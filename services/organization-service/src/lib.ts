import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new HttpError(400, "VALIDATION_ERROR", "Invalid request body", result.error.flatten()));
    }
    req.body = result.data;
    next();
  };
}

export function verifyAccessToken(token: string): AuthUser {
  const payload = jwt.verify(token, process.env.JWT_SECRET || "development-only-secret-change-me", {
    issuer: "teamflow-auth"
  });
  if (typeof payload === "string" || !payload.sub || typeof payload.email !== "string") {
    throw new HttpError(401, "INVALID_TOKEN", "Invalid access token");
  }
  return {
    id: payload.sub,
    email: payload.email,
    name: typeof payload.name === "string" ? payload.name : payload.email
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return next(new HttpError(401, "AUTH_REQUIRED", "A bearer token is required"));
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
    next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    next(new HttpError(401, "INVALID_TOKEN", "Invalid or expired access token"));
  }
}

export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details }
    });
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error.flatten() }
    });
  }
  console.error("Unhandled request error", error instanceof Error ? error.message : error);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, "NOT_FOUND", `Route ${req.method} ${req.path} not found`));
}
