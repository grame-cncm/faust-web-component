import { library } from "@fortawesome/fontawesome-svg-core"
import { faPlay, faStop, faUpRightFromSquare, faSquareCaretLeft, faAnglesLeft, faAnglesRight, faSliders, faDiagramProject, faWaveSquare, faChartLine, faPowerOff, faCopy } from "@fortawesome/free-solid-svg-icons"

for (const icon of [faPlay, faStop, faUpRightFromSquare, faSquareCaretLeft, faAnglesLeft, faAnglesRight, faSliders, faDiagramProject, faWaveSquare, faChartLine, faPowerOff, faCopy]) {
    library.add(icon)
}

import FaustEditorBasic from "./faust-editor-basic"

customElements.define("faust-editor-basic", FaustEditorBasic)

