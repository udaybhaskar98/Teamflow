import { Prisma, Task, TaskPriority, TaskStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import path from "path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { assertOrganizationMember, getProjectAccess } from "./access";
import { addTaskToBoard, ensureBoard, loadBoard, moveItemToColumn, moveTaskToStatus } from "./board";
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
import { AttachmentMissingError, storage } from "./storage";

export const app = express();
app.use(helmet());
app.use(cors({ origin: corsOrigins(), credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", asyncHandler(async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "task-service", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "degraded", service: "task-service" });
  }
}));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

const dateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
  .transform((value) => new Date(value));

export function serializeTask(task: Task) {
  return {
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  };
}

async function loadTaskForUser(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "Task not found");
  const access = await getProjectAccess(task.projectId, userId);
  return { task, access };
}

async function assertValidParent(projectId: string, parentTaskId: string, taskId?: string) {
  if (taskId && parentTaskId === taskId) {
    throw new HttpError(400, "INVALID_PARENT", "A task cannot be its own parent");
  }
  const parent = await prisma.task.findUnique({ where: { id: parentTaskId } });
  if (!parent || parent.projectId !== projectId) {
    throw new HttpError(400, "INVALID_PARENT", "The parent task must belong to the same project");
  }
  let cursor = parent;
  let depth = 0;
  while (cursor.parentTaskId && depth < 50) {
    if (cursor.parentTaskId === taskId) {
      throw new HttpError(400, "INVALID_PARENT", "This parent would create a task cycle");
    }
    cursor = (await prisma.task.findUnique({ where: { id: cursor.parentTaskId } }))!;
    if (!cursor) break;
    depth += 1;
  }
}

async function publishTaskEvent(
  type: string,
  actor: { id: string; name: string },
  task: Task,
  organizationId: string | undefined,
  extra: Record<string, unknown> = {}
) {
  await eventBus.publish({
    type,
    actor,
    organizationId,
    projectId: task.projectId,
    data: { task: serializeTask(task), ...extra }
  });
}

const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueDate: dateSchema.nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional()
});

app.post("/tasks", requireAuth, validateBody(createTaskSchema), asyncHandler(async (req, res) => {
  const input = req.body as z.infer<typeof createTaskSchema>;
  const access = await getProjectAccess(input.projectId, req.user!.id);
  if (input.assigneeId) {
    await assertOrganizationMember(access.project.organizationId, input.assigneeId);
  }
  if (input.parentTaskId) {
    await assertValidParent(input.projectId, input.parentTaskId);
  }
  const task = await prisma.task.create({
    data: {
      id: randomUUID(),
      projectId: input.projectId,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? TaskStatus.TODO,
      priority: input.priority ?? TaskPriority.MEDIUM,
      dueDate: input.dueDate ?? null,
      assigneeId: input.assigneeId ?? null,
      creatorId: req.user!.id,
      parentTaskId: input.parentTaskId ?? null
    }
  });
  await ensureBoard(task.projectId, access.project.name);
  await addTaskToBoard({ taskId: task.id, projectId: task.projectId, status: task.status });
  await publishTaskEvent("task.created", req.user!, task, access.organization.id);
  if (task.assigneeId) {
    await publishTaskEvent("task.assigned", req.user!, task, access.organization.id, {
      previousAssigneeId: null
    });
  }
  res.status(201).json({ data: serializeTask(task) });
}));

const listQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  assigneeId: z.string().optional()
});

app.get("/projects/:projectId/tasks", requireAuth, asyncHandler(async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid task filters", parsed.error.flatten());
  }
  await getProjectAccess(req.params.projectId, req.user!.id);
  const tasks = await prisma.task.findMany({
    where: {
      projectId: req.params.projectId,
      status: parsed.data.status,
      priority: parsed.data.priority,
      assigneeId: parsed.data.assigneeId
    },
    orderBy: [{ createdAt: "asc" }]
  });
  res.json({ data: tasks.map(serializeTask) });
}));

