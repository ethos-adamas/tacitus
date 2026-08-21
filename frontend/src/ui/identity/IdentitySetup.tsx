import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useGestioneIdentitaLocale } from '../../application/hooks/useIdentitaLocale';
import { useTema } from '../../application/hooks/useTheme';
import { erroreMostrato } from '../../application/store/feedbackSlice';
import { useDispatch, useSelector } from '../../application/store/hooks';

const IdentitySetup = () => {
  const dispatch = useDispatch();
  const { crea } = useGestioneIdentitaLocale();
  const { cambiaTema, tema } = useTema();
  const error = useSelector(state => state.feedback.errore);
  const [nickname, setNickname] = useState('');

  const changeNickname = (event: ChangeEvent<HTMLInputElement>) => {
    setNickname(event.target.value);
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
    <main className="landing">
      <button
        className="icon-action landing-theme"
        onClick={cambiaTema}
        aria-label={`Passa al tema ${tema === 'dark' ? 'chiaro' : 'scuro'}`}
        title={`Tema ${tema === 'dark' ? 'chiaro' : 'scuro'}`}>
        {tema === 'dark' ? '☀' : '☾'}
      </button>
      <section className="identity-card">
        <p className="brand">TACITUS</p>
        <h1>Messaggistica privata senza account.</h1>
        <p>Le chiavi private non lasciano mai questo dispositivo.</p>
        <form onSubmit={submitIdentity}>
          <label>
            Nickname immutabile
            <input
              value={nickname}
              onChange={changeNickname}
              minLength={3}
              maxLength={24}
              pattern="[a-z0-9_]+"
              required
              autoFocus
            />
          </label>
          <button className="primary">Crea Identità</button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
};

export default IdentitySetup;
