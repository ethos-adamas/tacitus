import { useEffect } from 'react';
import type { Tema } from '../../domain/preferenze';
import {
  applyTheme,
  followsSystemTheme,
  loadTheme,
  nextTheme,
  saveTheme,
} from '../../infrastructure/theme/theme';
import { useDispatch, useSelector } from '../store/hooks';
import { temaSelezionato } from '../store/temaSlice';

export const useTheme = (): void => {
  const dispatch = useDispatch();

  useEffect(() => {
    const systemTheme = matchMedia('(prefers-color-scheme: dark)');
    const synchronizeTheme = () => {
      const theme = loadTheme(systemTheme.matches);
      applyTheme(theme);
      dispatch(temaSelezionato(theme));
    };
    const followSystemTheme = () => {
      if (followsSystemTheme()) synchronizeTheme();
    };
    synchronizeTheme();
    systemTheme.addEventListener('change', followSystemTheme);
    return () => systemTheme.removeEventListener('change', followSystemTheme);
  }, [dispatch]);
};

export const useTema = (): { tema: Tema; cambiaTema: () => void } => {
  const dispatch = useDispatch();
  const tema = useSelector(state => state.tema);
  const cambiaTema = () => {
    const next = nextTheme(tema);
    saveTheme(next);
    applyTheme(next);
    dispatch(temaSelezionato(next));
  };
  return { tema, cambiaTema };
};
