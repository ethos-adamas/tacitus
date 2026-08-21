import { isTauri } from '@tauri-apps/api/core';
import type { PermessoNotifiche } from '../../domain/preferenze';
import { parseTacitusId, type TacitusId } from '../../domain/tacitusId';

const DENIED_KEY = 'tacitus.v3.notifications.denied';
const ENABLED_KEY = 'tacitus.v3.notifications.enabled';
const notificationTargets = new Map<number, TacitusId>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const notificationsEnabled = (): boolean =>
  localStorage.getItem(ENABLED_KEY) === 'true';

export const saveNotificationsEnabled = (enabled: boolean): void => {
  localStorage.setItem(ENABLED_KEY, String(enabled));
};

export const notificationPermission = async (): Promise<PermessoNotifiche> => {
  if (isTauri()) {
    const { isPermissionGranted } =
      await import('@tauri-apps/plugin-notification');
    if (await isPermissionGranted()) return 'granted';
    return localStorage.getItem(DENIED_KEY) === 'true' ? 'denied' : 'default';
  }
  return 'Notification' in window ? Notification.permission : 'unsupported';
};

export const requestNotificationPermission =
  async (): Promise<PermessoNotifiche> => {
    const permission = isTauri()
      ? await (
          await import('@tauri-apps/plugin-notification')
        ).requestPermission()
      : 'Notification' in window
        ? await Notification.requestPermission()
        : 'unsupported';
    if (permission === 'denied') localStorage.setItem(DENIED_KEY, 'true');
    if (permission === 'granted') localStorage.removeItem(DENIED_KEY);
    return permission;
  };

export const shouldNotify = (
  enabled: boolean,
  visibility: DocumentVisibilityState,
  focused: boolean,
): boolean => enabled && (visibility !== 'visible' || !focused);

export const showMessageNotification = async (
  tacitusId: TacitusId,
  onClick: () => void,
): Promise<void> => {
  if (isTauri()) {
    const { sendNotification } =
      await import('@tauri-apps/plugin-notification');
    const id = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fff_ffff;
    notificationTargets.set(id, tacitusId);
    sendNotification({
      id,
      title: 'Tacitus',
      body: 'Hai ricevuto un nuovo messaggio',
      extra: { tacitusId },
      autoCancel: true,
    });
    return;
  }
  const notification = new Notification('Tacitus', {
    body: 'Hai ricevuto un nuovo messaggio',
  });
  notification.onclick = () => {
    window.focus();
    onClick();
    notification.close();
  };
};

export const listenForNotificationClicks = async (
  onClick: (tacitusId: TacitusId) => void,
): Promise<() => void> => {
  if (!isTauri()) return () => undefined;
  const { onAction } = await import('@tauri-apps/plugin-notification');
  const listener = await onAction(rawEvent => {
    const event: Record<string, unknown> = isRecord(rawEvent) ? rawEvent : {};
    const notification: Record<string, unknown> = isRecord(event.notification)
      ? event.notification
      : {};
    const notificationExtra = isRecord(notification.extra)
      ? notification.extra
      : {};
    const eventExtra = isRecord(event.extra) ? event.extra : {};
    const rawId = notification.id ?? event.id;
    const id = typeof rawId === 'number' ? rawId : undefined;
    const rawTacitusId =
      notificationExtra.tacitusId ??
      eventExtra.tacitusId ??
      (id === undefined ? undefined : notificationTargets.get(id));
    if (typeof rawTacitusId === 'string') {
      try {
        onClick(parseTacitusId(rawTacitusId));
      } catch {
        // Gli eventi nativi sono input esterno: un target non valido va ignorato.
      }
    }
    if (id !== undefined) notificationTargets.delete(id);
  });
  return () => void listener.unregister();
};
