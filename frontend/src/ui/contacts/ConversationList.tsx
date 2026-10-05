import { useState } from 'react';
import { Plus, ShieldBan, UserRound, X } from 'lucide-react';
import { useElencoConversazioni } from '../../application/hooks/useElencoConversazioni';
import { useRelazioni } from '../../application/hooks/useRelazioni';
import { useSelector } from '../../application/store/hooks';
import {
  selectIdentitaBloccate,
  type VoceElencoConversazioni,
} from '../../application/store/selectors';
import type { StatoContatto } from '../../domain/relazioni';
import type { TacitusId } from '../../domain/tacitusId';
import { Button } from '../kit/Button';
import AddContactDialog from './AddContactDialog';

const statusLabel: Record<StatoContatto, string> = {
  'in-attesa': 'In attesa del Contatto',
  offline: 'Offline',
  negoziazione: 'Negoziazione…',
  'riattivazione-necessaria': 'Riattivazione necessaria',
  'sessione-sicura': 'Sessione sicura',
};

type IntentRowProps = {
  tacitusId: TacitusId;
};

const IntentRow = ({ tacitusId }: IntentRowProps) => {
  const { annullaIntento } = useRelazioni();
  const cancel = () => annullaIntento(tacitusId);
  return (
    <div className="contact">
      <span className="avatar" aria-hidden="true">
        <UserRound size={22} />
      </span>
      <span>
        <strong>Intento di contatto</strong>
        <small>In attesa del Contatto</small>
        <code>{tacitusId}</code>
      </span>
      <Button
        type="button"
        variant="ghost"
        className="icon-button"
        onClick={cancel}
        aria-label="Annulla Intento">
        <X size={20} aria-hidden="true" />
      </Button>
    </div>
  );
};

type ConversationRowProps = Extract<
  VoceElencoConversazioni,
  { tipo: 'conversazione' }
> & {
  onSelect: (tacitusId: TacitusId) => void;
};

const ConversationRow = ({
  attiva,
  nickname,
  nonLetti,
  onSelect,
  stato,
  tacitusId,
}: ConversationRowProps) => {
  const fotoInAttesa = useSelector(state => !!state.album.offerte[tacitusId]);
  const select = () => onSelect(tacitusId);
  return (
    <Button
      type="button"
      variant="ghost"
      className={`!grid contact ${stato} ${attiva ? 'selected' : ''}`}
      aria-current={attiva ? 'true' : undefined}
      onClick={select}>
      <span className="avatar" aria-hidden="true">
        {nickname[0].toUpperCase()}
      </span>
      <span>
        <strong>{nickname}</strong>
        <small className={`contact-state ${stato}`}>{statusLabel[stato]}</small>
        {fotoInAttesa && <small>Foto da accettare</small>}
      </span>
      {nonLetti > 0 && <b className="unread">{nonLetti}</b>}
    </Button>
  );
};

type BlockedRowProps = { tacitusId: TacitusId };

const BlockedRow = ({ tacitusId }: BlockedRowProps) => {
  const { sbloccaContatto } = useRelazioni();
  const unblock = () => sbloccaContatto(tacitusId);
  return (
    <div className="contact blocked-contact">
      <span className="avatar" aria-hidden="true">
        <ShieldBan size={22} />
      </span>
      <span>
        <strong>Identità bloccata</strong>
        <code>{tacitusId}</code>
      </span>
      <Button type="button" onClick={unblock} aria-label="Sblocca">
        Sblocca
      </Button>
    </div>
  );
};

const ConversationList = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { seleziona, voci } = useElencoConversazioni();
  const blocchi = useSelector(selectIdentitaBloccate);
  const openDialog = () => setDialogOpen(true);
  const closeDialog = () => setDialogOpen(false);

  return (
    <aside className="conversation-list" aria-label="Conversazioni">
      <div className="panel-title">
        <h1>Conversazioni</h1>
        <AddContactDialog
          open={dialogOpen}
          onClose={closeDialog}
          trigger={
            <Button
              className="add icon-button"
              variant="ghost"
              onClick={openDialog}
              aria-label="Aggiungi Contatto"
              title="Aggiungi Contatto">
              <Plus size={24} aria-hidden="true" />
            </Button>
          }
        />
      </div>
      {voci.length === 0 ? (
        <p className="empty">Aggiungi il Tacitus ID di una persona online.</p>
      ) : (
        voci.map(voce =>
          voce.tipo === 'intento' ? (
            <IntentRow key={voce.tacitusId} tacitusId={voce.tacitusId} />
          ) : (
            <ConversationRow
              key={voce.tacitusId}
              {...voce}
              onSelect={seleziona}
            />
          ),
        )
      )}
      {blocchi.length > 0 && (
        <section className="blocked-identities">
          <h2>Identità bloccate</h2>
          {blocchi.map(({ tacitusId }) => (
            <BlockedRow key={tacitusId} tacitusId={tacitusId} />
          ))}
        </section>
      )}
    </aside>
  );
};

export default ConversationList;
