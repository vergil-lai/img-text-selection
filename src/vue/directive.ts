import { createOcrSelect } from '../index';
import type { OcrSelectBinding, OcrSelectRuntime, OcrSelectState } from '../runtime';
import type { App, Directive, Plugin } from 'vue';

export interface OcrSelectDirectiveValue {
    onStateChange?: (state: OcrSelectState) => void;
    onError?: (error: unknown) => void;
}

export interface VueOcrSelectOptions {
    runtime?: OcrSelectRuntime;
}

interface BindingRecord {
    binding: OcrSelectBinding;
    unsubscribe: () => void;
}

function createDirective(
    runtime: OcrSelectRuntime,
): Directive<HTMLElement, OcrSelectDirectiveValue | undefined> {
    const records = new WeakMap<HTMLElement, BindingRecord>();

    return {
        mounted(element, directiveBinding) {
            if (!(element instanceof HTMLImageElement)) {
                console.warn('[img-text-selection] v-img-text-selection 只能用于原生 <img> 元素。');
                return;
            }
            const binding = runtime.attach(element);
            const unsubscribe = binding.subscribe((state) => {
                directiveBinding.value?.onStateChange?.(state);
                if (state.status === 'error') directiveBinding.value?.onError?.(state.error);
            });
            records.set(element, { binding, unsubscribe });
        },
        unmounted(element) {
            const record = records.get(element);
            if (!record) return;
            record.unsubscribe();
            record.binding.dispose();
            records.delete(element);
        },
    };
}

export function createOcrSelectPlugin(options: VueOcrSelectOptions = {}): Plugin {
    return {
        install(app: App) {
            const runtime = options.runtime ?? createOcrSelect();
            app.directive('img-text-selection', createDirective(runtime));
            app.onUnmount(() => void runtime.dispose());
        },
    };
}

export default createOcrSelectPlugin();

export type { OcrSelectState };