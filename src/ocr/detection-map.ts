export type OcrBox = readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
]

interface DetectionMapOptions {
    threshold: number
    boxThreshold: number
    minimumPixels: number
    scaleX: number
    scaleY: number
    unclipRatio?: number
}

export function extractTextBoxes(
    probabilities: Float32Array,
    shape: readonly number[],
    options: DetectionMapOptions,
): OcrBox[] {
    if (shape.length !== 4) throw new RangeError('Detection shape must be [1, 1, height, width]')
    const [batch = 0, channels = 0, height = 0, width = 0] = shape
    if (batch !== 1 || channels !== 1 || probabilities.length !== height * width) {
        throw new RangeError('Detection output shape is invalid')
    }

    const visited = new Uint8Array(probabilities.length)
    const boxes: OcrBox[] = []
    for (let start = 0; start < probabilities.length; start += 1) {
        if (visited[start] || probabilities[start]! < options.threshold) continue
        const queue = [start]
        visited[start] = 1
        let cursor = 0
        let minX = width
        let minY = height
        let maxX = 0
        let maxY = 0
        let score = 0
        while (cursor < queue.length) {
            const index = queue[cursor++]!
            const x = index % width
            const y = Math.floor(index / width)
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
            score += probabilities[index]!
            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    const nextX = x + dx
                    const nextY = y + dy
                    if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue
                    const next = nextY * width + nextX
                    if (visited[next] || probabilities[next]! < options.threshold) continue
                    visited[next] = 1
                    queue.push(next)
                }
            }
        }
        if (queue.length < options.minimumPixels || score / queue.length < options.boxThreshold)
            continue
        const regionWidth = maxX - minX + 1
        const regionHeight = maxY - minY + 1
        const unclipDistance =
            options.unclipRatio === undefined
                ? 0
                : (regionWidth * regionHeight * options.unclipRatio) /
                  (2 * (regionWidth + regionHeight))
        const left = Math.max(0, minX - unclipDistance) * options.scaleX
        const top = Math.max(0, minY - unclipDistance) * options.scaleY
        const right = Math.min(width, maxX + 1 + unclipDistance) * options.scaleX
        const bottom = Math.min(height, maxY + 1 + unclipDistance) * options.scaleY
        boxes.push([
            [left, top],
            [right, top],
            [right, bottom],
            [left, bottom],
        ])
    }
    return boxes
}