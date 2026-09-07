import { forwardRef, type ComponentProps } from 'react';
import { cn } from '../classNames';

export const Input = forwardRef<HTMLInputElement, ComponentProps<'input'>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'min-h-11 w-full rounded-md border border-input bg-[var(--input)] px-3 py-2 text-foreground focus-visible:outline-3',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
