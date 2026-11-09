import axios from "axios";
import { HttpError } from "./lib";

const baseURL = process.env.ORGANIZATION_SERVICE_URL || "http://localhost:4002";
const client = axios.create({ baseURL, timeout: Number(process.env.SERVICE_REQUEST_TIMEOUT_MS || 5000) });

export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

export interface OrgMembership {
  organization: { id: string; name: string; description?: string | null; ownerId: string };
  membership: { userId: string; role: OrgRole };
}

export interface AccessibleOrganization {
  id: string;
  name: string;
  role: OrgRole;
}

export async function getOrganizationMembership(organizationId: string, userId: string): Promise<OrgMembership> {
  try {
    const response = await client.get(`/internal/organizations/${organizationId}/members/${userId}`);
    return response.data.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found or you are not a member");
    }
    if (axios.isAxiosError(error)) {
      throw new HttpError(502, "ORGANIZATION_SERVICE_UNAVAILABLE", "Organization Service is unavailable");
    }
    throw error;
  }
}

export async function getUserOrganizations(userId: string): Promise<AccessibleOrganization[]> {
  try {
    const response = await client.get(`/internal/users/${userId}/organizations`);
    return response.data.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new HttpError(502, "ORGANIZATION_SERVICE_UNAVAILABLE", "Organization Service is unavailable");
    }
    throw error;
  }
}
