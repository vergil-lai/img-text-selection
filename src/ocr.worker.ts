import * as ort from 'onnxruntime-web/webgpu';
import { runOcrPipeline } from './ocr/pipeline';
import type { PipelineSession } from './ocr/pipeline';
import type { TensorInput } from './ocr/preprocess';
import type { OcrBackend, OcrResult } from './runtime';
import type { OcrWorkerAssets, OcrWorkerRequest, OcrWorkerResponse } from './worker-protocol';

interface SessionPair {
    detection: ort.InferenceSession;
    recognition: ort.InferenceSession;
    backend: OcrBackend;
    dictionary: string[];
    key: string;
}

let sessions: SessionPair | undefined;
let operationQueue = Promise.resolve();

function respond(message: OcrWorkerResponse): void {
    postMessage(message);
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Asset request failed: ${response.status} ${url}`);
    return response.json() as Promise<T>;
}

async function createSessionPair(
    assets: OcrWorkerAssets,
    providers: ('webgpu' | 'wasm')[],
    backend: OcrBackend,
    key: string,
): Promise<SessionPair> {
    const options: ort.InferenceSession.SessionOptions = {
        executionProviders: providers,
        graphOptimizationLevel: 'all',
    };
    const detection = await ort.InferenceSession.create(assets.detection, options);
    try {
        const recognition = await ort.InferenceSession.create(assets.recognition, options);
        const dictionary = await fetchJson<string[]>(assets.dictionary);
        return { detection, recognition, backend, dictionary, key };
    } catch (error) {
        await detection.release();
        throw error;
    }
}

async function releaseSessions(): Promise<void> {
    const current = sessions;
    sessions = undefined;
    if (!current) return;
    await Promise.allSettled([current.detection.release(), current.recognition.release()]);
}

/** 复用同一执行后端的模型会话，并在可用时优先选择 WebGPU。 */
async function prepareSessions(assets: OcrWorkerAssets, forceWasm = false): Promise<SessionPair> {
    const key = forceWasm ? 'wasm' : 'auto';
    if (sessions?.key === key) return sessions;
    await releaseSessions();
    ort.env.wasm.wasmPaths = { wasm: assets.wasm, mjs: assets.wasmModule };
    ort.env.wasm.numThreads = 1;

    if (!forceWasm && 'gpu' in navigator) {
        try {
            sessions = await createSessionPair(assets, ['webgpu'], 'webgpu', key);
            return sessions;
        } catch {
            await releaseSessions();
        }
    }
    sessions = await createSessionPair(assets, ['wasm'], 'wasm', key);
    return sessions;
}

/** 将 ONNX Runtime 会话适配为与模型运行时无关的流水线接口。 */
class OrtSessionAdapter implements PipelineSession {
    constructor(private readonly session: ort.InferenceSession) {}

    /** 执行模型并校验流水线所需的 float32 输出。 */
    async run(input: TensorInput) {
        const inputName = this.session.inputNames[0];
        const outputName = this.session.outputNames[0];
        if (!inputName || !outputName) throw new Error('ONNX model input or output is missing');
        const outputs = await this.session.run({
            [inputName]: new ort.Tensor('float32', input.data, input.shape),
        });
        const output = outputs[outputName];
        if (!output || !(output.data instanceof Float32Array)) {
            throw new TypeError('ONNX output must be a float32 tensor');
        }
        return { data: output.data, dims: output.dims };
    }
}

async function decodeImage(bytes: ArrayBuffer): Promise<ImageData> {
    const bitmap = await createImageBitmap(new Blob([bytes]));
    try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Offscreen canvas 2D context is unavailable');
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
    } finally {
        bitmap.close();
    }
}

/** 解码图片、执行 OCR 流水线并包装为主线程可消费的结果。 */
async function execute(request: OcrWorkerRequest, forceWasm = false): Promise<OcrResult> {
    respond({ type: 'progress', taskId: request.taskId, stage: 'loading' });
    const image = await decodeImage(request.image);
    const pair = await prepareSessions(request.assets, forceWasm);
    const lines = await runOcrPipeline(
        image,
        {
            detection: new OrtSessionAdapter(pair.detection),
            recognition: new OrtSessionAdapter(pair.recognition),
        },
        pair.dictionary,
        {
            onStage: (stage) => respond({ type: 'progress', taskId: request.taskId, stage }),
        },
    );
    if (lines.length === 0)
        throw Object.assign(new Error('No reliable text found'), { code: 'no_reliable_text' });
    return {
        width: image.width,
        height: image.height,
        backend: pair.backend,
        lines,
    };
}

/** 识别请求；WebGPU 推理失败时自动以 WASM 重试。 */
async function recognize(request: OcrWorkerRequest): Promise<void> {
    try {
        let result: OcrResult;
        try {
            result = await execute(request);
        } catch (error) {
            const isSemanticFailure =
                error instanceof Error && 'code' in error && error.code === 'no_reliable_text';
            if (sessions?.backend !== 'webgpu' || isSemanticFailure) throw error;
            // 仅将运行时失败回退到 WASM；无文本并非后端不兼容。
            await releaseSessions();
            result = await execute(request, true);
        }
        respond({ type: 'result', taskId: request.taskId, result });
    } catch (error) {
        const code =
            error instanceof Error && 'code' in error && typeof error.code === 'string'
                ? error.code
                : 'inference_failed';
        respond({
            type: 'error',
            taskId: request.taskId,
            code,
            message: error instanceof Error ? error.message : 'OCR inference failed',
        });
    }
}

addEventListener('message', (event: MessageEvent<OcrWorkerRequest>) => {
    operationQueue = operationQueue.then(
        () => recognize(event.data),
        () => recognize(event.data),
    );
});