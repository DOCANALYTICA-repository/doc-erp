import React from 'react';
import { Pagination } from '@astryxdesign/core/Pagination';

/**
 * The pagination control, in one place.
 *
 * Renders nothing at all when everything fits on one page — a pager under a
 * five-row table is noise that implies there is more to see.
 */
export const PagedFooter: React.FC<{
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  label: string;
}> = ({ page, pageSize, total, onChange, label }) => {
  if (total <= pageSize) return null;

  return (
    <nav aria-label={label} className="flex justify-end pt-2">
      <Pagination
        page={page}
        pageSize={pageSize}
        totalItems={total}
        onChange={onChange}
      />
    </nav>
  );
};
