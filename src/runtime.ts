import { calculateImageContentRect } from './image-geometry';
import { SelectionGesture } from './selection-gesture';
import { SelectableTextLayer } from './text-layer';
import type { OcrTextLine } from './text-layer';

export type OcrBackend = 'webgpu' | 'wasm';

export interface OcrLine {
    text: string;
    confidence: number;
    box: readonly [
        readonly [number, number],
        readonly [number, number],
        readonly [number, number],
        readonly [number, number],
    ];
}

export interface OcrResult {
    width: number;
    height: number;
    backend: OcrBackend;
    lines: OcrLine[];
}

export interface OcrEngine {
    recognize(image: HTMLImageElement): Promise<OcrResult>;
    dispose(): void | Promise<void>;
}

export type OcrSelectState =
    | { status: 'idle' }
    | { status: 'recognizing' }
    | { status: 'active'; backend: OcrBackend }
    | { status: 'error'; error: unknown }
    | { status: 'disposed' };

interface RuntimeOptions {
    engine: OcrEngine;
}

/** Attach 支持的绑定目标：图片元素或任意 CSS 选择器。 */
export type OcrSelectTarget = HTMLImageElement | string;

/** 将绑定目标解析为图片元素；字符串按 CSS 选择器匹配首个结果。 */
function resolveImage(target: OcrSelectTarget): HTMLImageElement {
    if (typeof target !== 'string') return target;
    const element = document.querySelector(target);
    if (!element) throw new Error(`No element matches the selector "${target}"`);
    if (!(element instanceof HTMLImageElement)) {
        throw new Error(
            `Selector "${target}" matched a <${element.tagName.toLowerCase()}> element, expected an <img>`,
        );
    }
    return element;
}

/** 生成可用于 OCR 结果缓存的图片内容标识。 */
function identityOf(image: HTMLImageElement): string {
    return `${image.currentSrc || image.src}\u0000${image.naturalWidth}x${image.naturalHeight}`;
}

function createHost(image: HTMLImageElement): HTMLDivElement {
    const host = document.createElement('div');
    host.className = 'ocr-select-host';
    host.style.position = 'fixed';
    host.style.zIndex = '2147483646';
    host.style.pointerEvents = 'none';
    host.style.overflow = 'hidden';
    document.body.append(host);
    positionHost(host, image);
    return host;
}

function positionHost(host: HTMLDivElement, image: HTMLImageElement): void {
    const rect = image.getBoundingClientRect();
    host.style.left = `${rect.left}px`;
    host.style.top = `${rect.top}px`;
    host.style.width = `${rect.width}px`;
    host.style.height = `${rect.height}px`;
}

function addStatus(host: HTMLElement): void {
    const status = document.createElement('div');
    status.className = 'ocr-select-status';
    status.setAttribute('role', 'status');
    status.textContent = '正在识别文字…';
    host.append(status);
}

function addError(host: HTMLElement, retry: () => void): void {
    const panel = document.createElement('div');
    panel.className = 'ocr-select-error';
    panel.setAttribute('role', 'alert');
    panel.append('文字识别失败');
    const button = document.createElement('button');
    button.className = 'ocr-select-retry';
    button.type = 'button';
    button.textContent = '重试';
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        retry();
    });
    panel.append(button);
    host.style.pointerEvents = 'auto';
    host.append(panel);
}

function addTextLayer(
    host: HTMLElement,
    image: HTMLImageElement,
    result: OcrResult,
): SelectableTextLayer {
    const lines: OcrTextLine[] = result.lines.map((line, index) => ({
        ...line,
        id: `line-${index}`,
    }));
    const selectableLayer = new SelectableTextLayer(
        { width: result.width, height: result.height },
        lines,
    );
    const layer = selectableLayer.element;
    positionTextLayer(layer, image, result);
    layer.style.position = 'absolute';
    layer.style.pointerEvents = 'auto';
    host.style.pointerEvents = 'auto';
    host.append(layer);
    return selectableLayer;
}

/** 按图片的 `object-fit` 布局同步 SVG 文本层的位置与尺寸。 */
function positionTextLayer(layer: SVGSVGElement, image: HTMLImageElement, result: OcrResult): void {
    const style = getComputedStyle(image);
    const objectFit =
        style.objectFit === 'contain' ||
        style.objectFit === 'cover' ||
        style.objectFit === 'none' ||
        style.objectFit === 'scale-down'
            ? style.objectFit
            : 'fill';
    const content = calculateImageContentRect({
        elementWidth: image.getBoundingClientRect().width,
        elementHeight: image.getBoundingClientRect().height,
        naturalWidth: image.naturalWidth || result.width,
        naturalHeight: image.naturalHeight || result.height,
        objectFit,
        objectPosition: style.objectPosition || '50% 50%',
    });
    layer.style.left = `${content.x}px`;
    layer.style.top = `${content.y}px`;
    layer.style.width = `${content.width}px`;
    layer.style.height = `${content.height}px`;
}

