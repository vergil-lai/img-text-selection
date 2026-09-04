import type { OcrLine } from '../runtime';
import { cropTextBox } from './crop';
import { decodeCtc } from './ctc';
import { extractTextBoxes } from './detection-map';
import { createDetectionInput, createRecognitionInput } from './preprocess';
import type { TensorInput } from './preprocess';

export interface PipelineOutput {
    data: Float32Array;
    dims: readonly number[];
}

export interface PipelineSession {
    run(input: TensorInput): Promise<PipelineOutput>;
}

interface PipelineSessions {
    detection: PipelineSession;
    recognition: PipelineSession;
}

interface PipelineProgress {
    onStage?: (stage: 'detecting' | 'recognizing', completed: number, total: number) => void;
}

function top(line: OcrLine): number {
    return Math.min(...line.box.map((point) => point[1]));
}

function left(line: OcrLine): number {
    return Math.min(...line.box.map((point) => point[0]));
}

/** 依次检测文字区域、识别每个区域，并按阅读顺序返回可靠文本行。 */
export async function runOcrPipeline(
    image: ImageData,
    sessions: PipelineSessions,
    dictionary: readonly string[],
    progress: PipelineProgress = {},
): Promise<OcrLine[]> {
    progress.onStage?.('detecting', 0, 1);
    const detectionInput = createDetectionInput(image, {
        maxSideLength: 960,
        multipleOf: 32,
    });
    const detectionOutput = await sessions.detection.run(detectionInput);
    const outputWidth = detectionOutput.dims[3];
    const outputHeight = detectionOutput.dims[2];
    if (!outputWidth || !outputHeight)
        throw new RangeError('Detection output dimensions are invalid');
    const boxes = extractTextBoxes(detectionOutput.data, detectionOutput.dims, {
        threshold: 0.3,
        boxThreshold: 0.5,
        minimumPixels: 4,
        scaleX: image.width / outputWidth,
        scaleY: image.height / outputHeight,
        unclipRatio: 1.4,
    });
    progress.onStage?.('detecting', 1, 1);

    const lines: OcrLine[] = [];
    // 检测框逐个送入识别模型，便于报告细粒度进度。
    for (const [index, box] of boxes.entries()) {
        progress.onStage?.('recognizing', index, boxes.length);
        const crop = cropTextBox(image, box);
        const recognitionInput = createRecognitionInput(crop, {
            height: 48,
            maxWidth: 1280,
            widthMultiple: 32,
        });
        const recognitionOutput = await sessions.recognition.run(recognitionInput);
        const decoded = decodeCtc(recognitionOutput.data, recognitionOutput.dims, dictionary);
        if (decoded.text && decoded.confidence >= 0.5) {
            lines.push({ text: decoded.text, confidence: decoded.confidence, box });
        }
        progress.onStage?.('recognizing', index + 1, boxes.length);
    }
    // oxlint-disable-next-line unicorn/no-array-sort -- `lines` is a fresh local result array.
    return lines.sort((first, second) => top(first) - top(second) || left(first) - left(second));
}