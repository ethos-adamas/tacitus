import { describe, expect, it } from 'vitest';
import { nextTheme, resolveTheme } from '../theme';

describe('tema', () => {
  it('segue il sistema finché non esiste una scelta esplicita', () => {
    // Given
    const systemDark = true;

    // When
    const systemTheme = resolveTheme(null, systemDark);
    const savedTheme = resolveTheme('light', systemDark);

    // Then
    expect(systemTheme).toBe('dark');
    expect(savedTheme).toBe('light');
    expect(nextTheme(savedTheme)).toBe('dark');
  });
});
