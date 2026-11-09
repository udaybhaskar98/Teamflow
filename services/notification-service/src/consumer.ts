import amqp, { Connection, ConsumeMessage } from "amqplib";
import { z } from "zod";
import { handleActivityEvent } from "./activity";
import { createNotifications, NotificationInput } from "./notifications";

const EVENTS_EXCHANGE = "teamflow.events";
const DLX = "teamflow.dlx";
const QUEUE = "notification-service.events";
const DEAD_QUEUE = "notification-service.dead";

export const eventSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  version: z.literal(1),
  occurredAt: z.string(),
  actor: z.object({ id: z.string(), name: z.string() }),
  organizationId: z.string().optional(),
  projectId: z.string().optional(),
  data: z.record(z.string(), z.unknown())
});

type Event = z.infer<typeof eventSchema>;

export async function handleNotificationEvent(event: Event): Promise<number> {
  const notifications: NotificationInput[] = [];

  if (event.type === "task.assigned") {
    const task = event.data.task as
      | { id?: string; title?: string; assigneeId?: string | null; projectId?: string }
      | undefined;
    if (task?.id && task.title && task.assigneeId && task.assigneeId !== event.actor.id) {
      notifications.push({
        userId: task.assigneeId,
        type: "TASK_ASSIGNED",
        title: "Task assigned to you",
        message: `${event.actor.name} assigned you "${task.title}"`,
        entityType: "TASK",
        entityId: task.id,
        projectId: event.projectId || task.projectId,
        eventId: event.id
      });
    }
  }

  if (event.type === "comment.created") {
    const task = event.data.task as
      | { id?: string; title?: string; assigneeId?: string | null; creatorId?: string }
      | undefined;
    const comment = event.data.comment as { id?: string } | undefined;
    if (task?.id && task.title && comment?.id) {
      const recipients = new Set<string>();
      if (task.assigneeId) recipients.add(task.assigneeId);
      if (task.creatorId) recipients.add(task.creatorId);
      recipients.delete(event.actor.id);
      for (const userId of recipients) {
        notifications.push({
          userId,
          type: "TASK_COMMENT",
          title: "New task comment",
          message: `${event.actor.name} commented on "${task.title}"`,
          entityType: "TASK",
          entityId: task.id,
          projectId: event.projectId,
          eventId: event.id
        });
      }
    }
  }

  if (event.type === "org.member.added") {
    const member = event.data.member as { userId?: string; name?: string } | undefined;
    const organization = event.data.organization as { id?: string; name?: string } | undefined;
    if (member?.userId && organization?.id && organization.name && member.userId !== event.actor.id) {
      notifications.push({
        userId: member.userId,
        type: "ORGANIZATION_ADDED",
        title: "Added to an organization",
        message: `${event.actor.name} added you to ${organization.name}`,
        entityType: "ORGANIZATION",
        entityId: organization.id,
        eventId: event.id
      });
    }
  }

  if (event.type === "task.status_changed") {
    const task = event.data.task as
      | { id?: string; title?: string; assigneeId?: string | null; status?: string; projectId?: string }
      | undefined;
    if (task?.id && task.title && task.assigneeId && task.assigneeId !== event.actor.id) {
      notifications.push({
        userId: task.assigneeId,
        type: "TASK_STATUS_CHANGED",
        title: "Task status updated",
        message: `${event.actor.name} moved "${task.title}" to ${task.status?.replaceAll("_", " ").toLowerCase()}`,
        entityType: "TASK",
        entityId: task.id,
        projectId: event.projectId || task.projectId,
        eventId: event.id
      });
    }
  }

  return createNotifications(notifications);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  const url = process.env.RABBITMQ_URL || "amqp://localhost:5672";
  let connection: Connection | undefined;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      connection = await amqp.connect(url);
      break;
    } catch {
      console.warn(`notification-service RabbitMQ connection attempt ${attempt} failed`);
      await sleep(Math.min(1000 * attempt, 5000));
    }
  }
  if (!connection) throw new Error("Could not connect to RabbitMQ");
  connection.on("close", () => {
    console.warn("notification-service RabbitMQ connection closed; reconnecting");
    setTimeout(() => void startConsumers(), 2000);
  });
  const channel = await connection.createChannel();
  await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
  await channel.assertExchange(DLX, "topic", { durable: true });
  await channel.assertQueue(DEAD_QUEUE, { durable: true });
  await channel.bindQueue(DEAD_QUEUE, DLX, "#");
  await channel.assertQueue(QUEUE, { durable: true, deadLetterExchange: DLX });
  for (const pattern of [
    "org.member.added",
    "project.created",
    "project.updated",
    "project.deleted",
    "task.created",
    "task.updated",
    "task.assigned",
    "task.status_changed",
    "task.deleted",
    "comment.created",
    "comment.deleted"
  ]) {
    await channel.bindQueue(QUEUE, EVENTS_EXCHANGE, pattern);
  }
  await channel.prefetch(20);

  await channel.consume(QUEUE, async (message: ConsumeMessage | null) => {
    if (!message) return;
    let event: Event;
    try {
      const parsed = eventSchema.safeParse(JSON.parse(message.content.toString()));
      if (!parsed.success) {
        console.warn("notification-service discarded an invalid event", parsed.error.flatten());
        channel.ack(message);
        return;
      }
      event = parsed.data;
    } catch {
      console.warn("notification-service discarded a malformed event");
      channel.ack(message);
      return;
    }
    try {
      await Promise.all([handleNotificationEvent(event), handleActivityEvent(event)]);
      channel.ack(message);
    } catch (error) {
      console.error("notification-service event failed", error instanceof Error ? error.message : error);
      channel.nack(message, false, !message.fields.redelivered);
    }
  });
  console.log("notification-service event consumer ready");
}

let running = false;
export async function startConsumers(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await connect();
  } catch (error) {
    running = false;
    console.error("notification-service consumer failed", error);
    setTimeout(() => void startConsumers(), 5000);
  }
}
