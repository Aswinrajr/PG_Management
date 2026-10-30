import { describe, expect, it } from 'vitest';
import { autoArrange, layoutTags, validateLayout, type Fixture } from './geometry.js';

const room = { widthCm: 300, lengthCm: 400 };
const bed = (id: string, xCm: number, yCm: number, rot: 0 | 90 = 0) => ({ id, xCm, yCm, rot });

describe('validateLayout', () => {
  it('accepts a clean layout', () => expect(validateLayout(room, [bed('a', 0, 0), bed('b', 210, 0)], [])).toEqual([]));
  it('finds a bed outside the room', () => expect(validateLayout(room, [bed('a', 250, 0)], [])).toContain('A bed is outside the room'));
  it('uses the turned size when rotated', () => expect(validateLayout({ widthCm: 150, lengthCm: 400 }, [bed('a', 0, 0, 90)], [])).toHaveLength(1));
  it('finds overlapping beds', () => expect(validateLayout(room, [bed('a', 0, 0), bed('b', 60, 0)], [])).toHaveLength(1));
  it('lets a window sit beside a bed', () => {
    const window: Fixture = { id: 'w', type: 'window', xCm: 0, yCm: 0, rot: 0 };
    expect(validateLayout(room, [bed('a', 0, 0)], [window])).toEqual([]);
  });
});

describe('layoutTags', () => {
  it('tags a bed by the window', () => {
    const window: Fixture = { id: 'w', type: 'window', xCm: 0, yCm: 390, rot: 0 };
    expect(layoutTags(bed('a', 0, 150), [window])).toEqual(['window']);
    expect(layoutTags(bed('a', 0, 0), [window])).toEqual([]);
  });
});

describe('autoArrange', () => {
  it('gives a valid layout for 4 beds', () => {
    const beds = autoArrange(room, 4).map((spot, i) => ({ id: String(i), ...spot }));
    expect(validateLayout(room, beds, [])).toEqual([]);
  });
});
