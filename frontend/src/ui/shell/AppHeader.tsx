import { useRef, useState } from 'react';
import { Copy, Settings } from 'lucide-react';
import { version } from '../../../package.json';
import { ricezioneFotoCambiata } from '../../application/store/albumSlice';
import Brand from './Brand';
import { useGestioneIdentitaLocale } from '../../application/hooks/useIdentitaLocale';
import { useImpostazioniNotifiche } from '../../application/hooks/useNotifications';
import {
  avvisoMostrato,
  erroreMostrato,
} from '../../application/store/feedbackSlice';
import { useDispatch, useSelector } from '../../application/store/hooks';
import { copyTacitusId } from '../../infrastructure/clipboard/clipboard';
import { Button } from '../kit/Button';
import { CheckboxField } from '../kit/Fields';
import { ConfirmDialog } from '../kit/ConfirmDialog';
import { SettingsPopover } from '../kit/SettingsPopover';
import ThemeSelector from './ThemeSelector';

const AppHeader = () => {
  const dispatch = useDispatch();
  const fotoAbilitate = useSelector(state => state.album.preferenze.abilitate);
  const connection = useSelector(state => state.connessioneRelay);
  const identitaState = useSelector(state => state.identitaLocale);
  const { cancella } = useGestioneIdentitaLocale();
  const { cambiaNotifiche, notifiche } = useImpostazioniNotifiche();
  const [notificationsPending, setNotificationsPending] = useState(false);
  const notificationsPendingRef = useRef(false);

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

  const togglePhotos = (enabled: boolean) =>
    dispatch(ricezioneFotoCambiata(enabled));

  const changeNotifications = async (nextChecked: boolean) => {
    if (
      nextChecked === notifiche.abilitate ||
      notificationsPendingRef.current ||
      notifiche.permesso === 'denied' ||
      notifiche.permesso === 'unsupported'
    )
      return;
    notificationsPendingRef.current = true;
    setNotificationsPending(true);
    try {
      await cambiaNotifiche();
    } catch {
      dispatch(erroreMostrato('Configurazione delle notifiche non riuscita.'));
    } finally {
      notificationsPendingRef.current = false;
      setNotificationsPending(false);
    }
  };

  const notificationsHelp = notificationsPending
    ? 'Richiesta del permesso…'
    : notifiche.permesso === 'denied'
      ? 'Notifiche bloccate: consentile nelle impostazioni del browser.'
      : notifiche.permesso === 'unsupported'
        ? 'Notifiche non supportate in questo ambiente.'
        : notifiche.permesso === 'granted'
          ? 'Le notifiche sono disponibili mentre l’applicazione è aperta.'
          : 'Attivando Notifiche, il browser può chiedere il permesso.';
  const notificationsDisabled =
    notificationsPending ||
    notifiche.permesso === 'denied' ||
    notifiche.permesso === 'unsupported';

  return (
    <>
      <header className="app-header">
        <Brand />
        <SettingsPopover
          trigger={
            <Button
              variant="ghost"
              className="icon-button"
              aria-label="Impostazioni"
              title="Impostazioni">
              <Settings size={22} aria-hidden="true" />
            </Button>
          }>
          <div className="settings-content">
            <div className="identity">
              <strong>{identity.nickname}</strong>
              <code>{identity.tacitusId}</code>
              <Button onClick={shareIdentity}>
                <Copy size={18} aria-hidden="true" />
                Copia Tacitus ID
              </Button>
            </div>
            <ThemeSelector />
            <CheckboxField
              checked={fotoAbilitate}
              label="Ricevi foto e album"
              onCheckedChange={togglePhotos}
            />
            <CheckboxField
              id="notifications-setting"
              label="Notifiche"
              checked={notifiche.abilitate}
              disabled={notificationsDisabled}
              onCheckedChange={changeNotifications}
              descriptionId="notifications-help"
            />
            <p id="notifications-help" className="settings-help">
              {notificationsHelp}
            </p>
            <ConfirmDialog
              trigger={<Button variant="danger">Cancella dati</Button>}
              title="Cancellare definitivamente i dati?"
              description="Cancella Identità, Contatti e Conversazioni da questo dispositivo."
              confirmLabel="Cancella definitivamente"
              onConfirm={cancella}
            />
            <small className="settings-help">
              Tacitus v{version} · ethos-adamas
            </small>
          </div>
        </SettingsPopover>
      </header>
      <footer className="local-identity">
        <span className="avatar" aria-hidden="true">
          {identity.nickname[0].toUpperCase()}
        </span>
        <div className="identity-summary">
          <strong>{identity.nickname}</strong>
          <span className={`connection ${connection}`}>
            {connection === 'online'
              ? 'online'
              : connection === 'connecting'
                ? 'Connessione…'
                : 'Offline'}
          </span>
        </div>
        <Button
          className="copy-identity icon-button"
          variant="ghost"
          onClick={shareIdentity}
          aria-label="Copia Tacitus ID"
          title="Copia Tacitus ID">
          <Copy size={22} aria-hidden="true" />
        </Button>
      </footer>
    </>
  );
};

export default AppHeader;
