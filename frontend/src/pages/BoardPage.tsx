import { useState, type DragEvent } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { boardApi, organizationApi } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { cn, formatDate, isOverdue } from "../lib/utils";
import { useAsyncData } from "../lib/useAsyncData";
import type { BoardItem, TaskPriority, TaskStatus } from "../types";
import type { ProjectContextValue } from "./ProjectLayout";
import { Icon } from "../components/Icon";
import { TaskDetailModal, TaskFormModal } from "../components/TaskModals";
import {
  Avatar,
  Button,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  PriorityBadge
} from "../components/ui";

const columnAccent: Record<TaskStatus, string> = {
  TODO: "border-t-slate-400",
  IN_PROGRESS: "border-t-blue-500",
  DONE: "border-t-emerald-500"
};

export function BoardPage() {
  const { project } = useOutletContext<ProjectContextValue>();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTaskId = searchParams.get("task");
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus | null>(null);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "ALL">("ALL");
  const [assigneeId, setAssigneeId] = useState("ALL");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const [board, members] = await Promise.all([
        boardApi.get(project.id),
        organizationApi.members(project.organizationId)
      ]);
      return { board, members };
    },
    [project.id, project.organizationId]
  );

  const openTask = (taskId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("task", taskId);
    setSearchParams(next, { replace: true });
  };

  const closeTask = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("task");
    setSearchParams(next, { replace: true });
  };

  const refreshAfterChange = () => {
    reload();
    window.setTimeout(reload, 900);
  };

  const moveTask = async (columnId: string, position: number) => {
    if (!draggingId || moving) return;
    setMoving(true);
    try {
      await boardApi.move(project.id, draggingId, columnId, position);
      reload();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not move task", "error");
    } finally {
      setDraggingId(null);
      setMoving(false);
    }
  };

  const handleColumnDrop = (event: DragEvent, columnId: string, length: number) => {
    event.preventDefault();
    void moveTask(columnId, length);
  };

  const handleCardDrop = (event: DragEvent, item: BoardItem, items: BoardItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    if (item.taskId === draggingId) return;
    const position = items.findIndex((entry) => entry.id === item.id);
    const columnId = item.columnId;
    void moveTask(columnId, Math.max(position, 0));
  };

  if (loading && !data) return <LoadingBlock label="Loading board" />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;

  const { board, members } = data;
  const hasFilters = query.trim().length > 0 || priority !== "ALL" || assigneeId !== "ALL";
  const totalTasks = board.columns.reduce((sum, column) => sum + column.items.length, 0);
  const memberName = (id: string | null | undefined) =>
    members.find((member) => member.userId === id)?.name || "Unassigned";

  const filtered = (columnItems: BoardItem[]) =>
    columnItems.filter((item) => {
      const task = item.task;
      if (!task) return false;
      if (query.trim()) {
        const needle = query.trim().toLowerCase();
        if (
          !task.title.toLowerCase().includes(needle) &&
          !(task.description ?? "").toLowerCase().includes(needle)
        ) {
          return false;
        }
      }
      if (priority !== "ALL" && task.priority !== priority) return false;
      if (assigneeId === "UNASSIGNED" && task.assigneeId) return false;
      if (assigneeId !== "ALL" && assigneeId !== "UNASSIGNED" && task.assigneeId !== assigneeId) {
        return false;
      }
      return true;
    });

  return (
    <div>
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Board</h2>
          <p className="text-sm text-slate-500">
            {totalTasks} task{totalTasks === 1 ? "" : "s"} across {board.columns.length} columns. Drag cards
            to update status.
          </p>
        </div>
        <Button onClick={() => setNewTaskStatus("TODO")}>
          <Icon name="plus" className="h-4 w-4" />
          New task
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter this board"
            aria-label="Filter tasks"
          />
        </div>
        <select
          className="input w-auto"
          value={priority}
          onChange={(event) => setPriority(event.target.value as TaskPriority | "ALL")}
          aria-label="Filter by priority"
        >
          <option value="ALL">All priorities</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select
          className="input w-auto max-w-48"
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
          aria-label="Filter by assignee"
        >
          <option value="ALL">All assignees</option>
          <option value="UNASSIGNED">Unassigned</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
            onClick={() => {
              setQuery("");
              setPriority("ALL");
              setAssigneeId("ALL");
            }}
          >
            Clear
          </button>
        )}
      </div>

      {totalTasks === 0 ? (
        <EmptyState
          title="This board is empty"
          description="Create the first task and it will appear in the To Do column."
          action={<Button onClick={() => setNewTaskStatus("TODO")}>Create task</Button>}
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {board.columns.map((column) => {
            const items = filtered(column.items);
            return (
              <section
                key={column.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleColumnDrop(event, column.id, column.items.length)}
                className={cn(
                  "flex min-h-[240px] flex-col rounded-2xl border border-slate-200 border-t-4 bg-slate-100/70",
                  columnAccent[column.status]
                )}
              >
                <div className="flex items-center justify-between px-3 py-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-800">{column.name}</h3>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">
                      {items.length}
                      {hasFilters && items.length !== column.items.length ? ` / ${column.items.length}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewTaskStatus(column.status)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-brand-600"
                    title={`Add to ${column.name}`}
                    aria-label={`Add task to ${column.name}`}
                  >
                    <Icon name="plus" className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-1 flex-col gap-2 px-2 pb-3">
                  {items.map((item) => {
                    const task = item.task;
                    if (!task) return null;
                    return (
                      <article
                        key={item.id}
                        draggable
                        onDragStart={(event) => {
                          setDraggingId(item.taskId);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", item.taskId);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onDrop={(event) => handleCardDrop(event, item, column.items)}
                        onClick={() => openTask(task.id)}
                        className={cn(
                          "group cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand-300 hover:shadow active:cursor-grabbing",
                          draggingId === item.taskId && "opacity-40"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-semibold leading-snug text-slate-800 group-hover:text-brand-700">
                            {task.title}
                          </h4>
                          <PriorityBadge priority={task.priority} />
                        </div>
                        {task.description && (
                          <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{task.description}</p>
                        )}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              "flex items-center gap-1 text-[10px]",
                              isOverdue(task.dueDate, task.status)
                                ? "font-semibold text-red-600"
                                : "text-slate-500"
                            )}
                          >
                            <Icon name="calendar" className="h-3.5 w-3.5" />
                            {task.dueDate ? formatDate(task.dueDate) : "No due date"}
                          </span>
                          {task.assigneeId ? (
                            <Avatar name={memberName(task.assigneeId)} size="sm" />
                          ) : (
                            <span className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] text-slate-400">
                              Unassigned
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}

                  {items.length === 0 && (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-xs text-slate-400">
                      {hasFilters ? "No tasks match these filters." : "Drop a task here."}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {moving && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-lg">
          Saving board order…
        </div>
      )}

      {newTaskStatus && (
        <TaskFormModal
          key={`${newTaskStatus}-new`}
          projectId={project.id}
          members={members}
          initialStatus={newTaskStatus}
          onClose={() => setNewTaskStatus(null)}
          onCreated={(task) => {
            setNewTaskStatus(null);
            reload();
            openTask(task.id);
            notify("Task created", "success");
          }}
        />
      )}

      <TaskDetailModal
        taskId={selectedTaskId}
        projectId={project.id}
        members={members}
        onClose={closeTask}
        onChanged={refreshAfterChange}
      />
    </div>
  );
}
