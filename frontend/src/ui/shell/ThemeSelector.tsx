import { type ChangeEvent } from 'react';
import { useTema } from '../../application/hooks/useTheme';
import type { SceltaTema } from '../../domain/preferenze';
import { SelectField } from '../kit/Fields';

const isThemeChoice = (value: string): value is SceltaTema =>
  value === 'system' ||
  value === 'light' ||
  value === 'dark' ||
  value === 'retro';

const ThemeSelector = () => {
  const { scelta, selezionaTema } = useTema();
  const change = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (isThemeChoice(value)) selezionaTema(value);
  };
  return (
    <SelectField label="Tema" value={scelta} onChange={change}>
      <option value="system">Sistema</option>
      <option value="light">Chiaro</option>
      <option value="dark">Scuro</option>
      <option value="retro">Rétro</option>
    </SelectField>
  );
};

export default ThemeSelector;
