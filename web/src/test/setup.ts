import "@testing-library/jest-dom/vitest";
import { Blob, File } from "node:buffer";
import { fetch, Headers, Request, Response } from "undici";

// jsdom's Blob isn't readable by msw's XHR interceptor (it crashes rebuilding the request);
// swap in undici's Fetch classes before msw loads, so its `HttpResponse` uses them too. jsdom's
// File isn't an instance of this Blob either, so a File built from it serializes to the string
// "[object File]" instead of its bytes when msw rebuilds the request — swap File in too.
Object.assign(globalThis, { Blob, File, Headers, Request, Response, fetch });

const { server } = await import("./server");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// jsdom has no object URLs; components only need a stable string to put in <img src>. Vitest's
// jsdom environment does define createObjectURL, but its compat shim assumes jsdom's own Blob
// impl and crashes on the undici Blob swapped in above, so the stub replaces it unconditionally.
URL.createObjectURL = () => "blob:test";
URL.revokeObjectURL = () => {};
