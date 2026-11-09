import axios from "axios";
import { HttpError } from "./lib";

const client = axios.create({
  baseURL: process.env.AUTH_SERVICE_URL || "http://localhost:4001",
  timeout: Number(process.env.SERVICE_REQUEST_TIMEOUT_MS || 5000)
});

export interface UserProfile {
  id: string;
  email: string;
  name: string;
}

export async function findUserByEmail(email: string): Promise<UserProfile> {
  try {
    const response = await client.get("/internal/users/by-email", { params: { email } });
    return response.data.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new HttpError(404, "USER_NOT_FOUND", "No registered user has that email address");
    }
    if (axios.isAxiosError(error)) {
      throw new HttpError(502, "USER_SERVICE_UNAVAILABLE", "User Service is unavailable");
    }
    throw error;
  }
}
