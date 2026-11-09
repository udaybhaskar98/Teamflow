import { Board, BoardColumn, BoardItem, Prisma, TaskStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "./prisma";

export const DEFAULT_COLUMNS: Array<{ name: string; status: TaskStatus; position: number }> = [
  { name: "To Do", status: TaskStatus.TODO, position: 0 },
  { name: "In Progress", status: TaskStatus.IN_PROGRESS, position: 1 },
  { name: "Done", status: TaskStatus.DONE, position: 2 }
];

export async function ensureBoard(projectId: string, name = "Project board"): Promise<Board> {
  const existing = await prisma.board.findUnique({ where: { projectId } });
  if (existing) return existing;
  try {
    return await prisma.board.create({
      data: {
        id: randomUUID(),
        projectId,
        name,
        columns: {
          create: DEFAULT_COLUMNS.map((column) => ({ id: randomUUID(), ...column }))
        }
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.board.findUnique({ where: { projectId } });
      if (raced) return raced;
    }
    throw error;
  }
}

export async function addTaskToBoard(input: {
  taskId: string;
  projectId: string;
  status: TaskStatus;
}): Promise<void> {
  const board = await ensureBoard(input.projectId);
  const column = await prisma.boardColumn.findUnique({
    where: { boardId_status: { boardId: board.id, status: input.status } }
  });
  if (!column) throw new Error(`Board column missing for status ${input.status}`);
  const existing = await prisma.boardItem.findUnique({ where: { taskId: input.taskId } });
  if (existing) {
    if (existing.columnId !== column.id) {
      await moveItemToColumn(input.taskId, column.id, Number.MAX_SAFE_INTEGER);
    }
    return;
  }
  const aggregate = await prisma.boardItem.aggregate({
    where: { columnId: column.id },
    _max: { position: true }
  });
  await prisma.boardItem.create({
    data: {
      id: randomUUID(),
      columnId: column.id,
      taskId: input.taskId,
      position: (aggregate._max.position ?? -1) + 1
    }
  });
}

export async function moveTaskToStatus(taskId: string, status: TaskStatus): Promise<void> {
  const item = await prisma.boardItem.findUnique({
    where: { taskId },
    include: { column: { include: { board: true } } }
  });
  if (!item) return;
  if (item.column.status === status) return;
  const target = await prisma.boardColumn.findUnique({
    where: { boardId_status: { boardId: item.column.boardId, status } }
  });
  if (!target) return;
  await moveItemToColumn(taskId, target.id, Number.MAX_SAFE_INTEGER);
}

export async function removeTaskFromBoard(taskId: string): Promise<void> {
  await prisma.boardItem.deleteMany({ where: { taskId } });
}

export async function moveItemToColumn(taskId: string, targetColumnId: string, requestedPosition: number): Promise<void> {
  const item = await prisma.boardItem.findUnique({
    where: { taskId },
    include: { column: true }
  });
  if (!item) throw new Error("Board item not found");
  const targetColumn = await prisma.boardColumn.findUnique({ where: { id: targetColumnId } });
  if (!targetColumn) throw new Error("Target column not found");
  if (targetColumn.boardId !== item.column.boardId) throw new Error("Cannot move an item across boards");

  await prisma.$transaction(async (tx) => {
    const sourceColumnId = item.columnId;
    await tx.boardItem.update({ where: { id: item.id }, data: { columnId: targetColumnId } });

    const targetItems = await tx.boardItem.findMany({
      where: { columnId: targetColumnId, id: { not: item.id } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }]
    });
    const position = Math.max(0, Math.min(requestedPosition, targetItems.length));
    targetItems.splice(position, 0, { ...item, columnId: targetColumnId });
    for (const [index, targetItem] of targetItems.entries()) {
      await tx.boardItem.update({ where: { id: targetItem.id }, data: { position: index } });
    }

    if (sourceColumnId !== targetColumnId) {
      const sourceItems = await tx.boardItem.findMany({
        where: { columnId: sourceColumnId },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }]
      });
      for (const [index, sourceItem] of sourceItems.entries()) {
        await tx.boardItem.update({ where: { id: sourceItem.id }, data: { position: index } });
      }
    }
  });
}

export type BoardWithColumns = Board & {
  columns: Array<BoardColumn & { items: BoardItem[] }>;
};

export async function loadBoard(projectId: string): Promise<BoardWithColumns | null> {
  return prisma.board.findUnique({
    where: { projectId },
    include: {
      columns: {
        orderBy: { position: "asc" },
        include: { items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] } }
      }
    }
  });
}
