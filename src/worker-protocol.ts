import type { OcrResult } from './runtime'

export type OcrWorkerAssets = {
    detection: string
    recognition: string
    dictionary: string
    wasm: string
    wasmModule: string
}

export type OcrWorkerRequest = {
    type: 'recognize'
    taskId: string
    image: ArrayBuffer
    assets: OcrWorkerAssets
}

export type OcrWorkerResponse =
    | { type: 'progress'; taskId: string; stage: 'loading' | 'detecting' | 'recognizing' }
    | { type: 'result'; taskId: string; result: OcrResult }
    | { type: 'error'; taskId: string; code: string; message: string }