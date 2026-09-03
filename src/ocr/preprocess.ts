export interface TensorInput {
    data: Float32Array
    shape: [number, number, number, number]
    scale: { x: number; y: number }
    validRatio?: number
}

interface DetectionConfig {
    maxSideLength: number
    multipleOf: number
}

interface RecognitionConfig {
    height: number
    maxWidth: number
    widthMultiple: number
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value))
}

/** 使用双线性插值采样 RGB 像素。 */
function sample(
    image: ImageData,
    targetX: number,
    targetY: number,
    targetWidth: number,
    targetHeight: number,
): [number, number, number] {
    const sourceX = ((targetX + 0.5) * image.width) / targetWidth - 0.5
    const sourceY = ((targetY + 0.5) * image.height) / targetHeight - 0.5
    const floorX = Math.floor(sourceX)
    const floorY = Math.floor(sourceY)
    const x0 = clamp(floorX, 0, image.width - 1)
    const x1 = clamp(floorX + 1, 0, image.width - 1)
    const y0 = clamp(floorY, 0, image.height - 1)
    const y1 = clamp(floorY + 1, 0, image.height - 1)
    const xWeight = sourceX - floorX
    const yWeight = sourceY - floorY
    const channel = (offset: number): number => {
        const top =
            image.data[(y0 * image.width + x0) * 4 + offset]! * (1 - xWeight) +
            image.data[(y0 * image.width + x1) * 4 + offset]! * xWeight
        const bottom =
            image.data[(y1 * image.width + x0) * 4 + offset]! * (1 - xWeight) +
            image.data[(y1 * image.width + x1) * 4 + offset]! * xWeight
        return top * (1 - yWeight) + bottom * yWeight
    }
    return [channel(0), channel(1), channel(2)]
}

/** 将原图缩放、归一化为检测模型的 NCHW 张量。 */
export function createDetectionInput(image: ImageData, config: DetectionConfig): TensorInput {
    const longest = Math.max(image.width, image.height)
    const ratio = Math.min(1, config.maxSideLength / longest)
    const width = Math.max(
        config.multipleOf,
        Math.round((image.width * ratio) / config.multipleOf) * config.multipleOf,
    )
    const height = Math.max(
        config.multipleOf,
        Math.round((image.height * ratio) / config.multipleOf) * config.multipleOf,
    )
    const data = new Float32Array(3 * width * height)
    const mean = [0.485, 0.456, 0.406]
    const standardDeviation = [0.229, 0.224, 0.225]
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const channels = sample(image, x, y, width, height)
            for (let channel = 0; channel < 3; channel += 1) {
                data[channel * width * height + y * width + x] =
                    (channels[2 - channel]! / 255 - mean[channel]!) / standardDeviation[channel]!
            }
        }
    }
    return {
        data,
        shape: [1, 3, height, width],
        scale: { x: width / image.width, y: height / image.height },
    }
}

/** 将文字裁剪图缩放并右侧留白为识别模型的 NCHW 张量。 */
export function createRecognitionInput(image: ImageData, config: RecognitionConfig): TensorInput {
    const contentWidth = Math.min(
        config.maxWidth,
        Math.ceil((config.height * image.width) / image.height),
    )
    const width = Math.min(
        config.maxWidth,
        Math.max(
            config.widthMultiple,
            Math.ceil(contentWidth / config.widthMultiple) * config.widthMultiple,
        ),
    )
    const data = new Float32Array(3 * config.height * width)
    for (let y = 0; y < config.height; y += 1) {
        for (let x = 0; x < contentWidth; x += 1) {
            const channels = sample(image, x, y, contentWidth, config.height)
            for (let channel = 0; channel < 3; channel += 1) {
                data[channel * config.height * width + y * width + x] =
                    (channels[2 - channel]! / 255 - 0.5) / 0.5
            }
        }
    }
    return {
        data,
        shape: [1, 3, config.height, width],
        scale: { x: contentWidth / image.width, y: config.height / image.height },
        validRatio: contentWidth / width,
    }
}