app.get("/tasks/:id", requireAuth, asyncHandler(async (req, res) => {
  const { task } = await loadTaskForUser(req.params.id, req.user!.id);
  const subtasks = await prisma.task.findMany({
    where: { parentTaskId: task.id },
    orderBy: { createdAt: "asc" }
  });
  res.json({ data: { ...serializeTask(task), subtasks: subtasks.map(serializeTask) } });
}));

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    dueDate: dateSchema.nullable().optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    parentTaskId: z.string().uuid().nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

app.patch("/tasks/:id", requireAuth, validateBody(updateTaskSchema), asyncHandler(async (req, res) => {
  const input = req.body as z.infer<typeof updateTaskSchema>;
  const { task: existing, access } = await loadTaskForUser(req.params.id, req.user!.id);

  if (input.assigneeId && input.assigneeId !== existing.assigneeId) {
    await assertOrganizationMember(access.project.organizationId, input.assigneeId);
  }
  if (input.parentTaskId) {
    await assertValidParent(existing.projectId, input.parentTaskId, existing.id);
  }

  const data: Prisma.TaskUncheckedUpdateInput = {};
  const changes: string[] = [];
  if (input.title !== undefined && input.title !== existing.title) {
    data.title = input.title;
    changes.push("title");
  }
  if (input.description !== undefined && input.description !== existing.description) {
    data.description = input.description;
    changes.push("description");
  }
  if (input.status !== undefined && input.status !== existing.status) {
    data.status = input.status;
    changes.push("status");
  }
  if (input.priority !== undefined && input.priority !== existing.priority) {
    data.priority = input.priority;
    changes.push("priority");
  }
  if (input.dueDate !== undefined) {
    const nextTime = input.dueDate?.getTime() ?? null;
    const existingTime = existing.dueDate?.getTime() ?? null;
    if (nextTime !== existingTime) {
      data.dueDate = input.dueDate;
      changes.push("dueDate");
    }
  }
  if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId) {
    data.assigneeId = input.assigneeId;
    changes.push("assignee");
  }
  if (input.parentTaskId !== undefined && input.parentTaskId !== existing.parentTaskId) {
    data.parentTaskId = input.parentTaskId;
    changes.push("parentTask");
  }

  if (changes.length === 0) {
    return res.json({ data: serializeTask(existing) });
  }

  const updated = await prisma.task.update({ where: { id: existing.id }, data });
  if (changes.includes("status")) {
    await moveTaskToStatus(updated.id, updated.status);
  }
  await publishTaskEvent("task.updated", req.user!, updated, access.organization.id, { changes });
  if (changes.includes("assignee")) {
    await publishTaskEvent("task.assigned", req.user!, updated, access.organization.id, {
      previousAssigneeId: existing.assigneeId
    });
  }
  if (changes.includes("status")) {
    await publishTaskEvent("task.status_changed", req.user!, updated, access.organization.id, {
      previousStatus: existing.status
    });
  }
  res.json({ data: serializeTask(updated) });
}));

app.delete("/tasks/:id", requireAuth, asyncHandler(async (req, res) => {
  const { task, access } = await loadTaskForUser(req.params.id, req.user!.id);
  const attachments = await prisma.attachment.findMany({ where: { taskId: task.id } });
  await Promise.allSettled(attachments.map((attachment) => storage.remove(attachment.storedName)));
  await prisma.$transaction([
    prisma.attachment.deleteMany({ where: { taskId: task.id } }),
    prisma.comment.deleteMany({ where: { taskId: task.id } }),
    prisma.boardItem.deleteMany({ where: { taskId: task.id } }),
    prisma.task.delete({ where: { id: task.id } })
  ]);
  await publishTaskEvent("task.deleted", req.user!, task, access.organization.id);
  res.status(204).send();
}));

