import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { attachmentApi, commentApi, taskApi } from "../lib/api";
import { formatBytes, formatDate, isOverdue, timeAgo } from "../lib/utils";
import type { Attachment, Comment, Membership, Task, TaskPriority, TaskStatus } from "../types";
import { Icon } from "./Icon";
import {
  Avatar,
  Button,
  ErrorBanner,
  FormError,
  LoadingBlock,
  Modal,
  PriorityBadge,
  StatusBadge
} from "./ui";

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function dateToIso(value: string): string | null {
  return value ? new Date(`${value}T12:00:00`).toISOString() : null;
}

export function TaskFormModal({
  projectId,
  members,
  initialStatus = "TODO",
  parentTaskId,
  parentTitle,
  onClose,
  onCreated
}: {
  projectId: string;
  members: Membership[];
  initialStatus?: TaskStatus;
  parentTaskId?: string | null;
  parentTitle?: string;
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const task = await taskApi.create({
        projectId,
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        assigneeId: assigneeId || null,
        dueDate: dateToIso(dueDate),
        parentTaskId: parentTaskId ?? null
      });
      onCreated(task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={parentTitle ? "New subtask" : "New task"}
      subtitle={parentTitle ? `Part of "${parentTitle}"` : "Add work to this project."}
    >
      <form className="space-y-4" onSubmit={submit}>
        <FormError message={error} />
        <div>
          <label className="label" htmlFor="task-title">
            Title
          </label>
          <input
            id="task-title"
            className="input"
            required
            maxLength={200}
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to be done?"
          />
        </div>
        <div>
          <label className="label" htmlFor="task-description">
            Description
          </label>
          <textarea
            id="task-description"
            className="input min-h-28 resize-y"
            maxLength={5000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add context, acceptance criteria, or links"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="task-status">
              Status
            </label>
            <select
              id="task-status"
              className="input"
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
            >
              <option value="TODO">To do</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DONE">Done</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="task-priority">
              Priority
            </label>
            <select
              id="task-priority"
              className="input"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="task-assignee">
              Assignee
            </label>
            <select
              id="task-assignee"
              className="input"
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="task-due">
              Due date
            </label>
            <input
              id="task-due"
              type="date"
              className="input"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Create task
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TaskDetailPanel({
  taskId,
  projectId,
  members,
  onClose,
  onChanged
}: {
  taskId: string;
  projectId: string;
  members: Membership[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("TODO");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [uploading, setUploading] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskSaving, setSubtaskSaving] = useState(false);

  const applyTask = (next: Task) => {
    setTask(next);
    setTitle(next.title);
    setDescription(next.description ?? "");
    setStatus(next.status);
    setPriority(next.priority);
    setAssigneeId(next.assigneeId ?? "");
    setDueDate(toDateInput(next.dueDate));
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedTask, loadedComments, loadedAttachments] = await Promise.all([
        taskApi.get(taskId),
        commentApi.list(taskId),
        attachmentApi.list(taskId)
      ]);
      applyTask(loadedTask);
      setComments(loadedComments);
      setAttachments(loadedAttachments);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load task");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const saveTask = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const updated = await taskApi.update(taskId, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        assigneeId: assigneeId || null,
        dueDate: dateToIso(dueDate)
      });
      applyTask(updated);
      notify("Task updated", "success");
      onChanged();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not update task");
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async () => {
    if (!task || !window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    try {
      await taskApi.remove(taskId);
      notify("Task deleted", "success");
      onChanged();
      onClose();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not delete task", "error");
    }
  };

  const addComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!commentBody.trim()) return;
    setCommentSaving(true);
    try {
      const comment = await commentApi.create(taskId, commentBody.trim());
      setComments((current) => [...current, comment]);
      setCommentBody("");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not add comment", "error");
    } finally {
      setCommentSaving(false);
    }
  };

  const saveComment = async (id: string) => {
    try {
      const updated = await commentApi.update(id, editingBody.trim());
      setComments((current) => current.map((comment) => (comment.id === id ? updated : comment)));
      setEditingComment(null);
      setEditingBody("");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not update comment", "error");
    }
  };

  const removeComment = async (id: string) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await commentApi.remove(id);
      setComments((current) => current.filter((comment) => comment.id !== id));
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not delete comment", "error");
    }
  };

  const uploadFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const attachment = await attachmentApi.upload(taskId, file);
      setAttachments((current) => [...current, attachment]);
      notify("Attachment uploaded", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not upload file", "error");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (attachment: Attachment) => {
    if (!window.confirm(`Delete "${attachment.originalName}"?`)) return;
    try {
      await attachmentApi.remove(attachment.id);
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not delete attachment", "error");
    }
  };

  const addSubtask = async (event: FormEvent) => {
    event.preventDefault();
    if (!subtaskTitle.trim() || !task) return;
    setSubtaskSaving(true);
    try {
      await taskApi.create({ projectId, title: subtaskTitle.trim(), parentTaskId: task.id });
      setSubtaskTitle("");
      await load();
      onChanged();
      notify("Subtask created", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not create subtask", "error");
    } finally {
      setSubtaskSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={task ? task.title : "Task details"}
      subtitle={task ? `Created ${formatDate(task.createdAt)}` : undefined}
      size="xl"
    >
      {loading && !task && <LoadingBlock label="Loading task" />}
      {error && <ErrorBanner message={error} onRetry={load} />}
      {task && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <form onSubmit={saveTask} className="space-y-4">
              <FormError message={formError} />
              <div>
                <label className="label" htmlFor="detail-title">
                  Title
                </label>
                <input
                  id="detail-title"
                  className="input"
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="detail-description">
                  Description
                </label>
                <textarea
                  id="detail-description"
                  className="input min-h-36 resize-y"
                  maxLength={5000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="No description yet."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="detail-status">
                    Status
                  </label>
                  <select
                    id="detail-status"
                    className="input"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as TaskStatus)}
                  >
                    <option value="TODO">To do</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="detail-priority">
                    Priority
                  </label>
                  <select
                    id="detail-priority"
                    className="input"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as TaskPriority)}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="detail-assignee">
                    Assignee
                  </label>
                  <select
                    id="detail-assignee"
                    className="input"
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="detail-due">
                    Due date
                  </label>
                  <input
                    id="detail-due"
                    type="date"
                    className="input"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="danger" onClick={deleteTask}>
                  <Icon name="trash" className="h-4 w-4" />
                  Delete
                </Button>
                <Button type="submit" loading={saving}>
                  <Icon name="check" className="h-4 w-4" />
                  Save changes
                </Button>
              </div>
            </form>

            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Icon name="comment" className="h-4 w-4 text-slate-400" />
                Comments ({comments.length})
              </h3>
              <div className="space-y-3">
                {comments.length === 0 && (
                  <p className="text-sm text-slate-500">No comments yet. Start the conversation.</p>
                )}
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={comment.authorName} size="sm" />
                      <p className="text-xs font-semibold text-slate-800">{comment.authorName}</p>
                      <p className="text-xs text-slate-400">{timeAgo(comment.createdAt)}</p>
                      {comment.authorId === user?.id && (
                        <div className="ml-auto flex gap-1">
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            onClick={() => {
                              setEditingComment(comment.id);
                              setEditingBody(comment.body);
                            }}
                            aria-label="Edit comment"
                          >
                            <Icon name="edit" className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            onClick={() => removeComment(comment.id)}
                            aria-label="Delete comment"
                          >
                            <Icon name="trash" className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    {editingComment === comment.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          className="input min-h-20 resize-y"
                          value={editingBody}
                          onChange={(event) => setEditingBody(event.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="secondary" onClick={() => setEditingComment(null)}>
                            Cancel
                          </Button>
                          <Button type="button" onClick={() => saveComment(comment.id)}>
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{comment.body}</p>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={addComment} className="mt-3 space-y-2">
                <textarea
                  className="input min-h-20 resize-y"
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Write a comment…"
                />
                <div className="flex justify-end">
                  <Button type="submit" loading={commentSaving} disabled={!commentBody.trim()}>
                    Comment
                  </Button>
                </div>
              </form>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Details</h3>
              <dl className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Status</dt>
                  <dd><StatusBadge status={task.status} /></dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Priority</dt>
                  <dd><PriorityBadge priority={task.priority} /></dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Assignee</dt>
                  <dd className="text-right font-medium text-slate-800">
                    {members.find((member) => member.userId === task.assigneeId)?.name || "Unassigned"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Due date</dt>
                  <dd
                    className={
                      isOverdue(task.dueDate, task.status)
                        ? "font-semibold text-red-600"
                        : "font-medium text-slate-800"
                    }
                  >
                    {task.dueDate ? formatDate(task.dueDate) : "None"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Subtask of</dt>
                  <dd className="truncate text-right font-medium text-slate-800">
                    {task.parentTaskId ? "Linked task" : "—"}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Icon name="board" className="h-4 w-4 text-slate-400" />
                Subtasks ({task.subtasks?.length ?? 0})
              </h3>
              <div className="space-y-2">
                {task.subtasks?.map((subtask) => (
                  <div
                    key={subtask.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <span className="truncate text-slate-700">{subtask.title}</span>
                    <StatusBadge status={subtask.status} />
                  </div>
                ))}
                {task.parentTaskId && (
                  <p className="text-xs text-slate-500">This task is a subtask.</p>
                )}
              </div>
              {!task.parentTaskId && (
                <form onSubmit={addSubtask} className="mt-2 flex gap-2">
                  <input
                    className="input py-1.5 text-xs"
                    value={subtaskTitle}
                    onChange={(event) => setSubtaskTitle(event.target.value)}
                    placeholder="Add a subtask"
                  />
                  <Button type="submit" variant="secondary" loading={subtaskSaving} disabled={!subtaskTitle.trim()}>
                    Add
                  </Button>
                </form>
              )}
            </div>

            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Icon name="paperclip" className="h-4 w-4 text-slate-400" />
                Attachments ({attachments.length})
              </h3>
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-700">{attachment.originalName}</p>
                      <p className="text-[10px] text-slate-400">{formatBytes(attachment.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => attachmentApi.download(attachment).catch(() => notify("Download failed", "error"))}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                      aria-label={`Download ${attachment.originalName}`}
                    >
                      <Icon name="download" className="h-4 w-4" />
                    </button>
                    {attachment.uploaderId === user?.id && (
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${attachment.originalName}`}
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-600">
                <Icon name="paperclip" className="h-4 w-4" />
                {uploading ? "Uploading…" : "Attach a file"}
                <input
                  type="file"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(event) => {
                    void uploadFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              <p className="mt-1 text-[10px] text-slate-400">Images, PDFs, docs, sheets, CSV, text, or ZIP up to 10 MB.</p>
            </div>

            <div className="border-t border-slate-100 pt-3 text-xs text-slate-400">
              Last updated {timeAgo(task.updatedAt)}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function TaskDetailModal({
  taskId,
  projectId,
  members,
  onClose,
  onChanged
}: {
  taskId: string | null;
  projectId: string;
  members: Membership[];
  onClose: () => void;
  onChanged: () => void;
}) {
  if (!taskId) return null;
  return (
    <TaskDetailPanel
      key={taskId}
      taskId={taskId}
      projectId={projectId}
      members={members}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}
