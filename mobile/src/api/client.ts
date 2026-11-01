import { environment } from "../config/environment";

const REQUEST_TIMEOUT_MS = 15_000;
const CONNECTION_MESSAGE =
  "Couldn't reach BiletFlow. Check that the API is running and your phone is on the same Wi-Fi as the computer.";

/** An error the backend answered with, so callers can react to the HTTP status (for example 401). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

function getBaseUrl(): string {
  try {
    const url = new URL(environment.apiBaseUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.hostname.toLowerCase() === "your_local_ip" ||
      url.search ||
      url.hash
    ) {
      throw new Error("Invalid API URL");
    }
    return environment.apiBaseUrl;
  } catch {
    throw new Error(
      "The API address is missing or invalid. Set EXPO_PUBLIC_API_URL in mobile/.env to your computer's API address, then reload the app.",
    );
  }
}

function getErrorDetail(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("detail" in body)) return;
  if (typeof body.detail === "string") return body.detail;
  // FastAPI validation failures return an array of errors, each with a msg.
  if (Array.isArray(body.detail)) {
    const messages = body.detail.flatMap((entry: unknown) =>
      entry && typeof entry === "object" && "msg" in entry &&
      typeof entry.msg === "string" ? [entry.msg] : [],
    );
    return messages.join(" ") || undefined;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Sent as JSON. */
  body?: unknown;
  /** Added as `Authorization: Bearer <token>`. */
  token?: string | null;
  signal?: AbortSignal;
}

/** Shared fetch helper: JSON in and out, token header, timeout and readable errors. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, token, signal } = options;
  const baseUrl = getBaseUrl();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort);
  if (signal?.aborted) controller.abort();

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new Error(CONNECTION_MESSAGE);
    }

    if (!response.ok) {
      const errorBody: unknown = await response.json().catch(() => undefined);
      throw new ApiError(
        getErrorDetail(errorBody) ||
        `BiletFlow couldn't complete this request (HTTP ${response.status}). Please try again.`,
        response.status,
      );
    }

    try {
      return await response.json() as T;
    } catch {
      throw new Error("BiletFlow returned an unreadable response. Please try again.");
    }
  } catch (error) {
    if (timedOut && !signal?.aborted) {
      throw new Error("The request took too long. Check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

/** Small GET helper kept for the existing attendee API modules. */
export function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { signal });
}