async function syncBoardTasks(projectId: string, boardName: string) {
  await ensureBoard(projectId, boardName);
  const tasks = await prisma.task.findMany({ where: { projectId } });
  const existing = await prisma.boardItem.findMany({
    where: { column: { board: { projectId } } },
    select: { taskId: true }
  });
  const known = new Set(existing.map((item) => item.taskId));
  for (const task of tasks) {
    if (!known.has(task.id)) {
      await addTaskToBoard({ taskId: task.id, projectId, status: task.status });
    }
  }
  return tasks;
}

app.get("/boards/projects/:projectId", requireAuth, asyncHandler(async (req, res) => {
  const access = await getProjectAccess(req.params.projectId, req.user!.id);
  const tasks = await syncBoardTasks(req.params.projectId, access.project.name);
  const board = await loadBoard(req.params.projectId);
  if (!board) throw new HttpError(404, "BOARD_NOT_FOUND", "Board not found");
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  res.json({
    data: {
      ...board,
      columns: board.columns.map((column) => ({
        ...column,
        items: column.items.map((item) => ({
          ...item,
          task: tasksById.get(item.taskId) ? serializeTask(tasksById.get(item.taskId)!) : null
        }))
      }))
    }
  });
}));

const moveSchema = z.object({
  columnId: z.string().uuid(),
  position: z.number().int().min(0).default(0)
});

app.patch("/boards/projects/:projectId/items/:taskId/move", requireAuth, validateBody(moveSchema), asyncHandler(async (req, res) => {
  const access = await getProjectAccess(req.params.projectId, req.user!.id);
  const item = await prisma.boardItem.findUnique({
    where: { taskId: req.params.taskId },
    include: { column: { include: { board: true } } }
  });
  if (!item || item.column.board.projectId !== req.params.projectId) {
    throw new HttpError(404, "BOARD_ITEM_NOT_FOUND", "Task is not on this project's board");
  }
  const target = await prisma.boardColumn.findFirst({
    where: { id: req.body.columnId, boardId: item.column.boardId }
  });
  if (!target) throw new HttpError(404, "COLUMN_NOT_FOUND", "Board column not found");

  const task = await prisma.task.findUnique({ where: { id: req.params.taskId } });
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "Task not found");
  if (task.status !== target.status) {
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { status: target.status }
    });
    await publishTaskEvent("task.updated", req.user!, updated, access.organization.id, {
      changes: ["status"]
    });
    await publishTaskEvent("task.status_changed", req.user!, updated, access.organization.id, {
      previousStatus: task.status
    });
  }

  await moveItemToColumn(req.params.taskId, target.id, req.body.position);
  const board = await loadBoard(req.params.projectId);
  res.json({ data: board });
}));

const commentSchema = z.object({ body: z.string().trim().min(1).max(5000) });

app.get("/tasks/:taskId/comments", requireAuth, asyncHandler(async (req, res) => {
  await loadTaskForUser(req.params.taskId, req.user!.id);
  const comments = await prisma.comment.findMany({
    where: { taskId: req.params.taskId },
    orderBy: { createdAt: "asc" }
  });
  res.json({ data: comments });
}));

app.post("/tasks/:taskId/comments", requireAuth, validateBody(commentSchema), asyncHandler(async (req, res) => {
  const { task, access } = await loadTaskForUser(req.params.taskId, req.user!.id);
  const comment = await prisma.comment.create({
    data: {
      id: randomUUID(),
      taskId: task.id,
      projectId: task.projectId,
      authorId: req.user!.id,
      authorName: req.user!.name,
      body: (req.body as z.infer<typeof commentSchema>).body
    }
  });
  await eventBus.publish({
    type: "comment.created",
    actor: req.user!,
    organizationId: access.organization.id,
    projectId: task.projectId,
    data: { task: serializeTask(task), comment }
  });
  res.status(201).json({ data: comment });
}));

