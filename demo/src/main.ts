import { createOcrSelect, type OcrSelectState } from 'ocr-select-core'
import 'ocr-select-core/style.css'
import sampleUrl from './sample.png'
import './style.css'

const image = document.querySelector<HTMLImageElement>('#document')
const status = document.querySelector<HTMLElement>('#status')

if (!image || !status) {
    throw new Error('Demo 页面缺少必要元素')
}

const statusElement = status
image.src = sampleUrl

const runtime = createOcrSelect()
let unsubscribe = () => {}
const binding = runtime.attach(image)

function renderState(state: OcrSelectState): void {
    statusElement.dataset.status = state.status
    if (state.status === 'recognizing') statusElement.textContent = '正在识别…'
    else if (state.status === 'active') {
        statusElement.textContent = `可选择文字 · ${state.backend.toUpperCase()}`
    } else if (state.status === 'error') {
        const message = state.error instanceof Error ? state.error.message : '未知错误'
        statusElement.textContent = `识别失败：${message}`
    } else if (state.status === 'disposed') statusElement.textContent = '已释放'
    else statusElement.textContent = '点击图片开始识别'
}

unsubscribe = binding.subscribe(renderState)
window.addEventListener(
    'pagehide',
    () => {
        unsubscribe()
        void runtime.dispose()
    },
    { once: true },
)
