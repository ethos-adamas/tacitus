import { useEffect } from 'react';
import type { SceltaTema } from '../../domain/preferenze';
import {
  applyTheme,
  loadThemeChoice,
  resolveTheme,
  saveThemeChoice,
} from '../../infrastructure/theme/theme';
import { erroreMostrato } from '../store/feedbackSlice';
import { useDispatch, useSelector } from '../store/hooks';
import { sceltaTemaCambiata, temaDiSistemaCambiato } from '../store/temaSlice';

export const useTheme = (): void => {
  const dispatch = useDispatch();

  useEffect(() => {
    const systemTheme = matchMedia('(prefers-color-scheme: dark)');
    const synchronizeTheme = (choice = loadThemeChoice()) => {
      const theme = resolveTheme(choice, systemTheme.matches);
      applyTheme(theme);
      dispatch(sceltaTemaCambiata({ scelta: choice, effettivo: theme }));
    };
    const followSystemTheme = () => {
      if (loadThemeChoice() === 'system') {
        const theme = systemTheme.matches ? 'dark' : 'light';
        applyTheme(theme);
        dispatch(temaDiSistemaCambiato(theme));
      }
    };
    synchronizeTheme();
    systemTheme.addEventListener('change', followSystemTheme);
    return () => systemTheme.removeEventListener('change', followSystemTheme);
  }, [dispatch]);
};

export const useTema = () => {
  const dispatch = useDispatch();
  const { scelta, effettivo } = useSelector(state => state.tema);
  const selezionaTema = (next: SceltaTema) => {
    const effective = resolveTheme(
      next,
      matchMedia('(prefers-color-scheme: dark)').matches,
    );
    applyTheme(effective);
    dispatch(sceltaTemaCambiata({ scelta: next, effettivo: effective }));
    try {
      saveThemeChoice(next);
    } catch (reason) {
      dispatch(
        erroreMostrato(
          reason instanceof Error
            ? reason.message
            : 'La scelta del tema non può essere salvata.',
        ),
      );
    }
  };
  return { tema: effettivo, scelta, selezionaTema };
};
