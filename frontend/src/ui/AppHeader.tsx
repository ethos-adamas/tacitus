import type { LocalIdentity } from '../identity';
import type { Connection } from '../messaging/messagingSlice';
import type { NotificationPermissionState } from '../notifications';
import type { Theme } from '../preferences';

type AppHeaderProps = {
  connection: Connection;
  identity: LocalIdentity;
  notificationState: NotificationPermissionState;
  notificationsEnabled: boolean;
  onDeleteIdentity: () => void;
  onShareIdentity: () => void;
  onToggleNotifications: () => void;
  onToggleTheme: () => void;
  theme: Theme;
};

const AppHeader = ({
  connection,
  identity,
  notificationState,
  notificationsEnabled,
  onDeleteIdentity,
  onShareIdentity,
  onToggleNotifications,
  onToggleTheme,
  theme,
}: AppHeaderProps) => (
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
        onClick={onToggleNotifications}
        disabled={
          notificationState === 'denied' || notificationState === 'unsupported'
        }
        aria-pressed={notificationsEnabled}
        aria-label={
          notificationsEnabled ? 'Disattiva notifiche' : 'Abilita notifiche'
        }
        title={
          notificationState === 'denied'
            ? 'Notifiche bloccate nelle impostazioni del dispositivo'
            : notificationsEnabled
              ? 'Disattiva notifiche'
              : 'Abilita notifiche'
        }>
        {notificationsEnabled ? '🔔' : '🔕'}
      </button>
      <button
        className="icon-action"
        onClick={onToggleTheme}
        aria-label={`Passa al tema ${theme === 'dark' ? 'chiaro' : 'scuro'}`}
        title={`Tema ${theme === 'dark' ? 'chiaro' : 'scuro'}`}>
        {theme === 'dark' ? '☀' : '☾'}
      </button>
      <button className="copy-identity" onClick={onShareIdentity}>
        Copia Tacitus ID
      </button>
      <button className="danger" onClick={onDeleteIdentity}>
        Cancella dati
      </button>
    </div>
  </header>
);

export default AppHeader;
