# ocr-select-core

面向浏览器的本地 OCR 与可选择文字层核心。第一版固定使用内置的 PP-OCRv6 Tiny 模型，不需要配置模型地址或额外部署静态资产。

`OcrSelectRuntime` 管理 Worker、模型会话、内存缓存和当前活动图片；`OcrSelectBinding` 管理单张图片的生命周期、状态、覆盖层与选择交互。浏览器环境优先使用 WebGPU，并自动回退到 WASM。

Tiny 检测模型、识别模型、字符字典、ONNX Runtime WASM 和对应加载器都包含在 npm 包中。运行时不会访问外部模型服务，也不需要 `assetBaseUrl` 或 `model` 参数。

## 安装

```bash
npm install ocr-select-core
```

## 使用

```ts
import { createOcrSelect } from 'ocr-select-core'
import 'ocr-select-core/style.css'

const runtime = createOcrSelect()
const binding = runtime.attach(document.querySelector('img')!)

await binding.activate()
```

## 运行 Demo

```bash
cd demo
pnpm install
pnpm dev
```

打开终端输出的本地地址，点击示例图片即可启动 OCR；识别完成后可直接拖选、复制图片中的文字。

## LICENCE
[MIT](./LICENSE)