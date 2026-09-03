import React from 'react';
import { FileBarChart } from 'lucide-react';

import { useClubReport } from '../../../api/hooks';
import { BarList, StatRow } from '../../../components/ui/charts';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageLoader } from '../../../components/ui/PageLoader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { useClubWorkspace } from '../ClubWorkspaceContext';

const CURRENT_ACADEMIC_YEAR = '2025-2026';
const rupees = (n: number) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;

const REPORTS = [
  { id: 'annual', label: 'Annual report', path: (c: string) => `/clubs/${c}/reports/annual?academic_year=${CURRENT_ACADEMIC_YEAR}` },
  { id: 'budget-summary', label: 'Budget summary', path: (c: string) => `/clubs/${c}/reports/budget-summary?academic_year=${CURRENT_ACADEMIC_YEAR}` },
  { id: 'sponsorship-summary', label: 'Sponsorship summary', path: (c: string) => `/clubs/${c}/reports/sponsorship-summary` },
  { id: 'attendance', label: 'Attendance', path: (c: string) => `/clubs/${c}/reports/attendance` },
  { id: 'contribution', label: 'Contribution', path: (c: string) => `/clubs/${c}/reports/contribution` },
] as const;

type ReportId = (typeof REPORTS)[number]['id'];

const isNumeric = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const looksLikeMoney = (key: string) => /amount|budget|spent|allocated|secured|total_value/i.test(key);

function humanize(key: string) {
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Render a report payload as figures and bars rather than a JSON dump.
 *
 * The reports are heterogeneous, so rather than hand-writing five renderers
 * this reads the shape: scalar numbers become a stat row, arrays of
 * {label, count}-ish objects become bars, and anything genuinely unusual
 * falls back to a readable definition list.
 */
function ReportBody({ data }: { data: Record<string, unknown> }) {
  const scalars = Object.entries(data).filter(([, v]) => isNumeric(v) || typeof v === 'string');
  const arrays = Object.entries(data).filter(([, v]) => Array.isArray(v)) as [string, unknown[]][];

  return (
    <div className="flex flex-col gap-6">
      {scalars.length > 0 ? (
        <StatRow
          items={scalars.map(([k, v]) => ({
            label: humanize(k),
            value: isNumeric(v) && looksLikeMoney(k) ? rupees(v) : String(v),
          }))}
        />
      ) : null}

      {arrays.map(([key, rows]) => {
        const items = (rows as Array<Record<string, unknown>>)
          .filter(r => r && typeof r === 'object')
          .map(r => {
            const labelKey = Object.keys(r).find(k => typeof r[k] === 'string') ?? '';
            const valueKey = Object.keys(r).find(k => isNumeric(r[k])) ?? '';
            return { label: String(r[labelKey] ?? '—'), value: Number(r[valueKey] ?? 0) };
          });

        return (
          <div key={key}>
            <h4 className="mb-3 text-sm font-medium text-slate-600">{humanize(key)}</h4>
            <BarList
              items={items}
              formatValue={looksLikeMoney(key) ? rupees : undefined}
              emptyLabel="Nothing recorded"
            />
          </div>
        );
      })}

      {scalars.length === 0 && arrays.length === 0 ? (
        <EmptyState title="This report has no data yet" icon={FileBarChart} />
      ) : null}
    </div>
  );
}

export const ReportsTab: React.FC = () => {
  const { clubId } = useClubWorkspace();
  const [reportType, setReportType] = React.useState<ReportId>('annual');

  const report = REPORTS.find(r => r.id === reportType)!;
  const { data, isLoading, isError, error, refetch } = useClubReport(
    clubId, reportType, report.path(clubId),
  );

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Reports" />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Report type">
        {REPORTS.map(r => (
          <button
            key={r.id}
            role="tab"
            aria-selected={reportType === r.id}
            onClick={() => setReportType(r.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              reportType === r.id
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:text-slate-900'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {isLoading ? (
          <PageLoader label="Generating report..." />
        ) : isError ? (
          <ErrorState title="Report didn't load" error={error} onRetry={() => void refetch()} />
        ) : (
          <ReportBody data={(data as Record<string, unknown>) ?? {}} />
        )}
      </div>
    </div>
  );
};
