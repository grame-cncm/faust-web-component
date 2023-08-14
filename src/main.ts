import {EditorView, basicSetup} from "codemirror"
import {StreamLanguage} from "@codemirror/language"
import {clike} from "@codemirror/legacy-modes/mode/clike"
import {FaustCompiler, FaustMonoDspGenerator, IFaustMonoWebAudioNode, LibFaust, instantiateFaustModuleFromFile} from "@grame/faustwasm"
import jsURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.js?url"
import dataURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.data?url"
import wasmURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.wasm?url"
import {FaustUI} from "@shren/faust-ui"
import faustCSS from "@shren/faust-ui/dist/esm/index.css?inline"
import {library, icon} from "@fortawesome/fontawesome-svg-core"
import {faPlay, faStop, faUpRightFromSquare, faSquareCaretLeft, faAnglesLeft, faAnglesRight} from "@fortawesome/free-solid-svg-icons"
import faustSvg from "./faustText.svg"

for (const icon of [faPlay, faStop, faUpRightFromSquare, faSquareCaretLeft, faAnglesLeft, faAnglesRight]) {
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

async function loadFaust() {
    // Setup Faust
    const module = await instantiateFaustModuleFromFile(jsURL, dataURL, wasmURL)
    const libFaust = new LibFaust(module)
    compiler = new FaustCompiler(libFaust)
}

const faustPromise = loadFaust()
const audioCtx = new AudioContext()
// TODO: Decide between one node shared between embedded editors or one node per editor.
let node: IFaustMonoWebAudioNode | undefined

const template = document.createElement("template")
template.innerHTML = `
<div id="root">
    <div id="controls">
        <button title="Run" class="button" id="run" disabled>${icon({ prefix: "fas", iconName: "play" }).html[0]}</button>
        <button title="Stop" class="button" id="stop" disabled>${icon({ prefix: "fas", iconName: "stop" }).html[0]}</button>
        <a title="Open in Faust IDE" id="ide" class="button" target="_blank">${icon({ prefix: "fas", iconName: "up-right-from-square" }).html[0]}</a>
        <!-- TODO: volume control? <input id="volume" type="range" min="0" max="100"> -->
        <a id="faust" href="https://faust.grame.fr/" target="_blank"><img src="${faustSvg}" height="15px" /></a>
    </div>
    <div id="content">
        <div id="editor"></div>
        <div id="sidebar">
            <div id="sidebar-buttons">
                <button title="Toggle sidebar" id="sidebar-toggle" class="button" disabled>${icon({ prefix: "fas", iconName: "angles-left" }).html[0]}</button>
                <!--
                    <button>UI</button>
                    <button>DI</button>
                -->
            </div>
            <div id="sidebar-content">
                <div id="faust-ui"></div>
            </div>
        </div>
    </div>
</div>
<style>
    #root {
        border: 1px solid black;
        border-radius: 5px;
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

    #content {
        display: flex;
    }

    #editor {
        flex-grow: 1;
    }

    #editor .cm-editor {
        height: 100%;
    }

    #sidebar {
        border-left: 1px solid black;
        display: flex;
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
    }

    a.button {
        appearance: button;
        box-sizing: border-box;
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
    editor: EditorView | undefined = undefined

    constructor() {
        super()
    }

    // TODO: include collapsible sidepane or underpane for UI and diagram
    connectedCallback() {
        const code = this.innerHTML.replace("<!--", "").replace("-->", "").trim()
        this.attachShadow({mode: "open"}).appendChild(template.content.cloneNode(true))

        const ideLink = this.shadowRoot!.querySelector("#ide") as HTMLAnchorElement
        const urlParams = new URLSearchParams()
        // TODO: Maybe open current contents of editor in IDE, rather than original contents.
        urlParams.set("inline", btoa(code).replace("+", "-").replace("/", "_"))
        ideLink.href = `https://faustide.grame.fr/?${urlParams.toString()}`

        this.editor = new EditorView({
            doc: code,
            extensions: [basicSetup, faustLanguage],
            parent: this.shadowRoot!.querySelector("#editor")!,
        })

        const runButton = this.shadowRoot!.querySelector("#run") as HTMLButtonElement
        const stopButton = this.shadowRoot!.querySelector("#stop") as HTMLButtonElement
        const faustUIRoot = this.shadowRoot!.querySelector("#faust-ui") as HTMLDivElement
        const sidebarContent = this.shadowRoot!.querySelector("#sidebar-content") as HTMLDivElement
        const sidebarToggle = this.shadowRoot!.querySelector("#sidebar-toggle") as HTMLButtonElement

        faustPromise.then(() => runButton.disabled = false)

        let sidebarOpen = false
        const setSidebarOpen = (open: boolean) => {
            sidebarOpen = open
            sidebarContent.style.display = open ? "flex" : "none"
            sidebarToggle.innerHTML = icon({ prefix: "fas", iconName: open ? "angles-right" : "angles-left" }).html[0]
        }

        runButton.onclick = async () => {
            if (audioCtx.state === "suspended") {
                await audioCtx.resume()
            }
            await faustPromise
            // Compile Faust code
            // TODO: Report errors to user
            await generator.compile(compiler, "dsp", this.editor!.state.doc.toString(), "")
            // Create an audio node from compiled Faust
            if (node !== undefined) node.disconnect()
            node = (await generator.createNode(audioCtx))!
            node.connect(audioCtx.destination)
            stopButton.disabled = false

            sidebarToggle.disabled = false
            setSidebarOpen(true)
            const faustUI = new FaustUI({ ui: node.getUI(), root: faustUIRoot })
            faustUI.paramChangeByUI = (path, value) => node!.setParamValue(path, value)
            node.setOutputParamHandler((path, value) => faustUI.paramChangeByDSP(path, value))
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
            }
        }
    }
}

customElements.define("faust-editor", FaustEditor)
