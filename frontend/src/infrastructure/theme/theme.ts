import type { Tema } from '../../domain/preferenze';

const THEME_KEY = 'tacitus.v3.theme';

export const resolveTheme = (
  saved: string | null,
  systemDark: boolean,
): Tema => {
  if (saved === 'light' || saved === 'dark') return saved;
  return systemDark ? 'dark' : 'light';
};

export const loadTheme = (systemDark: boolean): Tema =>
  resolveTheme(localStorage.getItem(THEME_KEY), systemDark);

export const followsSystemTheme = (): boolean =>
  localStorage.getItem(THEME_KEY) === null;

export const saveTheme = (theme: Tema): void => {
  localStorage.setItem(THEME_KEY, theme);
};

export const applyTheme = (theme: Tema): void => {
  document.documentElement.dataset.theme = theme;
};

export const nextTheme = (theme: Tema): Tema =>
  theme === 'light' ? 'dark' : 'light';
