import "@testing-library/jest-dom/vitest";
import { Blob } from "node:buffer";
import { fetch, Headers, Request, Response } from "undici";

// jsdom's own Fetch API classes (Blob included) aren't interop-compatible with
// @mswjs/interceptors' internal Request reconstruction — sending a Blob body through the
// XHR interceptor crashes reading a jsdom-only `_bytes` field. Swap in undici's spec
// implementations, the ones Node's own global fetch is built on and msw expects, before
// msw itself is imported so its `HttpResponse` (which extends `Response`) is built on the
// same classes. Test-environment setup only; `client.ts` is untouched and keeps streaming
// the Blob body as-is in real (non-jsdom) XHR.
Object.assign(globalThis, { Blob, Headers, Request, Response, fetch });

const { server } = await import("./server");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// jsdom has no object URLs; components only need a stable string to put in <img src>.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
}
