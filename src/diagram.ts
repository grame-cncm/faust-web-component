// Block diagram of <faust-editor>: the compiler arguments given by its svg-*
// attributes, and the display of the diagrams in its Block Diagram tab
import { FaustSvgDiagrams } from "@grame/faustwasm";
import { svgDiagrams } from "./common";

// The attributes that only apply with svg-step
const STEP_ATTRIBUTES = ["svg-step-input", "svg-step-controls", "svg-step-offset"];

// The value of an integer attribute, undefined when it is absent or empty
function integerAttribute(element: Element, name: string, min: number): string | undefined {
    const value = element.getAttribute(name)?.trim();
    if (!value) return undefined;
    if (!/^-?\d+$/.test(value) || Number(value) < min) {
        throw new Error(`${name}="${value}": expects an integer >= ${min}`);
    }
    return value;
}

/**
 * The diagram arguments given by the attributes of a component:
 * - svg-fold="n": -f n, the complexity above which a block is drawn in its own file;
 * - svg-step="n": -sst n, steppable diagrams showing the values of samples 0 to n-1,
 *   and with it svg-step-input (-ssi, the test signal), svg-step-controls (one -ssc
 *   per item separated by white space) and svg-step-offset (-sso).
 * FaustSvgDiagrams.from splits its arguments at every space and handles no quotes,
 * so the white space of the test signal is removed.
 * Throws an Error on a value that is not a valid integer.
 */
export function diagramArgs(element: Element): string {
    const args: string[] = [];
    const fold = integerAttribute(element, "svg-fold", 0);
    if (fold !== undefined) args.push("-f", fold);
    const samples = integerAttribute(element, "svg-step", 1);
    if (samples === undefined) {
        const ignored = STEP_ATTRIBUTES.filter(name => element.hasAttribute(name));
        if (ignored.length > 0) console.warn(`faust-editor: ${ignored.join(", ")} ignored without svg-step`);
        return args.join(" ");
    }
    args.push("-sst", samples);
    const input = (element.getAttribute("svg-step-input") ?? "").replace(/\s+/g, "");
    if (input) args.push("-ssi", input);
    for (const control of (element.getAttribute("svg-step-controls") ?? "").split(/\s+/)) {
        if (control) args.push("-ssc", control);
    }
    const offset = integerAttribute(element, "svg-step-offset", 0);
    if (offset !== undefined) args.push("-sso", offset);
    return args.join(" ");
}

/**
 * Generates the diagrams of code with the arguments given by the attributes of
 * element, read again at each call, and shows process.svg in container:
 * FaustSvgDiagrams.display follows its links to the sub-diagrams, and starts the
 * player of a steppable diagram. An invalid attribute or a compilation error is
 * shown in its place.
 */
export function showDiagrams(container: HTMLElement, code: string, element: Element): void {
    try {
        FaustSvgDiagrams.display(container, svgDiagrams.from("main", code, diagramArgs(element)));
    } catch (e: any) {
        const error = document.createElement("pre");
        error.className = "diagram-error";
        error.textContent = e?.message ?? String(e);
        container.replaceChildren(error);
    }
}
