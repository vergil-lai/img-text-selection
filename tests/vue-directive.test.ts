import { createApp, h, resolveDirective, withDirectives } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createOcrSelectPlugin } from '../src/vue/directive'
import type { OcrSelectBinding, OcrSelectRuntime, OcrSelectState } from '../src/index'

function runtimeDouble() {
    let subscriber: ((state: OcrSelectState) => void) | undefined
    const binding = {
        subscribe: vi.fn((callback: (state: OcrSelectState) => void) => {
            subscriber = callback
            callback({ status: 'idle' })
            return vi.fn()
        }),
        dispose: vi.fn(),
    } as unknown as OcrSelectBinding
    const runtime = {
        attach: vi.fn(() => binding),
        dispose: vi.fn(),
    } as unknown as OcrSelectRuntime
    return { binding, runtime, emit: (state: OcrSelectState) => subscriber?.(state) }
}

describe('createOcrSelectPlugin', () => {
    afterEach(() => document.body.replaceChildren())

    test('registers v-img-text-selection and shares one runtime for the Vue app', () => {
        const { binding, runtime } = runtimeDouble()
        const root = document.createElement('div')
        document.body.append(root)
        const app = createApp({
            setup() {
                const directive = resolveDirective('img-text-selection')!
                return () =>
                    h('div', [
                        withDirectives(h('img', { src: 'first.png' }), [[directive]]),
                        withDirectives(h('img', { src: 'second.png' }), [[directive]]),
                    ])
            },
        })

        app.use(createOcrSelectPlugin({ runtime })).mount(root)

        const images = root.querySelectorAll('img')
        expect(runtime.attach).toHaveBeenNthCalledWith(1, images[0])
        expect(runtime.attach).toHaveBeenNthCalledWith(2, images[1])

        app.unmount()
        expect(binding.dispose).toHaveBeenCalledTimes(2)
        expect(runtime.dispose).toHaveBeenCalledOnce()
    })

    test('forwards state changes and errors to directive callbacks', () => {
        const { emit, runtime } = runtimeDouble()
        const onStateChange = vi.fn()
        const onError = vi.fn()
        const root = document.createElement('div')
        document.body.append(root)
        const app = createApp({
            setup() {
                const directive = resolveDirective('img-text-selection')!
                return () => withDirectives(h('img'), [[directive, { onStateChange, onError }]])
            },
        })
        app.use(createOcrSelectPlugin({ runtime })).mount(root)

        const error = new Error('OCR failed')
        emit({ status: 'error', error })

        expect(onStateChange).toHaveBeenLastCalledWith({ status: 'error', error })
        expect(onError).toHaveBeenCalledWith(error)
        app.unmount()
    })

    test('rejects component roots that are not native img elements', () => {
        const { runtime } = runtimeDouble()
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const root = document.createElement('div')
        document.body.append(root)
        const app = createApp({
            setup() {
                const directive = resolveDirective('img-text-selection')!
                return () => withDirectives(h('div'), [[directive]])
            },
        })

        app.use(createOcrSelectPlugin({ runtime })).mount(root)

        expect(runtime.attach).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalledWith(
            '[img-text-selection] v-img-text-selection 只能用于原生 <img> 元素。',
        )
        app.unmount()
    })
})