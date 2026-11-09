import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export interface ActivityEvent {
  id: string;
  type: string;
  actor: { id: string; name: string };
  projectId?: string;
  data: Record<string, unknown>;
}

export async function handleActivityEvent(event: ActivityEvent): Promise<number> {
  const project = event.data.project as { id?: string; name?: string } | undefined;
  const task = event.data.task as { id?: string; title?: string; projectId?: string } | undefined;
  const comment = event.data.comment as { id?: string; taskId?: string } | undefined;
  const type = event.type;
  let message = "";
  let projectId = event.projectId;
  let entityId = event.id;
  let metadata: Record<string, unknown> = {};

  switch (event.type) {
    case "project.created":
      if (!project?.id) return 0;
      projectId = project.id;
      entityId = project.id;
      message = `created project "${project.name || "Untitled"}"`;
      metadata = { project };
      break;
    case "project.updated":
      if (!project?.id) return 0;
      projectId = project.id;
      entityId = project.id;
      message = `updated project "${project.name || "Untitled"}"`;
      metadata = { project };
      break;
    case "project.deleted":
      if (!project?.id) return 0;
      projectId = project.id;
      entityId = project.id;
      message = `deleted project "${project.name || "Untitled"}"`;
      metadata = { project };
      break;
    case "task.created":
      if (!task?.id) return 0;
      projectId = event.projectId || task.projectId;
      entityId = task.id;
      message = `created task "${task.title || "Untitled"}"`;
      metadata = { task };
      break;
    case "task.updated": {
      if (!task?.id) return 0;
      projectId = event.projectId || task.projectId;
      entityId = task.id;
      const changes = Array.isArray(event.data.changes) ? (event.data.changes as string[]) : [];
      if (changes.includes("status")) message = `changed the status of "${task.title || "Untitled"}"`;
      else if (changes.includes("assignee")) message = `changed the assignee of "${task.title || "Untitled"}"`;
      else message = `updated task "${task.title || "Untitled"}"`;
      metadata = { task, changes };
      break;
    }
    case "task.deleted":
      if (!task?.id) return 0;
      projectId = event.projectId || task.projectId;
      entityId = task.id;
      message = `deleted task "${task.title || "Untitled"}"`;
      metadata = { task };
      break;
    case "comment.created":
      if (!task?.id || !comment?.id) return 0;
      projectId = event.projectId || task.projectId;
      entityId = comment.id;
      message = `commented on "${task.title || "Untitled"}"`;
      metadata = { taskId: task.id, commentId: comment.id };
      break;
    case "comment.deleted":
      if (!comment?.id) return 0;
      projectId = event.projectId;
      entityId = comment.id;
      message = `deleted a comment${task?.title ? ` on "${task.title}"` : ""}`;
      metadata = { taskId: task?.id, commentId: comment.id };
      break;
    default:
      return 0;
  }

  if (!projectId) return 0;

  const result = await prisma.activity.createMany({
    data: [
      {
        id: randomUUID(),
        projectId,
        eventId: event.id,
        type,
        actorId: event.actor.id,
        actorName: event.actor.name,
        message,
        metadata: metadata as Prisma.InputJsonValue
      }
    ],
    skipDuplicates: true
  });
  return result.count;
}
