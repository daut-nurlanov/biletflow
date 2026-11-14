import type { AttendeeRegistration, LoginResponse, User } from "../types/auth";
import { apiRequest } from "./client";

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function registerAttendee(input: AttendeeRegistration): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/api/auth/register", {
    method: "POST",
    body: {
      full_name: input.full_name.trim(),
      email: input.email.trim().toLowerCase(),
      password: input.password,
      role: "attendee",
    },
  });
}

export function getMe(token: string, signal?: AbortSignal): Promise<User> {
  return apiRequest<User>("/api/auth/me", { token, signal });
}
