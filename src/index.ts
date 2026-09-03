import './style.css'

import { OcrSelectRuntime } from './runtime'
import { WorkerOcrEngine } from './worker-engine'

export function createOcrSelect(): OcrSelectRuntime {
    return new OcrSelectRuntime({ engine: new WorkerOcrEngine() })
}

export { OcrSelectBinding, OcrSelectRuntime } from './runtime'
export type { OcrBackend, OcrLine, OcrResult, OcrSelectState } from './runtime'