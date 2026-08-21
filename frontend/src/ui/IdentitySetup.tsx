import type { FormEvent } from 'react';
import type { Theme } from '../preferences';

type IdentitySetupProps = {
  error: string;
  nickname: string;
  onNicknameChanged: (nickname: string) => void;
  onSubmit: (event: FormEvent) => void;
  onToggleTheme: () => void;
  theme: Theme;
};

const IdentitySetup = ({
  error,
  nickname,
  onNicknameChanged,
  onSubmit,
  onToggleTheme,
  theme,
}: IdentitySetupProps) => (
  <main className="landing">
    <button
      className="icon-action landing-theme"
      onClick={onToggleTheme}
      aria-label={`Passa al tema ${theme === 'dark' ? 'chiaro' : 'scuro'}`}
      title={`Tema ${theme === 'dark' ? 'chiaro' : 'scuro'}`}>
      {theme === 'dark' ? '☀' : '☾'}
    </button>
    <section className="identity-card">
      <p className="brand">TACITUS</p>
      <h1>Messaggistica privata senza account.</h1>
      <p>Le chiavi private non lasciano mai questo dispositivo.</p>
      <form onSubmit={onSubmit}>
        <label>
          Nickname immutabile
          <input
            value={nickname}
            onChange={({ target }) => onNicknameChanged(target.value)}
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

export default IdentitySetup;
