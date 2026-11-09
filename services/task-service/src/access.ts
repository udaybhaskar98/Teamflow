import axios from "axios";
import { HttpError } from "./lib";

const projectClient = axios.create({
  baseURL: process.env.PROJECT_SERVICE_URL || "http://localhost:4003",
  timeout: Number(process.env.SERVICE_REQUEST_TIMEOUT_MS || 5000)
});

const orgClient = axios.create({
  baseURL: process.env.ORGANIZATION_SERVICE_URL || "http://localhost:4002",
  timeout: Number(process.env.SERVICE_REQUEST_TIMEOUT_MS || 5000)
});

export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

export interface ProjectAccess {
  project: {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    ownerId: string;
    deadline: string | null;
  };
  role: OrgRole;
  organization: { id: string; name: string };
}

export async function getProjectAccess(projectId: string, userId: string): Promise<ProjectAccess> {
  try {
    const response = await projectClient.get(`/internal/projects/${projectId}/access`, { params: { userId } });
    return response.data.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new HttpError(404, "PROJECT_NOT_FOUND", "Project not found or you do not have access");
    }
    if (axios.isAxiosError(error)) {
      throw new HttpError(502, "PROJECT_SERVICE_UNAVAILABLE", "Project Service is unavailable");
    }
    throw error;
  }
}

export async function assertOrganizationMember(organizationId: string, userId: string): Promise<void> {
  try {
    await orgClient.get(`/internal/organizations/${organizationId}/members/${userId}`);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new HttpError(400, "INVALID_ASSIGNEE", "The assignee must be a member of the project's organization");
    }
    if (axios.isAxiosError(error)) {
      throw new HttpError(502, "ORGANIZATION_SERVICE_UNAVAILABLE", "Organization Service is unavailable");
    }
    throw error;
  }
}
