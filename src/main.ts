import {EditorView, basicSetup} from "codemirror"
import {StreamLanguage} from "@codemirror/language"
import {c} from "@codemirror/legacy-modes/mode/clike"

let editor = new EditorView({
  extensions: [basicSetup, StreamLanguage.define(c)],
  parent: document.body
})
