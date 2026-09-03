// @vitest-environment node

import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const distAssets = resolve(import.meta.dirname, '../dist/assets')

describe('npm package output', () => {
    test('ships Tiny and ONNX Runtime assets as files beside the worker', async () => {
        const requiredAssets = [
            'ocr-select/tiny/det.onnx',
            'ocr-select/tiny/rec.onnx',
            'ocr-select/tiny/dictionary.json',
            'ocr-select/ort/ort-wasm-simd-threaded.asyncify.mjs',
            'ocr-select/ort/ort-wasm-simd-threaded.asyncify.wasm',
        ]

        await expect(
            Promise.all(requiredAssets.map((file) => stat(resolve(distAssets, file)))),
        ).resolves.toHaveLength(5)
    })

    test('keeps binary assets out of JavaScript and exposes traceable URLs to consumers', async () => {
        const files = await import('node:fs/promises').then(({ readdir }) => readdir(distAssets))
        const worker = files.find((file) => /^ocr\.worker-.+\.js$/.test(file))

        expect(worker).toBeDefined()

        const source = await readFile(resolve(distAssets, worker!), 'utf8')
        expect(source.includes('data:application/octet-stream;base64')).toBe(false)
        expect(source.includes('new URL("./ocr-select/tiny/det.onnx"')).toBe(false)

        const entry = await readFile(resolve(import.meta.dirname, '../dist/index.js'), 'utf8')
        expect(entry.includes('data:application/octet-stream;base64')).toBe(false)
        expect(
            entry.includes('new URL("./assets/ocr-select/tiny/det.onnx", import.meta.url).href'),
        ).toBe(true)
    })
})