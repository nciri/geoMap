import { expect, test as base } from "@playwright/test";

// Fails a test on any uncaught page error, MapLibre style warning ("layers[id]...: ...") or
// MapLibre worker failure: each leaves the UI looking fine while part of the map stops working.
export const test = base.extend<{ pageProblems: void }>({
  pageProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("pageerror", (error) => problems.push(error.stack ?? error.message));
      page.on("console", (message) => {
        const text = message.text();
        if (
          (message.type() === "warning" && text.startsWith("layers[")) ||
          text.includes("Worker failed to load")
        ) {
          problems.push(text);
        }
      });
      await use();
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
