// @vitest-environment node

import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const distAssets = resolve(import.meta.dirname, '../dist/assets')
const distRoot = resolve(import.meta.dirname, '../dist')

describe('npm package output', () => {
    test('exposes the Vue directive as a separate subpath without bundling Vue', async () => {
        const source = await readFile(
            resolve(import.meta.dirname, '../dist/vue/directive.js'),
            'utf8',
        )
        const declarations = await readFile(
            resolve(import.meta.dirname, '../dist/vue/directive.d.ts'),
            'utf8',
        )

        expect(source).not.toContain("from 'vue'")
        expect(declarations).toContain("from 'vue'")
    })

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

        const chunks = await Promise.all(
            (await import('node:fs/promises').then(({ readdir }) => readdir(distRoot)))
                .filter((file) => file.endsWith('.js'))
                .map((file) => readFile(resolve(distRoot, file), 'utf8')),
        )
        expect(
            chunks.every((chunk) => !chunk.includes('data:application/octet-stream;base64')),
        ).toBe(true)
        expect(
            chunks.some((chunk) =>
                chunk.includes(
                    'new URL("./assets/ocr-select/tiny/det.onnx", import.meta.url).href',
                ),
            ),
        ).toBe(true)
    })
})