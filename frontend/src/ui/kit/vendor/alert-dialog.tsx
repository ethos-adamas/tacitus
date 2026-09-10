import * as AlertDialogPrimitive from 'radix-ui';
import { forwardRef } from 'react';
import { cn } from '../classNames';

export const AlertDialog = AlertDialogPrimitive.AlertDialog.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.AlertDialog.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.AlertDialog.Portal;

export const AlertDialogOverlay = forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.AlertDialog.Overlay>,
  React.ComponentPropsWithoutRef<
    typeof AlertDialogPrimitive.AlertDialog.Overlay
  >
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.AlertDialog.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-[60] bg-[var(--backdrop)] backdrop-blur-sm',
      className,
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName =
  AlertDialogPrimitive.AlertDialog.Overlay.displayName;

export const AlertDialogContent = forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.AlertDialog.Content>,
  React.ComponentPropsWithoutRef<
    typeof AlertDialogPrimitive.AlertDialog.Content
  >
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.AlertDialog.Content
    ref={ref}
    className={cn(
      'fixed left-1/2 top-1/2 z-[60] grid max-h-[calc(100dvh-2rem)] w-[min(500px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl focus:outline-none sm:p-6',
      className,
    )}
    {...props}
  />
));
AlertDialogContent.displayName =
  AlertDialogPrimitive.AlertDialog.Content.displayName;

export const AlertDialogTitle = AlertDialogPrimitive.AlertDialog.Title;
export const AlertDialogDescription =
  AlertDialogPrimitive.AlertDialog.Description;
export const AlertDialogCancel = AlertDialogPrimitive.AlertDialog.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.AlertDialog.Action;
