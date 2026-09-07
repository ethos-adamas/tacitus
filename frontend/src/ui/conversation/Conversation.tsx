import { AlbumGallery } from './Album';
import type { TacitusId } from '../../domain/tacitusId';
import { useEffect, useRef } from 'react';
import { useConversazioneAttiva } from '../../application/hooks/useConversazioneAttiva';
import { useRelazioni } from '../../application/hooks/useRelazioni';
import { useScambioMessaggi } from '../../application/hooks/useScambioMessaggi';
import { useSessioniSicure } from '../../application/hooks/useSessioniSicure';
import { useSelector } from '../../application/store/hooks';
import type { Conversazione as ConversazioneModel } from '../../domain/conversazioni';
import { MAX_MESSAGE_LENGTH, type Messaggio } from '../../domain/messaggi';
import type { Contatto, Relazione } from '../../domain/relazioni';
import ContactSettingsDialog from '../contacts/ContactSettingsDialog';
import { Button } from '../kit/Button';
import MessageComposer from './MessageComposer';

type MessageProps = { message: Messaggio; tacitusId: TacitusId };

const Message = ({ message, tacitusId }: MessageProps) => (
  <article
    className={`message ${message.direzione === 'ricevuto' ? 'incoming' : 'outgoing'}`}>
    {message.album ? (
      <AlbumGallery
        key={`${tacitusId}-${message.album.id}`}
        tacitusId={tacitusId}
        id={message.album.id}
      />
    ) : (
      <p>{message.testo}</p>
    )}
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
  const theme = useSelector(state => state.tema.effettivo);
  const secureSession = useSessioniSicure(contact.tacitusId);
  const { riattiva } = useRelazioni();
  const { aggiornaBozza, invia } = useScambioMessaggi(contact.tacitusId);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const reactivate = () => riattiva(contact.tacitusId);

  useEffect(() => {
    const history = messagesEnd.current?.parentElement;
    if (history) history.scrollTop = history.scrollHeight;
  }, [conversation.messaggi]);

  return (
    <>
      <div className="conversation-title">
        <Button variant="ghost" className="back" onClick={onBack}>
          ←
        </Button>
        <span className="avatar">{contact.nickname[0].toUpperCase()}</span>
        <div>
          <h2>{contact.nickname}</h2>
          <code>{contact.tacitusId}</code>
        </div>
        {relationship.stato === 'da-riattivare' && !contactIntentPending && (
          <Button disabled={connection !== 'online'} onClick={reactivate}>
            Riattiva
          </Button>
        )}
        <ContactSettingsDialog
          key={contact.tacitusId}
          tacitusId={contact.tacitusId}
          nickname={contact.nickname}
        />
      </div>
      <div className="messages">
        {conversation.messaggi.length === 0 && (
          <p className="empty">La Conversazione è vuota.</p>
        )}
        {conversation.messaggi.map(message => (
          <Message
            key={message.id}
            message={message}
            tacitusId={contact.tacitusId}
          />
        ))}
        <div ref={messagesEnd} />
      </div>
      <div className="conversation-composer">
        <MessageComposer
          key={contact.tacitusId}
          tacitusId={contact.tacitusId}
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
      </div>
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
