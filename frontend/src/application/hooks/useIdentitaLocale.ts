import { annullaAlbum } from '../album/trasferimentiAlbum';
import { preferenzeAlbumCaricate } from '../store/albumSlice';
import { useEffect } from 'react';
import { conversazioniCaricate } from '../store/conversazioniSlice';
import { erroreMostrato } from '../store/feedbackSlice';
import {
  identitaLocaleAssente,
  identitaLocaleDisponibile,
} from '../store/identitaLocaleSlice';
import { relazioniCaricate } from '../store/relazioniSlice';
import { useDispatch } from '../store/hooks';
import {
  leggiIdentitaLocale,
  memorizzaIdentitaLocale,
  rimuoviIdentitaLocale,
} from '../../infrastructure/identity/identitaLocaleCorrente';
import { createIdentity } from '../../infrastructure/identity/identityProvider';
import {
  clearLocalData,
  loadIdentity,
  loadState,
  resetLegacyData,
  saveIdentity,
} from '../../infrastructure/persistence/localPersistence';

export const useIdentitaLocale = (): void => {
  const dispatch = useDispatch();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await resetLegacyData();
        const identity = await loadIdentity();
        if (!active) return;
        if (!identity) {
          dispatch(identitaLocaleAssente());
          return;
        }
        const persisted = await loadState(identity);
        if (!active) return;
        memorizzaIdentitaLocale(identity);
        if (persisted) {
          if (persisted.album)
            dispatch(preferenzeAlbumCaricate(persisted.album));
          dispatch(relazioniCaricate(persisted.relazioni));
          dispatch(conversazioniCaricate(persisted.conversazioni));
        }
        dispatch(
          identitaLocaleDisponibile({
            nickname: identity.nickname,
            tacitusId: identity.tacitusId,
          }),
        );
      } catch {
        if (active) {
          dispatch(
            erroreMostrato(
              'I dati locali non possono essere letti. Cancella i dati per ripartire.',
            ),
          );
          dispatch(identitaLocaleAssente());
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [dispatch]);
};

export const useGestioneIdentitaLocale = () => {
  const dispatch = useDispatch();

  const crea = async (nickname: string) => {
    const identity = await createIdentity(nickname);
    await saveIdentity(identity);
    memorizzaIdentitaLocale(identity);
    dispatch(
      identitaLocaleDisponibile({
        nickname: identity.nickname,
        tacitusId: identity.tacitusId,
      }),
    );
  };

  const cancella = async () => {
    leggiIdentitaLocale();
    annullaAlbum();
    await clearLocalData();
    rimuoviIdentitaLocale();
    location.reload();
  };

  return { cancella, crea };
};
