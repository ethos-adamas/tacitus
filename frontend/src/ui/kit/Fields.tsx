import { Checkbox } from 'radix-ui';
import { forwardRef, useId, type ComponentProps, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from './classNames';
import { Input } from './vendor/input';

export const TextInput = forwardRef<HTMLInputElement, ComponentProps<'input'>>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={className} {...props} />
  ),
);
TextInput.displayName = 'TextInput';

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  ComponentProps<'textarea'>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-11 w-full rounded-md border border-input bg-[var(--input)] px-3 py-2 text-foreground focus-visible:outline-3',
      className,
    )}
    {...props}
  />
));
TextArea.displayName = 'TextArea';

type SelectFieldProps = ComponentProps<'select'> & {
  label?: string;
  children: ReactNode;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ children, className, label, ...props }, ref) => (
    <label className="field-label">
      {label}
      <select
        ref={ref}
        className={cn(
          'min-h-11 w-full rounded-md border border-input bg-[var(--input)] px-3 py-2 text-foreground focus-visible:outline-3',
          className,
        )}
        {...props}>
        {children}
      </select>
    </label>
  ),
);
SelectField.displayName = 'SelectField';

type CheckboxFieldProps = {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
};

export const CheckboxField = ({
  checked,
  disabled,
  id: providedId,
  label,
  onCheckedChange,
}: CheckboxFieldProps) => {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const change = (value: boolean | 'indeterminate') => {
    if (value !== 'indeterminate') onCheckedChange(value);
  };
  return (
    <label className="checkbox-field" htmlFor={id}>
      <Checkbox.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={change}
        className="checkbox-control">
        <Checkbox.Indicator>
          <Check aria-hidden="true" size={16} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span>{label}</span>
    </label>
  );
};