app.patch("/comments/:id", requireAuth, validateBody(commentSchema), asyncHandler(async (req, res) => {
  const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!comment) throw new HttpError(404, "COMMENT_NOT_FOUND", "Comment not found");
  await loadTaskForUser(comment.taskId, req.user!.id);
  if (comment.authorId !== req.user!.id) {
    throw new HttpError(403, "NOT_COMMENT_AUTHOR", "Only the author can edit this comment");
  }
  const updated = await prisma.comment.update({
    where: { id: comment.id },
    data: { body: (req.body as z.infer<typeof commentSchema>).body }
  });
  res.json({ data: updated });
}));

app.delete("/comments/:id", requireAuth, asyncHandler(async (req, res) => {
  const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!comment) throw new HttpError(404, "COMMENT_NOT_FOUND", "Comment not found");
  const { task, access } = await loadTaskForUser(comment.taskId, req.user!.id);
  if (comment.authorId !== req.user!.id) {
    throw new HttpError(403, "NOT_COMMENT_AUTHOR", "Only the author can delete this comment");
  }
  await prisma.comment.delete({ where: { id: comment.id } });
  await eventBus.publish({
    type: "comment.deleted",
    actor: req.user!,
    organizationId: access.organization.id,
    projectId: task.projectId,
    data: { task: serializeTask(task), comment }
  });
  res.status(204).send();
}));

const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024), files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new HttpError(400, "UNSUPPORTED_FILE_TYPE", "This file type is not allowed"));
      return;
    }
    callback(null, true);
  }
});

app.post("/tasks/:taskId/attachments", requireAuth, upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "FILE_REQUIRED", "A multipart file field named 'file' is required");
  const { task } = await loadTaskForUser(req.params.taskId, req.user!.id);
  const originalName = path.basename(req.file.originalname).slice(0, 255) || "attachment";
  const saved = await storage.save(req.file.buffer, originalName, req.file.mimetype);
  try {
    const attachment = await prisma.attachment.create({
      data: {
        id: randomUUID(),
        taskId: task.id,
        projectId: task.projectId,
        uploaderId: req.user!.id,
        originalName,
        storedName: saved.storedName,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    });
    res.status(201).json({ data: attachment });
  } catch (error) {
    await storage.remove(saved.storedName);
    throw error;
  }
}));

app.get("/tasks/:taskId/attachments", requireAuth, asyncHandler(async (req, res) => {
  await loadTaskForUser(req.params.taskId, req.user!.id);
  const attachments = await prisma.attachment.findMany({
    where: { taskId: req.params.taskId },
    orderBy: { createdAt: "asc" }
  });
  res.json({ data: attachments });
}));

app.get("/attachments/:id/download", requireAuth, asyncHandler(async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!attachment) throw new HttpError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found");
  await loadTaskForUser(attachment.taskId, req.user!.id);
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Content-Length", attachment.size);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${attachment.originalName.replace(/["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`
  );
  let stream: Awaited<ReturnType<typeof storage.open>>;
  try {
    stream = await storage.open(attachment.storedName);
  } catch (error) {
    if (error instanceof AttachmentMissingError) {
      throw new HttpError(404, "FILE_MISSING", "The stored file is missing");
    }
    throw error;
  }
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(404).json({ error: { code: "FILE_MISSING", message: "The stored file is missing" } });
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}));

app.delete("/attachments/:id", requireAuth, asyncHandler(async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!attachment) throw new HttpError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found");
  await loadTaskForUser(attachment.taskId, req.user!.id);
  if (attachment.uploaderId !== req.user!.id) {
    throw new HttpError(403, "NOT_ATTACHMENT_OWNER", "Only the uploader can delete this attachment");
  }
  await storage.remove(attachment.storedName);
  await prisma.attachment.delete({ where: { id: attachment.id } });
  res.status(204).send();
}));

app.use(notFoundHandler);
app.use(errorHandler);
