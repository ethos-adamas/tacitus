import { Slot } from 'radix-ui';
import { forwardRef, type ComponentProps, type ElementRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../classNames';

const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'border-primary bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'border-input bg-background text-foreground hover:bg-accent',
        danger:
          'border-destructive bg-background text-destructive hover:bg-accent',
        ghost:
          'border-transparent bg-transparent text-foreground hover:bg-accent',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = forwardRef<ElementRef<'button'>, ButtonProps>(
  ({ asChild = false, className, type = 'button', variant, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant }), className)}
        ref={ref}
        {...(asChild ? props : { ...props, type })}
      />
    );
  },
);
Button.displayName = 'Button';
