import { icon } from "@fortawesome/fontawesome-svg-core"
import faustCSS from "@shren/faust-ui/dist/esm/index.css?inline"
import { createEditor, setError, clearError } from "./editor"
import faustSvg from "./faustText.svg"

function editorTemplate(readonly: boolean = false, minHeight: string = "") {
    const editorMinHeight = minHeight != "" ? `min-height: ${minHeight};` : ""
    const template = document.createElement("template")
    template.innerHTML = `
    <div id="root">
        <div id="controls">
            <a title="Open in Faust IDE" id="ide" href="https://faustide.grame.fr/" class="button" target="_blank">${icon({ prefix: "fas", iconName: "up-right-from-square" }).html[0]}</a>
            <button title="Copy" class="button" id="copy">${icon({ prefix: "fas", iconName: "copy" }).html[0]}</button>
            <a title="Faust website" id="faust" href="https://faust.grame.fr/" target="_blank"><img src="${faustSvg}" height="15px" /></a>
        </div>
        <div id="content">
            <div id="editor"></div>
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
    return template
}

export default class FaustEditorBasic extends HTMLElement {
    constructor() {
        super()
    }
    
    readonly = false
    minHeight = null
    editor = null
    
    getCodeString() {
        return this.editor.state.doc.toString()
    }
    
    setCode(code) {
        this.editor.dispatch({
          changes: {from: 0, to: this.editor.state.doc.length, insert: code}
        })
    }

    connectedCallback() {
        const code = this.innerHTML.replace("<!--", "").replace("-->", "").trim()
        console.log("connectedCallback: Got %s for min-height", this.minHeight);
        this.attachShadow({ mode: "open" }).appendChild(editorTemplate(this.readonly, this.minHeight).content.cloneNode(true))

        const ideLink = this.shadowRoot!.querySelector("#ide") as HTMLAnchorElement
        ideLink.onfocus = () => {
            // Open current contents of editor in IDE
            const urlParams = new URLSearchParams()
            urlParams.set("inline", btoa(editor.state.doc.toString()).replace("+", "-").replace("/", "_"))
            ideLink.href = `https://faustide.grame.fr/?${urlParams.toString()}`
        }

        const editorEl = this.shadowRoot!.querySelector("#editor") as HTMLDivElement
        const editor = createEditor(editorEl, code, !this.readonly)

        const copyButton = this.shadowRoot!.querySelector("#copy") as HTMLButtonElement
        
        copyButton.onclick = () => {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(editor.state.doc.toString())
            } else {
                console.log("Unable to use clipboard")
            }
        }
        
        this.editor = editor
    }
    
    attributeChangedCallback(name, oldValue, newValue) {
      if ((name ==  "readonly") && (newValue != null)) {
          this.readonly = true
      }
      if ((name ==  "min-height") && (newValue != "")) {
          this.minHeight = newValue
      }
    }
    
    static get observedAttributes() {
      return ["readonly", "min-height"];
    }

}
