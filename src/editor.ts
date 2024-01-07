import {EditorView} from "codemirror"
// Most of the basic CodeMirror setup, sans folds.
import {lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, keymap} from "@codemirror/view"
import {history, defaultKeymap, historyKeymap} from "@codemirror/commands"
import {indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching} from "@codemirror/language"
import {highlightSelectionMatches, searchKeymap} from "@codemirror/search"
import {closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap} from "@codemirror/autocomplete"
import {EditorState} from "@codemirror/state"
// Custom CodeMirror setup
import {StreamLanguage} from "@codemirror/language"
import {clike} from "@codemirror/legacy-modes/mode/clike"
import {lintKeymap, setDiagnostics, openLintPanel, closeLintPanel} from "@codemirror/lint"

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

export function createEditor(parent: HTMLElement, doc: string, readonly: boolean = false) {
    return new EditorView({
        parent,
        doc,
        extensions: [
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            // foldGutter(),
            drawSelection(),
            dropCursor(),
            EditorState.allowMultipleSelections.of(true),
            indentOnInput(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            bracketMatching(),
            closeBrackets(),
            autocompletion(),
            rectangularSelection(),
            crosshairCursor(),
            highlightActiveLine(),
            highlightSelectionMatches(),
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                ...completionKeymap,
                ...lintKeymap
            ]),
            faustLanguage,
            EditorState.readOnly.of(readonly)
        ],
    })
}

export function setError(editor: EditorView, error: Error) {
    // Extract line number if available
    const rawMessage = error.message.trim()
    const match = rawMessage.match(/^main : (\d+) : (.*)$/)
    const message = match ? match[2] : rawMessage
    const { from, to } = match ? editor.state.doc.line(+match[1]) : { from: 0, to: 0 }
    // Show error in editor
    editor.dispatch(setDiagnostics(editor.state, [{
        from, to,
        severity: "error",
        message,
    }]))
    openLintPanel(editor)
}

export function clearError(editor: EditorView) {
    editor.dispatch(setDiagnostics(editor.state, []))
    closeLintPanel(editor)
}
