import { describe, expect, test } from 'vitest'
import { decodeCtc } from '../src/ocr/ctc'
import { extractTextBoxes } from '../src/ocr/detection-map'
import { createDetectionInput, createRecognitionInput } from '../src/ocr/preprocess'

function imageData(width: number, height: number, rgba: number[]): ImageData {
    return {
        width,
        height,
        data: new Uint8ClampedArray(rgba),
        colorSpace: 'srgb',
    } as ImageData
}

describe('OCR algorithms', () => {
    test('decodes repeated CTC classes with blank and space handling', () => {
        const logits = new Float32Array([0, 9, 0, 0, 0, 8, 0, 0, 9, 0, 0, 0, 0, 0, 7, 0])

        expect(decodeCtc(logits, [1, 4, 4], ['A', 'B'])).toMatchObject({ text: 'AB' })
    })

    test('uses the model output probability as CTC confidence', () => {
        const decoded = decodeCtc(new Float32Array([0.05, 0.9, 0.03, 0.02]), [1, 1, 4], ['A', 'B'])

        expect(decoded).toMatchObject({ text: 'A' })
        expect(decoded.confidence).toBeCloseTo(0.9)
    })

    test('extracts a text component as an image-space quadrilateral', () => {
        const width = 12
        const height = 8
        const probabilities = new Float32Array(width * height)
        for (let y = 2; y <= 4; y += 1) {
            for (let x = 3; x <= 8; x += 1) probabilities[y * width + x] = 0.9
        }

        const boxes = extractTextBoxes(probabilities, [1, 1, height, width], {
            threshold: 0.3,
            boxThreshold: 0.5,
            minimumPixels: 4,
            scaleX: 2,
            scaleY: 2,
        })

        expect(boxes).toHaveLength(1)
        expect(boxes[0]?.[0][0]).toBeCloseTo(6, 4)
        expect(boxes[0]?.[0][1]).toBeCloseTo(4, 4)
        expect(boxes[0]?.[2][0]).toBeCloseTo(18, 4)
        expect(boxes[0]?.[2][1]).toBeCloseTo(10, 4)
    })

    test('unclips detection regions before recognition cropping', () => {
        const probabilities = new Float32Array(10 * 10)
        for (let y = 4; y <= 5; y += 1) {
            for (let x = 3; x <= 6; x += 1) probabilities[y * 10 + x] = 0.9
        }

        const [box] = extractTextBoxes(probabilities, [1, 1, 10, 10], {
            threshold: 0.3,
            boxThreshold: 0.5,
            minimumPixels: 4,
            scaleX: 1,
            scaleY: 1,
            unclipRatio: 1.5,
        })

        expect(box?.[0][0]).toBeLessThan(3)
        expect(box?.[0][1]).toBeLessThan(4)
        expect(box?.[2][0]).toBeGreaterThan(7)
        expect(box?.[2][1]).toBeGreaterThan(6)
    })

    test('creates BGR channel-first normalized detection input', () => {
        const input = createDetectionInput(imageData(1, 1, [255, 0, 127, 255]), {
            maxSideLength: 32,
            multipleOf: 32,
        })

        expect(input.shape).toEqual([1, 3, 32, 32])
        expect(input.data[0]).toBeCloseTo((127 / 255 - 0.485) / 0.229)
        expect(input.data[32 * 32]).toBeCloseTo((0 - 0.456) / 0.224)
        expect(input.data[2 * 32 * 32]).toBeCloseTo((1 - 0.406) / 0.225)
    })

    test('pads recognition input width to a multiple of 32', () => {
        const pixels = Array.from({ length: 100 * 20 }, () => [255, 255, 255, 255]).flat()
        const input = createRecognitionInput(imageData(100, 20, pixels), {
            height: 48,
            maxWidth: 1280,
            widthMultiple: 32,
        })

        expect(input.shape).toEqual([1, 3, 48, 256])
        expect(input.validRatio).toBeCloseTo(240 / 256)
    })

    test('uses BGR order for recognition input', () => {
        const input = createRecognitionInput(imageData(1, 1, [255, 0, 127, 255]), {
            height: 1,
            maxWidth: 32,
            widthMultiple: 32,
        })

        expect(input.data[0]).toBeCloseTo((127 / 255 - 0.5) / 0.5)
        expect(input.data[32]).toBeCloseTo(-1)
        expect(input.data[64]).toBeCloseTo(1)
    })
})