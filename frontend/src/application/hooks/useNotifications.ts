import { useEffect } from 'react';
import { conversazioneSelezionata } from '../store/conversazioniSlice';
import { erroreMostrato } from '../store/feedbackSlice';
import { useDispatch, useSelector } from '../store/hooks';
import {
  notificheConfigurate,
  notificheDisabilitate,
} from '../store/notificheSlice';
import {
  listenForNotificationClicks,
  notificationPermission,
  notificationsEnabled,
  requestNotificationPermission,
  saveNotificationsEnabled,
} from '../../infrastructure/notifications/notifications';

export const useNotifications = (): void => {
  const dispatch = useDispatch();

  useEffect(() => {
    let active = true;
    let stopListening: (() => void) | undefined;
    void notificationPermission()
      .then(permesso => {
        if (!active) return;
        dispatch(
          notificheConfigurate({
            abilitate: permesso === 'granted' && notificationsEnabled(),
            permesso,
          }),
        );
      })
      .catch(() => {
        if (active) {
          dispatch(
            notificheConfigurate({
              abilitate: false,
              permesso: 'unsupported',
            }),
          );
        }
      });
    void listenForNotificationClicks(tacitusId =>
      dispatch(conversazioneSelezionata(tacitusId)),
    )
      .then(stop => {
        if (active) stopListening = stop;
        else stop();
      })
      .catch(() => {
        if (active) {
          dispatch(erroreMostrato('Ascolto delle notifiche non disponibile.'));
        }
      });
    return () => {
      active = false;
      stopListening?.();
    };
  }, [dispatch]);
};

export const useImpostazioniNotifiche = () => {
  const dispatch = useDispatch();
  const notifiche = useSelector(state => state.notifiche);

  const cambiaNotifiche = async () => {
    if (notifiche.abilitate) {
      saveNotificationsEnabled(false);
      dispatch(notificheDisabilitate());
      return;
    }
    const permesso =
      notifiche.permesso === 'granted'
        ? 'granted'
        : await requestNotificationPermission();
    const abilitate = permesso === 'granted';
    saveNotificationsEnabled(abilitate);
    dispatch(notificheConfigurate({ abilitate, permesso }));
    if (!abilitate) {
      dispatch(
        erroreMostrato(
          permesso === 'denied'
            ? 'Notifiche bloccate: abilitale dalle impostazioni del dispositivo.'
            : 'Le notifiche non sono supportate.',
        ),
      );
    }
  };

  return { cambiaNotifiche, notifiche };
};
