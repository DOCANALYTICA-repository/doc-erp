import React from 'react';
import { Inbox } from 'lucide-react';

/**
 * "There is nothing here" — said properly, and distinguished from
 * "I could not load this".
 *
 * The screens were full of bare grey sentences (`<div className="text-xs
 * text-slate-400">No documents yet.</div>`), and 21 of 24 catch handlers reset
 * to an empty array — so a failed request rendered the same "nothing here"
 * message as a genuinely empty list. That distinction is most of what makes an
 * application feel trustworthy, which is why `ErrorState` is a separate
 * component rather than a variant of this one.
 */
export const EmptyState: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}> = ({ title, description, action, icon: Icon = Inbox }) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
    <Icon className="h-7 w-7 text-slate-300" aria-hidden="true" />
    <p className="font-medium text-slate-900">{title}</p>
    {description ? <p className="max-w-sm text-sm text-slate-500">{description}</p> : null}
    {action ? <div className="mt-1">{action}</div> : null}
  </div>
);
