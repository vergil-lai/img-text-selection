interface Point {
    x: number
    y: number
}

export class SelectionGesture {
    #start: Point | undefined
    #suppressNextClick = false

    constructor(private readonly threshold: number) {}

    pointerDown(point: Point): void {
        this.#start = point
    }

    pointerUp(point: Point, selectionCollapsed: boolean): void {
        const start = this.#start
        this.#start = undefined
        if (!start || selectionCollapsed) return
        this.#suppressNextClick = Math.hypot(point.x - start.x, point.y - start.y) > this.threshold
    }

    consumeClickSuppression(): boolean {
        if (!this.#suppressNextClick) return false
        this.#suppressNextClick = false
        return true
    }
}