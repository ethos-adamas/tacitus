import type { SceltaTema, Tema } from '../../domain/preferenze';

const THEME_KEY = 'tacitus.v3.theme';

export const loadThemeChoice = (): SceltaTema => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'retro'
      ? saved
      : 'system';
  } catch {
    return 'system';
  }
};

export const saveThemeChoice = (choice: SceltaTema): void => {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    throw new Error('La scelta del tema vale solo per questa sessione.');
  }
};

export const resolveTheme = (choice: SceltaTema, systemDark: boolean): Tema =>
  choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;

export const applyTheme = (theme: Tema): void => {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme !== 'light');
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
};
