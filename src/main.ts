import {EditorView, basicSetup} from "codemirror"
import {StreamLanguage} from "@codemirror/language"
import {clike} from "@codemirror/legacy-modes/mode/clike"

const keywords = "process component import library declare with environment route waveform soundfile"
const atoms = "mem prefix int float rdtable rwtable select2 select3 ffunction fconstant fvariable button checkbox vslider hslider nentry vgroup hgroup tgroup vbargraph hbargraph attach acos asin atan atan2 cos sin tan exp log log10 pow sqrt abs min max fmod remainder floor ceil rint"

function words(str: string) {
  const obj: {[key: string]: true} = {}
  const words = str.split(" ")
  for (let i = 0; i < words.length; i++) obj[words[i]] = true
  return obj
}

const faust = clike({
  name: "clike",
  multiLineStrings: true,
  keywords: words(keywords),
  atoms: words(atoms),
  hooks: {
    "@": () => "meta",
    "'": () => "meta",
  }
})

const editor = new EditorView({
  extensions: [basicSetup, StreamLanguage.define(faust)],
  parent: document.body
})
