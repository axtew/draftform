import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The hook renders into a DOM: Testing Library needs document and window.
    environment: "jsdom",
    include: ["src/**/__tests__/*.test.{ts,tsx}"],
    typecheck: {
      enabled: true,
      include: ["src/**/__tests__/*.test-d.{ts,tsx}"],
    },
  },
});
