import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  selectActiveContact,
  selectActiveId,
  selectConnection,
  selectContacts,
} from './messaging/messagingSlice';
import { useMessaging } from './messaging/useMessaging';
import {
  listenForNotificationClicks,
  notificationPermission,
  requestNotificationPermission,
  showMessageNotification,
  type NotificationPermissionState,
} from './notifications';
import {
  copyTacitusId,
  nextTheme,
  NOTIFICATIONS_KEY,
  resolveTheme,
  shouldNotify,
  THEME_KEY,
  type Theme,
} from './preferences';
import { useAppSelector } from './store';
import AddContactDialog from './ui/AddContactDialog';
import AppHeader from './ui/AppHeader';
import Conversation from './ui/Conversation';
import ConversationList from './ui/ConversationList';
import IdentitySetup from './ui/IdentitySetup';

const App = () => {
  const activeContact = useAppSelector(selectActiveContact);
  const activeId = useAppSelector(selectActiveId);
  const connection = useAppSelector(selectConnection);
  const contacts = useAppSelector(selectContacts);
  const [nickname, setNickname] = useState('');
  const [contactCode, setContactCode] = useState('');
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const notificationsEnabledRef = useRef(false);
  const [notificationState, setNotificationState] =
    useState<NotificationPermissionState>('default');
  const messaging = useMessaging({
    onError: setError,
    onIncomingMessage: (tacitusId, onOpen) => {
      if (
        !shouldNotify(
          notificationsEnabledRef.current,
          document.visibilityState,
          document.hasFocus(),
        )
      )
        return;
      void showMessageNotification(tacitusId, onOpen).catch(() =>
        setError('Notifica non riuscita.'),
      );
    },
  });
  const onNotificationClick = useEffectEvent(messaging.selectContact);

  const closeContactDialog = () => {
    setDialogOpen(false);
    setContactCode('');
  };

  const submitIdentity = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await messaging.createIdentity(nickname);
    } catch {
      setError('Usa 3–24 caratteri: lettere minuscole, numeri o underscore.');
    }
  };

  const submitContact = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      messaging.addContact(contactCode);
      closeContactDialog();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Tacitus ID non valido.',
      );
    }
  };

  const shareIdentity = async () => {
    if (!messaging.identity) return;
    try {
      await copyTacitusId(messaging.identity.tacitusId);
      setNotice('Tacitus ID copiato.');
    } catch {
      setError('Copia del Tacitus ID non riuscita.');
    }
  };

  const toggleTheme = () => {
    const selected = nextTheme(theme);
    localStorage.setItem(THEME_KEY, selected);
    document.documentElement.dataset.theme = selected;
    setTheme(selected);
  };

  const toggleNotifications = async () => {
    try {
      if (notificationsEnabled) {
        notificationsEnabledRef.current = false;
        setNotificationsEnabled(false);
        localStorage.setItem(NOTIFICATIONS_KEY, 'false');
        return;
      }
      const permission =
        notificationState === 'granted'
          ? 'granted'
          : await requestNotificationPermission();
      setNotificationState(permission);
      if (permission !== 'granted') {
        setError(
          permission === 'denied'
            ? 'Notifiche bloccate: abilitale dalle impostazioni del dispositivo.'
            : 'Le notifiche non sono supportate.',
        );
        return;
      }
      notificationsEnabledRef.current = true;
      setNotificationsEnabled(true);
      localStorage.setItem(NOTIFICATIONS_KEY, 'true');
    } catch {
      setError('Configurazione delle notifiche non riuscita.');
    }
  };

  const deleteIdentity = async () => {
    if (
      !confirm('Cancellare definitivamente Identità, Contatti e Conversazioni?')
    )
      return;
    await messaging.deleteIdentity();
    location.reload();
  };

  useEffect(() => {
    const systemTheme = matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => {
      if (localStorage.getItem(THEME_KEY)) return;
      const selected = resolveTheme(null, systemTheme.matches);
      document.documentElement.dataset.theme = selected;
      setTheme(selected);
    };
    systemTheme.addEventListener('change', followSystem);
    return () => systemTheme.removeEventListener('change', followSystem);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void notificationPermission()
      .then(permission => {
        if (cancelled) return;
        setNotificationState(permission);
        const enabled =
          permission === 'granted' &&
          localStorage.getItem(NOTIFICATIONS_KEY) === 'true';
        notificationsEnabledRef.current = enabled;
        setNotificationsEnabled(enabled);
      })
      .catch(() => {
        if (!cancelled) setNotificationState('unsupported');
      });
    let stopListening: (() => void) | undefined;
    void listenForNotificationClicks(onNotificationClick)
      .then(stop => {
        if (cancelled) stop();
        else stopListening = stop;
      })
      .catch(() => {
        if (!cancelled) setError('Ascolto delle notifiche non riuscito.');
      });
    return () => {
      cancelled = true;
      stopListening?.();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2_000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (messaging.loading)
    return (
      <main className="landing">
        <p>Caricamento…</p>
      </main>
    );
  if (!messaging.identity)
    return (
      <IdentitySetup
        error={error}
        nickname={nickname}
        onNicknameChanged={setNickname}
        onSubmit={event => void submitIdentity(event)}
        onToggleTheme={toggleTheme}
        theme={theme}
      />
    );

  return (
    <main className="app-shell">
      <AppHeader
        connection={connection}
        identity={messaging.identity}
        notificationState={notificationState}
        notificationsEnabled={notificationsEnabled}
        onDeleteIdentity={() => void deleteIdentity()}
        onShareIdentity={() => void shareIdentity()}
        onToggleNotifications={() => void toggleNotifications()}
        onToggleTheme={toggleTheme}
        theme={theme}
      />
      {error && (
        <p className="toast" role="alert">
          {error}
          <button onClick={() => setError('')}>×</button>
        </p>
      )}
      {notice && (
        <p className="toast success" role="status">
          {notice}
        </p>
      )}
      <section className={`layout ${activeContact ? 'conversation-open' : ''}`}>
        <ConversationList
          activeId={activeId}
          contacts={contacts}
          onAddContact={() => setDialogOpen(true)}
          onSelectContact={messaging.selectContact}
        />
        <Conversation
          contact={activeContact}
          connection={connection}
          onBack={() => messaging.selectContact(undefined)}
          onDraftChanged={draft => {
            if (activeContact) messaging.updateDraft(activeContact, draft);
          }}
          onReactivate={() => {
            if (activeContact) messaging.reactivateContact(activeContact);
          }}
          onRemove={() => {
            if (
              activeContact &&
              confirm(
                `Rimuovere ${activeContact.nickname ?? activeContact.tacitusId} e la Conversazione locale?`,
              )
            )
              messaging.removeContact(activeContact);
          }}
          onSend={() => {
            if (activeContact) messaging.sendMessage(activeContact);
          }}
          theme={theme}
        />
      </section>
      <AddContactDialog
        code={contactCode}
        open={dialogOpen}
        onClose={closeContactDialog}
        onCodeChanged={setContactCode}
        onSubmit={submitContact}
      />
    </main>
  );
};

export default App;
