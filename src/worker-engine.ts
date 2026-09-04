import type { OcrEngine, OcrResult } from './runtime';
import type { OcrWorkerRequest, OcrWorkerResponse } from './worker-protocol';

type WorkerFactory = () => Worker;
type ImageReader = (image: HTMLImageElement) => Promise<ArrayBuffer>;

interface WorkerEngineOptions {
    workerFactory?: WorkerFactory;
    readImage?: ImageReader;
}

interface PendingTask {
    resolve: (result: OcrResult) => void;
    reject: (error: Error) => void;
}

const builtInAssets = {
    detection: '__OCR_SELECT_ASSET__./assets/ocr-select/tiny/det.onnx',
    recognition: '__OCR_SELECT_ASSET__./assets/ocr-select/tiny/rec.onnx',
    dictionary: '__OCR_SELECT_ASSET__./assets/ocr-select/tiny/dictionary.json',
    wasm: '__OCR_SELECT_ASSET__./assets/ocr-select/ort/ort-wasm-simd-threaded.asyncify.wasm',
    wasmModule: '__OCR_SELECT_ASSET__./assets/ocr-select/ort/ort-wasm-simd-threaded.asyncify.mjs',
};

/** 读取图片源字节并遵循图片元素声明的跨域凭据策略。 */
async function readImageBytes(image: HTMLImageElement): Promise<ArrayBuffer> {
    const source = image.currentSrc || image.src;
    if (!source) throw new Error('Image source is empty');
    const response = await fetch(source, {
        credentials: image.crossOrigin === 'use-credentials' ? 'include' : 'same-origin',
    });
    if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
    return response.arrayBuffer();
}

function defaultWorkerFactory(): Worker {
    return new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' });
}

/** 通过模块 Worker 执行 OCR，并管理在途任务与 Worker 生命周期。 */
export class WorkerOcrEngine implements OcrEngine {
    readonly #workerFactory: WorkerFactory;
    readonly #readImage: ImageReader;
    readonly #pending = new Map<string, PendingTask>();
    #worker: Worker | undefined;
    #disposed = false;

    constructor(options: WorkerEngineOptions = {}) {
        this.#workerFactory = options.workerFactory ?? defaultWorkerFactory;
        this.#readImage = options.readImage ?? readImageBytes;
    }

    /** 将图片字节转交给 Worker，并等待关联任务的识别结果。 */
    async recognize(image: HTMLImageElement): Promise<OcrResult> {
        if (this.#disposed) throw new Error('OCR engine has been disposed');
        const bytes = await this.#readImage(image);
        if (this.#disposed) throw new Error('OCR engine has been disposed');
        const worker = this.#ensureWorker();
        const taskId = crypto.randomUUID();
        const request: OcrWorkerRequest = {
            type: 'recognize',
            taskId,
            image: bytes,
            assets: builtInAssets,
        };
        return new Promise<OcrResult>((resolve, reject) => {
            this.#pending.set(taskId, { resolve, reject });
            try {
                worker.postMessage(request, [bytes]);
            } catch (error) {
                this.#pending.delete(taskId);
                reject(
                    error instanceof Error
                        ? error
                        : new Error('Failed to send image to OCR worker'),
                );
            }
        });
    }

    /** 拒绝在途任务并终止 Worker。 */
    dispose(): void {
        if (this.#disposed) return;
        this.#disposed = true;
        const error = new Error('OCR engine has been disposed');
        for (const task of this.#pending.values()) task.reject(error);
        this.#pending.clear();
        this.#worker?.removeEventListener('message', this.#handleMessage);
        this.#worker?.removeEventListener('error', this.#handleError);
        this.#worker?.terminate();
        this.#worker = undefined;
    }

    #ensureWorker(): Worker {
        if (this.#worker) return this.#worker;
        const worker = this.#workerFactory();
        worker.addEventListener('message', this.#handleMessage);
        worker.addEventListener('error', this.#handleError);
        this.#worker = worker;
        return worker;
    }

    readonly #handleMessage = (event: MessageEvent<OcrWorkerResponse>): void => {
        const response = event.data;
        if (response.type === 'progress') return;
        const task = this.#pending.get(response.taskId);
        if (!task) return;
        this.#pending.delete(response.taskId);
        if (response.type === 'result') task.resolve(response.result);
        else {
            this.#resetWorker();
            task.reject(Object.assign(new Error(response.message), { code: response.code }));
        }
    };

    readonly #handleError = (event: ErrorEvent): void => {
        const error = new Error(event.message || 'OCR worker failed');
        for (const task of this.#pending.values()) task.reject(error);
        this.#pending.clear();
        this.#resetWorker();
    };

    #resetWorker(): void {
        this.#worker?.removeEventListener('message', this.#handleMessage);
        this.#worker?.removeEventListener('error', this.#handleError);
        this.#worker?.terminate();
        this.#worker = undefined;
    }
}