import {EditorView} from "codemirror"
// Most of the basic CodeMirror setup, sans folds.
import {lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, keymap} from "@codemirror/view"
import {history, defaultKeymap, historyKeymap} from "@codemirror/commands"
import {indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching} from "@codemirror/language"
import {highlightSelectionMatches, searchKeymap} from "@codemirror/search"
import {closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap} from "@codemirror/autocomplete"
import {EditorState} from "@codemirror/state"
// Custom CodeMirror setup
import {StreamLanguage} from "@codemirror/language"
import {clike} from "@codemirror/legacy-modes/mode/clike"
import {lintKeymap, setDiagnostics, openLintPanel, closeLintPanel} from "@codemirror/lint"

import {FaustCompiler, FaustMonoDspGenerator, FaustSvgDiagrams, IFaustMonoWebAudioNode, LibFaust, instantiateFaustModuleFromFile} from "@grame/faustwasm"
import jsURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.js?url"
import dataURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.data?url"
import wasmURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.wasm?url"
import {FaustUI} from "@shren/faust-ui"
import faustCSS from "@shren/faust-ui/dist/esm/index.css?inline"
import {library, icon} from "@fortawesome/fontawesome-svg-core"
import {faPlay, faStop, faUpRightFromSquare, faSquareCaretLeft, faAnglesLeft, faAnglesRight, faSliders, faDiagramProject, faWaveSquare, faChartLine} from "@fortawesome/free-solid-svg-icons"
import faustSvg from "./faustText.svg"
import {Scope} from "./scope"

for (const icon of [faPlay, faStop, faUpRightFromSquare, faSquareCaretLeft, faAnglesLeft, faAnglesRight, faSliders, faDiagramProject, faWaveSquare, faChartLine]) {
    library.add(icon)
}

const keywords = "process component import library declare with environment route waveform soundfile"
const atoms = "mem prefix int float rdtable rwtable select2 select3 ffunction fconstant fvariable button checkbox vslider hslider nentry vgroup hgroup tgroup vbargraph hbargraph attach acos asin atan atan2 cos sin tan exp log log10 pow sqrt abs min max fmod remainder floor ceil rint"

function words(str: string) {
    const obj: {[key: string]: true} = {}
    const words = str.split(" ")
    for (let i = 0; i < words.length; i++) obj[words[i]] = true
    return obj
}

const faustLanguage = StreamLanguage.define(clike({
    name: "clike",
    multiLineStrings: true,
    keywords: words(keywords),
    atoms: words(atoms),
    hooks: {
        "@": () => "meta",
        "'": () => "meta",
    }
}))

const generator = new FaustMonoDspGenerator() // TODO: Support polyphony
let compiler: FaustCompiler
let svgDiagrams: FaustSvgDiagrams

async function loadFaust() {
    // Setup Faust
    const module = await instantiateFaustModuleFromFile(jsURL, dataURL, wasmURL)
    const libFaust = new LibFaust(module)
    compiler = new FaustCompiler(libFaust)
    svgDiagrams = new FaustSvgDiagrams(compiler)

}

const faustPromise = loadFaust()
const audioCtx = new AudioContext()

