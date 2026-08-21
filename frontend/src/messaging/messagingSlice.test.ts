import { describe, expect, it } from 'vitest';
import {
  contactDeactivated,
  contactIntentRecorded,
  contactMatched,
  contactPresenceChanged,
  contactRemoved,
  contactSelected,
  conversationsLoaded,
  incomingMessageRecorded,
  messagingReducer,
  outgoingMessageRecorded,
  relayDisconnected,
  secureSessionEstablished,
  selectActiveContact,
  selectContacts,
} from './messagingSlice';

const ALICE_ID = '2G2DX-6P175-0PJ6E-Q37T0-Q94YJC';
const BOB_ID = '3G2DX-6P175-0PJ6E-Q37T0-Q94YJC';

describe('stato della Messaggistica privata', () => {
  it('mantiene la Conversazione quando cambia la Sessione sicura', () => {
    let state = messagingReducer(undefined, contactIntentRecorded(ALICE_ID));
    state = messagingReducer(
      state,
      contactMatched({ tacitusId: ALICE_ID, nickname: 'alice', online: true }),
    );
    state = messagingReducer(
      state,
      secureSessionEstablished({ tacitusId: ALICE_ID, nickname: 'alice' }),
    );
    state = messagingReducer(
      state,
      outgoingMessageRecorded({
        tacitusId: ALICE_ID,
        message: {
          id: 'one',
          direction: 'outgoing',
          text: 'prima',
          createdAt: 1,
        },
      }),
    );
    state = messagingReducer(
      state,
      contactPresenceChanged({ tacitusId: ALICE_ID, online: false }),
    );
    state = messagingReducer(
      state,
      contactPresenceChanged({ tacitusId: ALICE_ID, online: true }),
    );
    state = messagingReducer(
      state,
      secureSessionEstablished({ tacitusId: ALICE_ID, nickname: 'alice' }),
    );

    expect(selectContacts({ messaging: state })[0]).toMatchObject({
      nickname: 'alice',
      online: true,
      secure: true,
      messages: [
        { id: 'one', direction: 'outgoing', text: 'prima', createdAt: 1 },
      ],
    });
  });

  it('conta come non letto un Messaggio ricevuto fuori dalla Conversazione attiva', () => {
    let state = messagingReducer(undefined, conversationsLoaded([]));
    state = messagingReducer(state, contactIntentRecorded(ALICE_ID));
    state = messagingReducer(state, contactIntentRecorded(BOB_ID));
    state = messagingReducer(state, contactSelected(ALICE_ID));
    state = messagingReducer(
      state,
      incomingMessageRecorded({
        tacitusId: BOB_ID,
        message: {
          id: 'incoming',
          direction: 'incoming',
          text: 'ciao',
          createdAt: 2,
        },
      }),
    );

    expect(
      selectContacts({ messaging: state }).find(
        ({ tacitusId }) => tacitusId === BOB_ID,
      ),
    ).toMatchObject({ unread: 1, messages: [{ text: 'ciao' }] });
  });

  it('mantiene la Relazione riattivabile quando il relay si disconnette', () => {
    let state = messagingReducer(undefined, contactIntentRecorded(ALICE_ID));
    state = messagingReducer(
      state,
      contactMatched({ tacitusId: ALICE_ID, nickname: 'alice', online: true }),
    );
    state = messagingReducer(state, relayDisconnected());

    expect(selectContacts({ messaging: state })[0]).toMatchObject({
      pending: false,
      reactivationRequired: true,
      online: false,
      secure: false,
    });
  });

  it('rimuove il Contatto e chiude la Conversazione selezionata', () => {
    let state = messagingReducer(undefined, contactIntentRecorded(ALICE_ID));
    state = messagingReducer(state, contactSelected(ALICE_ID));
    state = messagingReducer(state, contactDeactivated(ALICE_ID));
    state = messagingReducer(state, contactRemoved(ALICE_ID));

    expect(selectContacts({ messaging: state })).toEqual([]);
    expect(selectActiveContact({ messaging: state })).toBeUndefined();
  });
});
