import { describe, expect, it } from 'vitest'
import { copyTacitusId, nextTheme, resolveTheme, shouldNotify } from './preferences'

describe('preferenze del dispositivo', () => {
  it('segue il sistema finché non esiste una scelta e poi alterna il tema', () => {
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
    expect(nextTheme('light')).toBe('dark')
  })

  it('notifica soltanto quando abilitato e Tacitus non è in primo piano', () => {
    expect(shouldNotify(true, 'hidden', false)).toBe(true)
    expect(shouldNotify(true, 'visible', false)).toBe(true)
    expect(shouldNotify(true, 'visible', true)).toBe(false)
    expect(shouldNotify(false, 'hidden', false)).toBe(false)
  })

  it('copia soltanto il Tacitus ID', async () => {
    let copied = ''
    await copyTacitusId('ID-PUBBLICO', async (value) => { copied = value })
    expect(copied).toBe('ID-PUBBLICO')
  })
})
