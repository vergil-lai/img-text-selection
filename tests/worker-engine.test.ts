import { describe, expect, test, vi } from 'vitest'
import { WorkerOcrEngine } from '../src/worker-engine'
import type { OcrResult } from '../src/runtime'

const result: OcrResult = {
    width: 100,
    height: 50,
    backend: 'wasm',
    lines: [],
}

class FakeWorker extends EventTarget {
    readonly postMessage = vi.fn((message: { type: string; taskId: string }) => {
        if (message.type !== 'recognize') return
        queueMicrotask(() => {
            this.dispatchEvent(
                new MessageEvent('message', {
                    data: { type: 'result', taskId: message.taskId, result },
                }),
            )
        })
    })
    readonly terminate = vi.fn()
}

class FailingWorker extends EventTarget {
    readonly postMessage = vi.fn((message: { type: string; taskId: string }) => {
        queueMicrotask(() => {
            this.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        type: 'error',
                        taskId: message.taskId,
                        code: 'init_failed',
                        message: 'init failed',
                    },
                }),
            )
        })
    })
    readonly terminate = vi.fn()
}

describe('WorkerOcrEngine', () => {
    test('lazily reuses one worker and transfers image bytes', async () => {
        const worker = new FakeWorker()
        const workerFactory = vi.fn(() => worker as unknown as Worker)
        const readImage = vi.fn(async () => new Uint8Array([1, 2, 3]).buffer)
        const engine = new WorkerOcrEngine({
            workerFactory,
            readImage,
        })
        const image = document.createElement('img')

        await expect(engine.recognize(image)).resolves.toEqual(result)
        await expect(engine.recognize(image)).resolves.toEqual(result)

        expect(workerFactory).toHaveBeenCalledTimes(1)
        expect(readImage).toHaveBeenCalledTimes(2)
        expect(worker.postMessage).toHaveBeenCalledWith(
            {
                type: 'recognize',
                taskId: expect.any(String),
                image: expect.any(ArrayBuffer),
                assets: {
                    detection: expect.stringContaining('/ocr-select/tiny/det.onnx'),
                    recognition: expect.stringContaining('/ocr-select/tiny/rec.onnx'),
                    dictionary: expect.stringContaining('/ocr-select/tiny/dictionary.json'),
                    wasm: expect.stringContaining(
                        '/ocr-select/ort/ort-wasm-simd-threaded.asyncify.wasm',
                    ),
                    wasmModule: expect.stringContaining(
                        '/ocr-select/ort/ort-wasm-simd-threaded.asyncify.mjs',
                    ),
                },
            },
            [expect.any(ArrayBuffer)],
        )
    })

    test('terminates the worker on dispose', async () => {
        const worker = new FakeWorker()
        const engine = new WorkerOcrEngine({
            workerFactory: () => worker as unknown as Worker,
            readImage: async () => new ArrayBuffer(0),
        })
        await engine.recognize(document.createElement('img'))

        await engine.dispose()

        expect(worker.terminate).toHaveBeenCalledOnce()
        await expect(engine.recognize(document.createElement('img'))).rejects.toThrow('disposed')
    })

    test('recreates a worker after a task error so retry can recover', async () => {
        const failed = new FailingWorker()
        const recovered = new FakeWorker()
        const workerFactory = vi
            .fn<() => Worker>()
            .mockReturnValueOnce(failed as unknown as Worker)
            .mockReturnValueOnce(recovered as unknown as Worker)
        const engine = new WorkerOcrEngine({
            workerFactory,
            readImage: async () => new ArrayBuffer(0),
        })

        await expect(engine.recognize(document.createElement('img'))).rejects.toThrow('init failed')
        await expect(engine.recognize(document.createElement('img'))).resolves.toEqual(result)

        expect(failed.terminate).toHaveBeenCalledOnce()
        expect(workerFactory).toHaveBeenCalledTimes(2)
    })
})