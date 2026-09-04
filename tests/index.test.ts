import { describe, expect, test } from 'vitest';
import { createOcrSelect, OcrSelectRuntime } from '../src/index';

function invalidConfigurationCalls(): void {
    // @ts-expect-error The built-in Tiny runtime has no configuration options.
    createOcrSelect({ model: 'tiny', assetBaseUrl: '/ocr-assets/' });

    const runtime = createOcrSelect();
    const image = document.createElement('img');
    // @ts-expect-error A binding cannot select a different model.
    runtime.attach(image, { model: 'tiny' });
}

describe('createOcrSelect', () => {
    test('creates a runtime without external asset configuration', async () => {
        const runtime = createOcrSelect();

        expect(runtime).toBeInstanceOf(OcrSelectRuntime);

        await runtime.dispose();
    });

    test('does not accept model or asset URL options', () => {
        expect(invalidConfigurationCalls).toBeTypeOf('function');
    });
});