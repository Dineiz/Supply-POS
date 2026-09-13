import { type InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={
          "h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink " +
          "placeholder:text-ink-faint focus:outline-2 focus:outline-offset-2 focus:outline-accent " +
          className
        }
        {...props}
      />
    );
  }
);
