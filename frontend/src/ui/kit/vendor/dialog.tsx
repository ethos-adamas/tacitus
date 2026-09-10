import * as DialogPrimitive from 'radix-ui';
import { forwardRef, type ComponentProps } from 'react';
import { cn } from '../classNames';

export const Dialog = DialogPrimitive.Dialog.Root;

export const DialogTrigger = DialogPrimitive.Dialog.Trigger;

export const DialogPortal = DialogPrimitive.Dialog.Portal;

export const DialogOverlay = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Dialog.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Dialog.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Dialog.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-[var(--backdrop)] backdrop-blur-sm',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Dialog.Overlay.displayName;

export const DialogContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Dialog.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Dialog.Content>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Dialog.Content
    ref={ref}
    className={cn(
      'fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[min(500px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl focus:outline-none sm:p-6',
      className,
    )}
    {...props}
  />
));
DialogContent.displayName = DialogPrimitive.Dialog.Content.displayName;

export const DialogTitle = DialogPrimitive.Dialog.Title;
export const DialogDescription = DialogPrimitive.Dialog.Description;
export const DialogClose = DialogPrimitive.Dialog.Close;

export const DialogHeader = ({
  className,
  ...props
}: ComponentProps<'div'>) => (
  <div className={cn('dialog-title', className)} {...props} />
);

export const DialogFooter = ({
  className,
  ...props
}: ComponentProps<'div'>) => (
  <div className={cn('dialog-actions', className)} {...props} />
);
