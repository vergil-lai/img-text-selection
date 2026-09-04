import './style-types';
import './style.css';

import { OcrSelectRuntime } from './runtime';
import { WorkerOcrEngine } from './worker-engine';

/** 创建使用内置 Worker OCR 引擎的运行时实例。 */
export function createOcrSelect(): OcrSelectRuntime {
    return new OcrSelectRuntime({ engine: new WorkerOcrEngine() });
}

export { OcrSelectBinding, OcrSelectRuntime } from './runtime';
export type { OcrBackend, OcrLine, OcrResult, OcrSelectState, OcrSelectTarget } from './runtime';