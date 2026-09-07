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

  const toggleNotifications = async () => {
    try {
      await cambiaNotifiche();
    } catch {
      dispatch(erroreMostrato('Configurazione delle notifiche non riuscita.'));
    }
  };

  return (
    <header>
      <Brand />
      <div className="identity">
        <strong>{identity.nickname}</strong>
        <code>{identity.tacitusId}</code>
        <span className={`connection ${connection}`}>
          {connection === 'online' ? 'online' : connection}
        </span>
      </div>
      <div className="header-actions">
        <Button className="copy-identity" onClick={shareIdentity}>
          Copia Tacitus ID
        </Button>
        <SettingsPopover
          trigger={
            <Button
              variant="ghost"
              aria-label="Impostazioni"
              title="Impostazioni">
              ⚙
            </Button>
          }>
          <div className="settings-content">
            <ThemeSelector />
            <CheckboxField
              checked={fotoAbilitate}
              label="Ricevi foto e album"
              onCheckedChange={togglePhotos}
            />
            <Button
              variant="ghost"
              onClick={toggleNotifications}
              disabled={
                notifiche.permesso === 'denied' ||
                notifiche.permesso === 'unsupported'
              }
              aria-pressed={notifiche.abilitate}
              aria-label={
                notifiche.abilitate
                  ? 'Disattiva notifiche'
                  : 'Abilita notifiche'
              }
              title={
                notifiche.permesso === 'denied'
                  ? 'Notifiche bloccate nelle impostazioni del dispositivo'
                  : notifiche.abilitate
                    ? 'Disattiva notifiche'
                    : 'Abilita notifiche'
              }>
              {notifiche.abilitate ? '🔔' : '🔕'}
            </Button>
            <ConfirmDialog
              trigger={<Button variant="danger">Cancella dati</Button>}
              title="Cancellare definitivamente i dati?"
              description="Cancella Identità, Contatti e Conversazioni da questo dispositivo."
              confirmLabel="Cancella definitivamente"
              onConfirm={cancella}
            />
          </div>
        </SettingsPopover>
      </div>
    </header>
  );
};

export default AppHeader;
