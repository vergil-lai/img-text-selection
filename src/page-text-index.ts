export interface TextLineInput {
    id: string
    text: string
}

export interface TextPosition {
    lineId: string
    grapheme: number
}

export interface IndexedTextLine extends TextLineInput {
    graphemes: string[]
    utf16Offsets: number[]
}

export class PageTextIndex {
    readonly #lines: IndexedTextLine[]
    readonly #byId: Map<string, IndexedTextLine>

    constructor(lines: readonly TextLineInput[]) {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        this.#lines = lines.map((line) => {
            const segments = [...segmenter.segment(line.text)]
            return {
                ...line,
                graphemes: segments.map((segment) => segment.segment),
                utf16Offsets: [...segments.map((segment) => segment.index), line.text.length],
            }
        })
        this.#byId = new Map(this.#lines.map((line) => [line.id, line]))
    }

    line(id: string): IndexedTextLine {
        const line = this.#byId.get(id)
        if (!line) throw new RangeError(`Unknown text line: ${id}`)
        return line
    }

    positionAtUtf16(lineId: string, offset: number, affinity: 'start' | 'end'): TextPosition {
        const line = this.line(lineId)
        const bounded = Math.max(0, Math.min(offset, line.text.length))
        const exact = line.utf16Offsets.indexOf(bounded)
        if (exact >= 0) return { lineId, grapheme: exact }

        const next = line.utf16Offsets.findIndex((candidate) => candidate > bounded)
        return {
            lineId,
            grapheme: affinity === 'start' ? Math.max(0, next - 1) : next,
        }
    }

    textBetween(start: TextPosition, end: TextPosition): string {
        const startIndex = this.#lines.findIndex((line) => line.id === start.lineId)
        const endIndex = this.#lines.findIndex((line) => line.id === end.lineId)
        if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) {
            throw new RangeError('Text range must follow page order')
        }

        return this.#lines
            .slice(startIndex, endIndex + 1)
            .map((line, index, selected) => {
                const from = index === 0 ? start.grapheme : 0
                const to = index === selected.length - 1 ? end.grapheme : line.graphemes.length
                return line.graphemes.slice(from, to).join('')
            })
            .join('\n')
    }
}