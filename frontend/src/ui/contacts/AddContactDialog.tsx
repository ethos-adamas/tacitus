import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useRelazioni } from '../../application/hooks/useRelazioni';
import { erroreMostrato } from '../../application/store/feedbackSlice';
import { useDispatch } from '../../application/store/hooks';

type AddContactDialogProps = {
  open: boolean;
  onClose: () => void;
};

const AddContactDialog = ({ open, onClose }: AddContactDialogProps) => {
  const dispatch = useDispatch();
  const { creaIntento } = useRelazioni();
  const [tacitusIdInserito, setTacitusIdInserito] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  const changeTacitusId = (event: ChangeEvent<HTMLInputElement>) => {
    setTacitusIdInserito(event.target.value);
  };

  const close = () => {
    setTacitusIdInserito('');
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      creaIntento(tacitusIdInserito);
      close();
    } catch (reason) {
      dispatch(
        erroreMostrato(
          reason instanceof Error ? reason.message : 'Tacitus ID non valido.',
        ),
      );
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} onClose={close}>
      <form onSubmit={submit}>
        <div className="dialog-title">
          <h2>Aggiungi Contatto</h2>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <p>
          Entrambe le Identità devono essere online e inserire reciprocamente il
          Tacitus ID.
        </p>
        <label>
          Tacitus ID
          <input
            value={tacitusIdInserito}
            onChange={changeTacitusId}
            placeholder="00000-00000-00000-00000-000000"
            required
            autoFocus
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Annulla
          </button>
          <button className="primary">Aggiungi</button>
        </div>
      </form>
    </dialog>
  );
};

export default AddContactDialog;
