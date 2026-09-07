import { useState } from 'react';
import { useRelazioni } from '../../application/hooks/useRelazioni';
import { useSelector } from '../../application/store/hooks';
import type { TacitusId } from '../../domain/tacitusId';
import { Button } from '../kit/Button';
import { ConfirmDialog } from '../kit/ConfirmDialog';
import { Modal } from '../kit/Modal';
import { AlbumConsent } from '../conversation/Album';

type ContactSettingsDialogProps = {
  tacitusId: TacitusId;
  nickname: string;
};

const ContactSettingsDialog = ({
  nickname,
  tacitusId,
}: ContactSettingsDialogProps) => {
  const [open, setOpen] = useState(false);
  const { bloccaContatto, rimuoviContatto } = useRelazioni();
  const ricezioneGlobale = useSelector(
    state => state.album.preferenze.abilitate,
  );
  const error = useSelector(state => state.feedback.errore);

  const removeContact = () => rimuoviContatto(tacitusId);
  const blockContact = () => bloccaContatto(tacitusId);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button
          type="button"
          variant="ghost"
          className="contact-settings-trigger"
          aria-label="Impostazioni del Contatto">
          ⚙
        </Button>
      }
      title="Impostazioni del Contatto">
      <div className="contact-identity">
        <strong>{nickname}</strong>
        <code>{tacitusId}</code>
      </div>
      <AlbumConsent tacitusId={tacitusId} />
      <p>Le modifiche ai consensi si applicano subito.</p>
      {!ricezioneGlobale && (
        <p role="status">
          La ricezione di foto e album è disattivata nelle impostazioni
          generali.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <section className="contact-management">
        <h3>Gestione del Contatto</h3>
        <ConfirmDialog
          trigger={<Button variant="danger">Rimuovi Contatto</Button>}
          title="Rimuovere il Contatto?"
          description={`Rimuovere ${nickname} e cancellare la Conversazione e gli Album locali?`}
          confirmLabel="Rimuovi definitivamente"
          onConfirm={removeContact}
        />
        <ConfirmDialog
          trigger={<Button variant="danger">Blocca Contatto</Button>}
          title="Bloccare il Contatto?"
          description={`Bloccare ${nickname} e cancellare la Conversazione e gli Album locali?`}
          confirmLabel="Blocca definitivamente"
          onConfirm={blockContact}
        />
      </section>
    </Modal>
  );
};

export default ContactSettingsDialog;
