import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';

import { describeError } from '../../services/errors';

/**
 * "I could not load this" — which is NOT the same as "there is nothing here".
 *
 * Every silent catch that reset a list to [] was telling the user the second
 * thing while meaning the first.
 */
export const ErrorState: React.FC<{
  title?: string;
  error: unknown;
  onRetry?: () => void;
}> = ({ title = "This didn't load", error, onRetry }) => (
  <div
    role="alert"
    className="flex flex-col items-start gap-3 rounded-lg border border-error/25 bg-error-muted p-6"
  >
    <div className="flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 text-error" aria-hidden="true" />
      <h3 className="font-heading font-semibold text-error">{title}</h3>
    </div>
    <p className="text-sm text-primary">{describeError(error)}</p>
    {onRetry ? <Button label="Try again" variant="secondary" clickAction={onRetry} /> : null}
  </div>
);
