import * as PopoverPrimitive from 'radix-ui';
import { forwardRef, type ComponentProps } from 'react';
import { cn } from '../classNames';

export const Popover = PopoverPrimitive.Popover.Root;
export const PopoverTrigger = PopoverPrimitive.Popover.Trigger;
export const PopoverPortal = PopoverPrimitive.Popover.Portal;

export const PopoverContent = forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Popover.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Popover.Content>
>(({ className, ...props }, ref) => (
  <PopoverPrimitive.Popover.Content
    ref={ref}
    className={cn(
      'z-50 w-[min(300px,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl outline-none',
      className,
    )}
    {...props}
  />
));
PopoverContent.displayName = PopoverPrimitive.Popover.Content.displayName;

export const PopoverClose = PopoverPrimitive.Popover.Close;

export const PopoverHeader = ({
  className,
  ...props
}: ComponentProps<'div'>) => (
  <div className={cn('mb-3 font-semibold', className)} {...props} />
);
