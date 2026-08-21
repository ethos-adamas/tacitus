import { describe, expect, it } from 'vitest';
import { shouldNotify } from '../notifications';

describe('notifiche', () => {
  it('notifica soltanto quando abilitate e Tacitus non è in primo piano', () => {
    // Given
    const enabled = true;

    // When
    const hidden = shouldNotify(enabled, 'hidden', false);
    const visible = shouldNotify(enabled, 'visible', true);

    // Then
    expect(hidden).toBe(true);
    expect(visible).toBe(false);
    expect(shouldNotify(false, 'hidden', false)).toBe(false);
  });
});
