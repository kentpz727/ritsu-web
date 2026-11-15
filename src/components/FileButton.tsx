import { useRef, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from 'react';

type FileButtonProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'hidden'> & {
  className?: string;
  children: ReactNode;
};

/**
 * A real button that opens the file picker. Native <label> + hidden input looks
 * like a button but cannot be reached with the keyboard (P-05).
 */
export function FileButton({ className = 'btn', children, onChange, ...inputProps }: FileButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange?.(e);
    // Allow picking the same file again.
    e.target.value = '';
  }

  return (
    <>
      <button type="button" className={className} onClick={() => inputRef.current?.click()}>
        {children}
      </button>
      <input ref={inputRef} type="file" hidden {...inputProps} onChange={handleChange} />
    </>
  );
}
