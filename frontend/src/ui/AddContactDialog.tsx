import { useEffect, useRef, type FormEvent } from 'react';

type AddContactDialogProps = {
  code: string;
  open: boolean;
  onClose: () => void;
  onCodeChanged: (code: string) => void;
  onSubmit: (event: FormEvent) => void;
};

const AddContactDialog = ({
  code,
  open,
  onClose,
  onCodeChanged,
  onSubmit,
}: AddContactDialogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open && !dialogRef.current?.open) dialogRef.current?.showModal();
    if (!open && dialogRef.current?.open) dialogRef.current.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="dialog-title">
          <h2>Aggiungi Contatto</h2>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <p>
          Entrambe le Identità devono essere online e inserire reciprocamente il
          codice.
        </p>
        <label>
          Tacitus ID
          <input
            value={code}
            onChange={({ target }) => onCodeChanged(target.value)}
            placeholder="00000-00000-00000-00000-000000"
            required
            autoFocus
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Annulla
          </button>
          <button className="primary">Aggiungi</button>
        </div>
      </form>
    </dialog>
  );
};

export default AddContactDialog;
