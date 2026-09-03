import { afterEach, describe, expect, test, vi } from 'vitest'
import { OcrSelectRuntime } from '../src/runtime'
import type { OcrEngine, OcrResult } from '../src/runtime'

const result: OcrResult = {
    width: 300,
    height: 160,
    backend: 'wasm',
    lines: [
        {
            text: 'Pro 最受欢迎',
            confidence: 0.99,
            box: [
                [20, 20],
                [220, 20],
                [220, 60],
                [20, 60],
            ],
        },
        {
            text: '优先体验最新模型',
            confidence: 0.98,
            box: [
                [20, 80],
                [260, 80],
                [260, 120],
                [20, 120],
            ],
        },
    ],
}

async function activeBinding() {
    const image = document.createElement('img')
    image.src = 'data:image/png;base64,fixture'
    Object.defineProperties(image, {
        naturalWidth: { configurable: true, value: 300 },
        naturalHeight: { configurable: true, value: 160 },
    })
    document.body.append(image)
    const engine: OcrEngine = { recognize: vi.fn(async () => result), dispose: vi.fn() }
    const runtime = new OcrSelectRuntime({ engine })
    const binding = runtime.attach(image)
    await binding.activate()
    const layer = document.querySelector<SVGSVGElement>('.ocr-select-text-layer')
    if (!layer) throw new Error('Expected active text layer')
    return { binding, layer, runtime }
}

function selectAcrossLines(layer: SVGSVGElement): void {
    const texts = layer.querySelectorAll('text')
    const first = texts[0]?.firstChild
    const second = texts[1]?.firstChild
    if (!first || !second) throw new Error('Expected SVG text nodes')
    const range = document.createRange()
    range.setStart(first, 4)
    range.setEnd(second, 4)
    const selection = getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
}

describe('selection interaction', () => {
    afterEach(() => {
        getSelection()?.removeAllRanges()
        document.body.replaceChildren()
    })

    test('lets ordinary clicks bubble but suppresses exactly one click after text drag', async () => {
        const { layer, runtime } = await activeBinding()
        const bubbled = vi.fn()
        document.addEventListener('click', bubbled)

        layer.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        expect(bubbled).toHaveBeenCalledTimes(1)

        layer.dispatchEvent(
            new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }),
        )
        selectAcrossLines(layer)
        layer.dispatchEvent(
            new MouseEvent('pointerup', { bubbles: true, clientX: 20, clientY: 10 }),
        )
        layer.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        layer.dispatchEvent(new MouseEvent('click', { bubbles: true }))

        expect(bubbled).toHaveBeenCalledTimes(2)
        document.removeEventListener('click', bubbled)
        await runtime.dispose()
    })

    test('writes normalized plain text for a selection inside the layer', async () => {
        const { layer, runtime } = await activeBinding()
        selectAcrossLines(layer)
        const setData = vi.fn()
        const event = new Event('copy', { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'clipboardData', { value: { setData } })

        layer.dispatchEvent(event)

        expect(event.defaultPrevented).toBe(true)
        expect(setData).toHaveBeenCalledWith('text/plain', '最受欢迎\n优先体验')
        await runtime.dispose()
    })

    test('deactivates on Escape and outside pointerdown', async () => {
        const first = await activeBinding()
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(first.binding.state.status).toBe('idle')
        await first.binding.activate()

        document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        expect(first.binding.state.status).toBe('idle')
        await first.runtime.dispose()
    })
})