let accessToken: string | null = null;
let unauthorizedHandler: () => void = () => {};

// pmtiles copies these headers on every range request, so updating them here also refreshes tile requests.
export const tileHeaders = new Headers();

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) tileHeaders.set("Authorization", `Bearer ${token}`);
  else tileHeaders.delete("Authorization");
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized(): void {
  unauthorizedHandler();
}
