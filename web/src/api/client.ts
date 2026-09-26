import { getAccessToken, notifyUnauthorized } from "../auth/session";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiInit = Omit<RequestInit, "body"> & { json?: unknown };

export async function api<T>(path: string, { json, headers, ...init }: ApiInit = {}): Promise<T> {
  const request = new Headers(headers);
  const token = getAccessToken();
  if (token) request.set("Authorization", `Bearer ${token}`);
  if (json !== undefined) request.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers: request,
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  if (response.status === 401) notifyUnauthorized();
  if (!response.ok) throw new ApiError(response.status, await problemDetail(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function problemDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown; title?: unknown };
    if (typeof body.detail === "string" && body.detail) return body.detail;
    if (typeof body.title === "string" && body.title) return body.title;
  } catch {
    // Not a ProblemDetail (proxy error page, empty body): the status line is all we have.
  }
  return `HTTP ${response.status}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
