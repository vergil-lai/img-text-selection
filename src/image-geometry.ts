export interface ImageGeometryInput {
    elementWidth: number;
    elementHeight: number;
    naturalWidth: number;
    naturalHeight: number;
    objectFit: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
    objectPosition: string;
}

export interface ImageContentRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** 将 CSS `object-position` 关键字或百分比转换为定位比例。 */
function positionFraction(value: string): number {
    if (value === 'left' || value === 'top') return 0;
    if (value === 'right' || value === 'bottom') return 1;
    if (value === 'center') return 0.5;
    if (value.endsWith('%')) return Number.parseFloat(value) / 100;
    return 0.5;
}

/** 计算应用 `object-fit` 与 `object-position` 后图片实际内容的显示区域。 */
export function calculateImageContentRect(input: ImageGeometryInput): ImageContentRect {
    if (input.objectFit === 'fill') {
        return { x: 0, y: 0, width: input.elementWidth, height: input.elementHeight };
    }
    const containScale = Math.min(
        input.elementWidth / input.naturalWidth,
        input.elementHeight / input.naturalHeight,
    );
    const coverScale = Math.max(
        input.elementWidth / input.naturalWidth,
        input.elementHeight / input.naturalHeight,
    );
    const scale =
        input.objectFit === 'cover'
            ? coverScale
            : input.objectFit === 'none'
              ? 1
              : input.objectFit === 'scale-down'
                ? Math.min(1, containScale)
                : containScale;
    const width = input.naturalWidth * scale;
    const height = input.naturalHeight * scale;
    const [horizontal = '50%', vertical = '50%'] = input.objectPosition.trim().split(/\s+/);

    return {
        x: (input.elementWidth - width) * positionFraction(horizontal),
        y: (input.elementHeight - height) * positionFraction(vertical),
        width,
        height,
    };
}