import { defineConfig, devices } from "@playwright/test";

// Browser tests of the components, against the build in dist/ (the script that
// pages load), served with the test pages by test/e2e/serve.mjs. `npm run
// test:e2e` builds first.
const port = 4174;

export default defineConfig({
    testDir: "test/e2e",
    timeout: 60_000,
    expect: { timeout: 20_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    reporter: process.env.CI ? "github" : "list",
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        trace: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                // As in a page the user has interacted with: an AudioContext starts
                // running, so the check that the tests keep it suspended means something
                launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
            },
        },
    ],
    webServer: {
        command: `node test/e2e/serve.mjs ${port}`,
        url: `http://127.0.0.1:${port}/components.html`,
        reuseExistingServer: !process.env.CI,
    },
});
