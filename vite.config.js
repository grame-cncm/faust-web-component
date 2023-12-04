import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, process.env.FAUST_WEB_BASIC ? "src/main-basic.ts" : "src/main.ts"),
            name: "faust_web_component",
            formats: ["iife"],
            fileName: () => {
                if (process.env.FAUST_WEB_BASIC) { return "faust-web-component-basic.js" }
                else { return "faust-web-component.js" }
            },
        },
        sourcemap: true,
    },
})
