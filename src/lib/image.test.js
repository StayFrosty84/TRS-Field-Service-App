import { describe, it, expect } from 'vitest';
import { fitDimensions } from './image.js';

describe('fitDimensions', () => {
  it('scales the long edge (landscape) down to maxEdge', () => {
    expect(fitDimensions(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200, scale: 0.4 });
  });

  it('scales the long edge (portrait) down to maxEdge', () => {
    expect(fitDimensions(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600, scale: 0.4 });
  });

  it('never upscales images already within maxEdge', () => {
    expect(fitDimensions(800, 600, 1600)).toEqual({ w: 800, h: 600, scale: 1 });
  });

  it('rounds fractional dimensions to integers', () => {
    const out = fitDimensions(1000, 333, 500);
    expect(out.w).toBe(500);
    expect(out.h).toBe(167); // 333 * 0.5 = 166.5 -> 167
  });
});
