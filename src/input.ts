// Audio input of a component: a test signal, a device or the audio file
import { FaustMonoDspGenerator, IFaustMonoWebAudioNode, IFaustPolyWebAudioNode } from "@grame/faustwasm";
import { FaustUI } from "@shren/faust-ui";
import testSignalsCode from "./testsignals.dsp?raw";
import {
    faustPromise,
    audioCtx,
    compiler,
    getInputDevices,
    refreshInputDevices,
    deviceUpdateCallbacks
} from "./common";

type FaustNode = IFaustMonoWebAudioNode | IFaustPolyWebAudioNode;

// Values of the options of the selector
const TEST = "test:";
const DEVICE = "device:";
const FILE = "file";

// The test signal generator (src/testsignals.dsp), compiled once for the page
let testSignalsPromise: Promise<FaustMonoDspGenerator> | undefined;
function getTestSignals(): Promise<FaustMonoDspGenerator> {
    if (!testSignalsPromise) {
        testSignalsPromise = (async () => {
            await faustPromise;
            const generator = new FaustMonoDspGenerator();
            await generator.compile(compiler, "testsignals", testSignalsCode, "-ftz 2");
            return generator;
        })();
    }
    return testSignalsPromise;
}

// The audio file, loaded once for the page
let audioFilePromise: Promise<AudioBuffer> | undefined;
function getAudioFile(): Promise<AudioBuffer> {
    if (!audioFilePromise) {
        audioFilePromise = (async () => {
            // The file is next to the script
            const scriptTag = document.querySelector('script[src$="faust-web-component.js"]') as HTMLScriptElement | null;
            const scriptSrc = scriptTag?.src ?? "";
            const baseUrl = scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);
            const file = await fetch(baseUrl + '02-XYLO1.mp3');
            return audioCtx.decodeAudioData(await file.arrayBuffer());
        })();
        audioFilePromise.catch(() => audioFilePromise = undefined);
    }
    return audioFilePromise;
}

// The item with this label in a Faust UI description
function findItem(items: any[], label: string): any {
    for (const item of items) {
        if (item.label === label && item.address) return item;
        if (item.items) {
            const found = findItem(item.items, label);
            if (found) return found;
        }
    }
    return undefined;
}

// The entries of a "menu{'label':value;...}" style, as [label, value]. The
// quotes around a label are dropped whatever they are: libfaust-wasm writes
// them as '-' in its JSON.
function menuEntries(style: string): [string, number][] {
    const menu = style.match(/^menu\{(.*)\}$/);
    if (!menu) return [];
    return menu[1].split(";").map(entry => {
        const colon = entry.lastIndexOf(":");
        return [entry.slice(1, colon - 1), Number(entry.slice(colon + 1))] as [string, number];
    });
}

// A Faust UI description without the item at this address
function withoutItem(items: any[], address: string): any[] {
    return items
        .filter(item => item.address !== address)
        .map(item => item.items ? { ...item, items: withoutItem(item.items, address) } : item);
}

// Feeds the node of a component from the selector: the test signals first (the
// entries of the generator's "signal" menu), then the devices, then the audio file.
// A test signal goes to every input of the node, a device or the file is connected
// as it is. The microphone is asked for only when a device is selected.
export class InputSource {
    // Called when a test signal is selected (true) or no longer (false)
    onTestSignal: (active: boolean) => void = () => { };

    private select: HTMLSelectElement;
    private panel: HTMLDivElement;
    private choice: string | null;
    private node: FaustNode | undefined;
    private source: AudioNode | undefined;
    private stream: MediaStream | undefined;
    private merger: ChannelMergerNode | undefined;
    private testNode: IFaustMonoWebAudioNode | undefined;
    private testNodePromise: Promise<IFaustMonoWebAudioNode> | undefined;
    private testUI: FaustUI | undefined;
    private signalAddress = "";
    private signals: [string, number][] = [];
    private token = 0;

    // select: the input selector; panel: where the controls of the test signals
    // go; input: the component's "input" attribute (a test signal, "Audio File")
    constructor(select: HTMLSelectElement, panel: HTMLDivElement, input: string | null) {
        this.select = select;
        this.panel = panel;
        this.choice = input === null ? null : this.valueOf(input);
        select.onchange = () => {
            this.choice = select.value;
            this.connect();
        };
        deviceUpdateCallbacks.push(devices => this.updateDevices(devices));
    }

    // Feed a new node (or the same one again after a stop)
    async attach(node: FaustNode) {
        this.detach();
        const token = this.token;
        this.node = node;
        if (node.numberOfInputs === 0) {
            this.select.disabled = true;
            this.select.replaceChildren(new Option("Audio input"));
            return;
        }
        const generator = await getTestSignals();
        if (token !== this.token) return;
        const ui = generator.getUI();
        const item = findItem(ui, "signal");
        this.signalAddress = item.address;
        this.signals = menuEntries(item.meta?.find((m: any) => m.style)?.style ?? "");
        const devices = await getInputDevices();
        if (token !== this.token) return;
        this.select.disabled = false;
        this.fill(devices);
        await this.connect();
    }

