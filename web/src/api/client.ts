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

export async function apiResponse(
  path: string,
  { json, headers, ...init }: ApiInit = {},
): Promise<Response> {
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
  if (!response.ok) {
    throw new ApiError(response.status, problemDetail(await response.text(), response.status));
  }
  return response;
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const response = await apiResponse(path, init);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// fetch cannot report upload progress; basemaps weigh hundreds of MB.
// fetch cannot report upload progress; basemaps weigh hundreds of MB, so the Blob
// (a File, in practice) is handed to XHR as-is and streamed from disk by the browser.
export function uploadWithProgress<T>(
  path: string,
  body: Blob,
  onProgress: (fraction: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", path);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status === 401) notifyUnauthorized();
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText) as T);
      else reject(new ApiError(xhr.status, problemDetail(xhr.responseText, xhr.status)));
    };
    xhr.onerror = () => reject(new ApiError(0, "Connexion au serveur impossible."));
    xhr.send(body);
  });
}

function problemDetail(text: string, status: number): string {
  try {
    const body = JSON.parse(text) as { detail?: unknown; title?: unknown };
    if (typeof body.detail === "string" && body.detail) return body.detail;
    if (typeof body.title === "string" && body.title) return body.title;
  } catch {
    // Not a ProblemDetail (proxy error page, empty body): the status line is all we have.
  }
  return `HTTP ${status}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
