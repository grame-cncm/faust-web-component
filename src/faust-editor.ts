import { icon } from "@fortawesome/fontawesome-svg-core"
import { FaustMonoDspGenerator, FaustPolyDspGenerator, IFaustMonoWebAudioNode } from "@grame/faustwasm"
import { FaustUI } from "@shren/faust-ui"
import faustCSS from "@shren/faust-ui/dist/esm/index.css?inline"
import Split from "split.js"
import { faustPromise, audioCtx, compiler, svgDiagrams, default_generator, get_mono_generator, get_poly_generator, getInputDevices, deviceUpdateCallbacks, accessMIDIDevice, midiInputCallback, extractMidiAndNvoices } from "./common"
import { createEditor, setError, clearError } from "./editor"
import { Scope } from "./scope"
import faustSvg from "./faustText.svg"

function editorTemplate(minHeight: string = "") {
    const editorMinHeight = minHeight != "" ? `min-height: ${minHeight};` : ""
    const template = document.createElement("template")
    let copyButton = `<button title="Copy" class="button" id="copy">${icon({ prefix: "fas", iconName: "copy" }).html[0]}</button>`
    if (!navigator.clipboard) {
        console.log("Unable to use clipboard")
        copyButton = ""
    }
    template.innerHTML = `
    <div id="root">
        <div id="controls">
            <button title="Run" class="button" id="run" disabled>${icon({ prefix: "fas", iconName: "play" }).html[0]}</button>
            <button title="Stop" class="button" id="stop" disabled>${icon({ prefix: "fas", iconName: "stop" }).html[0]}</button>
            <a title="Open in Faust IDE" id="ide" href="https://faustide.grame.fr/" class="button" target="_blank">${icon({ prefix: "fas", iconName: "up-right-from-square" }).html[0]}</a>
            ${copyButton}
            <select id="audio-input" class="dropdown" disabled>
                <option>Audio input</option>
            </select>
            <!-- TODO: MIDI input
            <select id="midi-input" class="dropdown" disabled>
                <option>MIDI input</option>
            </select>
            -->
            <!-- TODO: volume control? <input id="volume" type="range" min="0" max="100"> -->
            <a title="Faust website" id="faust" href="https://faust.grame.fr/" target="_blank"><img src="${faustSvg}" height="15px" /></a>
        </div>
        <div id="content">
            <div id="editor"></div>
            <div id="sidebar">
                <div id="sidebar-buttons">
                    <button title="Controls" id="tab-ui" class="button tab" disabled>${icon({ prefix: "fas", iconName: "sliders" }).html[0]}</button>
                    <button title="Block Diagram" id="tab-diagram" class="button tab" disabled>${icon({ prefix: "fas", iconName: "diagram-project" }).html[0]}</button>
                    <button title="Scope" id="tab-scope" class="button tab" disabled>${icon({ prefix: "fas", iconName: "wave-square" }).html[0]}</button>
                    <button title="Spectrum" id="tab-spectrum" class="button tab" disabled>${icon({ prefix: "fas", iconName: "chart-line" }).html[0]}</button>
                </div>
                <div id="sidebar-content" >
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
            overflow:hidden;
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

        #faust-ui {
            width: 232px;
            max-height: 150px;
        }

        #faust-scope, #faust-spectrum {
            min-width: 232px;
            min-height: 150px;
        }

        #faust-diagram {
            max-width: 232px;
            height: 150px;
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
            ${minHeight != "" ? `min-height: ${minHeight};` : ""}
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
            display: flex;
            max-width: 100%;
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
            background-color: #ddd;
        }

        #sidebar-buttons .button:active {
            background-color: #aaa;
        }

        #sidebar-content {
            background-color: #fff;
            border-left: 1px solid #ccc;
            overflow: auto;
            flex-grow: 1;
            max-height: 100%;
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

        .dropdown {
            height: 19px;
            margin: 3px 0 3px 10px;
            border: 0;
            background: #fff;
        }

        .gutter {
            background-color: #f5f5f5;
            background-repeat: no-repeat;
            background-position: 50%;
        }
        
        .gutter.gutter-horizontal {
            background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAeCAYAAADkftS9AAAAIklEQVQoU2M4c+bMfxAGAgYYmwGrIIiDjrELjpo5aiZeMwF+yNnOs5KSvgAAAABJRU5ErkJggg==');
            cursor: col-resize;
        }

        ${faustCSS}
    </style>
    `
    return template
}

