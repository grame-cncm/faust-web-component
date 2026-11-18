// Static server for the browser tests: the test pages of test/e2e/pages, then the
// build in dist/ (faust-web-component.js and the audio file, which the component
// loads from next to the script). Usage: node test/e2e/serve.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const directories = [join(root, "test/e2e/pages"), join(root, "dist")];
const port = Number(process.argv[2] ?? 4174);
const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".map": "application/json",
    ".mp3": "audio/mpeg",
    ".svg": "image/svg+xml",
};

createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, "http://localhost").pathname));
    for (const directory of directories) {
        const file = join(directory, path);
        if (!file.startsWith(directory)) break;
        try {
            const content = await readFile(file);
            response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
            response.end(content);
            return;
        } catch {
            // not in this directory: try the next one
        }
    }
    response.writeHead(404);
    response.end("Not found");
}).listen(port, "127.0.0.1", () => console.log(`Serving the test pages on http://127.0.0.1:${port}/`));
