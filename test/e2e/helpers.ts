// Shared setup of the browser tests
import { test as base, expect, type Locator, type Page } from "@playwright/test";

declare global {
    interface Window {
        __contexts: AudioContext[];
    }
}

// Before the component script runs: keep every AudioContext suspended, so that a
// test is never heard and does not depend on audio output, and record them.
// Compilation, nodes, controls and diagrams work with a suspended context.
function keepAudioSuspended() {
    window.__contexts = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
        constructor(options?: AudioContextOptions) {
            super(options);
            Native.prototype.suspend.call(this);
            window.__contexts.push(this);
        }
    };
    AudioContext.prototype.resume = async () => {};
}

// What libfaust-wasm logs on every compilation error: it is built without
// exception catching, so a Faust error aborts the call, after recording its
// message, which faustwasm then reads; the module keeps working.
const COMPILATION_ABORT = /^Aborted\(Assertion failed: Exception thrown, but exception catching is not enabled/;

type PageLog = {
    /** the console warnings of the page */
    warnings: string[];
    /** allows the console error that libfaust-wasm logs on a compilation error */
    allowCompilationErrors(): void;
};

type Fixtures = {
    log: PageLog;
};

/**
 * test, with the audio kept suspended, the components page opened, and a check
 * after each test that the page threw no error, logged no console error (but
 * the one of a compilation error, when allowed), and left every AudioContext
 * suspended.
 */
export const test = base.extend<Fixtures>({
    log: [async ({ page }, use) => {
        const errors: string[] = [];
        let allowCompilationErrors = false;
        const log: PageLog = {
            warnings: [],
            allowCompilationErrors: () => { allowCompilationErrors = true; },
        };
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text());
            if (message.type() === "warning") log.warnings.push(message.text());
        });
        await page.addInitScript(keepAudioSuspended);
        await page.goto("/components.html");
        await use(log);
        const unexpected = errors.filter((error) => !(allowCompilationErrors && COMPILATION_ABORT.test(error)));
        expect(unexpected, "errors of the page").toEqual([]);
        const states = await page.evaluate(() => window.__contexts.map((context) => context.state));
        expect(states.length, "AudioContexts created").toBeGreaterThan(0);
        expect(states.every((state) => state === "suspended"), `AudioContext states: ${states}`).toBe(true);
    }, { auto: true }],
});

export { expect };

/** The component with this id */
export function component(page: Page, id: string): Locator {
    return page.locator(`#${id}`);
}

/**
 * Runs an editor, opens its Block Diagram tab and waits for the diagram (or the
 * error shown in its place).
 */
export async function runAndOpenDiagram(editor: Locator): Promise<void> {
    await expect(editor.locator("#run")).toBeEnabled();
    await editor.locator("#run").click();
    await expect(editor.locator("#tab-diagram")).toBeEnabled();
    await editor.locator("#tab-diagram").click();
    await expect(editor.locator("#faust-diagram > svg, #faust-diagram > .diagram-error")).toHaveCount(1);
}

/** The diagram shown in the Block Diagram tab of an editor */
export function diagram(editor: Locator): Locator {
    return editor.locator("#faust-diagram > svg");
}

/**
 * The texts of the shown diagram that the player writes: the values of the
 * inputs and outputs ("in0: 1.0", "out0: 0.5"), the sample ("n = 4   (0 … 15)")
 * and the use of a sub-diagram ("use 2 of 2 · from process ...").
 */
export async function playerTexts(editor: Locator): Promise<string[]> {
    const texts = await diagram(editor).locator("text").allTextContents();
    return texts.filter((text) => /^(in\d+:|out\d+:|n = |use )/.test(text));
}

/** The links of the shown diagram */
export async function links(editor: Locator): Promise<string[]> {
    return diagram(editor)
        .locator("a")
        .evaluateAll((anchors) =>
            anchors.map((a) => a.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? a.getAttribute("href") ?? "")
        );
}
