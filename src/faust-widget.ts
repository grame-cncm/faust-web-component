// Import necessary libraries and modules
import { icon } from "@fortawesome/fontawesome-svg-core";
import faustCSS from "@shren/faust-ui/dist/esm/index.css?inline";
import faustSvg from "./faustText.svg";
import {
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    IFaustMonoWebAudioNode,
    IFaustPolyWebAudioNode,
} from "@grame/faustwasm";
import { FaustUI } from "@shren/faust-ui";
import {
    faustPromise,
    audioCtx,
    get_poly_generator,
    compiler,
    getInputDevices,
    deviceUpdateCallbacks,
    accessMIDIDevice,
    midiInputCallback,
    extractMidiAndNvoices,
    default_generator,
} from "./common";

// Create a template for the FaustWidget component
const template = document.createElement("template")
template.innerHTML = `
<div id="root">
    <div id="controls">
        <button title="On/off" class="button" id="power" disabled>${icon({ prefix: "fas", iconName: "power-off" }).html[0]}</button>
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
    <div id="faust-ui"></div>
</div>
<style>
    #root {
        border: 1px solid black;
        border-radius: 5px;
        box-sizing: border-box;
        display: inline-block;
        background-color: #384d64;
    }

    *, *:before, *:after {
        box-sizing: inherit; 
    }

    #controls {
        display: flex;
        margin-bottom: -20px;
        position: relative;
        z-index: 1;
    }

    #faust {
        margin-left: auto;
        padding-left: 10px;
        margin-right: 10px;
        display: flex;
        align-items: center;
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

    ${faustCSS}
</style>
`

// Define the FaustWidget web component
export default class FaustWidget extends HTMLElement {
    constructor() {
        super();
    }

    // Called when the component is connected to the DOM
    connectedCallback() {
        // Extract the Faust code from the inner HTML
        const code = this.innerHTML.replace("<!--", "").replace("-->", "").trim();
        this.attachShadow({ mode: "open" }).appendChild(template.content.cloneNode(true));

        // Query and initialize various elements in the shadow DOM
        const powerButton = this.shadowRoot!.querySelector("#power") as HTMLButtonElement;
        const faustUIRoot = this.shadowRoot!.querySelector("#faust-ui") as HTMLDivElement;
        const audioInputSelector = this.shadowRoot!.querySelector("#audio-input") as HTMLSelectElement;

        // Enable the power button once Faust is ready
        faustPromise.then(() => powerButton.disabled = false);

        // State variables
        let on = false;
        let gmidi = false;
        let gnvoices = -1;
        let node: IFaustMonoWebAudioNode | IFaustPolyWebAudioNode;
        let input: MediaStreamAudioSourceNode | undefined;
        let faustUI: FaustUI;
        let generator: FaustMonoDspGenerator | FaustPolyDspGenerator;
        let sourceNode: AudioBufferSourceNode | undefined;

        // Function to setup the Faust environment
        const setup = async () => {
            await faustPromise;

            // Compile Faust code to access JSON metadata 
            await default_generator.compile(compiler, "main", code, "-ftz 2");
            const json = default_generator.getMeta();
            let { midi, nvoices } = extractMidiAndNvoices(json);
            gmidi = midi;
            gnvoices = nvoices;

            // Build the generator (possibly reusing default_generator which is a FaustMonoDspGenerator) 
            // and generate UI
            generator = nvoices > 0 ? get_poly_generator() : default_generator;
            await generator.compile(compiler, "main", code, "-ftz 2");
            const ui = generator.getUI();

            // Generate Faust UI
            faustUI = new FaustUI({ ui, root: faustUIRoot });
            faustUIRoot.style.width = faustUI.minWidth * 1.25 + "px";
            faustUIRoot.style.height = faustUI.minHeight * 1.25 + "px";
            faustUI.resize();
        }

        // Function to start the Faust node and audio context
        const start = async () => {
            if (audioCtx.state === "suspended") {
                await audioCtx.resume();
            }

            // Create an audio node from compiled Faust if not already created
            if (node === undefined) {
                if (gnvoices > 0) {
                    node = (await (generator as FaustPolyDspGenerator).createNode(audioCtx, gnvoices))!;
                } else {
                    node = (await (generator as FaustMonoDspGenerator).createNode(audioCtx))!;
                }
            }

            // Start sensors if available
            await node.startSensors();

            // Access MIDI device if available
            if (gmidi) {
                accessMIDIDevice(midiInputCallback(node))
                    .then(() => {
                        console.log('Successfully connected to the MIDI device.');
                    })
                    .catch((error) => {
                        console.error('Error accessing MIDI device:', error.message);
                    });
            }

            // Set up parameter handling for Faust UI
            faustUI.paramChangeByUI = (path, value) => node?.setParamValue(path, value);
            node.setOutputParamHandler((path, value) => faustUI.paramChangeByDSP(path, value));

            // Enable audio input if necessary
            if (node.numberOfInputs > 0) {
                audioInputSelector.disabled = false;
                updateInputDevices(await getInputDevices());
                await connectInput();
            } else {
                audioInputSelector.disabled = true;
                audioInputSelector.innerHTML = "<option>Audio input</option>";
            }

            // Connect Faust node to the audio context destination
            node.connect(audioCtx.destination);
            powerButton.style.color = "#ffa500";
        }

        // Function to stop the Faust node
        const stop = () => {
            node?.disconnect();
            node?.stopSensors();
            powerButton.style.color = "#fff";
        }

        // Toggle the Faust node on/off
        powerButton.onclick = () => {
            if (on) {
                stop();
            } else {
                start();
            }
            on = !on;
        }

        // Function to update available audio input devices
        const updateInputDevices = (devices: MediaDeviceInfo[]) => {
            if (audioInputSelector.disabled) return;
            while (audioInputSelector.lastChild) audioInputSelector.lastChild.remove();
            for (const device of devices) {
                if (device.kind === "audioinput") {
                    audioInputSelector.appendChild(new Option(device.label || device.deviceId, device.deviceId));
                }
            }
            audioInputSelector.appendChild(new Option("Audio File", "Audio File"));
        }
        deviceUpdateCallbacks.push(updateInputDevices);

        // Function to connect selected audio input device
        const connectInput = async () => {
            const deviceId = audioInputSelector.value;
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            if (input) {
                input.disconnect();
                input = undefined;
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

        // Set input change handler
        audioInputSelector.onchange = connectInput;

        // Initial setup
        setTimeout(() => {
            // Display a "Compiling..." message while Faust is compiling
            faustUIRoot.innerHTML = "<p><center>Compiling...</center></p>";
            setup();
        }, 0);

    }
}

