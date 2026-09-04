# img-text-selection

[![npm version](https://img.shields.io/npm/v/img-text-selection)](https://www.npmjs.com/package/img-text-selection)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

> 识别之后，直接选择 —— 让网页图片里的文字可拖选、可复制。

img-text-selection 为页面中的 `<img>` 带来与普通文字一致的阅读体验：点击图片后，OCR 在浏览器本地完成，并生成与原图逐行对齐的文字层，之后就可以像选中普通网页文字一样拖选、双击选词、复制图片里的内容。识别全程在浏览器内运行，图片不会上传到任何服务器，无需自建或调用远程 OCR API。

## 特性

- **完全本地，隐私友好** — 识别在浏览器内的 Web Worker 中执行，图片与识别数据不出本地
- **零配置开箱即用** — PP-OCRv6 Tiny 检测/识别模型、字符字典与 ONNX Runtime 运行时全部内置在 npm 包中，安装即用，无需额外下载或配置
- **WebGPU 优先，WASM 自动回退** — 支持时启用 WebGPU 加速，否则回退到 WASM SIMD，主流现代浏览器均可运行
- **原生选择体验** — 文字层逐行对齐原图（含倾斜文本行自动旋转），拖选、复制的行为与普通网页文字一致
- **不阻塞主线程** — 推理流水线在模块 Worker 中运行，页面交互保持流畅
- **结果缓存** — 按图片地址与原始尺寸缓存识别结果，同一张图片再次激活时即时呈现
- **TypeScript 原生 / Vue 3 指令** — 提供完整类型定义；Vue 项目通过 `v-img-text-selection` 一行接入

## 工作原理

- **`OcrSelectRuntime`** — 调度中心：管理 OCR Worker、模型会话与识别结果缓存，通过 `attach()` 将任意 `<img>` 纳入管理
- **`OcrSelectBinding`** — 单张图片的生命周期：监听点击、驱动识别、渲染覆盖层并托管选择交互
- **Worker 引擎** — 图片字节经 `postMessage` 零拷贝转入模块 Worker，检测 → 识别流水线在后台执行，主线程只负责渲染文字层

## 安装

```bash
npm install img-text-selection
```

## 快速开始

### 原生 TypeScript / JavaScript

```ts
import { createOcrSelect, type OcrSelectState } from 'img-text-selection';
import 'img-text-selection/style.css';

const runtime = createOcrSelect();
const binding = runtime.attach('#document'); // 传 CSS 选择器或 HTMLImageElement 均可

// 订阅状态变化（立即收到当前状态）
const unsubscribe = binding.subscribe((state: OcrSelectState) => {
    switch (state.status) {
        case 'idle':
            console.log('等待用户点击图片');
            break;
        case 'recognizing':
            console.log('正在识别…');
            break;
        case 'active':
            console.log(`文字层就绪 · ${state.backend.toUpperCase()}`); // webgpu | wasm
            break;
        case 'error':
            console.error('识别失败', state.error);
            break;
        case 'disposed':
            console.log('绑定已释放');
            break;
    }
});

// 主动激活文字层；也可以什么都不做，等用户点击图片自动触发
await binding.activate();

// 页面卸载时清理
unsubscribe();
binding.dispose();
await runtime.dispose();
```

### Vue 3 指令

Vue 适配层由同一个包的 `./vue` 子路径提供；Vue 3.5+ 是 optional peer dependency，非 Vue 项目不需要安装它。

在应用入口注册插件（同一个 app 内的所有实例共享一个 runtime，app 卸载时自动释放）：

```ts
import { createApp } from 'vue';
import { createOcrSelectPlugin } from 'img-text-selection/vue';
import 'img-text-selection/style.css';
import App from './App.vue';

createApp(App).use(createOcrSelectPlugin()).mount('#app');
```

在组件中把指令放在原生 `<img>` 上：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { OcrSelectState } from 'img-text-selection/vue';

const state = ref<OcrSelectState>({ status: 'idle' });
const label = computed(() => {
    if (state.value.status === 'recognizing') return '正在识别…';
    if (state.value.status === 'active') return '可选择文字';
    if (state.value.status === 'error') return '识别失败';
    return '点击图片开始识别';
});

function onStateChange(next: OcrSelectState): void {
    state.value = next;
}
</script>

<template>
    <p aria-live="polite">{{ label }}</p>
    <img v-img-text-selection="{ onStateChange }" src="/document.png" alt="Document" />
</template>
```

指令值可传入 `onStateChange` 与 `onError` 回调；指令只能用于最终挂载为原生 `<img>` 的元素。如需自定义 runtime，可使用 `createOcrSelectPlugin({ runtime })` 传入已有实例。

## API

### `createOcrSelect(): OcrSelectRuntime`

创建使用内置 Worker OCR 引擎的运行时实例。

### `OcrSelectRuntime`

| 成员                                                           | 说明                                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `attach(target: HTMLImageElement \| string): OcrSelectBinding` | 绑定一张图片；目标可传元素或任意 CSS 选择器（匹配首个 `<img>`），可绑定多张，同一时刻仅一张处于激活态 |
| `dispose(): Promise<void>`                                     | 释放所有绑定并终止 Worker                                                                             |

### `OcrSelectBinding`

| 成员                              | 说明                                             |
| --------------------------------- | ------------------------------------------------ |
| `state: OcrSelectState`           | 当前状态（只读）                                 |
| `activate(): Promise<void>`       | 激活文字层；命中缓存时直接呈现，跳过识别         |
| `deactivate(): void`              | 收起文字层并回到 `idle`                          |
| `subscribe(listener): () => void` | 订阅状态变化并立即收到当前状态，返回取消订阅函数 |
| `dispose(): void`                 | 解绑图片并清理该绑定的全部资源                   |

### `OcrSelectState`

| 状态          | 附加字段                      | 说明                             |
| ------------- | ----------------------------- | -------------------------------- |
| `idle`        | —                             | 初始态，等待用户点击图片         |
| `recognizing` | —                             | Worker 正在执行 OCR              |
| `active`      | `backend: 'webgpu' \| 'wasm'` | 文字层就绪，可拖选、复制         |
| `error`       | `error: unknown`              | 识别失败，覆盖层提供「重试」按钮 |
| `disposed`    | —                             | 绑定已释放                       |

### 交互行为

- 点击已绑定的图片即自动识别并激活文字层；按 `Esc` 或激活其他图片会收起当前文字层
- 识别结果按图片地址与原始尺寸缓存；图片 `src` 变化后自动失效，下次激活重新识别
- 识别失败时在图片上展示错误面板与重试按钮，无需刷新页面

## 运行 Demo

```bash
cd demo/typescript   # 或 cd demo/vue
pnpm install
pnpm dev
```

打开终端输出的本地地址，点击示例图片即可启动 OCR；识别完成后可直接拖选、复制图片中的文字。

## 注意事项

- **构建工具** — 运行时资源通过 `new URL(..., import.meta.url)` 引用，Vite / Webpack 5+ 会在构建时自动拷贝，请确保产物完整保留包内静态资源
- **跨域图片** — 识别前会 `fetch` 图片原始字节，跨域图片需返回正确的 CORS 响应头（或使用同源图片）
- **首次加载** — 首次激活时按需加载内置模型（约 6 MB）与 ONNX Runtime WASM（约 23 MB），之后由浏览器 HTTP 缓存接管

## License

[MIT](./LICENSE)