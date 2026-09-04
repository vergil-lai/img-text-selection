import { PageTextIndex } from './page-text-index';
import type { TextPosition } from './page-text-index';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type Point = readonly [number, number];

export interface OcrTextLine {
    id: string;
    text: string;
    confidence: number;
    box: readonly [Point, Point, Point, Point];
}

interface ImageSize {
    width: number;
    height: number;
}

function distance(left: Point, right: Point): number {
    return Math.hypot(right[0] - left[0], right[1] - left[1]);
}

/** 将倾斜的 OCR 文本行映射为可由浏览器选中的 SVG 文本元素。 */
function lineElement(line: OcrTextLine): SVGTextElement {
    const [topLeft, topRight, bottomRight, bottomLeft] = line.box;
    const width = (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2;
    const height = (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2;
    const angle = (Math.atan2(topRight[1] - topLeft[1], topRight[0] - topLeft[0]) * 180) / Math.PI;
    const text = document.createElementNS(SVG_NAMESPACE, 'text');
    text.dataset.ocrLine = line.id;
    text.setAttribute('x', '0');
    text.setAttribute('y', String(height * 0.82));
    text.setAttribute('font-size', String(height));
    text.setAttribute('textLength', String(width));
    text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    text.setAttribute('dir', 'auto');
    text.setAttribute('transform', `translate(${topLeft[0]} ${topLeft[1]}) rotate(${angle})`);
    text.textContent = line.text;
    return text;
}

function lineIdForNode(node: Node): string | undefined {
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return element?.closest<SVGTextElement>('[data-ocr-line]')?.dataset.ocrLine;
}

/** 将 OCR 结果渲染为 SVG 文本层，并还原浏览器选区中的原始文本。 */
export class SelectableTextLayer {
    readonly element: SVGSVGElement;
    readonly #index: PageTextIndex;

    constructor(size: ImageSize, lines: readonly OcrTextLine[]) {
        this.#index = new PageTextIndex(lines);
        this.element = document.createElementNS(SVG_NAMESPACE, 'svg');
        this.element.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
        this.element.setAttribute('preserveAspectRatio', 'none');
        this.element.classList.add('ocr-select-text-layer');
        for (const line of lines) this.element.append(lineElement(line));
    }

    /** 从本图层的 DOM Range 提取按 OCR 行组织的文本。 */
    textForRange(range: Range): string | undefined {
        const start = this.#position(range.startContainer, range.startOffset, 'start');
        const end = this.#position(range.endContainer, range.endOffset, 'end');
        if (!start || !end) return undefined;
        return this.#index.textBetween(start, end);
    }

    #position(node: Node, offset: number, affinity: 'start' | 'end'): TextPosition | undefined {
        if (!this.element.contains(node)) return undefined;
        const lineId = lineIdForNode(node);
        if (!lineId) return undefined;
        return this.#index.positionAtUtf16(lineId, offset, affinity);
    }
}