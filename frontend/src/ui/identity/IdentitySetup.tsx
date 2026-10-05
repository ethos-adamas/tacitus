import Brand from '../shell/Brand';
import { Settings } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useGestioneIdentitaLocale } from '../../application/hooks/useIdentitaLocale';
import { erroreMostrato } from '../../application/store/feedbackSlice';
import { useDispatch, useSelector } from '../../application/store/hooks';
import { Button } from '../kit/Button';
import { SettingsPopover } from '../kit/SettingsPopover';
import ThemeSelector from '../shell/ThemeSelector';
import { TextInput } from '../kit/Fields';
import { version } from '../../../package.json';

const IdentitySetup = () => {
  const dispatch = useDispatch();
  const { crea } = useGestioneIdentitaLocale();
  const error = useSelector(state => state.feedback.errore);
  const [nickname, setNickname] = useState('');

  const changeNickname = (event: ChangeEvent<HTMLInputElement>) => {
    setNickname(event.target.value.toLowerCase());
  };

  const submitIdentity = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await crea(nickname);
    } catch {
      dispatch(
        erroreMostrato(
          'Usa 3–24 caratteri: lettere minuscole, numeri o underscore.',
        ),
      );
    }
  };

  return (
    <>
      <SettingsPopover
        trigger={
          <Button
            variant="ghost"
            className="landing-settings icon-button"
            aria-label="Impostazioni Tacitus"
            title="Impostazioni Tacitus">
            <Settings size={22} aria-hidden="true" />
          </Button>
        }>
        <div className="settings-content">
          <ThemeSelector />
          <small className="settings-help">
            Tacitus v{version} · ethos-adamas
          </small>
        </div>
      </SettingsPopover>
      <main className="landing">
        <section className="identity-card">
          <Brand />
          <h1>Messaggistica privata senza account.</h1>
          <p>Le chiavi private non lasciano mai questo dispositivo.</p>
          <form onSubmit={submitIdentity}>
            <label>
              Nickname immutabile
              <TextInput
                value={nickname}
                onChange={changeNickname}
                minLength={3}
                maxLength={24}
                pattern="[a-z0-9_]+"
                required
                aria-describedby="nickname-help"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
              />
            </label>
            <small id="nickname-help" className="settings-help">
              3–24 caratteri: lettere minuscole, numeri o underscore.
            </small>
            <Button type="submit" variant="primary">
              Crea Identità
            </Button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      </main>
    </>
  );
};

export default IdentitySetup;
