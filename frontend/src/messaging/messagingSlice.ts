import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { createContact, type Contact, type Message } from './model';

export type Connection = 'connecting' | 'online' | 'offline';

export type MessagingState = {
  activeId?: string;
  connection: Connection;
  contacts: Contact[];
};

type ContactMatched = {
  tacitusId: string;
  nickname: string;
  online: boolean;
};

type ContactPresenceChanged = {
  tacitusId: string;
  online: boolean;
};

type ContactMessageRecorded = {
  tacitusId: string;
  message: Message;
};

type ContactDraftChanged = {
  tacitusId: string;
  draft: string;
};

type SecureSessionEstablished = {
  tacitusId: string;
  nickname?: string;
};

const initialState: MessagingState = {
  connection: 'offline',
  contacts: [],
};

const findContact = (state: MessagingState, tacitusId: string) =>
  state.contacts.find(contact => contact.tacitusId === tacitusId);

const messagingSlice = createSlice({
  name: 'messaging',
  initialState,
  reducers: {
    conversationsLoaded: (state, { payload }: PayloadAction<Contact[]>) => {
      state.contacts = payload;
      state.activeId = undefined;
    },
    contactIntentRecorded: (state, { payload }: PayloadAction<string>) => {
      const contact = findContact(state, payload);
      if (contact) {
        contact.pending = true;
        contact.reactivationRequired = false;
        return;
      }
      state.contacts.push(createContact(payload));
    },
    contactReactivationRequested: (
      state,
      { payload }: PayloadAction<string>,
    ) => {
      const contact = findContact(state, payload);
      if (!contact) return;
      contact.pending = true;
      contact.reactivationRequired = false;
      contact.secure = false;
    },
    contactMatched: (state, { payload }: PayloadAction<ContactMatched>) => {
      const contact = findContact(state, payload.tacitusId);
      if (!contact) return;
      contact.nickname = payload.nickname;
      contact.pending = false;
      contact.reactivationRequired = false;
      contact.online = payload.online;
      contact.secure = false;
    },
    contactPresenceChanged: (
      state,
      { payload }: PayloadAction<ContactPresenceChanged>,
    ) => {
      const contact = findContact(state, payload.tacitusId);
      if (!contact) return;
      contact.online = payload.online;
      contact.secure = false;
    },
    contactDeactivated: (state, { payload }: PayloadAction<string>) => {
      const contact = findContact(state, payload);
      if (!contact) return;
      contact.pending = false;
      contact.reactivationRequired = true;
      contact.online = false;
      contact.secure = false;
    },
    contactRemoved: (state, { payload }: PayloadAction<string>) => {
      state.contacts = state.contacts.filter(
        contact => contact.tacitusId !== payload,
      );
      if (state.activeId === payload) state.activeId = undefined;
    },
    secureSessionEstablished: (
      state,
      { payload }: PayloadAction<SecureSessionEstablished>,
    ) => {
      const contact = findContact(state, payload.tacitusId);
      if (!contact) return;
      contact.nickname = payload.nickname ?? contact.nickname;
      contact.online = true;
      contact.secure = true;
    },
    contactSelected: (
      state,
      { payload }: PayloadAction<string | undefined>,
    ) => {
      state.activeId = payload;
      const contact = payload ? findContact(state, payload) : undefined;
      if (contact) contact.unread = 0;
    },
    contactDraftChanged: (
      state,
      { payload }: PayloadAction<ContactDraftChanged>,
    ) => {
      const contact = findContact(state, payload.tacitusId);
      if (contact) contact.draft = payload.draft;
    },
    incomingMessageRecorded: (
      state,
      { payload }: PayloadAction<ContactMessageRecorded>,
    ) => {
      const contact = findContact(state, payload.tacitusId);
      if (!contact) return;
      if (!contact.messages.some(({ id }) => id === payload.message.id)) {
        contact.messages.push(payload.message);
      }
      contact.unread =
        state.activeId === payload.tacitusId ? 0 : contact.unread + 1;
    },
    outgoingMessageRecorded: (
      state,
      { payload }: PayloadAction<ContactMessageRecorded>,
    ) => {
      const contact = findContact(state, payload.tacitusId);
      if (!contact) return;
      if (!contact.messages.some(({ id }) => id === payload.message.id)) {
        contact.messages.push(payload.message);
      }
      contact.draft = '';
    },
    relayConnecting: state => {
      state.connection = 'connecting';
    },
    relayReady: state => {
      state.connection = 'online';
    },
    relayDisconnected: state => {
      state.connection = 'offline';
      state.contacts.forEach(contact => {
        contact.pending = false;
        contact.reactivationRequired = true;
        contact.online = false;
        contact.secure = false;
      });
    },
  },
});

export const {
  contactDeactivated,
  contactDraftChanged,
  contactIntentRecorded,
  contactMatched,
  contactPresenceChanged,
  contactReactivationRequested,
  contactRemoved,
  contactSelected,
  conversationsLoaded,
  incomingMessageRecorded,
  outgoingMessageRecorded,
  relayConnecting,
  relayDisconnected,
  relayReady,
  secureSessionEstablished,
} = messagingSlice.actions;

export const messagingReducer = messagingSlice.reducer;

type MessagingRootState = { messaging: MessagingState };

export const selectActiveId = ({ messaging }: MessagingRootState) =>
  messaging.activeId;
export const selectConnection = ({ messaging }: MessagingRootState) =>
  messaging.connection;
export const selectContacts = ({ messaging }: MessagingRootState) =>
  messaging.contacts;
export const selectActiveContact = ({ messaging }: MessagingRootState) =>
  messaging.contacts.find(contact => contact.tacitusId === messaging.activeId);
