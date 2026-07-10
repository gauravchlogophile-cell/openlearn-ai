.PHONY: dev build validate test manifest

dev:
	npm install && npm run dev

build:
	npm run build

validate:
	node scripts/validate-content.mjs

manifest:
	node scripts/generate-manifest.mjs

test:
	npm test
