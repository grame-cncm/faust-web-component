import { icon } from "@fortawesome/fontawesome-svg-core"
import faustCSS from "@shren/faust-ui/dist/esm/index.css?inline"
import faustSvg from "./faustText.svg"
import { IFaustMonoWebAudioNode } from "@grame/faustwasm"
import { FaustUI } from "@shren/faust-ui"
import { faustPromise, audioCtx, generator, compiler, getInputDevices, deviceUpdateCallbacks } from "./common"

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

export default class FaustWidget extends HTMLElement {
    constructor() {
        super()
    }

    connectedCallback() {
        const code = this.innerHTML.replace("<!--", "").replace("-->", "").trim()
        this.attachShadow({ mode: "open" }).appendChild(template.content.cloneNode(true))

        const powerButton = this.shadowRoot!.querySelector("#power") as HTMLButtonElement
        const faustUIRoot = this.shadowRoot!.querySelector("#faust-ui") as HTMLDivElement

        faustPromise.then(() => powerButton.disabled = false)

        let on = false
        let node: IFaustMonoWebAudioNode | undefined
        let input: MediaStreamAudioSourceNode | undefined
        let faustUI: FaustUI

        const setup = async () => {
            await faustPromise
            // Compile Faust code
            await generator.compile(compiler, "main", code, "")
            // Create controls via Faust UI
            const ui = generator.getUI()
            faustUI = new FaustUI({ ui, root: faustUIRoot })
            faustUIRoot.style.width = faustUI.minWidth * 1.25 + "px"
            faustUIRoot.style.height = faustUI.minHeight * 1.25 + "px"
            faustUI.resize()
        }

        const start = async () => {
            if (audioCtx.state === "suspended") {
                await audioCtx.resume()
            }
            // Create an audio node from compiled Faust
            if (node === undefined) {
                node = (await generator.createNode(audioCtx))!
            }

            faustUI.paramChangeByUI = (path, value) => node?.setParamValue(path, value)
            node.setOutputParamHandler((path, value) => faustUI.paramChangeByDSP(path, value))

            if (node.numberOfInputs > 0) {
                audioInputSelector.disabled = false
                updateInputDevices(await getInputDevices())
                await connectInput()
            } else {
                audioInputSelector.disabled = true
                audioInputSelector.innerHTML = "<option>Audio input</option>"
            }
            node.connect(audioCtx.destination)
            powerButton.style.color = "#ffa500"
        }

        const stop = () => {
            node?.disconnect()
            powerButton.style.color = "#fff"
        }

        powerButton.onclick = () => {
            if (on) {
                stop()
            } else {
                start()
            }
            on = !on
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
                input = audioCtx.createMediaStreamSource(stream)
                input.connect(node!)
            }
        }

        audioInputSelector.onchange = connectInput

        setup()
    }
}
