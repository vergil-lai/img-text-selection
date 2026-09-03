import { describe, expect, test } from 'vitest'
import { PageTextIndex } from '../src/page-text-index'

describe('PageTextIndex', () => {
    test('keeps combining marks and emoji sequences as single selectable characters', () => {
        const index = new PageTextIndex([
            { id: 'first', text: 'Ame\u0301lie 👨‍👩‍👧‍👦' },
            { id: 'second', text: '第二行' },
        ])

        expect(index.line('first').graphemes).toEqual([
            'A',
            'm',
            'e\u0301',
            'l',
            'i',
            'e',
            ' ',
            '👨‍👩‍👧‍👦',
        ])
        expect(index.line('first').utf16Offsets).toEqual([0, 1, 2, 4, 5, 6, 7, 8, 19])
    })

    test('copies a partial multi-line grapheme range as normalized plain text', () => {
        const index = new PageTextIndex([
            { id: 'first', text: 'Pro 最受欢迎' },
            { id: 'second', text: '优先体验最新模型' },
        ])

        expect(
            index.textBetween({ lineId: 'first', grapheme: 4 }, { lineId: 'second', grapheme: 4 }),
        ).toBe('最受欢迎\n优先体验')
    })

    test('maps a DOM UTF-16 offset inside a combining sequence to a grapheme boundary', () => {
        const index = new PageTextIndex([{ id: 'first', text: 'e\u0301x' }])

        expect(index.positionAtUtf16('first', 1, 'start')).toEqual({
            lineId: 'first',
            grapheme: 0,
        })
        expect(index.positionAtUtf16('first', 1, 'end')).toEqual({
            lineId: 'first',
            grapheme: 1,
        })
    })
})