import { isTauri } from '@tauri-apps/api/core';

export type NotificationPermissionState =
  'default' | 'granted' | 'denied' | 'unsupported';

const DENIED_KEY = 'tacitus.notifications.denied';
const notificationTargets = new Map<number, string>();
const title = 'Tacitus';
const body = 'Hai ricevuto un nuovo messaggio';

export const notificationPermission =
  async (): Promise<NotificationPermissionState> => {
    if (isTauri()) {
      const { isPermissionGranted } =
        await import('@tauri-apps/plugin-notification');
      if (await isPermissionGranted()) return 'granted';
      return localStorage.getItem(DENIED_KEY) === 'true' ? 'denied' : 'default';
    }
    return 'Notification' in window ? Notification.permission : 'unsupported';
  };

export const requestNotificationPermission =
  async (): Promise<NotificationPermissionState> => {
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

export const showMessageNotification = async (
  tacitusId: string,
  onClick: () => void,
) => {
  if (isTauri()) {
    const { sendNotification } =
      await import('@tauri-apps/plugin-notification');
    const id = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fff_ffff;
    notificationTargets.set(id, tacitusId);
    sendNotification({
      id,
      title,
      body,
      extra: { tacitusId },
      autoCancel: true,
    });
    return;
  }
  const notification = new Notification(title, { body });
  notification.onclick = () => {
    window.focus();
    onClick();
    notification.close();
  };
};

export const listenForNotificationClicks = async (
  onClick: (tacitusId: string) => void,
) => {
  if (!isTauri()) return () => undefined;
  const { onAction } = await import('@tauri-apps/plugin-notification');
  const listener = await onAction(rawEvent => {
    const event = rawEvent as typeof rawEvent & {
      notification?: { id?: number; extra?: Record<string, unknown> };
    };
    const id = event.notification?.id ?? event.id;
    const tacitusId =
      event.notification?.extra?.tacitusId ??
      event.extra?.tacitusId ??
      (id === undefined ? undefined : notificationTargets.get(id));
    if (typeof tacitusId === 'string') onClick(tacitusId);
    if (id !== undefined) notificationTargets.delete(id);
  });
  return () => void listener.unregister();
};
