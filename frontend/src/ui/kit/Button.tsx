import { forwardRef, type ComponentProps } from 'react';
import { cn } from './classNames';

export { Button } from './vendor/button';

export const DownloadLink = forwardRef<HTMLAnchorElement, ComponentProps<'a'>>(
  ({ className, ...props }, ref) => (
    <a
      ref={ref}
      className={cn(
        'download-link inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2',
        className,
      )}
      {...props}
    />
  ),
);
DownloadLink.displayName = 'DownloadLink';
