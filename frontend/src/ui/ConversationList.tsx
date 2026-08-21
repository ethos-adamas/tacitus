import type { Contact } from '../messaging/model';

type ConversationListProps = {
  activeId?: string;
  contacts: Contact[];
  onAddContact: () => void;
  onSelectContact: (tacitusId: string) => void;
};

const contactStatus = (contact: Contact) => {
  if (contact.pending) return 'In attesa del Contatto';
  if (contact.secure) return 'Sessione sicura';
  if (contact.online) return 'Negoziazione…';
  if (contact.reactivationRequired) return 'Riattivazione necessaria';
  return 'Offline';
};

const ConversationList = ({
  activeId,
  contacts,
  onAddContact,
  onSelectContact,
}: ConversationListProps) => (
  <aside>
    <div className="panel-title">
      <h1>Conversazioni</h1>
      <button className="add" onClick={onAddContact}>
        +
      </button>
    </div>
    {contacts.length === 0 ? (
      <p className="empty">Aggiungi il Tacitus ID di una persona online.</p>
    ) : (
      contacts.map(contact => (
        <button
          className={`contact ${activeId === contact.tacitusId ? 'selected' : ''}`}
          key={contact.tacitusId}
          onClick={() => onSelectContact(contact.tacitusId)}>
          <span className="avatar">
            {(contact.nickname ?? '?')[0].toUpperCase()}
          </span>
          <span>
            <strong>{contact.nickname ?? 'Contatto'}</strong>
            <small>{contactStatus(contact)}</small>
          </span>
          {contact.unread > 0 && <b className="unread">{contact.unread}</b>}
        </button>
      ))
    )}
  </aside>
);

export default ConversationList;
