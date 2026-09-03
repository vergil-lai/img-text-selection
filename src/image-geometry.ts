export interface ImageGeometryInput {
    elementWidth: number
    elementHeight: number
    naturalWidth: number
    naturalHeight: number
    objectFit: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'
    objectPosition: string
}

export interface ImageContentRect {
    x: number
    y: number
    width: number
    height: number
}

function positionFraction(value: string): number {
    if (value === 'left' || value === 'top') return 0
    if (value === 'right' || value === 'bottom') return 1
    if (value === 'center') return 0.5
    if (value.endsWith('%')) return Number.parseFloat(value) / 100
    return 0.5
}

export function calculateImageContentRect(input: ImageGeometryInput): ImageContentRect {
    if (input.objectFit === 'fill') {
        return { x: 0, y: 0, width: input.elementWidth, height: input.elementHeight }
    }
    const containScale = Math.min(
        input.elementWidth / input.naturalWidth,
        input.elementHeight / input.naturalHeight,
    )
    const coverScale = Math.max(
        input.elementWidth / input.naturalWidth,
        input.elementHeight / input.naturalHeight,
    )
    const scale =
        input.objectFit === 'cover'
            ? coverScale
            : input.objectFit === 'none'
              ? 1
              : input.objectFit === 'scale-down'
                ? Math.min(1, containScale)
                : containScale
    const width = input.naturalWidth * scale
    const height = input.naturalHeight * scale
    const [horizontal = '50%', vertical = '50%'] = input.objectPosition.trim().split(/\s+/)

    return {
        x: (input.elementWidth - width) * positionFraction(horizontal),
        y: (input.elementHeight - height) * positionFraction(vertical),
        width,
        height,
    }
}