import { describe, expect, it } from 'vitest';
import { imageTypeToMode } from './image-analysis';

describe('imageTypeToMode', () => {
  it('routes high-confidence line-art → line-art pipeline', () => {
    expect(imageTypeToMode('line-art', 'high')).toBe('line-art');
  });

  it('routes high-confidence typography → line-art pipeline', () => {
    expect(imageTypeToMode('typography', 'high')).toBe('line-art');
  });

  it('routes medium-confidence line-art → photo (not confident enough to force pipeline)', () => {
    expect(imageTypeToMode('line-art', 'medium')).toBe('photo');
  });

  it('routes low-confidence line-art → photo', () => {
    expect(imageTypeToMode('line-art', 'low')).toBe('photo');
  });

  it('routes illustration → illustration regardless of confidence', () => {
    expect(imageTypeToMode('illustration', 'medium')).toBe('illustration');
    expect(imageTypeToMode('illustration', 'high')).toBe('illustration');
    expect(imageTypeToMode('illustration', 'low')).toBe('illustration');
  });

  it('routes photo → photo', () => {
    expect(imageTypeToMode('photo', 'high')).toBe('photo');
    expect(imageTypeToMode('photo', 'medium')).toBe('photo');
  });
});
