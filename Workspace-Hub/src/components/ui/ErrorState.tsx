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
    className="flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-6"
  >
    <div className="flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden="true" />
      <h3 className="font-semibold text-rose-900">{title}</h3>
    </div>
    <p className="text-sm text-rose-800">{describeError(error)}</p>
    {onRetry ? <Button label="Try again" variant="secondary" clickAction={onRetry} /> : null}
  </div>
);
