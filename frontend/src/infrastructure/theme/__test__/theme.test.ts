import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  loadThemeChoice,
  resolveTheme,
  saveThemeChoice,
} from '../theme';

describe('tema', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => vi.unstubAllGlobals());

  it('valida le scelte salvate e segue il sistema quando richiesto', () => {
    // Given
    localStorage.setItem('tacitus.v3.theme', 'retro');

    // When / Then
    expect(loadThemeChoice()).toBe('retro');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('retro', true)).toBe('retro');
  });

  it('usa system per valori assenti o sconosciuti', () => {
    // Given / When / Then
    expect(loadThemeChoice()).toBe('system');
    localStorage.setItem('tacitus.v3.theme', 'unknown');
    expect(loadThemeChoice()).toBe('system');
  });

  it('rimuove la scelta persistita quando si torna al sistema', () => {
    // Given
    saveThemeChoice('dark');

    // When
    saveThemeChoice('system');

    // Then
    expect(localStorage.getItem('tacitus.v3.theme')).toBeNull();
  });

  it('non interrompe il caricamento se lo storage non è disponibile', () => {
    // Given
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage');
      },
    });

    // When / Then
    expect(loadThemeChoice()).toBe('system');
  });

  it('applica tema, classe dark e color scheme al documento', () => {
    // Given / When
    applyTheme('retro');

    // Then
    expect(document.documentElement.dataset.theme).toBe('retro');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});
