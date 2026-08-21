import { useGestioneIdentitaLocale } from '../../application/hooks/useIdentitaLocale';
import { useImpostazioniNotifiche } from '../../application/hooks/useNotifications';
import { useTema } from '../../application/hooks/useTheme';
import {
  avvisoMostrato,
  erroreMostrato,
} from '../../application/store/feedbackSlice';
import { useDispatch, useSelector } from '../../application/store/hooks';
import { copyTacitusId } from '../../infrastructure/clipboard/clipboard';

const AppHeader = () => {
  const dispatch = useDispatch();
  const connection = useSelector(state => state.connessioneRelay);
  const identitaState = useSelector(state => state.identitaLocale);
  const { cancella } = useGestioneIdentitaLocale();
  const { cambiaNotifiche, notifiche } = useImpostazioniNotifiche();
  const { cambiaTema, tema } = useTema();
  if (identitaState.stato !== 'pronta') {
    throw new Error('Identità locale assente nell’applicazione autenticata.');
  }
  const identity = identitaState.identita;

  const shareIdentity = async () => {
    try {
      await copyTacitusId(identity.tacitusId);
      dispatch(avvisoMostrato('Tacitus ID copiato.'));
    } catch {
      dispatch(erroreMostrato('Copia del Tacitus ID non riuscita.'));
    }
  };

  const deleteIdentity = async () => {
    if (
      confirm('Cancellare definitivamente Identità, Contatti e Conversazioni?')
    ) {
      await cancella();
    }
  };

  const toggleNotifications = async () => {
    try {
      await cambiaNotifiche();
    } catch {
      dispatch(erroreMostrato('Configurazione delle notifiche non riuscita.'));
    }
  };

  return (
    <header>
      <p className="brand">TACITUS</p>
      <div className="identity">
        <strong>{identity.nickname}</strong>
        <code>{identity.tacitusId}</code>
        <span className={`connection ${connection}`}>
          {connection === 'online' ? 'online' : connection}
        </span>
      </div>
      <div className="header-actions">
        <button
          className="icon-action"
          onClick={toggleNotifications}
          disabled={
            notifiche.permesso === 'denied' ||
            notifiche.permesso === 'unsupported'
          }
          aria-pressed={notifiche.abilitate}
          aria-label={
            notifiche.abilitate ? 'Disattiva notifiche' : 'Abilita notifiche'
          }
          title={
            notifiche.permesso === 'denied'
              ? 'Notifiche bloccate nelle impostazioni del dispositivo'
              : notifiche.abilitate
                ? 'Disattiva notifiche'
                : 'Abilita notifiche'
          }>
          {notifiche.abilitate ? '🔔' : '🔕'}
        </button>
        <button
          className="icon-action"
          onClick={cambiaTema}
          aria-label={`Passa al tema ${tema === 'dark' ? 'chiaro' : 'scuro'}`}
          title={`Tema ${tema === 'dark' ? 'chiaro' : 'scuro'}`}>
          {tema === 'dark' ? '☀' : '☾'}
        </button>
        <button className="copy-identity" onClick={shareIdentity}>
          Copia Tacitus ID
        </button>
        <button className="danger" onClick={deleteIdentity}>
          Cancella dati
        </button>
      </div>
    </header>
  );
};

export default AppHeader;
