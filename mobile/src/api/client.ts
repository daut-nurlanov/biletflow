import { environment } from "../config/environment";

const REQUEST_TIMEOUT_MS = 15_000;
const CONNECTION_MESSAGE =
  "Couldn't reach BiletFlow. Check that the API is running and your phone is on the same Wi-Fi as the computer.";

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

/** Small GET helper shared by the Week 7 API modules. */
export async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
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

  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch {
      throw new Error(CONNECTION_MESSAGE);
    }

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => undefined);
      throw new Error(
        getErrorDetail(body) ||
        `BiletFlow couldn't load this information (HTTP ${response.status}). Please try again.`,
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