const template = document.createElement("template")
template.innerHTML = `
<div id="root">
    <div id="controls">
        <button title="Run" class="button" id="run" disabled>${icon({ prefix: "fas", iconName: "play" }).html[0]}</button>
        <button title="Stop" class="button" id="stop" disabled>${icon({ prefix: "fas", iconName: "stop" }).html[0]}</button>
        <a title="Open in Faust IDE" id="ide" href="https://faustide.grame.fr/" class="button" target="_blank">${icon({ prefix: "fas", iconName: "up-right-from-square" }).html[0]}</a>
        <!-- TODO: volume control? <input id="volume" type="range" min="0" max="100"> -->
        <a title="Faust website" id="faust" href="https://faust.grame.fr/" target="_blank"><img src="${faustSvg}" height="15px" /></a>
    </div>
    <div id="content">
        <div id="editor"></div>
        <div id="sidebar">
            <div id="sidebar-buttons">
                <button title="Toggle sidebar" id="sidebar-toggle" class="button" disabled>${icon({ prefix: "fas", iconName: "angles-left" }).html[0]}</button>
                <button title="Controls" id="tab-ui" class="button tab" disabled>${icon({ prefix: "fas", iconName: "sliders" }).html[0]}</button>
                <button title="Block Diagram" id="tab-diagram" class="button tab" disabled>${icon({ prefix: "fas", iconName: "diagram-project" }).html[0]}</button>
                <button title="Scope" id="tab-scope" class="button tab" disabled>${icon({ prefix: "fas", iconName: "wave-square" }).html[0]}</button>
                <button title="Spectrum" id="tab-spectrum" class="button tab" disabled>${icon({ prefix: "fas", iconName: "chart-line" }).html[0]}</button>
            </div>
            <div id="sidebar-content">
                <div id="faust-ui"></div>
                <div id="faust-diagram"></div>
                <div id="faust-scope"></div>
                <div id="faust-spectrum"></div>
            </div>
        </div>
    </div>
</div>
<style>
    #root {
        border: 1px solid black;
        border-radius: 5px;
        box-sizing: border-box;
    }

    *, *:before, *:after {
        box-sizing: inherit; 
    }

    #controls {
        background-color: #384d64;
        border-bottom: 1px solid black;
        display: flex;
    }

    #faust {
        margin-left: auto;
        margin-right: 10px;
        display: flex;
        align-items: center;
    }

    #faust-scope, #faust-spectrum {
        min-width: 220px;
        min-height: 150px;
    }

    #content {
        display: flex;
    }

    #editor {
        flex-grow: 1;
        overflow-y: auto;
    }

    #editor .cm-editor {
        height: 100%;
    }

    .cm-diagnostic {
        font-family: monospace;
    }

    .cm-diagnostic-error {
        background-color: #fdf2f5 !important;
        color: #a4000f !important;
        border-color: #a4000f !important;
    }

    #sidebar {
        border-left: 1px solid black;
        display: flex;
        max-width: 100%;
    }

    #sidebar-toggle {
        border-bottom: 1px solid black;
        flex-grow: 0;
    }

    .tab {
        flex-grow: 1;
    }

    #sidebar-buttons .tab.active {
        background-color: #bbb;
    }

    #sidebar-buttons {
        background-color: #f5f5f5;
        display: flex;
        flex-direction: column;
    }

    #sidebar-buttons .button {
        background-color: #f5f5f5;
        color: #000;
        width: 20px;
        height: 20px;
        padding: 4px;
    }

    #sidebar-buttons .button:hover {
        background-color: #ccc;
    }

    #sidebar-buttons .button:active {
        background-color: #aaa;
    }

    #sidebar-content {
        background-color: #fff;
        display: none;
        border-left: 1px solid black;
        overflow: auto
    }

    #sidebar-content > div {
        display: none;
    }

    #sidebar-content > div.active {
        display: block;
    }

    a.button {
        appearance: button;
    }

    .button {
        background-color: #384d64;
        border: 0;
        padding: 5px;
        width: 25px;
        height: 25px;
        color: #fff;
    }

    .button:hover {
        background-color: #4b71a1;
    }

    .button:active {
        background-color: #373736;
    }

    .button:disabled {
        opacity: 0.65;
        cursor: not-allowed;
        pointer-events: none;
    }

    #controls > .button > svg {
        width: 15px;
        height: 15px;
        vertical-align: top;
    }

    ${faustCSS}
</style>
`

class FaustEditor extends HTMLElement {
    constructor() {
        super()
    }

