import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent dark:focus:ring-white border-slate-200 dark:border-slate-800 dark:text-white ${
            error ? 'border-rose-500 focus:ring-rose-500' : ''
          } ${className}`}
          {...props}
        />
        {error && (
          <span className="text-xs text-rose-500 animate-fade-in">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
