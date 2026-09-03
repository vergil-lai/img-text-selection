import { describe, expect, test } from 'vitest'
import { runOcrPipeline } from '../src/ocr/pipeline'
import type { TensorInput } from '../src/ocr/preprocess'

function sourceImage(): ImageData {
    return {
        width: 12,
        height: 8,
        data: new Uint8ClampedArray(12 * 8 * 4).fill(255),
        colorSpace: 'srgb',
    } as ImageData
}

describe('runOcrPipeline', () => {
    test('turns a detection map and recognition logits into positioned text lines', async () => {
        const detection = {
            run: async (input: TensorInput) => {
                const [, , height, width] = input.shape
                const data = new Float32Array(width * height)
                for (let y = 8; y < 20; y += 1) {
                    for (let x = 8; x < 24; x += 1) data[y * width + x] = 0.9
                }
                return { data, dims: [1, 1, height, width] }
            },
        }
        const recognition = {
            run: async () => ({
                data: new Float32Array([0, 9, 0, 9, 0, 0]),
                dims: [1, 2, 3],
            }),
        }

        const lines = await runOcrPipeline(sourceImage(), { detection, recognition }, ['文'])

        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatchObject({ text: '文' })
        expect(lines[0]?.box[0][0]).toBeCloseTo(1.2)
        expect(lines[0]?.box[0][1]).toBeCloseTo(0.8)
    })
})