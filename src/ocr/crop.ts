import type { OcrBox } from './detection-map';

function distance(left: readonly [number, number], right: readonly [number, number]): number {
    return Math.hypot(right[0] - left[0], right[1] - left[1]);
}

function sample(source: ImageData, x: number, y: number, channel: number): number {
    const boundedX = Math.max(0, Math.min(source.width - 1, Math.floor(x)));
    const boundedY = Math.max(0, Math.min(source.height - 1, Math.floor(y)));
    return source.data[(boundedY * source.width + boundedX) * 4 + channel]!;
}

/** 将任意四边形文字框重采样为供识别模型使用的矩形图像。 */
export function cropTextBox(source: ImageData, box: OcrBox): ImageData {
    const [topLeft, topRight, bottomRight, bottomLeft] = box;
    const width = Math.max(
        1,
        Math.round(Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight))),
    );
    const height = Math.max(
        1,
        Math.round(Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight))),
    );
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y += 1) {
        const vertical = (y + 0.5) / height;
        for (let x = 0; x < width; x += 1) {
            const horizontal = (x + 0.5) / width;
            // 对上下边插值后再纵向插值，完成四边形到矩形的双线性映射。
            const topX = topLeft[0] + (topRight[0] - topLeft[0]) * horizontal;
            const topY = topLeft[1] + (topRight[1] - topLeft[1]) * horizontal;
            const bottomX = bottomLeft[0] + (bottomRight[0] - bottomLeft[0]) * horizontal;
            const bottomY = bottomLeft[1] + (bottomRight[1] - bottomLeft[1]) * horizontal;
            const sourceX = topX + (bottomX - topX) * vertical;
            const sourceY = topY + (bottomY - topY) * vertical;
            const offset = (y * width + x) * 4;
            for (let channel = 0; channel < 4; channel += 1) {
                data[offset + channel] = sample(source, sourceX, sourceY, channel);
            }
        }
    }

    return { width, height, data, colorSpace: 'srgb' } as ImageData;
}