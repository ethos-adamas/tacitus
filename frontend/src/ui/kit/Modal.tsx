import type { ReactElement, ReactNode } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './vendor/dialog';
import { Button } from './Button';

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'standard' | 'image';
};

export const Modal = ({
  children,
  description,
  footer,
  onOpenChange,
  open,
  size = 'standard',
  title,
  trigger,
}: ModalProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    <DialogPortal>
      <DialogOverlay />
      <DialogContent className={size === 'image' ? 'modal-image' : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" aria-label="Chiudi">
              ×
            </Button>
          </DialogClose>
        </DialogHeader>
        {description && (
          <DialogDescription className="modal-description">
            {description}
          </DialogDescription>
        )}
        <div className="modal-body">{children}</div>
        {footer ?? (
          <DialogFooter>
            <DialogClose asChild>
              <Button>Chiudi</Button>
            </DialogClose>
          </DialogFooter>
        )}
      </DialogContent>
    </DialogPortal>
  </Dialog>
);
