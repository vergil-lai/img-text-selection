import { describe, expect, test } from 'vitest'
import { calculateImageContentRect } from '../src/image-geometry'

describe('calculateImageContentRect', () => {
    test('maps a contained image to the letterboxed content rectangle', () => {
        expect(
            calculateImageContentRect({
                elementWidth: 400,
                elementHeight: 300,
                naturalWidth: 1600,
                naturalHeight: 900,
                objectFit: 'contain',
                objectPosition: '50% 50%',
            }),
        ).toEqual({ x: 0, y: 37.5, width: 400, height: 225 })
    })

    test('maps a covered image using object-position offsets', () => {
        expect(
            calculateImageContentRect({
                elementWidth: 200,
                elementHeight: 200,
                naturalWidth: 400,
                naturalHeight: 200,
                objectFit: 'cover',
                objectPosition: '100% 50%',
            }),
        ).toEqual({ x: -200, y: 0, width: 400, height: 200 })
    })

    test('matches the browser defaults for object-fit fill', () => {
        expect(
            calculateImageContentRect({
                elementWidth: 300,
                elementHeight: 200,
                naturalWidth: 1200,
                naturalHeight: 600,
                objectFit: 'fill',
                objectPosition: '50% 50%',
            }),
        ).toEqual({ x: 0, y: 0, width: 300, height: 200 })
    })

    test('supports none and scale-down without stretching small images', () => {
        const input = {
            elementWidth: 300,
            elementHeight: 200,
            naturalWidth: 100,
            naturalHeight: 50,
            objectPosition: '50% 50%',
        } as const

        expect(calculateImageContentRect({ ...input, objectFit: 'none' })).toEqual({
            x: 100,
            y: 75,
            width: 100,
            height: 50,
        })
        expect(calculateImageContentRect({ ...input, objectFit: 'scale-down' })).toEqual({
            x: 100,
            y: 75,
            width: 100,
            height: 50,
        })
    })
})