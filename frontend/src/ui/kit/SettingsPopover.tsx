import { useState, type ReactElement, type ReactNode } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverPortal,
  PopoverTrigger,
} from './vendor/popover';

type SettingsPopoverProps = {
  trigger: ReactElement;
  children: ReactNode;
};

export const SettingsPopover = ({
  children,
  trigger,
}: SettingsPopoverProps) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverPortal>
        <PopoverContent align="end">
          <PopoverHeader className="settings-heading">
            Impostazioni
          </PopoverHeader>
          {children}
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
};
