import { describe, expect, test } from 'vitest';
import { SelectionGesture } from '../src/selection-gesture';

describe('SelectionGesture', () => {
    test('preserves an ordinary click', () => {
        const gesture = new SelectionGesture(4);
        gesture.pointerDown({ x: 10, y: 10 });
        gesture.pointerUp({ x: 12, y: 12 }, true);

        expect(gesture.consumeClickSuppression()).toBe(false);
    });

    test('suppresses exactly one click after a non-collapsed drag selection', () => {
        const gesture = new SelectionGesture(4);
        gesture.pointerDown({ x: 10, y: 10 });
        gesture.pointerUp({ x: 15, y: 10 }, false);

        expect(gesture.consumeClickSuppression()).toBe(true);
        expect(gesture.consumeClickSuppression()).toBe(false);
    });

    test('does not suppress a drag that produced no text selection', () => {
        const gesture = new SelectionGesture(4);
        gesture.pointerDown({ x: 10, y: 10 });
        gesture.pointerUp({ x: 20, y: 10 }, true);

        expect(gesture.consumeClickSuppression()).toBe(false);
    });
});