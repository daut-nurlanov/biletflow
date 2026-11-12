import type { LoginResponse, User } from "../types/auth";
import { apiRequest } from "./client";

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function getMe(token: string, signal?: AbortSignal): Promise<User> {
  return apiRequest<User>("/api/auth/me", { token, signal });
}
