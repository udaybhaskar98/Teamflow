import { randomUUID } from "crypto";
import { prisma } from "./prisma";

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  projectId?: string;
  eventId: string;
}

export async function createNotifications(inputs: NotificationInput[]): Promise<number> {
  const unique = new Map<string, NotificationInput>();
  for (const input of inputs) unique.set(`${input.eventId}:${input.userId}`, input);
  const rows = [...unique.values()];
  if (rows.length === 0) return 0;
  const result = await prisma.notification.createMany({
    data: rows.map((row) => ({ id: randomUUID(), ...row })),
    skipDuplicates: true
  });
  return result.count;
}
