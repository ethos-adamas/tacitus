import { useRef, useState, type ReactElement } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './vendor/alert-dialog';
import { Button } from './Button';

type ConfirmDialogProps = {
  trigger: ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
};

export const ConfirmDialog = ({
  confirmLabel,
  description,
  onConfirm,
  title,
  trigger,
}: ConfirmDialogProps) => {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);

  const changeOpen = (nextOpen: boolean) => {
    if (!pending) {
      setOpen(nextOpen);
      if (nextOpen) setError(undefined);
    }
  };

  const confirm = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    try {
      await onConfirm();
      setOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Operazione non riuscita.',
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const focusCancel = (event: Event) => {
    event.preventDefault();
    cancelRef.current?.focus();
  };

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogPortal>
        <AlertDialogOverlay />
        <AlertDialogContent onOpenAutoFocus={focusCancel}>
          <AlertDialogTitle className="alert-dialog-title">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="alert-dialog-description">
            {description}
          </AlertDialogDescription>
          {error && <p role="alert">{error}</p>}
          <div className="dialog-actions">
            <AlertDialogCancel asChild>
              <Button ref={cancelRef} disabled={pending}>
                Annulla
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="danger" disabled={pending} onClick={confirm}>
                {confirmLabel}
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
};
