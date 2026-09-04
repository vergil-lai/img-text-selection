import { cp } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

function builtInAssetUrls(): Plugin {
    return {
        name: 'built-in-ocr-asset-urls',
        renderChunk(code) {
            let replacements = 0
            const transformed = code.replace(
                /(["'])__OCR_SELECT_ASSET__(\.\/[^"']+)\1/g,
                (_match, _quote, path: string) => {
                    replacements += 1
                    return `new URL(${JSON.stringify(path)}, import.meta.url).href`
                },
            )
            if (replacements === 0) return null
            if (replacements !== 5) {
                throw new Error(`Expected 5 OCR runtime assets, found ${replacements}`)
            }
            return { code: transformed, map: null }
        },
    }
}

export default defineConfig({
    base: './',
    plugins: [
        builtInAssetUrls(),
        {
            name: 'copy-ocr-runtime-assets',
            async closeBundle() {
                await cp(
                    resolve(import.meta.dirname, 'runtime-assets'),
                    resolve(import.meta.dirname, 'dist/assets/ocr-select'),
                    { recursive: true },
                )
            },
        },
    ],
    resolve: {
        conditions: ['onnxruntime-web-use-extern-wasm'],
    },
    worker: {
        format: 'es',
    },
    build: {
        lib: {
            entry: {
                index: resolve(import.meta.dirname, 'src/index.ts'),
                'vue/directive': resolve(import.meta.dirname, 'src/vue/directive.ts'),
            },
            formats: ['es'],
            fileName: (_format, entryName) => `${entryName}.js`,
            cssFileName: 'index',
        },
        rolldownOptions: {
            external: ['vue'],
        },
        sourcemap: true,
        minify: false,
    },
})