    // Disconnect the input from the node
    detach() {
        this.token++;
        this.disconnect();
        this.node = undefined;
        this.onTestSignal(false);
    }

    // Lay out the test signals' controls again, once their panel is visible
    resizePanel() {
        this.testUI?.resize();
    }

    // The option value of an "input" attribute: a test signal, the file, or a device by label
    private valueOf(input: string): string {
        const name = input.trim().toLowerCase();
        if (name === "audio file" || name === "file") return FILE;
        return TEST + name;
    }

    // Fill the selector and select the current choice
    private fill(devices: MediaDeviceInfo[]) {
        const tests = document.createElement("optgroup");
        tests.label = "Test signals";
        for (const [label, value] of this.signals) {
            tests.appendChild(new Option(label, TEST + value));
        }
        const inputs = devices.filter(device => device.kind === "audioinput");
        const group = document.createElement("optgroup");
        group.label = "Devices";
        for (const [i, device] of inputs.entries()) {
            const label = device.label || (inputs.length > 1 ? `Microphone ${i + 1}` : "Microphone");
            group.appendChild(new Option(label, DEVICE + device.deviceId));
        }
        const file = document.createElement("optgroup");
        file.label = "File";
        file.appendChild(new Option("Audio File", FILE));
        this.select.replaceChildren(tests, group, file);

        // An "input" attribute gives a test signal by its name
        if (this.choice?.startsWith(TEST)) {
            const name = this.choice.slice(TEST.length);
            const signal = this.signals.find(([label]) => label.toLowerCase() === name);
            if (signal) this.choice = TEST + signal[1];
        }
        // By default the first device, as before the test signals
        const values = [...this.select.options].map(option => option.value);
        if (this.choice === null || !values.includes(this.choice)) {
            if (this.choice !== null && !this.choice.startsWith(DEVICE)) {
                console.warn(`faust-web-component: unknown input "${this.choice.replace(TEST, "")}"`);
            }
            this.choice = inputs.length > 0 ? DEVICE + inputs[0].deviceId : values[0];
        }
        this.select.value = this.choice;
    }

    // New device list: keep the selection
    private updateDevices(devices: MediaDeviceInfo[]) {
        if (this.select.disabled) return;
        this.fill(devices);
    }

    // The node generating the test signals, with its controls in the panel
    private getTestNode(): Promise<IFaustMonoWebAudioNode> {
        if (!this.testNodePromise) {
            this.testNodePromise = (async () => {
                const generator = await getTestSignals();
                const testNode = (await generator.createNode(audioCtx))!;
                const ui = withoutItem(testNode.getUI(), this.signalAddress);
                const testUI = new FaustUI({ ui, root: this.panel });
                testUI.paramChangeByUI = (path, value) => testNode.setParamValue(path, value);
                this.panel.style.width = testUI.minWidth * 1.25 + "px";
                this.panel.style.height = testUI.minHeight * 1.25 + "px";
                this.testNode = testNode;
                this.testUI = testUI;
                return testNode;
            })();
        }
        return this.testNodePromise;
    }

    // Connect the selected input to the node
    private async connect() {
        const token = ++this.token;
        this.disconnect();
        const node = this.node;
        const choice = this.choice;
        if (!node || !choice) return;
        if (!choice.startsWith(TEST)) this.onTestSignal(false);
        try {
            if (choice.startsWith(TEST)) {
                const testNode = await this.getTestNode();
                if (token !== this.token) return;
                testNode.setParamValue(this.signalAddress, Number(choice.slice(TEST.length)));
                // The same signal on every input of the node
                const channels = Math.min(32, Math.max(1, node.getNumInputs()));
                this.merger = new ChannelMergerNode(audioCtx, { numberOfInputs: channels });
                for (let i = 0; i < channels; i++) {
                    testNode.connect(this.merger, 0, i);
                }
                this.merger.connect(node);
                this.onTestSignal(true);
            } else if (choice === FILE) {
                const buffer = await getAudioFile();
                if (token !== this.token) return;
                const source = audioCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(node);
                source.start();
                this.source = source;
            } else {
                const deviceId = choice.slice(DEVICE.length) || undefined;
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
                if (token !== this.token) {
                    for (const track of stream.getTracks()) track.stop();
                    return;
                }
                this.stream = stream;
                this.source = audioCtx.createMediaStreamSource(stream);
                this.source.connect(node);
                // The labels (and the real ids) are known now
                const id = stream.getAudioTracks()[0]?.getSettings().deviceId;
                if (id) this.choice = DEVICE + id;
                refreshInputDevices();
            }
        } catch (error) {
            console.error("Cannot connect the audio input: ", error);
        }
    }

    // Disconnect the current input
    private disconnect() {
        if (this.source instanceof AudioBufferSourceNode) this.source.stop();
        this.source?.disconnect();
        this.source = undefined;
        for (const track of this.stream?.getTracks() ?? []) track.stop();
        this.stream = undefined;
        this.testNode?.disconnect();
        this.merger?.disconnect();
        this.merger = undefined;
    }
}
