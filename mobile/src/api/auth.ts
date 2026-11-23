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

interface MessageResponse { message: string }

/** Always answers the same way, so it never reveals which emails have accounts. */
export function forgotPassword(email: string): Promise<MessageResponse> {
  return apiRequest<MessageResponse>("/api/auth/forgot-password", { method: "POST", body: { email: email.trim().toLowerCase() } });
}

export function resetPassword(token: string, newPassword: string): Promise<MessageResponse> {
  return apiRequest<MessageResponse>("/api/auth/reset-password", { method: "POST", body: { token: token.trim(), new_password: newPassword } });
}

export function verifyEmail(token: string, code: string): Promise<MessageResponse> {
  return apiRequest<MessageResponse>("/api/auth/verify-email", { method: "POST", token, body: { token: code.trim() } });
}

export function resendVerification(token: string): Promise<MessageResponse> {
  return apiRequest<MessageResponse>("/api/auth/resend-verification", { method: "POST", token });
}
