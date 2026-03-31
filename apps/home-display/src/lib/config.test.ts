import { describe, expect, it } from 'vitest';

import { resolveDisplayMode } from './config';

describe('resolveDisplayMode', () => {
  it('uses hallway mode for hallway surface kind', () => {
    expect(resolveDisplayMode('/display', 'hallway_display')).toBe('hallway');
  });

  it('falls back to pathname when surface kind does not force mode', () => {
    expect(resolveDisplayMode('/display/hallway')).toBe('hallway');
  });

  it('defaults to kitchen mode', () => {
    expect(resolveDisplayMode('/display')).toBe('kitchen');
  });
});