    connectedCallback() {
        const code = this.innerHTML.replace("<!--", "").replace("-->", "").trim()
        this.attachShadow({mode: "open"}).appendChild(template.content.cloneNode(true))

        const ideLink = this.shadowRoot!.querySelector("#ide") as HTMLAnchorElement
        ideLink.onfocus = () => {
            // Open current contents of editor in IDE
            const urlParams = new URLSearchParams()
            urlParams.set("inline", btoa(editor.state.doc.toString()).replace("+", "-").replace("/", "_"))
            ideLink.href = `https://faustide.grame.fr/?${urlParams.toString()}`
        }

        const editor = new EditorView({
            doc: code,
            extensions: [
                lineNumbers(),
                highlightActiveLineGutter(),
                highlightSpecialChars(),
                history(),
                // foldGutter(),
                drawSelection(),
                dropCursor(),
                EditorState.allowMultipleSelections.of(true),
                indentOnInput(),
                syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
                bracketMatching(),
                closeBrackets(),
                autocompletion(),
                rectangularSelection(),
                crosshairCursor(),
                highlightActiveLine(),
                highlightSelectionMatches(),
                keymap.of([
                    ...closeBracketsKeymap,
                    ...defaultKeymap,
                    ...searchKeymap,
                    ...historyKeymap,
                    ...completionKeymap,
                    ...lintKeymap
                ]),
                faustLanguage,
            ],
            parent: this.shadowRoot!.querySelector("#editor")!,
        })

        const runButton = this.shadowRoot!.querySelector("#run") as HTMLButtonElement
        const stopButton = this.shadowRoot!.querySelector("#stop") as HTMLButtonElement
        const faustUIRoot = this.shadowRoot!.querySelector("#faust-ui") as HTMLDivElement
        const faustDiagram = this.shadowRoot!.querySelector("#faust-diagram") as HTMLDivElement
        const sidebarContent = this.shadowRoot!.querySelector("#sidebar-content") as HTMLDivElement
        const sidebarToggle = this.shadowRoot!.querySelector("#sidebar-toggle") as HTMLButtonElement
        const tabButtons = [...this.shadowRoot!.querySelectorAll(".tab")] as HTMLButtonElement[]
        const tabContents = [...sidebarContent.querySelectorAll("div")] as HTMLDivElement[]

        faustPromise.then(() => runButton.disabled = false)

        let sidebarOpen = false
        const setSidebarOpen = (open: boolean) => {
            sidebarOpen = open
            sidebarContent.style.display = open ? "flex" : "none"
            sidebarToggle.innerHTML = icon({ prefix: "fas", iconName: open ? "angles-right" : "angles-left" }).html[0]
        }

        let node: IFaustMonoWebAudioNode | undefined
        let analyser: AnalyserNode | undefined
        let scope: Scope | undefined
        let spectrum: Scope | undefined

        runButton.onclick = async () => {
            if (audioCtx.state === "suspended") {
                await audioCtx.resume()
            }
            await faustPromise
            // Compile Faust code
            const code = editor.state.doc.toString()
            // TODO: Report errors to user
            try {
                await generator.compile(compiler, "main", code, "")
            } catch (e: any) {
                // Extract line number if available
                const rawMessage = (e as Error).message.trim()
                const match = rawMessage.match(/^main : (\d+) : (.*)$/)
                const message = match ? match[2] : rawMessage
                const { from, to } = match ? editor.state.doc.line(+match[1]) : { from: 0, to: 0 }
                // Show error in editor
                editor.dispatch(setDiagnostics(editor.state, [{
                    from, to,
                    severity: "error",
                    message,
                }]))
                openLintPanel(editor)
                return
            }
            // Clear any old errors
            editor.dispatch(setDiagnostics(editor.state, []))
            closeLintPanel(editor)

            // Create an audio node from compiled Faust
            if (node !== undefined) node.disconnect()
            node = (await generator.createNode(audioCtx))!
            node.connect(audioCtx.destination)
            stopButton.disabled = false
            for (const tabButton of tabButtons) {
                tabButton.disabled = false
            }
            sidebarToggle.disabled = false
            // TODO: Only open Faust UI if there are actual UI elements (not just an empty box labeled "dsp").
            setSidebarOpen(true)
            openTab(0)
            const faustUI = new FaustUI({ ui: node.getUI(), root: faustUIRoot })
            faustUI.paramChangeByUI = (path, value) => node!.setParamValue(path, value)
            node.setOutputParamHandler((path, value) => faustUI.paramChangeByDSP(path, value))

            setSVG(svgDiagrams.from("main", code, "")["process.svg"])

            analyser = new AnalyserNode(audioCtx, {
                fftSize: Math.pow(2, 11), minDecibels: -96, maxDecibels: 0, smoothingTimeConstant: 0.85
            })
            node.connect(analyser)
            scope = new Scope(tabContents[2])
            spectrum = new Scope(tabContents[3])
        }

        const setSVG = (svgString: string) => {
            faustDiagram.innerHTML = svgString

            for (const a of faustDiagram.querySelectorAll("a")) {
                a.onclick = e => {
                    e.preventDefault()
                    const filename = (a.href as any as SVGAnimatedString).baseVal
                    const svgString = compiler.fs().readFile("main-svg/" + filename, { encoding: "utf8" }) as string
                    setSVG(svgString)
                }
            }
        }

        let animPlot: number | undefined
        const drawScope = () => {
            scope!.renderScope([{
                analyser: analyser!,
                style: "rgb(212, 100, 100)",
                edgeThreshold: 0.09,
            }])
            animPlot = requestAnimationFrame(drawScope)
        }

        const drawSpectrum = () => {
            spectrum!.renderSpectrum(analyser!)
            animPlot = requestAnimationFrame(drawSpectrum)
        }

        const openTab = (i: number) => {
            setSidebarOpen(true)
            for (const [j, tab] of tabButtons.entries()) {
                if (i === j) {
                    tab.classList.add("active")
                    tabContents[j].classList.add("active")
                } else {
                    tab.classList.remove("active")
                    tabContents[j].classList.remove("active")
                }
            }
            if (i === 2) {
                scope!.onResize()
                if (animPlot !== undefined) cancelAnimationFrame(animPlot)
                animPlot = requestAnimationFrame(drawScope)
            } else if (i === 3) {
                spectrum!.onResize()
                if (animPlot !== undefined) cancelAnimationFrame(animPlot)
                animPlot = requestAnimationFrame(drawSpectrum)
            } else if (animPlot !== undefined) {
                cancelAnimationFrame(animPlot)
                animPlot = undefined
            }
        }

        for (const [i, tabButton] of tabButtons.entries()) {
            tabButton.onclick = () => openTab(i)
        }

        sidebarToggle.onclick = () => {
            setSidebarOpen(!sidebarOpen)
        }

        stopButton.onclick = () => {
            if (node !== undefined) {
                node.disconnect()
                node.destroy()
                node = undefined
                stopButton.disabled = true
                setSidebarOpen(false)
                sidebarToggle.disabled = true
                for (const tabButton of tabButtons) {
                    tabButton.disabled = true
                }
            }
        }
    }
}

customElements.define("faust-editor", FaustEditor)
