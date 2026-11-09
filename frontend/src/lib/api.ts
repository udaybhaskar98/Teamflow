import type {
  Activity,
  Attachment,
  AuthResponse,
  Board,
  Comment,
  Membership,
  Notification,
  Organization,
  OrganizationRole,
  Profile,
  Project,
  Task,
  TaskPriority,
  TaskStatus
} from "../types";

const env = import.meta.env;

function serviceUrl(explicit: string | undefined, service: string, local: string): string {
  if (explicit) return explicit.replace(/\/+$/, "");
  const gateway = env.VITE_API_BASE_URL?.trim();
  if (gateway) {
    const root = gateway === "/" ? "" : gateway.replace(/\/+$/, "");
    return `${root}/api/${service}`;
  }
  return local;
}

const urls = {
  auth: serviceUrl(env.VITE_AUTH_API_URL, "auth", "http://localhost:4001"),
  organization: serviceUrl(env.VITE_ORGANIZATION_API_URL, "organization", "http://localhost:4002"),
  project: serviceUrl(env.VITE_PROJECT_API_URL, "project", "http://localhost:4003"),
  task: serviceUrl(env.VITE_TASK_API_URL, "task", "http://localhost:4004"),
  notification: serviceUrl(env.VITE_NOTIFICATION_API_URL, "notification", "http://localhost:4005")
};

const TOKEN_KEY = "teamflow.token";
const USER_KEY = "teamflow.user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthResponse["user"];
  } catch {
    return null;
  }
}

export function storeSession(session: AuthResponse | null) {
  if (!session) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export class ApiError extends Error {
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

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const isForm = options.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        ...(isForm || options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body:
        options.body === undefined
          ? undefined
          : isForm
            ? (options.body as FormData)
            : JSON.stringify(options.body),
      signal: options.signal
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the TeamFlow service. Check that it is running.");
  }

  if (response.status === 401 && token) {
    window.dispatchEvent(new CustomEvent("teamflow:unauthorized"));
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code || "REQUEST_FAILED",
      error?.message || `Request failed with status ${response.status}`,
      error?.details
    );
  }
  return (payload?.data ?? payload) as T;
}

