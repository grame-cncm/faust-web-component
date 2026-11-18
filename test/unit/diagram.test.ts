// diagramArgs: the svg-* attributes of <faust-editor> turned into compiler arguments
import { afterEach, describe, expect, it, vi } from "vitest";

// diagram.ts imports faustwasm and common.ts, which load libfaust and create an
// AudioContext in a browser: diagramArgs uses neither
vi.mock("@grame/faustwasm", () => ({ FaustSvgDiagrams: { display: vi.fn() } }));
vi.mock("../../src/common", () => ({ svgDiagrams: { from: vi.fn() } }));

import { diagramArgs } from "../../src/diagram";

// An element with these attributes: diagramArgs only reads them
function element(attributes: Record<string, string>): Element {
    return {
        getAttribute: (name: string) => (name in attributes ? attributes[name] : null),
        hasAttribute: (name: string) => name in attributes,
    } as unknown as Element;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("diagramArgs", () => {
    it("gives no argument without attributes", () => {
        expect(diagramArgs(element({}))).toBe("");
    });

    it("maps svg-fold to -f, also without svg-step", () => {
        expect(diagramArgs(element({ "svg-fold": "0" }))).toBe("-f 0");
        expect(diagramArgs(element({ "svg-fold": " 3 " }))).toBe("-f 3");
        expect(diagramArgs(element({ "svg-fold": "" }))).toBe("");
    });

    it("maps svg-step to -sst", () => {
        expect(diagramArgs(element({ "svg-step": "16" }))).toBe("-sst 16");
    });

    it("maps every step attribute, in the order of the compiler options", () => {
        const args = diagramArgs(
            element({
                "svg-step": "16",
                "svg-step-input": "1-1',0.5",
                "svg-step-controls": "gate=1@3 gate=0@8",
                "svg-step-offset": "10",
                "svg-fold": "0",
            })
        );
        expect(args).toBe("-f 0 -sst 16 -ssi 1-1',0.5 -ssc gate=1@3 -ssc gate=0@8 -sso 10");
    });

    it("removes the white space of the test signal", () => {
        // FaustSvgDiagrams.from splits its arguments at spaces
        expect(diagramArgs(element({ "svg-step": "4", "svg-step-input": " 1 - 1'\n" }))).toBe("-sst 4 -ssi 1-1'");
        expect(diagramArgs(element({ "svg-step": "4", "svg-step-input": "   " }))).toBe("-sst 4");
    });

    it("gives one -ssc per control, whatever the white space between them", () => {
        expect(diagramArgs(element({ "svg-step": "8", "svg-step-controls": "  gate=1@3\n\t gate=0@8 " }))).toBe(
            "-sst 8 -ssc gate=1@3 -ssc gate=0@8"
        );
    });

    it.each([
        ["svg-step", "0", ">= 1"],
        ["svg-step", "-4", ">= 1"],
        ["svg-step", "abc", ">= 1"],
        ["svg-step", "1.5", ">= 1"],
        ["svg-step", "16 8", ">= 1"],
        ["svg-step-offset", "-1", ">= 0"],
        ["svg-fold", "x", ">= 0"],
    ])("refuses %s=\"%s\"", (name, value, bound) => {
        const attributes: Record<string, string> = { "svg-step": "16", [name]: value };
        expect(() => diagramArgs(element(attributes))).toThrow(`${name}="${value}": expects an integer ${bound}`);
    });

    it("ignores the step attributes without svg-step, with a warning", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const args = diagramArgs(
            element({ "svg-step-input": "1", "svg-step-offset": "abc", "svg-fold": "0" })
        );
        expect(args).toBe("-f 0");
        expect(warn).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith("faust-editor: svg-step-input, svg-step-offset ignored without svg-step");
    });

    it("does not warn when no step attribute is given", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        diagramArgs(element({ "svg-fold": "0" }));
        expect(warn).not.toHaveBeenCalled();
    });
});
