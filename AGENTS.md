# AGENTS.md

Guidance for AI coding agents (and humans in a hurry) working in this repository.

## What this is

`@grame/faust-web-component` provides two web components that embed Faust in a page:

- `<faust-editor>`: a CodeMirror editor with the Faust code, Run/Stop, and a side pane with tabs: controls, block diagram, scope, spectrum, test signal;
- `<faust-widget>`: only the controls of a DSP and its power button, no editing and no diagram.

The Faust compiler is [faustwasm](https://github.com/grame-cncm/faustwasm) (`@grame/faustwasm`), whose `libfaust-wasm` runs in the page; the controls are drawn by [faust-ui](https://github.com/grame-cncm/faust-ui) (`@grame/faust-ui`). The build is a single IIFE script, `dist/faust-web-component.js`, loaded with a `<script>` tag.

## Layout

- `src/main.ts`: defines the two custom elements.
- `src/common.ts`: what the page shares: the libfaust module, the `FaustCompiler`, `FaustSvgDiagrams`, the `AudioContext`, devices and MIDI. The generators are not shared: `get_mono_generator()` and `get_poly_generator()` make a new one per component, since with a shared one every component played the code compiled last.
- `src/faust-editor.ts`, `src/faust-widget.ts`: the components; each has its template and its style in its shadow DOM.
- `src/diagram.ts`: the Block Diagram tab of the editor: the `svg-*` attributes turned into compiler arguments (`-f`, `-sst`, `-ssi`, `-ssc`, `-sso`), and the display through `FaustSvgDiagrams.display`, which follows the links and starts the player of a steppable diagram.
- `src/input.ts`: the audio input of a component: test signals, devices, audio file. `src/testsignals.dsp` generates the test signals in Faust, compiled once for the page.
- `src/scope.ts`: scope and spectrum plots. `src/editor.ts`: the CodeMirror setup and the error display.
- `public/02-XYLO1.mp3`: the audio file, which the page loads from next to the script.
- `index.html`: the example page, served by `make test`.

## Build and check

```sh
npm install            # or: make install
npm run build          # dist/faust-web-component.js (vite, not minified, with a source map)
npx tsc --noEmit -p .  # type-check: vite build does not check types
make test              # build, copy index.html to dist/, serve http://localhost:8000
```

There is no automated test suite. A change is checked by `tsc --noEmit`, `npm run build`, and by loading a page in a browser: open the console and look for errors, check what the change shows. The page must be served over http (`make test`, or `python3 -m http.server` in `dist/`): from `file://` the AudioWorklet and the audio file do not load.

- Running a DSP plays sound through the speakers of the machine. To check a component without being heard, use a page of your own (not committed) that keeps every `AudioContext` suspended before the script loads: replace `window.AudioContext` with a subclass whose constructor calls `AudioContext.prototype.suspend` on the new context, and make `AudioContext.prototype.resume` do nothing. Run, the tabs and the diagrams still work; check `state === "suspended"` on each context.
- An editor without an `input` attribute selects the first audio device, which asks for the microphone: give `input="impulse"` (or another test signal) in a test page.
- Report what was checked and how: the commands, the page, the values read. Never claim a check that was not run.

## Conventions

- Keep the two components consistent: an attribute or a behavior shared by both is implemented once (in `common.ts`, `input.ts` or a module of its own) rather than copied.
- Attributes are read from the element (`this.getAttribute(...)`); document every attribute in `README.md`, with its default and an example.
- Code that runs inside a component works in its shadow DOM: look elements up from `this.shadowRoot`, not `document`.
- No new runtime dependency without the maintainer's approval: everything is bundled into the one script that pages load.
- Comments describe the code and its reasons, never who wrote it or who found the bug.

## Dependencies and version

- An update of `@grame/faustwasm` or `@grame/faust-ui` is a commit of its own: `Updated with faustwasm x.y.z.`, the body saying what the new version brings to the components. Run `npm install @grame/faustwasm@^x.y.z`, check that `package-lock.json` changes nothing else unless intended, then build and check a page.
- The version is in `package.json` and `package-lock.json` (`npm version x.y.z --no-git-tag-version`), and in the two CDN links of `README.md` (`@grame/faust-web-component@x.y.z`). Agree on the number with the maintainer: the minor for a feature or a new faustwasm minor, the patch for a fix. The release commit is `Set version to x.y.z.`, or, when it is the one that brings a new faustwasm, `Updated with faustwasm a.b.c. Set version to x.y.z.`
- `dist/` is gitignored but published: `npm publish` ships `dist/faust-web-component.js` as it stands on disk (see `files` in `package.json`), so build right before publishing.

## Git

- Work on a branch; integrate into `main` by rebase then fast-forward (`git merge --ff-only`), keeping the history linear.
- Commit messages: a summary line, then a body explaining why, and how the change was checked. Credit an AI agent that co-authored the change with a `Co-Authored-By:` trailer.
- Do not commit `dist/`, test pages or other scratch files. Do not push, tag, publish to npm or open pull requests unless asked to.