/** 管理一张图片的 OCR 生命周期、文字图层和复制交互。 */
export class OcrSelectBinding {
    #state: OcrSelectState = { status: 'idle' };
    #subscribers = new Set<(state: OcrSelectState) => void>();
    #host: HTMLDivElement | undefined;
    #textLayer: SelectableTextLayer | undefined;
    #result: OcrResult | undefined;
    #resizeObserver: ResizeObserver | undefined;
    readonly #gesture = new SelectionGesture(4);
    #generation = 0;
    #identity: string;
    #disposed = false;

    constructor(
        private readonly runtime: OcrSelectRuntime,
        readonly image: HTMLImageElement,
    ) {
        this.#identity = identityOf(image);
        image.addEventListener('click', this.#handleClick);
        image.addEventListener('load', this.#handleLoad);
    }

    /** 获取当前识别与交互状态。 */
    get state(): OcrSelectState {
        return this.#state;
    }

    /** 订阅状态变化，并立即接收当前状态。 */
    subscribe(subscriber: (state: OcrSelectState) => void): () => void {
        this.#subscribers.add(subscriber);
        subscriber(this.#state);
        return () => this.#subscribers.delete(subscriber);
    }

    /** 激活图片文字选择层；优先复用相同图片的缓存结果。 */
    async activate(): Promise<void> {
        if (this.#disposed) throw new Error('OCR binding has been disposed');
        this.runtime.beginActivation(this);
        const identity = identityOf(this.image);
        this.#identity = identity;
        const cached = this.runtime.cached(identity);
        if (cached) {
            this.#showResult(cached);
            return;
        }

        const generation = ++this.#generation;
        this.#showStatus();
        this.#setState({ status: 'recognizing' });
        try {
            const result = await this.runtime.recognize(this.image);
            // 识别期间图片源或绑定状态变化时，丢弃过期的异步结果。
            if (
                this.#disposed ||
                generation !== this.#generation ||
                identity !== identityOf(this.image)
            ) {
                return;
            }
            this.runtime.cache(identity, result);
            this.#showResult(result);
        } catch (error) {
            if (this.#disposed || generation !== this.#generation) return;
            this.#showError();
            this.#setState({ status: 'error', error });
        }
    }

    /** 移除文字图层并取消当前激活态。 */
    deactivate(): void {
        if (this.#disposed) return;
        this.#generation += 1;
        this.#removeHost();
        this.#setState({ status: 'idle' });
        this.runtime.endActivation(this);
    }

    /** 解除图片事件、订阅和运行时关联。 */
    dispose(): void {
        if (this.#disposed) return;
        this.deactivate();
        this.#disposed = true;
        this.image.removeEventListener('click', this.#handleClick);
        this.image.removeEventListener('load', this.#handleLoad);
        this.#setState({ status: 'disposed' });
        this.#subscribers.clear();
        this.runtime.detach(this);
    }

    #showStatus(): void {
        this.#removeHost();
        this.#host = createHost(this.image);
        this.#attachPositionEvents();
        addStatus(this.#host);
    }

    #showResult(result: OcrResult): void {
        this.#removeHost();
        this.#host = createHost(this.image);
        this.#textLayer = addTextLayer(this.#host, this.image, result);
        this.#result = result;
        this.#attachPositionEvents();
        this.#attachSelectionEvents();
        this.#setState({ status: 'active', backend: result.backend });
    }

    #showError(): void {
        this.#removeHost();
        this.#host = createHost(this.image);
        this.#attachPositionEvents();
        addError(this.#host, () => void this.activate());
    }

    #removeHost(): void {
        this.#detachSelectionEvents();
        this.#detachPositionEvents();
        this.#host?.remove();
        this.#host = undefined;
        this.#textLayer = undefined;
        this.#result = undefined;
    }

    #setState(state: OcrSelectState): void {
        this.#state = state;
        for (const subscriber of this.#subscribers) subscriber(state);
    }

    readonly #handleClick = (): void => {
        if (this.#state.status === 'idle' || this.#state.status === 'error') void this.activate();
    };

    readonly #handleLoad = (): void => {
        const identity = identityOf(this.image);
        if (identity === this.#identity) return;
        this.#identity = identity;
        this.deactivate();
    };

    #attachSelectionEvents(): void {
        const layer = this.#textLayer?.element;
        if (!layer) return;
        layer.addEventListener('pointerdown', this.#handlePointerDown);
        layer.addEventListener('pointerup', this.#handlePointerUp);
        layer.addEventListener('click', this.#handleLayerClick);
        document.addEventListener('copy', this.#handleCopy);
        document.addEventListener('keydown', this.#handleKeyDown);
        document.addEventListener('pointerdown', this.#handleOutsidePointerDown, true);
    }

    #detachSelectionEvents(): void {
        const layer = this.#textLayer?.element;
        layer?.removeEventListener('pointerdown', this.#handlePointerDown);
        layer?.removeEventListener('pointerup', this.#handlePointerUp);
        layer?.removeEventListener('click', this.#handleLayerClick);
        document.removeEventListener('copy', this.#handleCopy);
        document.removeEventListener('keydown', this.#handleKeyDown);
        document.removeEventListener('pointerdown', this.#handleOutsidePointerDown, true);
    }

    readonly #handlePointerDown = (event: PointerEvent): void => {
        this.#gesture.pointerDown({ x: event.clientX, y: event.clientY });
    };

    readonly #handlePointerUp = (event: PointerEvent): void => {
        const selection = getSelection();
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined;
        const hasLayerSelection =
            !!selection &&
            !selection.isCollapsed &&
            !!range &&
            this.#textLayer?.textForRange(range) !== undefined;
        this.#gesture.pointerUp({ x: event.clientX, y: event.clientY }, !hasLayerSelection);
    };

    readonly #handleLayerClick = (event: MouseEvent): void => {
        if (this.#gesture.consumeClickSuppression()) event.stopPropagation();
    };

    readonly #handleCopy = (event: ClipboardEvent): void => {
        const selection = getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
        const text = this.#textLayer?.textForRange(selection.getRangeAt(0));
        if (text === undefined || !event.clipboardData) return;
        event.preventDefault();
        event.clipboardData.setData('text/plain', text);
    };

    readonly #handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') this.deactivate();
    };

    readonly #handleOutsidePointerDown = (event: PointerEvent): void => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (target === this.image || this.#host?.contains(target)) return;
        this.deactivate();
    };

    #attachPositionEvents(): void {
        window.addEventListener('scroll', this.#handlePositionChange, true);
        window.addEventListener('resize', this.#handlePositionChange);
        if (typeof ResizeObserver !== 'undefined') {
            this.#resizeObserver = new ResizeObserver(this.#handlePositionChange);
            this.#resizeObserver.observe(this.image);
        }
    }

    #detachPositionEvents(): void {
        window.removeEventListener('scroll', this.#handlePositionChange, true);
        window.removeEventListener('resize', this.#handlePositionChange);
        this.#resizeObserver?.disconnect();
        this.#resizeObserver = undefined;
    }

    readonly #handlePositionChange = (): void => {
        if (!this.#host) return;
        positionHost(this.#host, this.image);
        if (this.#textLayer && this.#result) {
            positionTextLayer(this.#textLayer.element, this.image, this.#result);
        }
    };
}

/** 协调多个图片绑定、OCR 缓存及共享引擎的运行时。 */
export class OcrSelectRuntime {
    readonly #engine: OcrEngine;
    readonly #bindings = new Set<OcrSelectBinding>();
    readonly #cache = new Map<string, OcrResult>();
    #active: OcrSelectBinding | undefined;
    #disposed = false;

    constructor(options: RuntimeOptions) {
        this.#engine = options.engine;
    }

    /** 为图片创建独立的 OCR 绑定；目标可传图片元素或 CSS 选择器。 */
    attach(target: OcrSelectTarget): OcrSelectBinding {
        if (this.#disposed) throw new Error('OCR runtime has been disposed');
        const binding = new OcrSelectBinding(this, resolveImage(target));
        this.#bindings.add(binding);
        return binding;
    }

    /** 激活一个绑定，并关闭此前处于激活态的绑定。 */
    beginActivation(binding: OcrSelectBinding): void {
        if (this.#active && this.#active !== binding) this.#active.deactivate();
        this.#active = binding;
    }

    /** 仅在当前绑定仍处于激活态时清除激活引用。 */
    endActivation(binding: OcrSelectBinding): void {
        if (this.#active === binding) this.#active = undefined;
    }

    /** 读取指定图片标识对应的已识别结果。 */
    cached(identity: string): OcrResult | undefined {
        return this.#cache.get(identity);
    }

    /** 缓存指定图片标识的识别结果。 */
    cache(identity: string, result: OcrResult): void {
        this.#cache.set(identity, result);
    }

    /** 委托共享引擎识别图片。 */
    recognize(image: HTMLImageElement): Promise<OcrResult> {
        return this.#engine.recognize(image);
    }

    /** 移除已销毁的图片绑定及其激活引用。 */
    detach(binding: OcrSelectBinding): void {
        this.#bindings.delete(binding);
        this.endActivation(binding);
    }

    /** 销毁所有绑定、缓存及底层 OCR 引擎。 */
    async dispose(): Promise<void> {
        if (this.#disposed) return;
        this.#disposed = true;
        for (const binding of this.#bindings) binding.dispose();
        this.#cache.clear();
        await this.#engine.dispose();
    }
}