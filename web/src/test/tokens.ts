// Unsigned JWT-shaped string: the web app only decodes claims, the server verifies signatures.
export function fakeToken(claims: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(claims));
  const base64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${base64}.signature`;
}
