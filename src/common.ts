// Import Faust Web Audio API
import {
    IFaustMonoWebAudioNode,
    IFaustPolyWebAudioNode,
    FaustCompiler,
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    FaustSvgDiagrams,
    LibFaust,
    instantiateFaustModuleFromFile
} from "@grame/faustwasm";

// Import Faust module URLs
import jsURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.js?url";
import dataURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.data?url";
import wasmURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.wasm?url";

// Import FontAwesome icons
import { library } from "@fortawesome/fontawesome-svg-core";
import {
    faPlay,
    faStop,
    faUpRightFromSquare,
    faSquareCaretLeft,
    faAnglesLeft,
    faAnglesRight,
    faSliders,
    faDiagramProject,
    faWaveSquare,
    faChartLine,
    faPowerOff
} from "@fortawesome/free-solid-svg-icons";

// Add icons to FontAwesome library
for (const icon of [
    faPlay,
    faStop,
    faUpRightFromSquare,
    faSquareCaretLeft,
    faAnglesLeft,
    faAnglesRight,
    faSliders,
    faDiagramProject,
    faWaveSquare,
    faChartLine,
    faPowerOff
]) {
    library.add(icon);
}

// Global variables for Faust
export let compiler: FaustCompiler;
export let svgDiagrams: FaustSvgDiagrams;
export const default_generator = new FaustMonoDspGenerator();
export const get_mono_generator = (): FaustMonoDspGenerator => new FaustMonoDspGenerator();
export const get_poly_generator = (): FaustPolyDspGenerator => new FaustPolyDspGenerator();

// Load Faust module
async function loadFaust(): Promise<void> {
    // Setup Faust
    const module = await instantiateFaustModuleFromFile(jsURL, dataURL, wasmURL);
    const libFaust = new LibFaust(module);
    compiler = new FaustCompiler(libFaust);
    svgDiagrams = new FaustSvgDiagrams(compiler);
}

// Initialize Faust
export const faustPromise: Promise<void> = loadFaust();

// Create an AudioContext
export const audioCtx: AudioContext = new AudioContext({ latencyHint: 0.00001 });
audioCtx.destination.channelInterpretation = "discrete";

export const deviceUpdateCallbacks: Array<(devices: MediaDeviceInfo[]) => void> = [];
let devices: MediaDeviceInfo[] = [];

// Get input devices
async function _getInputDevices(): Promise<void> {
    if (navigator.mediaDevices) {
        navigator.mediaDevices.ondevicechange = _getInputDevices;
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            // Ignore permission errors
        }
        devices = await navigator.mediaDevices.enumerateDevices();
        for (const callback of deviceUpdateCallbacks) {
            callback(devices);
        }
    }
}

let getInputDevicesPromise: Promise<void> | undefined;
export async function getInputDevices(): Promise<MediaDeviceInfo[]> {
    if (!getInputDevicesPromise) {
        getInputDevicesPromise = _getInputDevices();
    }
    await getInputDevicesPromise;
    return devices;
}

// Access MIDI device
export async function accessMIDIDevice(
    onMIDIMessage: (data: Uint8Array) => void
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (navigator.requestMIDIAccess) {
            navigator
                .requestMIDIAccess()
                .then((midiAccess) => {
                    const inputDevices = midiAccess.inputs.values();
                    for (const midiInput of inputDevices) {
                        midiInput.onmidimessage = (event) => {
                            onMIDIMessage(event.data);
                        };
                        resolve();
                    }
                })
                .catch((error) => {
                    reject(error);
                });
        } else {
            reject(new Error('Web MIDI API is not supported by this browser.'));
        }
    });
}

// Set up MIDI input callback
export const midiInputCallback = (node: IFaustMonoWebAudioNode | IFaustPolyWebAudioNode)
    : ((data: Uint8Array) => void) => {
    return (data: Uint8Array) => {
        node.midiMessage(data);
    };
};

// Define type for JSON data with metadata
interface JSONData {
    meta: Array<{ options?: string; }>;
}

// Analyze the metadata of a Faust JSON file and extract the [midi:on] and [nvoices:n] options
export function extractMidiAndNvoices(jsonData: JSONData)
    : { midi: boolean; nvoices: number } {
    const optionsMetadata = jsonData.meta.find((meta) => meta.options);
    if (optionsMetadata && optionsMetadata.options) {
        const options = optionsMetadata.options;

        const midiRegex = /\[midi:(on|off)\]/;
        const nvoicesRegex = /\[nvoices:(\d+)\]/;

        const midiMatch = options.match(midiRegex);
        const nvoicesMatch = options.match(nvoicesRegex);

        const midi = midiMatch ? midiMatch[1] === "on" : false;
        const nvoices = nvoicesMatch ? parseInt(nvoicesMatch[1], 10) : -1;

        return { midi, nvoices };
    } else {
        return { midi: false, nvoices: -1 };
    }
}
