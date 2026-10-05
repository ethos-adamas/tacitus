import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useRelazioni } from '../../application/hooks/useRelazioni';
import { erroreMostrato } from '../../application/store/feedbackSlice';
import { useDispatch } from '../../application/store/hooks';
import { Button } from '../kit/Button';
import { TextInput } from '../kit/Fields';
import { Modal } from '../kit/Modal';

type AddContactDialogProps = {
  open: boolean;
  onClose: () => void;
  trigger: ReactElement;
};

const AddContactDialog = ({
  open,
  onClose,
  trigger,
}: AddContactDialogProps) => {
  const dispatch = useDispatch();
  const { creaIntento } = useRelazioni();
  const [tacitusIdInserito, setTacitusIdInserito] = useState('');
  const [submitError, setSubmitError] = useState<string>();

  const changeTacitusId = (event: ChangeEvent<HTMLInputElement>) => {
    setTacitusIdInserito(event.target.value);
  };

  const close = () => {
    setTacitusIdInserito('');
    setSubmitError(undefined);
    onClose();
  };

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) close();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      creaIntento(tacitusIdInserito);
      close();
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'Tacitus ID non valido.';
      setSubmitError(message);
      dispatch(erroreMostrato(message));
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={changeOpen}
      trigger={trigger}
      title="Aggiungi Contatto"
      description="Entrambe le Identità devono essere online e inserire reciprocamente il Tacitus ID. Puoi avere al massimo 5 Intenti in attesa."
      footer={
        <div className="dialog-actions">
          <Button type="button" onClick={close}>
            Annulla
          </Button>
          <Button type="submit" form="add-contact-form" variant="primary">
            Aggiungi
          </Button>
        </div>
      }>
      <form id="add-contact-form" onSubmit={submit}>
        <label className="field-label">
          Tacitus ID
          <TextInput
            value={tacitusIdInserito}
            onChange={changeTacitusId}
            placeholder="00000-00000-00000-00000-000000"
            required
            autoFocus
          />
        </label>
        {submitError && <p role="alert">{submitError}</p>}
      </form>
    </Modal>
  );
};

export default AddContactDialog;
