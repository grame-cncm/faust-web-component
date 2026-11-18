// The Block Diagram tab of <faust-editor>, plain and steppable (svg-* attributes)
import { component, diagram, expect, links, playerTexts, runAndOpenDiagram, test } from "./helpers";

test("without attributes, the diagram is plain", async ({ page }) => {
    const editor = component(page, "plain");
    await runAndOpenDiagram(editor);
    await expect(diagram(editor)).toHaveCount(1);
    await expect(diagram(editor).locator("script.faust-svg-step")).toHaveCount(0);
    expect(await playerTexts(editor)).toEqual([]);
    // small enough to be drawn in one diagram, without links
    expect(await links(editor)).toEqual([]);
});

test("svg-step makes a steppable diagram that starts at sample 0", async ({ page }) => {
    const editor = component(page, "step");
    await runAndOpenDiagram(editor);
    await expect(diagram(editor).locator("script.faust-svg-step")).toHaveCount(1);
    // a step on the input (svg-step-input="1"); the gate is pressed from sample 3
    await expect.poll(() => playerTexts(editor)).toEqual(
        expect.arrayContaining(["in0: 1.0", "out0: 0.5", "out1: 0.0", "n = 0   (0 … 15)"])
    );
});

test("the arrow keys step the diagram, and a link keeps the sample", async ({ page }) => {
    const editor = component(page, "step");
    await runAndOpenDiagram(editor);
    await diagram(editor).focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
    // smooth of a step: 1 - 0.5^5; the gated one: 0.5 at sample 3, 0.75 at 4
    await expect.poll(() => playerTexts(editor)).toEqual(
        expect.arrayContaining(["out0: 0.96875", "out1: 0.75", "n = 4   (0 … 15)"])
    );

    // svg-fold="0": smooth has a diagram of its own; c=1 is its second use, gated
    const targets = await links(editor);
    const second = targets.findIndex((href) => /^smooth-\d+\.svg#c=1/.test(href));
    expect(second, `links: ${targets}`).toBeGreaterThanOrEqual(0);
    await diagram(editor).locator("a").nth(second).dispatchEvent("click");
    await expect.poll(() => playerTexts(editor)).toEqual(
        expect.arrayContaining(["in0: 1.0", "out0: 0.75", "n = 4   (0 … 15)", expect.stringMatching(/^use 2 of 2/)])
    );
    expect(page.url()).toMatch(/\/components\.html$/);
});

test("svg-step-offset shifts the samples, svg-step-input loses its spaces", async ({ page }) => {
    const editor = component(page, "offset");
    await runAndOpenDiagram(editor);
    // svg-step-input="1 - 1'", an impulse, into + ~ *(0.5): 0.5^n
    await expect.poll(() => playerTexts(editor)).toEqual(
        expect.arrayContaining(["out0: 0.000976563", "n = 10   (10 … 13)"])
    );
});

test("svg-fold applies without svg-step, and the links of a plain diagram work", async ({ page }) => {
    const editor = component(page, "fold");
    await runAndOpenDiagram(editor);
    await expect(diagram(editor).locator("script.faust-svg-step")).toHaveCount(0);
    const targets = await links(editor);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((href) => /^smooth-\d+\.svg$/.test(href)), `links: ${targets}`).toBe(true);
    await diagram(editor).locator("a").first().dispatchEvent("click");
    await expect.poll(() => links(editor)).toContain("process.svg");
    expect(page.url()).toMatch(/\/components\.html$/);
});

test("the step attributes are ignored without svg-step, with a warning", async ({ page, log }) => {
    const editor = component(page, "ignored");
    await runAndOpenDiagram(editor);
    await expect(diagram(editor)).toHaveCount(1);
    await expect(diagram(editor).locator("script.faust-svg-step")).toHaveCount(0);
    expect(log.warnings).toContain("faust-editor: svg-step-input ignored without svg-step");
});

test("a compilation error of the step options is shown in the tab, and the page still compiles", async ({ page, log }) => {
    log.allowCompilationErrors();
    const editor = component(page, "bad-label");
    await runAndOpenDiagram(editor);
    await expect(editor.locator("#faust-diagram > .diagram-error")).toContainText(
        "no control labelled 'nope'"
    );
    // libfaust-wasm aborted the call on the error: the next diagram is still made
    const other = component(page, "offset");
    await runAndOpenDiagram(other);
    await expect.poll(() => playerTexts(other)).toEqual(expect.arrayContaining(["n = 10   (10 … 13)"]));
});

test("an invalid attribute value is shown in the tab", async ({ page }) => {
    const editor = component(page, "bad-fold");
    await runAndOpenDiagram(editor);
    await expect(editor.locator("#faust-diagram > .diagram-error")).toHaveText('svg-fold="x": expects an integer >= 0');
});
