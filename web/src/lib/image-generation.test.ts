import { describe, expect, it } from 'vitest';
import { pickStabilityAspectRatio, pickOpenAiSize } from './image-generation';

describe('pickStabilityAspectRatio', () => {
  it('picks 1:1 for a square target', () => {
    expect(pickStabilityAspectRatio(100, 100)).toBe('1:1');
  });

  it('picks 2:3 for a portrait target close to it', () => {
    expect(pickStabilityAspectRatio(70, 100)).toBe('2:3');
  });

  it('picks 3:2 for a landscape target close to it', () => {
    expect(pickStabilityAspectRatio(100, 70)).toBe('3:2');
  });

  it('picks 9:16 for a tall portrait target', () => {
    expect(pickStabilityAspectRatio(50, 90)).toBe('9:16');
  });

  it('treats width/height and height/width symmetrically around 1:1', () => {
    // 100x150 (2:3-ish) and 150x100 (3:2-ish) should pick mirror-image ratios
    expect(pickStabilityAspectRatio(100, 150)).toBe('2:3');
    expect(pickStabilityAspectRatio(150, 100)).toBe('3:2');
  });
});

describe('pickOpenAiSize', () => {
  it('picks the square size for a square target', () => {
    expect(pickOpenAiSize(100, 100)).toBe('1024x1024');
  });

  it('picks the portrait size for a tall target', () => {
    expect(pickOpenAiSize(70, 140)).toBe('1024x1536');
  });

  it('picks the landscape size for a wide target', () => {
    expect(pickOpenAiSize(140, 70)).toBe('1536x1024');
  });

  it('falls back to square for a mild, near-1:1 ratio', () => {
    expect(pickOpenAiSize(105, 100)).toBe('1024x1024');
  });
});
