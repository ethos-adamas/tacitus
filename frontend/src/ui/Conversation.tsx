import { useEffect, useRef } from 'react';
import { MAX_MESSAGE_LENGTH, type Contact } from '../messaging/model';
import type { Connection } from '../messaging/messagingSlice';
import type { Theme } from '../preferences';
import EmojiComposer from './EmojiComposer';

type ConversationProps = {
  contact?: Contact;
  connection: Connection;
  onBack: () => void;
  onDraftChanged: (draft: string) => void;
  onReactivate: () => void;
  onRemove: () => void;
  onSend: () => void;
  theme: Theme;
};

const Conversation = ({
  contact,
  connection,
  onBack,
  onDraftChanged,
  onReactivate,
  onRemove,
  onSend,
  theme,
}: ConversationProps) => {
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView();
  }, [contact?.messages]);

  return (
    <section className="conversation">
      {!contact ? (
        <p className="empty">Scegli una Conversazione.</p>
      ) : (
        <>
          <div className="conversation-title">
            <button className="back" onClick={onBack}>
              ←
            </button>
            <span className="avatar">
              {(contact.nickname ?? '?')[0].toUpperCase()}
            </span>
            <div>
              <h2>{contact.nickname ?? 'Contatto'}</h2>
              <code>{contact.tacitusId}</code>
            </div>
            {contact.reactivationRequired &&
              !contact.pending &&
              !contact.online && (
                <button
                  disabled={connection !== 'online'}
                  onClick={onReactivate}>
                  Riattiva
                </button>
              )}
            <button className="danger remove" onClick={onRemove}>
              Rimuovi
            </button>
          </div>
          <div className="messages">
            {contact.messages.length === 0 && (
              <p className="empty">La Conversazione è vuota.</p>
            )}
            {contact.messages.map(message => (
              <article
                key={message.id}
                className={`message ${message.direction}`}>
                <p>{message.text}</p>
                <time>
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </article>
            ))}
            <div ref={messagesEnd} />
          </div>
          <EmojiComposer
            key={contact.tacitusId}
            value={contact.draft}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={
              contact.secure
                ? 'Scrivi un messaggio'
                : 'Il Contatto deve essere online'
            }
            disabled={!contact.secure}
            theme={theme}
            onChange={onDraftChanged}
            onSend={onSend}
          />
        </>
      )}
    </section>
  );
};

export default Conversation;
