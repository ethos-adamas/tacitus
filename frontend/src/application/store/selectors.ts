import { createSelector } from '@reduxjs/toolkit';
import type { StatoContatto } from '../../domain/relazioni';
import type { TacitusId } from '../../domain/tacitusId';
import type { RootState } from './store';

export const selectConversazione = (state: RootState, tacitusId: TacitusId) =>
  state.conversazioni.perContatto[tacitusId];

const statoContatto = (
  relazioni: RootState['relazioni'],
  presenzeContatti: RootState['presenzeContatti'],
  sessioniSicure: RootState['sessioniSicure'],
  tacitusId: TacitusId,
): StatoContatto => {
  if (relazioni.intenti[tacitusId]) return 'in-attesa';
  if (relazioni.relazioni[tacitusId].stato === 'da-riattivare') {
    return 'riattivazione-necessaria';
  }
  if (presenzeContatti[tacitusId] === 'offline') return 'offline';
  return sessioniSicure[tacitusId] === 'pronta'
    ? 'sessione-sicura'
    : 'negoziazione';
};

export const selectStatoContatto = (
  state: RootState,
  tacitusId: TacitusId,
): StatoContatto =>
  statoContatto(
    state.relazioni,
    state.presenzeContatti,
    state.sessioniSicure,
    tacitusId,
  );

export type VoceElencoConversazioni =
  | {
      tipo: 'intento';
      tacitusId: TacitusId;
      stato: 'in-attesa';
    }
  | {
      tipo: 'conversazione';
      tacitusId: TacitusId;
      nickname: string;
      nonLetti: number;
      attiva: boolean;
      stato: StatoContatto;
    };

export const selectElencoConversazioni = createSelector(
  [
    (state: RootState) => state.relazioni,
    (state: RootState) => state.conversazioni,
    (state: RootState) => state.presenzeContatti,
    (state: RootState) => state.sessioniSicure,
  ],
  (
    relazioni,
    conversazioni,
    presenzeContatti,
    sessioniSicure,
  ): VoceElencoConversazioni[] => [
    ...Object.values(relazioni.intenti)
      .filter(({ tacitusId }) => !relazioni.contatti[tacitusId])
      .map(({ tacitusId }) => ({
        tipo: 'intento' as const,
        tacitusId,
        stato: 'in-attesa' as const,
      })),
    ...Object.values(relazioni.contatti).map(contatto => {
      const tacitusId = contatto.tacitusId;
      return {
        tipo: 'conversazione' as const,
        tacitusId,
        nickname: contatto.nickname,
        nonLetti: conversazioni.perContatto[tacitusId].nonLetti,
        attiva: conversazioni.idConversazioneAttiva === tacitusId,
        stato: statoContatto(
          relazioni,
          presenzeContatti,
          sessioniSicure,
          tacitusId,
        ),
      };
    }),
  ],
);

export const selectConversazioneAttiva = createSelector(
  [
    (state: RootState) => state.conversazioni,
    (state: RootState) => state.relazioni,
    (state: RootState) => state.presenzeContatti,
    (state: RootState) => state.sessioniSicure,
  ],
  (conversazioni, relazioni, presenzeContatti, sessioniSicure) => {
    const tacitusId = conversazioni.idConversazioneAttiva;
    if (!tacitusId) return undefined;
    return {
      contatto: relazioni.contatti[tacitusId],
      conversazione: conversazioni.perContatto[tacitusId],
      intentoInCorso: relazioni.intenti[tacitusId] !== undefined,
      presenza: presenzeContatti[tacitusId],
      relazione: relazioni.relazioni[tacitusId],
      sessioneSicura: sessioniSicure[tacitusId],
    };
  },
);
