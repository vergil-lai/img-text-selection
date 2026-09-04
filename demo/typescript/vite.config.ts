import { defineConfig } from 'vite'

export default defineConfig({
    resolve: {
        conditions: ['onnxruntime-web-use-extern-wasm'],
    },
    worker: {
        format: 'es',
    },
})
