export interface DecodedText {
    text: string
    confidence: number
}

/** 将识别模型的 CTC logits 解码为文本，并合并连续的重复字符。 */
export function decodeCtc(
    logits: Float32Array,
    shape: readonly number[],
    dictionary: readonly string[],
): DecodedText {
    if (shape.length !== 3) throw new RangeError('CTC shape must be [1, time, classes]')
    const [batch = 0, time = 0, classes = 0] = shape
    if (batch !== 1 || classes !== dictionary.length + 2 || logits.length !== time * classes) {
        throw new RangeError('CTC output does not match dictionary')
    }

    const characters: string[] = []
    const confidences: number[] = []
    let previous = -1
    for (let step = 0; step < time; step += 1) {
        const offset = step * classes
        let selected = 0
        for (let candidate = 1; candidate < classes; candidate += 1) {
            if (logits[offset + candidate]! > logits[offset + selected]!) selected = candidate
        }
        // CTC 的 0 为 blank；连续相同 token 只代表一个字符。
        if (selected !== 0 && selected !== previous) {
            const character = selected === dictionary.length + 1 ? ' ' : dictionary[selected - 1]
            if (character !== undefined) {
                characters.push(character)
                confidences.push(logits[offset + selected]!)
            }
        }
        previous = selected
    }

    return {
        text: characters.join(''),
        confidence:
            confidences.length === 0
                ? 0
                : confidences.reduce((total, value) => total + value, 0) / confidences.length,
    }
}