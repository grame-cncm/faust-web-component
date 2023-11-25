import { IFaustMonoWebAudioNode, IFaustPolyWebAudioNode, FaustCompiler, FaustMonoDspGenerator, FaustPolyDspGenerator, FaustSvgDiagrams, LibFaust, instantiateFaustModuleFromFile } from "@grame/faustwasm"
import jsURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.js?url"
import dataURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.data?url"
import wasmURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.wasm?url"
import { library } from "@fortawesome/fontawesome-svg-core"
import { faPlay, faStop, faUpRightFromSquare, faSquareCaretLeft, faAnglesLeft, faAnglesRight, faSliders, faDiagramProject, faWaveSquare, faChartLine, faPowerOff, faCopy } from "@fortawesome/free-solid-svg-icons"

for (const icon of [faPlay, faStop, faUpRightFromSquare, faSquareCaretLeft, faAnglesLeft, faAnglesRight, faSliders, faDiagramProject, faWaveSquare, faChartLine, faPowerOff, faCopy]) {
    library.add(icon)
}

export let compiler: FaustCompiler
export let svgDiagrams: FaustSvgDiagrams
export const default_generator = new FaustMonoDspGenerator()
export const get_mono_generator = () => new FaustMonoDspGenerator()
export const get_poly_generator = () => new FaustPolyDspGenerator()

async function loadFaust() {
    // Setup Faust
    const module = await instantiateFaustModuleFromFile(jsURL, dataURL, wasmURL)
    const libFaust = new LibFaust(module)
    compiler = new FaustCompiler(libFaust)
    svgDiagrams = new FaustSvgDiagrams(compiler)
}

export const faustPromise = loadFaust()
export const audioCtx = new AudioContext()

export const deviceUpdateCallbacks: ((d: MediaDeviceInfo[]) => void)[] = []
let devices: MediaDeviceInfo[] = []
async function _getInputDevices() {
    if (navigator.mediaDevices) {
        navigator.mediaDevices.ondevicechange = _getInputDevices
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch (e) { }
        devices = await navigator.mediaDevices.enumerateDevices()
        for (const callback of deviceUpdateCallbacks) {
            callback(devices)
        }
    }
}

let getInputDevicesPromise: Promise<void> | undefined
export async function getInputDevices() {
    if (getInputDevicesPromise === undefined) {
        getInputDevicesPromise = _getInputDevices()
    }
    await getInputDevicesPromise
    return devices
}

export async function accessMIDIDevice(
    onMIDIMessage: (data) => void
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (navigator.requestMIDIAccess) {
            navigator
                .requestMIDIAccess()
                .then((midiAccess) => {
                    const inputDevices = midiAccess.inputs.values();
                    let midiInput: WebMidi.MIDIInput | null = null;
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
export const midiInputCallback = (node: IFaustMonoWebAudioNode | IFaustPolyWebAudioNode) => {
    return (data) => {

        const cmd = data[0] >> 4;
        const channel = data[0] & 0xf;
        const data1 = data[1];
        const data2 = data[2];

        if (channel === 9) return;
        else if (cmd === 8 || (cmd === 9 && data2 === 0)) node.keyOff(channel, data1, data2);
        else if (cmd === 9) node.keyOn(channel, data1, data2);
        else if (cmd === 11) node.ctrlChange(channel, data1, data2);
        else if (cmd === 14) node.pitchWheel(channel, (data2 * 128.0 + data1));
    }
}

// Analyze the metadata of a Faust JSON file extract the [midi:on] and [nvoices:n] options
export function extractMidiAndNvoices(jsonData: JSONData): { midi: boolean, nvoices: number } {
    const optionsMetadata = jsonData.meta.find(meta => meta.options);
    if (optionsMetadata) {
        const options = optionsMetadata.options;

        const midiRegex = /\[midi:(on|off)\]/;
        const nvoicesRegex = /\[nvoices:(\d+)\]/;

        const midiMatch = options.match(midiRegex);
        const nvoicesMatch = options.match(nvoicesRegex);

        const midi = midiMatch ? midiMatch[1] === "on" : false;
        const nvoices = nvoicesMatch ? parseInt(nvoicesMatch[1]) : -1;

        return { midi, nvoices };
    } else {
        return { midi: false, nvoices: -1 };
    }
}