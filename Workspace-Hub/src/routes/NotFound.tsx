import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useDocumentMeta } from '../lib/meta';

/**
 * A 404 INSIDE the authenticated shell.
 *
 * The top-level catch-all used to send any unmatched path — a stale
 * /app/... bookmark included — to the public landing page, which reads as
 * "you have been logged out" rather than "that page has moved".
 */
export const NotFound: React.FC = () => {
  useDocumentMeta({ title: 'Page not found' });

  const location = useLocation();

  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <Compass className="w-10 h-10 text-sand-400" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold text-primary">There's nothing at this address</h1>
      <p className="mt-2 max-w-md text-sm text-secondary">
        <code className="rounded bg-muted px-1.5 py-0.5 text-primary">{location.pathname}</code>{' '}
        isn't a page in this workspace. It may have been renamed, or the link may be out of date.
      </p>
      <Link
        to="/app"
        className="mt-6 rounded-lg bg-sand-900 px-4 py-2 text-sm font-medium text-white hover:bg-sand-800"
      >
        Go to your inbox
      </Link>
    </div>
  );
};
