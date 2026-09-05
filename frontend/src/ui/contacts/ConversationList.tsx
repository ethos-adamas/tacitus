import { useState } from 'react';
import { useElencoConversazioni } from '../../application/hooks/useElencoConversazioni';
import { useRelazioni } from '../../application/hooks/useRelazioni';
import { useSelector } from '../../application/store/hooks';
import {
  selectIdentitaBloccate,
  type VoceElencoConversazioni,
} from '../../application/store/selectors';
import type { StatoContatto } from '../../domain/relazioni';
import type { TacitusId } from '../../domain/tacitusId';
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
      <span className="avatar">?</span>
      <span>
        <strong>Intento di contatto</strong>
        <small>In attesa del Contatto</small>
        <code>{tacitusId}</code>
      </span>
      <button type="button" onClick={cancel} aria-label="Annulla Intento">
        ×
      </button>
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
    <button className={`contact ${attiva ? 'selected' : ''}`} onClick={select}>
      <span className="avatar">{nickname[0].toUpperCase()}</span>
      <span>
        <strong>{nickname}</strong>
        <small>{statusLabel[stato]}</small>
        {fotoInAttesa && <small>Foto da accettare</small>}
      </span>
      {nonLetti > 0 && <b className="unread">{nonLetti}</b>}
    </button>
  );
};

type BlockedRowProps = { tacitusId: TacitusId };

const BlockedRow = ({ tacitusId }: BlockedRowProps) => {
  const { sbloccaContatto } = useRelazioni();
  const unblock = () => sbloccaContatto(tacitusId);
  return (
    <div className="contact blocked-contact">
      <span className="avatar">×</span>
      <span>
        <strong>Identità bloccata</strong>
        <code>{tacitusId}</code>
      </span>
      <button type="button" onClick={unblock} aria-label="Sblocca">
        Sblocca
      </button>
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
    <aside>
      <div className="panel-title">
        <h1>Conversazioni</h1>
        <button className="add" onClick={openDialog}>
          +
        </button>
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
      <AddContactDialog open={dialogOpen} onClose={closeDialog} />
    </aside>
  );
};

export default ConversationList;
