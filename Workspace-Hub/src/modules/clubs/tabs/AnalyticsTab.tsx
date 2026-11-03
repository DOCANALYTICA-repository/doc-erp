import React from 'react';
import { BarChart3 } from 'lucide-react';

import { useClubAnalytics } from '../../../api/hooks';
import { BarList, ColumnChart, Gauge, GroupedColumnChart, StatRow } from '../../../components/ui/charts';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { Card } from '../../../components/ui/Card';
import { useClubWorkspace } from '../ClubWorkspaceContext';

const CURRENT_ACADEMIC_YEAR = '2025-2026';
const rupees = (n: number) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;

interface Widget {
  key: string;
  title: string;
  data: unknown;
}

const Panel: React.FC<{ title: string; children: React.ReactNode; wide?: boolean }> = ({
  title, children, wide,
}) => (
  <Card as="section" padding="md" className={wide ? 'sm:col-span-2' : undefined}>
    <h3 className="mb-4 font-heading text-sm font-semibold text-primary">{title}</h3>
    {children}
  </Card>
);

/**
 * Renders one analytics widget in the shape its data actually is.
 *
 * The endpoint computes nine well-formed objects at a cost of 16 queries and
 * ~2.7 seconds, and every one of them was rendered as pretty-printed JSON
 * inside a <pre>. Nothing here fetches anything new — this is purely the
 * rendering the payload always deserved.
 */
function renderWidget(widget: Widget): React.ReactNode {
  const d = widget.data as Record<string, unknown>;

  switch (widget.key) {
    case 'contribution_leaderboard': {
      const rows = (widget.data as Array<Record<string, unknown>>) ?? [];
      return (
        <BarList
          items={rows.map(r => ({
            label: String(r.student_name ?? r.student_id ?? 'Unknown'),
            value: Number(r.completed_tasks ?? r.contribution_score ?? 0),
          }))}
          emptyLabel="No completed contributions yet"
        />
      );
    }

    case 'member_activity':
      return (
        <StatRow
          items={[
            { label: 'Total', value: Number(d.total_members ?? 0) },
            { label: 'Active', value: Number(d.active_members ?? 0) },
            { label: 'Alumni', value: Number(d.alumni_members ?? 0) },
          ]}
        />
      );

    case 'attendance_trends':
      return (
        <Gauge
          percent={Number(d.attendance_rate_percent ?? 0)}
          label="Attendance rate"
          caption={`${Number(d.present ?? 0)} present of ${Number(d.total_records ?? 0)} recorded`}
        />
      );

    case 'monthly_progress': {
      const rows = (widget.data as Array<Record<string, unknown>>) ?? [];
      return (
        <ColumnChart
          items={rows.map(r => ({ label: String(r.month ?? ''), value: Number(r.count ?? 0) }))}
          emptyLabel="No events scheduled yet"
        />
      );
    }

    case 'registration_trends': {
      const byStatus = (d.by_status as Record<string, number>) ?? {};
      return (
        <div className="flex flex-col gap-4">
          <StatRow
            items={[
              { label: 'Drives', value: Number(d.total_drives ?? 0) },
              { label: 'Applications', value: Number(d.total_applications ?? 0) },
              { label: 'Selected', value: Number(d.selected ?? 0) },
            ]}
          />
          <BarList
            items={Object.entries(byStatus).map(([label, value]) => ({
              label: label.charAt(0).toUpperCase() + label.slice(1),
              value: Number(value),
            }))}
            emptyLabel="No applications received yet"
          />
        </div>
      );
    }

    case 'budget_utilization': {
      const pct = Number(d.utilization_percent ?? 0);
      return (
        <Gauge
          percent={pct}
          label="Budget used"
          danger={pct > 100}
          caption={`${rupees(Number(d.spent_amount ?? 0))} of ${rupees(Number(d.allocated_amount ?? 0))}`}
        />
      );
    }

    case 'year_over_year_comparison': {
      const rows = (widget.data as Array<Record<string, unknown>>) ?? [];
      return (
        <GroupedColumnChart
          items={rows.map(r => ({
            label: String(r.academic_year ?? ''),
            a: Number(r.allocated ?? 0),
            b: Number(r.spent ?? 0),
          }))}
          aLabel="Allocated"
          bLabel="Spent"
          formatValue={rupees}
        />
      );
    }

    case 'sponsorship_summary':
      return (
        <StatRow
          items={[
            { label: 'Sponsors', value: Number(d.total_sponsors ?? 0) },
            { label: 'Secured', value: rupees(Number(d.total_secured ?? 0)) },
          ]}
        />
      );

    case 'feedback_analysis':
      // The server says explicitly that this is not implemented rather than
      // fabricating numbers. Say so, rather than rendering {"available": false}.
      return (
        <p className="text-sm text-secondary">
          {String(d.reason ?? 'Not available yet.')}
        </p>
      );

    default:
      return (
        <pre className="overflow-x-auto rounded-lg bg-body p-3 text-xs text-secondary">
          {JSON.stringify(widget.data, null, 2)}
        </pre>
      );
  }
}

export const AnalyticsTab: React.FC = () => {
  const { clubId } = useClubWorkspace();
  const { data, isLoading, isError, error, refetch } = useClubAnalytics(clubId, CURRENT_ACADEMIC_YEAR);

  if (isLoading) return <PageSkeleton variant="stats" label="Computing analytics" />;
  if (isError) return <ErrorState title="Analytics didn't load" error={error} onRetry={() => void refetch()} />;

  const widgets = ((data as Record<string, unknown> | undefined)?.widgets as Widget[]) ?? [];
  if (widgets.length === 0) {
    return <EmptyState title="No analytics available yet" icon={BarChart3} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Analytics" description={`Academic year ${CURRENT_ACADEMIC_YEAR}`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {widgets.map(w => (
          <Panel
            key={w.key}
            title={w.title}
            wide={w.key === 'contribution_leaderboard' || w.key === 'year_over_year_comparison'}
          >
            {renderWidget(w)}
          </Panel>
        ))}
      </div>
    </div>
  );
};