async function downloadFile(baseUrl: string, path: string, filename: string): Promise<void> {
  const token = getToken();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) {
    throw new ApiError(response.status, "DOWNLOAD_FAILED", "Could not download the attachment");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function queryString(values: Record<string, string | number | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const result = params.toString();
  return result ? `?${result}` : "";
}

export const authApi = {
  register: (input: { name: string; email: string; password: string }) =>
    request<AuthResponse>(urls.auth, "/auth/register", { method: "POST", body: input }),
  login: (input: { email: string; password: string }) =>
    request<AuthResponse>(urls.auth, "/auth/login", { method: "POST", body: input }),
  logout: () => request<void>(urls.auth, "/auth/logout", { method: "POST" })
};

export const userApi = {
  me: () => request<Profile>(urls.auth, "/users/me"),
  updateMe: (input: {
    name?: string;
    bio?: string | null;
    title?: string | null;
    preferences?: Record<string, unknown>;
  }) => request<Profile>(urls.auth, "/users/me", { method: "PATCH", body: input }),
  get: (id: string) => request<Profile>(urls.auth, `/users/${id}`)
};

export const organizationApi = {
  list: () => request<Organization[]>(urls.organization, "/organizations"),
  get: (id: string) => request<Organization>(urls.organization, `/organizations/${id}`),
  create: (input: { name: string; description?: string | null }) =>
    request<Organization>(urls.organization, "/organizations", { method: "POST", body: input }),
  update: (id: string, input: { name?: string; description?: string | null }) =>
    request<Organization>(urls.organization, `/organizations/${id}`, { method: "PATCH", body: input }),
  members: (id: string) => request<Membership[]>(urls.organization, `/organizations/${id}/members`),
  addMember: (id: string, input: { email: string; role: "ADMIN" | "MEMBER" }) =>
    request<Membership>(urls.organization, `/organizations/${id}/members`, { method: "POST", body: input }),
  updateMember: (id: string, userId: string, role: "ADMIN" | "MEMBER") =>
    request<Membership>(urls.organization, `/organizations/${id}/members/${userId}`, {
      method: "PATCH",
      body: { role }
    }),
  removeMember: (id: string, userId: string) =>
    request<void>(urls.organization, `/organizations/${id}/members/${userId}`, { method: "DELETE" })
};

export const projectApi = {
  list: (organizationId?: string) =>
    request<Project[]>(urls.project, `/projects${queryString({ organizationId })}`),
  get: (id: string) => request<Project>(urls.project, `/projects/${id}`),
  create: (input: {
    organizationId: string;
    name: string;
    description?: string | null;
    deadline?: string | null;
  }) => request<Project>(urls.project, "/projects", { method: "POST", body: input }),
  update: (
    id: string,
    input: { name?: string; description?: string | null; deadline?: string | null }
  ) => request<Project>(urls.project, `/projects/${id}`, { method: "PATCH", body: input }),
  remove: (id: string) => request<void>(urls.project, `/projects/${id}`, { method: "DELETE" })
};

export const taskApi = {
  list: (
    projectId: string,
    filters: { status?: TaskStatus; priority?: TaskPriority; assigneeId?: string } = {},
    signal?: AbortSignal
  ) =>
    request<Task[]>(
      urls.task,
      `/projects/${projectId}/tasks${queryString(filters)}`,
      { signal }
    ),
  get: (id: string) => request<Task>(urls.task, `/tasks/${id}`),
  create: (input: {
    projectId: string;
    title: string;
    description?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: string | null;
    assigneeId?: string | null;
    parentTaskId?: string | null;
  }) => request<Task>(urls.task, "/tasks", { method: "POST", body: input }),
  update: (
    id: string,
    input: {
      title?: string;
      description?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
      dueDate?: string | null;
      assigneeId?: string | null;
      parentTaskId?: string | null;
    }
  ) => request<Task>(urls.task, `/tasks/${id}`, { method: "PATCH", body: input }),
  remove: (id: string) => request<void>(urls.task, `/tasks/${id}`, { method: "DELETE" })
};

export const boardApi = {
  get: (projectId: string) => request<Board>(urls.task, `/boards/projects/${projectId}`),
  move: (projectId: string, taskId: string, columnId: string, position: number) =>
    request<Board>(urls.task, `/boards/projects/${projectId}/items/${taskId}/move`, {
      method: "PATCH",
      body: { columnId, position }
    })
};

export const commentApi = {
  list: (taskId: string) => request<Comment[]>(urls.task, `/tasks/${taskId}/comments`),
  create: (taskId: string, body: string) =>
    request<Comment>(urls.task, `/tasks/${taskId}/comments`, { method: "POST", body: { body } }),
  update: (id: string, body: string) =>
    request<Comment>(urls.task, `/comments/${id}`, { method: "PATCH", body: { body } }),
  remove: (id: string) => request<void>(urls.task, `/comments/${id}`, { method: "DELETE" })
};

export const attachmentApi = {
  list: (taskId: string) => request<Attachment[]>(urls.task, `/tasks/${taskId}/attachments`),
  upload: (taskId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Attachment>(urls.task, `/tasks/${taskId}/attachments`, {
      method: "POST",
      body: form
    });
  },
  remove: (id: string) =>
    request<void>(urls.task, `/attachments/${id}`, { method: "DELETE" }),
  download: (attachment: Attachment) =>
    downloadFile(
      urls.task,
      `/attachments/${attachment.id}/download`,
      attachment.originalName
    )
};

export const notificationApi = {
  list: (unreadOnly = false) =>
    request<Notification[]>(urls.notification, `/notifications${queryString({ unreadOnly: unreadOnly ? "true" : undefined })}`),
  unreadCount: () =>
    request<{ count: number }>(urls.notification, "/notifications/unread-count"),
  markRead: (id: string) =>
    request<Notification>(urls.notification, `/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () =>
    request<{ updated: number }>(urls.notification, "/notifications/read-all", { method: "POST" })
};

export const activityApi = {
  list: (projectId: string, limit = 50) =>
    request<Activity[]>(urls.notification, `/projects/${projectId}/activity${queryString({ limit })}`)
};

export type { OrganizationRole };
