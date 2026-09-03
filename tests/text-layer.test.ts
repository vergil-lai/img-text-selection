import { describe, expect, test } from 'vitest'
import { SelectableTextLayer } from '../src/text-layer'

const lines = [
    {
        id: 'line-0',
        text: 'Pro 最受欢迎',
        confidence: 0.98,
        box: [
            [20, 20],
            [220, 20],
            [220, 60],
            [20, 60],
        ],
    },
    {
        id: 'line-1',
        text: '优先体验最新模型',
        confidence: 0.96,
        box: [
            [20, 80],
            [260, 80],
            [260, 120],
            [20, 120],
        ],
    },
] as const

describe('SelectableTextLayer', () => {
    test('renders transparent real SVG text in image coordinates', () => {
        const layer = new SelectableTextLayer({ width: 300, height: 160 }, lines)
        const texts = layer.element.querySelectorAll('text')

        expect(layer.element.getAttribute('viewBox')).toBe('0 0 300 160')
        expect(texts).toHaveLength(2)
        expect(texts[0]?.textContent).toBe('Pro 最受欢迎')
        expect(texts[0]?.getAttribute('textLength')).toBe('200')
        expect(texts[0]?.getAttribute('data-ocr-line')).toBe('line-0')
    })

    test('maps a DOM range back to normalized page text', () => {
        const layer = new SelectableTextLayer({ width: 300, height: 160 }, lines)
        const texts = layer.element.querySelectorAll('text')
        const first = texts[0]?.firstChild
        const second = texts[1]?.firstChild
        if (!first || !second) throw new Error('Expected SVG text nodes')
        const range = document.createRange()
        range.setStart(first, 4)
        range.setEnd(second, 4)

        expect(layer.textForRange(range)).toBe('最受欢迎\n优先体验')
    })
})