// <faust-widget>: compiles its DSP when the page loads and shows its controls
import { component, expect, test } from "./helpers";

test("the widget compiles its DSP and shows its controls", async ({ page }) => {
    const widget = component(page, "widget");
    await expect(widget.locator("#power")).toBeEnabled();
    // faust-ui draws the labels: the control itself is checked
    await expect(widget.locator("#faust-ui .faust-ui-component-hslider")).toHaveCount(1);
    await expect(widget.locator("#faust-ui")).not.toContainText("Compiling");
});

test("switched on, the widget selects the test signal of its input attribute", async ({ page }) => {
    const widget = component(page, "widget");
    await expect(widget.locator("#power")).toBeEnabled();
    // the input selector is filled when the node is created, on the first power on
    await widget.locator("#power").click();
    await expect(widget.locator("#audio-input")).toBeEnabled();
    await expect(widget.locator("#audio-input option:checked")).toHaveText("impulse");
    // and its controls are shown under the DSP's own
    await expect(widget.locator("#faust-input")).toBeVisible();
});

test("the widget has no block diagram", async ({ page }) => {
    const widget = component(page, "widget");
    await expect(widget.locator("#power")).toBeEnabled();
    await expect(widget.locator("#faust-diagram")).toHaveCount(0);
});
