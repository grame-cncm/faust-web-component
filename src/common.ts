import { FaustCompiler, FaustMonoDspGenerator, FaustSvgDiagrams, LibFaust, instantiateFaustModuleFromFile } from "@grame/faustwasm"
import jsURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.js?url"
import dataURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.data?url"
import wasmURL from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.wasm?url"
import { library } from "@fortawesome/fontawesome-svg-core"
import { faPlay, faStop, faUpRightFromSquare, faSquareCaretLeft, faAnglesLeft, faAnglesRight, faSliders, faDiagramProject, faWaveSquare, faChartLine, faPowerOff } from "@fortawesome/free-solid-svg-icons"

for (const icon of [faPlay, faStop, faUpRightFromSquare, faSquareCaretLeft, faAnglesLeft, faAnglesRight, faSliders, faDiagramProject, faWaveSquare, faChartLine, faPowerOff]) {
    library.add(icon)
}

export let compiler: FaustCompiler
export let svgDiagrams: FaustSvgDiagrams
export const generator = new FaustMonoDspGenerator() // TODO: Support polyphony

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
