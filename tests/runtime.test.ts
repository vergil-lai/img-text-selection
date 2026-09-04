import { afterEach, describe, expect, test, vi } from 'vitest';
import { OcrSelectRuntime } from '../src/runtime';
import type { OcrEngine, OcrResult } from '../src/runtime';

const result: OcrResult = {
    width: 300,
    height: 160,
    backend: 'wasm',
    lines: [
        {
            text: '可选择文字',
            confidence: 0.99,
            box: [
                [20, 20],
                [220, 20],
                [220, 60],
                [20, 60],
            ],
        },
    ],
};

function image(src: string): HTMLImageElement {
    const element = document.createElement('img');
    element.src = src;
    Object.defineProperties(element, {
        naturalWidth: { configurable: true, value: 300 },
        naturalHeight: { configurable: true, value: 160 },
        complete: { configurable: true, value: true },
    });
    document.body.append(element);
    return element;
}

describe('OcrSelectRuntime', () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    test('activates a selectable layer and reuses the in-memory result', async () => {
        const recognize = vi.fn(async () => result);
        const engine: OcrEngine = { recognize, dispose: vi.fn() };
        const runtime = new OcrSelectRuntime({ engine });
        const binding = runtime.attach(image('data:image/png;base64,first'));
        const states: string[] = [];
        binding.subscribe((state) => states.push(state.status));

        await binding.activate();

        expect(states).toContain('recognizing');
        expect(binding.state).toMatchObject({ status: 'active', backend: 'wasm' });
        expect(document.querySelector('.ocr-select-text-layer')?.textContent).toBe('可选择文字');

        binding.deactivate();
        await binding.activate();

        expect(recognize).toHaveBeenCalledTimes(1);
        expect(recognize).toHaveBeenCalledWith(binding.image);
        await runtime.dispose();
    });

    test('keeps only one binding active in a runtime', async () => {
        const engine: OcrEngine = { recognize: vi.fn(async () => result), dispose: vi.fn() };
        const runtime = new OcrSelectRuntime({ engine });
        const first = runtime.attach(image('data:image/png;base64,first'));
        const second = runtime.attach(image('data:image/png;base64,second'));

        await first.activate();
        await second.activate();

        expect(first.state.status).toBe('idle');
        expect(second.state.status).toBe('active');
        expect(document.querySelectorAll('.ocr-select-text-layer')).toHaveLength(1);
        await runtime.dispose();
    });

    test('invalidates the old layer when the image source changes', async () => {
        const engine: OcrEngine = { recognize: vi.fn(async () => result), dispose: vi.fn() };
        const runtime = new OcrSelectRuntime({ engine });
        const element = image('data:image/png;base64,first');
        const binding = runtime.attach(element);
        await binding.activate();

        element.src = 'data:image/png;base64,second';
        element.dispatchEvent(new Event('load'));

        expect(binding.state.status).toBe('idle');
        expect(document.querySelector('.ocr-select-text-layer')).toBeNull();
        await runtime.dispose();
    });

    test('keeps the overlay aligned when the page layout moves', async () => {
        const engine: OcrEngine = { recognize: vi.fn(async () => result), dispose: vi.fn() };
        const runtime = new OcrSelectRuntime({ engine });
        const element = image('data:image/png;base64,moving');
        let rect = { left: 10, top: 20, width: 300, height: 160 };
        vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({
            ...rect,
            right: rect.left + rect.width,
            bottom: rect.top + rect.height,
            x: rect.left,
            y: rect.top,
            toJSON: () => ({}),
        }));
        const binding = runtime.attach(element);
        await binding.activate();
        rect = { left: 40, top: 60, width: 600, height: 320 };

        window.dispatchEvent(new Event('scroll'));

        const host = document.querySelector<HTMLElement>('.ocr-select-host')!;
        expect(host.style.cssText).toContain('left: 40px');
        expect(host.style.cssText).toContain('top: 60px');
        expect(host.style.cssText).toContain('width: 600px');
        expect(host.style.cssText).toContain('height: 320px');
        await runtime.dispose();
    });

    test('attaches an image via a CSS selector', async () => {
        const engine: OcrEngine = { recognize: vi.fn(async () => result), dispose: vi.fn() };
        const runtime = new OcrSelectRuntime({ engine });
        const element = image('data:image/png;base64,selector');
        element.id = 'document';

        const binding = runtime.attach('#document');
        await binding.activate();

        expect(binding.image).toBe(element);
        expect(engine.recognize).toHaveBeenCalledWith(element);
        await runtime.dispose();
    });

    test('throws when a CSS selector matches no element', () => {
        const runtime = new OcrSelectRuntime({ engine: { recognize: vi.fn(), dispose: vi.fn() } });

        expect(() => runtime.attach('#missing')).toThrowError(
            'No element matches the selector "#missing"',
        );
    });

    test('throws when a CSS selector matches a non-image element', () => {
        const runtime = new OcrSelectRuntime({ engine: { recognize: vi.fn(), dispose: vi.fn() } });
        const div = document.createElement('div');
        div.id = 'not-an-image';
        document.body.append(div);

        expect(() => runtime.attach('#not-an-image')).toThrowError(
            'Selector "#not-an-image" matched a <div> element, expected an <img>',
        );
    });

    test('shows an inline retry action after recognition fails', async () => {
        const recognize = vi
            .fn<() => Promise<OcrResult>>()
            .mockRejectedValueOnce(new Error('model failed'))
            .mockResolvedValueOnce(result);
        const runtime = new OcrSelectRuntime({ engine: { recognize, dispose: vi.fn() } });
        const binding = runtime.attach(image('data:image/png;base64,retry'));

        await binding.activate();
        expect(binding.state.status).toBe('error');
        const retry = document.querySelector<HTMLButtonElement>('.ocr-select-retry')!;
        expect(retry.textContent).toBe('重试');

        retry.click();
        await vi.waitFor(() => expect(binding.state.status).toBe('active'));
        expect(recognize).toHaveBeenCalledTimes(2);
        await runtime.dispose();
    });
});