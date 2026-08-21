export type Theme = 'light' | 'dark';

export const THEME_KEY = 'tacitus.theme';
export const NOTIFICATIONS_KEY = 'tacitus.notifications';

export const resolveTheme = (
  saved: string | null,
  systemDark: boolean,
): Theme => {
  return saved === 'light' || saved === 'dark'
    ? saved
    : systemDark
      ? 'dark'
      : 'light';
};

export const nextTheme = (theme: Theme): Theme => {
  return theme === 'light' ? 'dark' : 'light';
};

export const shouldNotify = (
  enabled: boolean,
  visibility: DocumentVisibilityState,
  focused: boolean,
) => {
  return enabled && (visibility !== 'visible' || !focused);
};

export const copyTacitusId = (
  tacitusId: string,
  writeText: (value: string) => Promise<void> = value =>
    navigator.clipboard.writeText(value),
) => {
  return writeText(tacitusId);
};
