import axios from "axios";
import { HttpError } from "./lib";

const client = axios.create({
  baseURL: process.env.PROJECT_SERVICE_URL || "http://localhost:4003",
  timeout: Number(process.env.SERVICE_REQUEST_TIMEOUT_MS || 5000)
});

export async function assertProjectAccess(projectId: string, userId: string): Promise<void> {
  try {
    await client.get(`/internal/projects/${projectId}/access`, { params: { userId } });
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
