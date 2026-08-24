import { useEffect, useRef } from 'react';
import { useConversazioneAttiva } from '../../application/hooks/useConversazioneAttiva';
import { useRelazioni } from '../../application/hooks/useRelazioni';
import { useScambioMessaggi } from '../../application/hooks/useScambioMessaggi';
import { useSessioniSicure } from '../../application/hooks/useSessioniSicure';
import { useSelector } from '../../application/store/hooks';
import type { Conversazione as ConversazioneModel } from '../../domain/conversazioni';
import { MAX_MESSAGE_LENGTH, type Messaggio } from '../../domain/messaggi';
import type { Contatto, Relazione } from '../../domain/relazioni';
import EmojiComposer from '../emoji/EmojiComposer';

type MessageProps = { message: Messaggio };

const Message = ({ message }: MessageProps) => (
  <article
    className={`message ${message.direzione === 'ricevuto' ? 'incoming' : 'outgoing'}`}>
    <p>{message.testo}</p>
    <time>
      {new Date(message.creatoIl).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}
    </time>
  </article>
);

type ConversationContentProps = {
  contact: Contatto;
  conversation: ConversazioneModel;
  contactIntentPending: boolean;
  relationship: Relazione;
  onBack: () => void;
};

const ConversationContent = ({
  contact,
  contactIntentPending,
  conversation,
  relationship,
  onBack,
}: ConversationContentProps) => {
  const connection = useSelector(state => state.connessioneRelay);
  const theme = useSelector(state => state.tema);
  const secureSession = useSessioniSicure(contact.tacitusId);
  const { bloccaContatto, riattiva, rimuoviContatto } = useRelazioni();
  const { aggiornaBozza, invia } = useScambioMessaggi(contact.tacitusId);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const reactivate = () => riattiva(contact.tacitusId);

  const remove = () => {
    if (confirm(`Rimuovere ${contact.nickname} e la Conversazione locale?`)) {
      rimuoviContatto(contact.tacitusId);
    }
  };

  const block = () => {
    if (confirm(`Bloccare ${contact.nickname} e rimuovere la Conversazione?`)) {
      bloccaContatto(contact.tacitusId);
    }
  };

  useEffect(() => {
    messagesEnd.current?.scrollIntoView();
  }, [conversation.messaggi]);

  return (
    <>
      <div className="conversation-title">
        <button className="back" onClick={onBack}>
          ←
        </button>
        <span className="avatar">{contact.nickname[0].toUpperCase()}</span>
        <div>
          <h2>{contact.nickname}</h2>
          <code>{contact.tacitusId}</code>
        </div>
        {relationship.stato === 'da-riattivare' && !contactIntentPending && (
          <button disabled={connection !== 'online'} onClick={reactivate}>
            Riattiva
          </button>
        )}
        <button className="danger remove" onClick={remove}>
          Rimuovi
        </button>
        <button className="danger" onClick={block}>
          Blocca
        </button>
      </div>
      <div className="messages">
        {conversation.messaggi.length === 0 && (
          <p className="empty">La Conversazione è vuota.</p>
        )}
        {conversation.messaggi.map(message => (
          <Message key={message.id} message={message} />
        ))}
        <div ref={messagesEnd} />
      </div>
      <EmojiComposer
        key={contact.tacitusId}
        value={conversation.bozza}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder={
          secureSession === 'pronta'
            ? 'Scrivi un messaggio'
            : 'Il Contatto deve essere online'
        }
        disabled={secureSession !== 'pronta'}
        theme={theme}
        onChange={aggiornaBozza}
        onSend={invia}
      />
    </>
  );
};

const Conversation = () => {
  const { chiudi, conversazioneAttiva } = useConversazioneAttiva();

  return (
    <section className="conversation">
      {conversazioneAttiva ? (
        <ConversationContent
          contact={conversazioneAttiva.contatto}
          contactIntentPending={conversazioneAttiva.intentoInCorso}
          conversation={conversazioneAttiva.conversazione}
          relationship={conversazioneAttiva.relazione}
          onBack={chiudi}
        />
      ) : (
        <p className="empty">Scegli una Conversazione.</p>
      )}
    </section>
  );
};

export default Conversation;
