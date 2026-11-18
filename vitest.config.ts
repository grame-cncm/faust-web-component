import { defineConfig } from "vitest/config";

// Unit tests: plain Node, no browser. The components themselves are tested in a
// browser by Playwright (test/e2e), which Vitest must not pick up.
export default defineConfig({
    test: {
        include: ["test/unit/**/*.test.ts"],
    },
});
