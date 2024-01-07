import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
    return {
        build: {
            lib: {
                entry: resolve(__dirname, mode == "basic" ? "src/main-basic.ts" : "src/main.ts"),
                name: "faust_web_component",
                formats: ["iife"],
                fileName: () => {
                    if (mode == "basic") { return "faust-web-component-basic.js" }
                    else { return "faust-web-component.js" }
                },
            },
            sourcemap: true,
            emptyOutDir: false,
        }
    }
})
