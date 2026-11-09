export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  bio: string | null;
  title: string | null;
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  role: OrganizationRole;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  name: string;
  role: OrganizationRole;
  createdAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  ownerId: string;
  deadline: string | null;
  role?: OrganizationRole;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeId: string | null;
  creatorId: string;
  parentTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  subtasks?: Task[];
}

export interface BoardItem {
  id: string;
  columnId: string;
  taskId: string;
  position: number;
  task: Task | null;
}

export interface BoardColumn {
  id: string;
  boardId: string;
  name: string;
  status: TaskStatus;
  position: number;
  items: BoardItem[];
}

export interface Board {
  id: string;
  projectId: string;
  name: string;
  columns: BoardColumn[];
}

export interface Comment {
  id: string;
  taskId: string;
  projectId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  taskId: string;
  projectId: string;
  uploaderId: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
  eventId: string;
  readAt: string | null;
  createdAt: string;
}

export interface Activity {
  id: string;
  projectId: string;
  eventId: string;
  type: string;
  actorId: string;
  actorName: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
