<script setup lang="ts">
import { computed, ref } from 'vue'
import type { OcrSelectState } from 'img-text-selection/vue'
import sampleUrl from './sample.png'

const state = ref<OcrSelectState>({ status: 'idle' })
const label = computed(() => {
  if (state.value.status === 'recognizing') return '正在识别…'
  if (state.value.status === 'active') return `可选择文字 · ${state.value.backend.toUpperCase()}`
  if (state.value.status === 'error') {
    const message = state.value.error instanceof Error ? state.value.error.message : '未知错误'
    return `识别失败：${message}`
  }
  if (state.value.status === 'disposed') return '已释放'
  return '点击图片开始识别'
})

function onStateChange(next: OcrSelectState): void {
  state.value = next
}
</script>

<template>
  <main>
    <section class="intro-panel" aria-labelledby="page-title">
      <p class="eyebrow">一张图片，一层可复制的文字</p>
      <h1 id="page-title">识别之后，<em>直接选择。</em></h1>
      <p class="intro">点击票据，OCR 在当前浏览器运行。完成后像操作普通网页文字一样拖选、复制。</p>
    </section>

    <div class="scan-bar" aria-label="识别状态">
      <span class="scan-dot" aria-hidden="true"></span>
      <span class="status" :data-status="state.status">{{ label }}</span>
    </div>

    <section class="document" aria-label="可识别的示例票据">
      <img
        v-img-text-selection="{ onStateChange }"
        :src="sampleUrl"
        alt="包含中英文价格与功能说明的示例图片"
      />
    </section>
  </main>
</template>