export default class FaustEditor extends HTMLElement {
    constructor() {
        super()
    }
    
    readonly = false
    minHeight = null
    editor = null
    
    getCodeString() {
        return this.editor.state.doc.toString()
    }

    connectedCallback() {
        const code = this.innerHTML.replace("<!--", "").replace("-->", "").trim()
        this.attachShadow({ mode: "open" }).appendChild(editorTemplate(this.minHeight).content.cloneNode(true))

        const ideLink = this.shadowRoot!.querySelector("#ide") as HTMLAnchorElement
        ideLink.onfocus = () => {
            // Open current contents of editor in IDE
            const urlParams = new URLSearchParams()
            urlParams.set("inline", btoa(editor.state.doc.toString()).replace("+", "-").replace("/", "_"))
            ideLink.href = `https://faustide.grame.fr/?${urlParams.toString()}`
        }

        const editorEl = this.shadowRoot!.querySelector("#editor") as HTMLDivElement
        const editor = createEditor(editorEl, code, this.readonly)

        const runButton = this.shadowRoot!.querySelector("#run") as HTMLButtonElement
        const stopButton = this.shadowRoot!.querySelector("#stop") as HTMLButtonElement
        const copyButton = this.shadowRoot!.querySelector("#copy") as HTMLButtonElement
        const faustUIRoot = this.shadowRoot!.querySelector("#faust-ui") as HTMLDivElement
        const faustDiagram = this.shadowRoot!.querySelector("#faust-diagram") as HTMLDivElement
        const sidebar = this.shadowRoot!.querySelector("#sidebar") as HTMLDivElement
        const sidebarContent = this.shadowRoot!.querySelector("#sidebar-content") as HTMLDivElement
        const tabButtons = [...this.shadowRoot!.querySelectorAll(".tab")] as HTMLButtonElement[]
        const tabContents = [...sidebarContent.querySelectorAll("div")] as HTMLDivElement[]

        const split = Split([editorEl, sidebar], {
            sizes: [100, 0],
            minSize: [0, 20],
            gutterSize: 7,
            snapOffset: 150,
            onDragEnd: () => { scope?.onResize(); spectrum?.onResize() },
        })

        faustPromise.then(() => runButton.disabled = false)

        const defaultSizes = [70, 30]
        let sidebarOpen = false
        const openSidebar = () => {
            if (!sidebarOpen) {
                split.setSizes(defaultSizes)
            }
            sidebarOpen = true
        }

        let node: IFaustMonoWebAudioNode | undefined
        let input: MediaStreamAudioSourceNode | undefined
        let analyser: AnalyserNode | undefined
        let scope: Scope | undefined
        let spectrum: Scope | undefined
        let gmidi = false
        let gnvoices = -1
        let sourceNode: AudioBufferSourceNode = undefined;

        runButton.onclick = async () => {
            if (audioCtx.state === "suspended") {
                await audioCtx.resume()
            }
            await faustPromise
            // Compile Faust code
            const code = editor.state.doc.toString()
            let generator = null
            try {
                // Compile Faust code to access JSON metadata
                await default_generator.compile(compiler, "main", code, "")
                const json = default_generator.getMeta()
                let { midi, nvoices } = extractMidiAndNvoices(json);
                gmidi = midi;
                gnvoices = nvoices;

                // Build the generator
                generator = nvoices > 0 ? get_poly_generator() : get_mono_generator();
                await generator.compile(compiler, "main", code, "");

            } catch (e: any) {
                setError(editor, e)
                return
            }
            // Clear any old errors
            clearError(editor)

            // Create an audio node from compiled Faust
            if (node !== undefined) node.disconnect()
            if (gnvoices > 0) {
                node = (await (generator as FaustPolyDspGenerator).createNode(audioCtx, gnvoices))!
            } else {
                node = (await (generator as FaustMonoDspGenerator).createNode(audioCtx))!
            }
            if (node.numberOfInputs > 0) {
                audioInputSelector.disabled = false
                updateInputDevices(await getInputDevices())
                await connectInput()
            } else {
                audioInputSelector.disabled = true
                audioInputSelector.innerHTML = "<option>Audio input</option>"
            }
            node.connect(audioCtx.destination)
            stopButton.disabled = false
            for (const tabButton of tabButtons) {
                tabButton.disabled = false
            }

            // Access MIDI device
            if (gmidi) {
                accessMIDIDevice(midiInputCallback(node))
                    .then(() => {
                        console.log('Successfully connected to the MIDI device.');
                    })
                    .catch((error) => {
                        console.error('Error accessing MIDI device:', error.message);
                    });
            }

            openSidebar()
            // Clear old tab contents
            for (const tab of tabContents) {
                while (tab.lastChild) tab.lastChild.remove()
            }
            // Create scope & spectrum plots
            analyser = new AnalyserNode(audioCtx, {
                fftSize: Math.pow(2, 11), minDecibels: -96, maxDecibels: 0, smoothingTimeConstant: 0.85
            })
            node.connect(analyser)
            scope = new Scope(tabContents[2])
            spectrum = new Scope(tabContents[3])

            // If there are UI elements, open Faust UI (controls tab); otherwise open spectrum analyzer.
            const ui = node.getUI()
            openTab(ui.length > 1 || ui[0].items.length > 0 ? 0 : 3)

            // Create controls via Faust UI
            const faustUI = new FaustUI({ ui, root: faustUIRoot })
            faustUI.paramChangeByUI = (path, value) => node?.setParamValue(path, value)
            node.setOutputParamHandler((path, value) => faustUI.paramChangeByDSP(path, value))

            // Create SVG block diagram
            setSVG(svgDiagrams.from("main", code, "")["process.svg"])

            // Set editor size to fit UI size or use custom value in attribute
            if (this.minHeight != null) {
                editorEl.style.height = this.minHeight;
            } else {
                editorEl.style.height = `${Math.max(125, faustUI.minHeight)}px`;
            }
            faustUIRoot.style.width = faustUI.minWidth * 1.25 + "px"
            faustUIRoot.style.height = faustUI.minHeight * 1.25 + "px"
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
        
        if (copyButton !== null) {
            copyButton.onclick = () => {
                navigator.clipboard.writeText(editor.state.doc.toString())
            }
        }
        
        stopButton.onclick = () => {
            if (node !== undefined) {
                node.disconnect()
                node.destroy()
                node = undefined
                stopButton.disabled = true
                // TODO: Maybe disable controls in faust-ui tab.
            }
        }

        const audioInputSelector = this.shadowRoot!.querySelector("#audio-input") as HTMLSelectElement

        const updateInputDevices = (devices: MediaDeviceInfo[]) => {
            if (audioInputSelector.disabled) return
            while (audioInputSelector.lastChild) audioInputSelector.lastChild.remove()
            for (const device of devices) {
                if (device.kind === "audioinput") {
                    audioInputSelector.appendChild(new Option(device.label || device.deviceId, device.deviceId))
                }
            }
            audioInputSelector.appendChild(new Option("Audio File", "Audio File"))
        }
        deviceUpdateCallbacks.push(updateInputDevices)

        const connectInput = async () => {
            const deviceId = audioInputSelector.value
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
            if (input) {
                input.disconnect()
                input = undefined
            }
            if (node && node.numberOfInputs > 0) {
                if (deviceId == "Audio File") {
                    try {
                        // Extract the base URL (excluding the script filename)
                        const scriptTag = document.querySelector('script[src$="faust-web-component.js"]');
                        const scriptSrc = scriptTag.src;
                        const baseUrl = scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);
                        // Load the file
                        let file = await fetch(baseUrl + '02-XYLO1.mp3');
                        const arrayBuffer = await file.arrayBuffer();
                        let audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                        // Create a source node from the buffer
                        sourceNode = audioCtx.createBufferSource();
                        sourceNode.buffer = audioBuffer;
                        sourceNode.connect(node!);
                        // Start playing the file
                        sourceNode.start();
                    } catch (error) {
                        console.error("Error loading file: ", error);
                    }
                } else {
                    if (sourceNode !== undefined) {
                        sourceNode.stop();
                        sourceNode.disconnect();
                        sourceNode = undefined;
                    }
                    input = audioCtx.createMediaStreamSource(stream);
                    input.connect(node!);
                }
            }
        }

        audioInputSelector.onchange = connectInput
        
        this.editor = editor
    }
    
    attributeChangedCallback(name, oldValue, newValue) {
      if ((name ===  "readonly") && (newValue !== null)) {
          this.readonly = true
      }
      if ((name ===  "min-height") && (newValue !== "")) {
          this.minHeight = newValue
      }
    }
    
    static get observedAttributes() {
      return ["readonly", "min-height"];
    }

}
