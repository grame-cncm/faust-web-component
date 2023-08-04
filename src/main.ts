import {EditorView, basicSetup} from "codemirror"
import {StreamLanguage} from "@codemirror/language"
import {clike} from "@codemirror/legacy-modes/mode/clike"
import {FaustCompiler, FaustMonoDspGenerator, LibFaust, instantiateFaustModuleFromFile} from "@grame/faustwasm"
import jsURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.js?url"
import dataURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.data?url"
import wasmURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.wasm?url"
import {library, icon} from "@fortawesome/fontawesome-svg-core"
import {faPlay, faStop, faUpRightFromSquare} from "@fortawesome/free-solid-svg-icons"
import faustSvg from "./faustText.svg"

for (const icon of [faPlay, faStop, faUpRightFromSquare]) {
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

const generator = new FaustMonoDspGenerator()
let compiler: FaustCompiler
console.log(compiler!, generator)
async function loadFaust() {
    // Setup Faust
    const module = await instantiateFaustModuleFromFile(jsURL, dataURL, wasmURL)
    const libFaust = new LibFaust(module)
    compiler = new FaustCompiler(libFaust)
    console.log("Loaded Faust")
}

const faustPromise = loadFaust()
const audioCtx = new AudioContext()
// TODO: Decide between one node shared between embedded editors or one node per editor.
let node: AudioNode | undefined

const template = document.createElement("template")
template.innerHTML = `
<div id="root">
    <div id="controls">
        <button class="button" id="run" disabled>${icon({ prefix: "fas", iconName: "play" }).html[0]}</button>
        <button class="button" id="stop" disabled>${icon({ prefix: "fas", iconName: "stop" }).html[0]}</button>
        <a id="ide" class="button" target="_blank">${icon({ prefix: "fas", iconName: "up-right-from-square" }).html[0]}</a>
        <!-- TODO: volume control? <input id="volume" type="range" min="0" max="100"> -->
        <a id="faust" href="https://faust.grame.fr/" target="_blank"><img src="${faustSvg}" height="15px" /></a>
    </div>
    <div id="editor">
    </div>
</div>
<style>
    #root {
        border: 1px solid black;
        border-radius: 5px;
    }

    #controls {
        background: #384d64;
        border-bottom: 1px solid black;
        display: flex;
    }

    #faust {
        margin-left: auto;
        margin-right: 10px;
        display: flex;
        align-items: center;
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
        background: #373736;
    }

    .button:disabled {
        opacity: 0.65;
    }

    #controls > .button > svg {
        width: 15px;
        height: 15px;
        vertical-align: top;
    }
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

        faustPromise.then(() => runButton.disabled = false)

        runButton.onclick = async () => {
            if (audioCtx.state === "suspended") {
                await audioCtx.resume()
            }
            await faustPromise
            // Compile Faust code
            await generator.compile(compiler, "dsp", this.editor!.state.doc.toString(), "")
            // Create an audio node from compiled Faust
            if (node !== undefined) node.disconnect()
            node = (await generator.createNode(audioCtx))!
            node.connect(audioCtx.destination)
            stopButton.disabled = false
        }

        stopButton.onclick = () => {
            if (node !== undefined) {
                node.disconnect()
                node = undefined
                stopButton.disabled = true
            }
        }
    }
}

customElements.define("faust-editor", FaustEditor)
