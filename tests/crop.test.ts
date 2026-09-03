import { describe, expect, test } from 'vitest'
import { cropTextBox } from '../src/ocr/crop'

describe('cropTextBox', () => {
    test('samples an image quadrilateral into a horizontal recognition image', () => {
        const source = {
            width: 4,
            height: 2,
            data: new Uint8ClampedArray([
                255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 255, 0, 255,
                255, 0, 255, 255, 255, 20, 20, 20, 255, 40, 40, 40, 255,
            ]),
            colorSpace: 'srgb',
        } as ImageData

        const crop = cropTextBox(source, [
            [0, 0],
            [4, 0],
            [4, 2],
            [0, 2],
        ])

        expect(crop.width).toBe(4)
        expect(crop.height).toBe(2)
        expect(crop.data.slice(0, 4)).toEqual(new Uint8ClampedArray([255, 0, 0, 255]))
    })
})