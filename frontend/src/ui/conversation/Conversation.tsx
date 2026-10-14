import { AlbumGallery } from './Album';
import { ArrowLeft } from 'lucide-react';
import type { TacitusId } from '../../domain/tacitusId';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversazioneAttiva } from '../../application/hooks/useConversazioneAttiva';
import { useRelazioni } from '../../application/hooks/useRelazioni';
import { useScambioMessaggi } from '../../application/hooks/useScambioMessaggi';
import { useSessioniSicure } from '../../application/hooks/useSessioniSicure';
import { useSelector } from '../../application/store/hooks';
import { selectStatoContatto } from '../../application/store/selectors';
import type { Conversazione as ConversazioneModel } from '../../domain/conversazioni';
import { MAX_MESSAGE_LENGTH, type Messaggio } from '../../domain/messaggi';
import type { Contatto, Relazione } from '../../domain/relazioni';
import ContactSettingsDialog from '../contacts/ContactSettingsDialog';
import { Button } from '../kit/Button';
import PhotoViewer, { type Photo } from '../kit/PhotoViewer';
import MessageComposer from './MessageComposer';

type MessageProps = {
  message: Messaggio;
  tacitusId: TacitusId;
  showTimestamp: boolean;
  onAlbumLoaded: (id: string, images: readonly string[]) => void;
  onOpenPhoto: (albumId: string, index: number) => void;
};

const Message = ({
  message,
  onAlbumLoaded,
  onOpenPhoto,
  showTimestamp,
  tacitusId,
}: MessageProps) => (
  <article
    className={`message ${message.direzione === 'ricevuto' ? 'incoming' : 'outgoing'}`}>
    {message.album ? (
      <AlbumGallery
        key={`${tacitusId}-${message.album.id}`}
        tacitusId={tacitusId}
        id={message.album.id}
        onLoaded={onAlbumLoaded}
        onOpen={onOpenPhoto}
      />
    ) : (
      <p>{message.testo}</p>
    )}
    {showTimestamp && (
      <time dateTime={new Date(message.creatoIl).toISOString()}>
        {new Date(message.creatoIl).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}
      </time>
    )}
  </article>
);

type AlbumPhoto = Photo & Readonly<{ albumId: string; index: number }>;

type PhotoSelection = Readonly<{ albumId: string; index: number }>;

const albumPhotos = (
  messages: readonly Messaggio[],
  albums: Readonly<Record<string, readonly string[]>>,
): AlbumPhoto[] =>
  messages.flatMap(message => {
    const album = message.album;
    if (!album) return [];
    return (albums[album.id] ?? []).map((src, index) => ({
      albumId: album.id,
      index,
      src,
      alt: `Foto ${index + 1}`,
      downloadName: `foto-${index + 1}.webp`,
    }));
  });

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
  const contactState = useSelector(state =>
    selectStatoContatto(state, contact.tacitusId),
  );
  const status =
    contactState === 'sessione-sicura'
      ? 'Online'
      : contactState === 'offline'
        ? 'Offline'
        : contactState === 'negoziazione'
          ? 'Connessione sicura…'
          : contactState === 'in-attesa'
            ? 'In attesa del Contatto'
            : 'Riattivazione necessaria';
  const { riattiva } = useRelazioni();
  const { aggiornaBozza, invia } = useScambioMessaggi(contact.tacitusId);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const [albums, setAlbums] = useState<
    Readonly<Record<string, readonly string[]>>
  >({});
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoSelection>();
  const photos = albumPhotos(conversation.messaggi, albums);
  const selectedIndex = selectedPhoto
    ? photos.findIndex(
        photo =>
          photo.albumId === selectedPhoto.albumId &&
          photo.index === selectedPhoto.index,
      )
    : -1;

  const reactivate = () => riattiva(contact.tacitusId);
  const rememberAlbum = useCallback(
    (id: string, images: readonly string[]) =>
      setAlbums(current => ({ ...current, [id]: images })),
    [],
  );
  const openPhoto = useCallback(
    (albumId: string, index: number) => setSelectedPhoto({ albumId, index }),
    [],
  );
  const showPhoto = (index: number) => setSelectedPhoto(photos[index]);
  const closePhoto = () => setSelectedPhoto(undefined);

  useEffect(() => {
    const history = messagesEnd.current?.parentElement;
    if (history) history.scrollTop = history.scrollHeight;
  }, [conversation.messaggi]);

  return (
    <>
      <div className="conversation-title">
        <Button
          variant="ghost"
          className="back icon-button"
          onClick={onBack}
          aria-label="Torna alle Conversazioni">
          <ArrowLeft size={22} aria-hidden="true" />
        </Button>
        <span className="avatar" aria-hidden="true">
          {contact.nickname[0].toUpperCase()}
        </span>
        <div className="conversation-heading">
          <h2>{contact.nickname}</h2>
          <small className={`contact-state ${contactState}`}>{status}</small>
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
        {conversation.messaggi.map((message, index) => (
          <Message
            key={message.id}
            message={message}
            tacitusId={contact.tacitusId}
            showTimestamp={
              conversation.messaggi[index + 1]?.direzione !== message.direzione
            }
            onAlbumLoaded={rememberAlbum}
            onOpenPhoto={openPhoto}
          />
        ))}
        <div ref={messagesEnd} />
      </div>
      <PhotoViewer
        photos={photos}
        index={selectedIndex === -1 ? undefined : selectedIndex}
        onIndexChange={showPhoto}
        onClose={closePhoto}
      />
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
          key={conversazioneAttiva.contatto.tacitusId}
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
