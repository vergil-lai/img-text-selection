# img-text-selection

面向浏览器的本地 OCR 与可选择文字层。为网页中的图片增加本地 OCR 与文字选择能力：用户点击图片后，浏览器会识别图片文字并生成与原图对齐的文字层，随后可以像操作普通网页文字一样拖选和复制。

`OcrSelectRuntime` 管理 Worker、模型会话、内存缓存和当前活动图片；`OcrSelectBinding` 管理单张图片的生命周期、状态、覆盖层与选择交互。浏览器环境优先使用 WebGPU，并自动回退到 WASM。

Tiny 检测模型、识别模型、字符字典、ONNX Runtime WASM 和对应加载器都包含在 npm 包中。

## 安装

```bash
npm install img-text-selection
```

## TypeScript 使用

```ts
import { createOcrSelect } from 'img-text-selection'
import 'img-text-selection/style.css'

const runtime = createOcrSelect()
const binding = runtime.attach(document.querySelector('img')!)

await binding.activate()
```

## Vue 3 指令

Vue 适配层由同一个包的 `./vue` 子路径提供；Vue 3.5+ 是 optional peer dependency，非 Vue 项目不需要安装它。

```bash
npm install img-text-selection vue
```

在应用入口注册插件：

```ts
import { createApp } from 'vue'
import { createOcrSelectPlugin } from 'img-text-selection/vue'
import App from './App.vue'

createApp(App).use(createOcrSelectPlugin()).mount('#app')
```

将指令放在原生 `<img>` 元素上：

```vue
<img src="/document.png" alt="Document" v-img-text-selection />
```

指令值可传入 `onStateChange` 和 `onError` 回调；同一个 Vue app 内的所有实例共享一个 runtime，并在 app 卸载时释放。当前指令仅支持最终挂载到原生 `<img>` 的元素。

## 运行 Demo

```bash
cd demo/typescript
pnpm install
pnpm dev
```

打开终端输出的本地地址，点击示例图片即可启动 OCR；识别完成后可直接拖选、复制图片中的文字。

Vue 指令示例：

```bash
cd demo/vue
pnpm install
pnpm dev
```

## LICENCE

[MIT](./LICENSE)