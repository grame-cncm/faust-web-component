# Build faust-web-component and try it in a browser.
#   make          this help
#   make test     build, then serve index.html with the built script on http://localhost:$(PORT)

PORT ?= 8000
URL  := http://localhost:$(PORT)/

.PHONY: help install build test clean

help:
	@echo "make install   Install the npm dependencies (node_modules/)"
	@echo "make build     Build dist/faust-web-component.js"
	@echo "make test      Build, copy index.html to dist/ and serve it on $(URL) (Ctrl-C to stop)"
	@echo "make clean     Remove dist/"
	@echo "PORT=8001 make test  serves on another port"

node_modules: package.json
	npm install
	@touch node_modules

install: node_modules

build: node_modules
	npm run build

# A local server is needed: from file:// the AudioWorklet and the audio file do
# not load. localhost is a secure context, so the microphone can be used.
test: build
	cp index.html dist/
	@echo "Serving $(URL)"
	@(sleep 1; open $(URL) 2>/dev/null || xdg-open $(URL) 2>/dev/null || true) &
	python3 -m http.server $(PORT) --directory dist

clean:
	rm -rf dist
