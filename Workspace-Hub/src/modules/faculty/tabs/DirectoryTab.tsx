import React from 'react';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Users } from 'lucide-react';

import { useDirectory } from '../../../api/hooks';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { STATUS_CLASSES } from '../../../components/ui/status';

export const DirectoryTab: React.FC = () => {
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  // Debounced: this used to issue a request per keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: faculty, isLoading, isError, error, refetch, isPlaceholderData } = useDirectory(debounced);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Faculty directory"
        action={
          <>
            <label className="sr-only" htmlFor="directory-search">Search the faculty directory</label>
            <input
              id="directory-search"
              type="search"
              placeholder="Search by name, designation or role…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-64 rounded-lg border border-border bg-body px-3 py-1.5 text-sm"
            />
          </>
        }
      />

      {isError ? (
        <ErrorState title="Directory didn't load" error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[0, 1, 2].map(i => <Skeleton key={i} height={120} index={i} />)}
        </div>
      ) : (faculty ?? []).length === 0 ? (
        <EmptyState
          title={debounced ? `No faculty match “${debounced}”` : 'No faculty listed'}
          icon={Users}
        />
      ) : (
        <div
          className={`grid grid-cols-1 gap-6 transition-opacity sm:grid-cols-3 ${isPlaceholderData ? 'opacity-60' : ''}`}
        >
          {faculty?.map(f => {
            const tone = f.availability_status === 'available'
              ? STATUS_CLASSES.approved
              : STATUS_CLASSES.closed;
            return (
              <Card as="article" padding="md" className="flex flex-col gap-1.5 text-sm shadow-sm" key={f.id}>
                <h3 className="font-semibold text-primary">{f.name}</h3>
                <p className="font-medium text-secondary">
                  {f.designation || f.role_tags_str || 'Faculty'}
                </p>
                <a href={`mailto:${f.email}`} className="text-secondary hover:underline">{f.email}</a>
                {/* Students do not receive phone or office details — the
                    server omits them rather than the UI hiding them. */}
                {f.office_location ? <p className="text-secondary">{f.office_location}</p> : null}
                {f.office_hours ? <p className="text-secondary">Office hours: {f.office_hours}</p> : null}
                <span className={`mt-1 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone.chip}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
                  {f.availability_status}
                </span>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
