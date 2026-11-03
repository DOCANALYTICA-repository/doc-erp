import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * A form-level failure, shown above the submit button.
 *
 * For everything that is not a field's fault: a permission refusal, a
 * conflict, a dropped connection. Previously these were toasts, which is
 * defensible — but a toast that appears while the user is looking at the
 * bottom of a long form is easy to miss, and it is gone by the time they
 * scroll back up to try again.
 *
 * `role="alert"` so it is announced when it appears.
 */
export const FormError: React.FC<{ message?: string }> = ({ message }) => {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-error/25 bg-error-muted px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" aria-hidden="true" />
      <p className="text-sm text-primary">{message}</p>
    </div>
  );
};
