interface Point {
    x: number
    y: number
}

/** 区分拖拽选文与普通点击，避免选文后的 click 触发外层操作。 */
export class SelectionGesture {
    #start: Point | undefined
    #suppressNextClick = false

    constructor(private readonly threshold: number) {}

    /** 记录手势起点。 */
    pointerDown(point: Point): void {
        this.#start = point
    }

    /** 根据拖动距离和选区状态决定是否屏蔽下一次点击。 */
    pointerUp(point: Point, selectionCollapsed: boolean): void {
        const start = this.#start
        this.#start = undefined
        if (!start || selectionCollapsed) return
        this.#suppressNextClick = Math.hypot(point.x - start.x, point.y - start.y) > this.threshold
    }

    /** 读取并清除待消费的点击屏蔽标记。 */
    consumeClickSuppression(): boolean {
        if (!this.#suppressNextClick) return false
        this.#suppressNextClick = false
        return true
    }
}