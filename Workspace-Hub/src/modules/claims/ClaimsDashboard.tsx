import React, { useState, useEffect, useMemo } from 'react';
import { api, ApiError } from '../../services/api';
import { describeError } from '../../services/errors';
import { useStore } from '../../context/useStore';
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { Button } from '@astryxdesign/core/Button';
import { DateRangeInput } from '@astryxdesign/core/DateRangeInput';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { useToast } from '@astryxdesign/core/Toast';
import { FileText, Plus, Compass, ShieldAlert, CheckCircle, Clock, AlertTriangle, Paperclip } from 'lucide-react';
import { ClaimStatusStepper } from './components/ClaimStatusStepper';
import { PageLoader } from '../../components/ui/PageLoader';
import type { IsoDate } from '../../lib/date';

// Astryx's DateRangeInput brands its dates as template-literal ISO strings.
// Holding our state in the same shape means there is no coercion at the
// boundary at all — a malformed date cannot reach the component.
type DateRange = { start: IsoDate; end: IsoDate };

// getDay() order, so DAY_NAMES[d.getDay()] indexes directly.
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
// Display order: the academic week starts on Monday.
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

type SubTab = 'dashboard' | 'my_claims' | 'new_claim' | 'review_queue';

export const ClaimsDashboard: React.FC = () => {
  const user = useStore(state => state.user);
  /**
   * Does this user get the reviewer's view?
   *
   * super_admin belongs here. It used to test `primary_role === 'faculty'`
   * alone, so an admin got the student tabs with no review queue at all — and
   * therefore no way to rescue a stuck claim, which is precisely what the
   * backend's super_admin bypass exists for.
   */
  const isFaculty =
    user?.primary_role === 'faculty' || user?.primary_role === 'super_admin';
  const [activeSubTab, setActiveSubTab] = useState<SubTab>(isFaculty ? 'review_queue' : 'dashboard');
  const showToast = useToast();

  const [claims, setClaims] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [documentsByClaimId, setDocumentsByClaimId] = useState<Record<string, any[]>>({});

  // Submit claim form state
  const [category, setCategory] = useState<'medical' | 'co_curricular'>('medical');
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [reason, setReason] = useState('');
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  /**
   * Timetable slots that actually fall inside the selected date range,
   * grouped by day.
   *
   * The picker used to map the flat list and ignore day_of_week entirely, so
   * the same subject appeared once per weekday it is taught with nothing to
   * distinguish the instances — and a student picking "the Monday class"
   * had no way to know which checkbox that was.
   */
  const visibleTimetable = useMemo<Array<[string, any[]]>>(() => {
    const daysInRange = new Set<string>();
    if (dateRange?.start && dateRange?.end) {
      const start = new Date(dateRange.start);
      const end = new Date(dateRange.end);
      // A range longer than a fortnight covers every weekday anyway; cap the
      // walk so a mistyped year cannot spin here.
      for (let d = new Date(start); d <= end && daysInRange.size < 7; d.setDate(d.getDate() + 1)) {
        daysInRange.add(DAY_NAMES[d.getDay()]);
      }
    }

    const grouped = new Map<string, any[]>();
    for (const slot of timetable) {
      if (daysInRange.size > 0 && !daysInRange.has(slot.day_of_week)) continue;
      const bucket = grouped.get(slot.day_of_week) ?? [];
      bucket.push(slot);
      grouped.set(slot.day_of_week, bucket);
    }

    return DAY_ORDER
      .filter(day => grouped.has(day))
      .map(day => [day, grouped.get(day)!] as [string, any[]]);
  }, [timetable, dateRange]);

  // Revise / resubmit inline state
  const [revisingClaimId, setRevisingClaimId] = useState<string | null>(null);
  const [reviseReason, setReviseReason] = useState('');
  const [resubmittingClaimId, setResubmittingClaimId] = useState<string | null>(null);
  const [resubmitDateRange, setResubmitDateRange] = useState<DateRange | null>(null);
  const [resubmitReason, setResubmitReason] = useState('');

  const programme = user?.programme || '';
  const semester = user?.semester || '';
  const section = user?.section || '';

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const list = await api.get<any[]>('/claims');
        setClaims(list);

        if (programme && semester && section) {
          const tt = await api.get<any[]>(
            `/claims/timetable?programme=${encodeURIComponent(programme)}&semester=${encodeURIComponent(semester)}&section=${encodeURIComponent(section)}`
          );
          setTimetable(tt);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [activeSubTab, programme, semester, section]);

  // Soft duplicate-claim check as the student types a date range — never
  // blocks submission, only warns (per the PRD).
  useEffect(() => {
    if (!dateRange) { setDuplicateWarning(null); return; }
    const t = setTimeout(() => {
      const dr = `${dateRange.start} to ${dateRange.end}`;
      api.get<any>(`/claims/duplicate-check?date_range=${encodeURIComponent(dr)}`)
        .then(res => setDuplicateWarning(res.has_potential_duplicate ? res.message : null))
        .catch(() => setDuplicateWarning(null));
    }, 400);
    return () => clearTimeout(t);
  }, [dateRange]);

  const loadDocuments = async (claimId: string) => {
    if (documentsByClaimId[claimId]) return;
    try {
      const docs = await api.get<any[]>(`/claims/${claimId}/documents`);
      setDocumentsByClaimId(prev => ({ ...prev, [claimId]: docs }));
    } catch (e) {
      setDocumentsByClaimId(prev => ({ ...prev, [claimId]: [] }));
    }
  };

  const openDocument = async (claimId: string, documentId: string) => {
    const res = await api.get<{ url: string }>(`/claims/${claimId}/documents/${documentId}/download-url`);
    window.open(res.url, '_blank');
  };

  const handleSubmitClaim = async () => {
    if (!dateRange) {
      showToast({ body: 'Please select a date range for this claim.', type: 'error' });
      return;
    }
    if (selectedHours.length === 0) {
      showToast({ body: 'Please select at least one missed class hour from the timetable.', type: 'error' });
      return;
    }
    if (category === 'medical' && !certificateFile) {
      showToast({ body: 'A medical certificate is required for this claim category.', type: 'error' });
      return;
    }

    const missedClasses = selectedHours.map(hourId => {
      const slot = timetable.find(t => t.id === hourId);
      return {
        subject: slot.subject,
        date: dateRange.start,
        hour: slot.hour,
        subject_faculty_id: slot.faculty_id
      };
    });

    const payload = {
      category,
      academic_year: '2025-2026',
      semester,
      programme,
      section,
      date_range: `${dateRange.start} to ${dateRange.end}`,
      reason,
      missed_classes: missedClasses
    };

    try {
      const claim = await api.post<any>('/claims', payload);
      if (certificateFile) {
        const formData = new FormData();
        formData.append('file', certificateFile);
        formData.append('document_type', category === 'medical' ? 'medical_certificate' : 'pre_approval_form');
        await api.upload(`/claims/${claim.id}/documents`, formData);
      }
      setCertificateFile(null);
      setDateRange(null);
      setReason('');
      setSelectedHours([]);
      showToast({ body: 'Claim submitted for initial review.', type: 'info' });
      setActiveSubTab('my_claims');
    } catch (err) {
      const message = err instanceof ApiError && err.status === 403
        ? 'Only students can submit attendance claims.'
        : 'Could not submit the claim. Please check the form and try again.';
      showToast({ body: message, type: 'error' });
      throw err;
    }
  };

  /*
   * The three review actions below had no try/catch at all.
   *
   * Astryx's Button.clickAction is try/finally with NO catch, so a rejected
   * write became an unhandled rejection: the spinner stopped and absolutely
   * nothing else happened. A faculty member clicking Approve on a claim they
   * are not scoped for saw no error, no toast, no change — indistinguishable
   * from a successful no-op.
   *
   * ApiError.message carries the FastAPI `detail`, so the real reason ("You
   * are not the assigned Course Coordinator for this programme") reaches the
   * user for free.
   */
  const refreshClaims = async () => setClaims(await api.get<any[]>('/claims'));

  const approveClaim = async (claimId: string) => {
    try {
      await api.post(`/claims/${claimId}/approve-stage?action=approve`, {});
      showToast({ body: 'Claim approved and moved to the next stage.', type: 'info' });
      await refreshClaims();
    } catch (err) {
      showToast({ body: `Could not approve this claim: ${describeError(err)}`, type: 'error' });
    }
  };

  const submitRevision = async (claimId: string) => {
    if (!reviseReason.trim()) {
      showToast({ body: 'A reason is required to revise a claim.', type: 'error' });
      return;
    }
    try {
      await api.post(
        `/claims/${claimId}/approve-stage?action=revise&feedback=${encodeURIComponent(reviseReason)}`,
        {},
      );
      showToast({ body: 'Claim returned to the student for revision.', type: 'info' });
      setRevisingClaimId(null);
      setReviseReason('');
      await refreshClaims();
    } catch (err) {
      showToast({ body: `Could not return this claim: ${describeError(err)}`, type: 'error' });
    }
  };

  /**
   * Reject. There was no reject path in the UI at all, on either side —
   * the backend has supported it at every stage since Phase 5, so a reviewer
   * who needed to refuse a claim outright had to return it for revision
   * indefinitely instead.
   */
  const rejectClaim = async (claimId: string) => {
    if (!reviseReason.trim()) {
      showToast({ body: 'A reason is required to reject a claim.', type: 'error' });
      return;
    }
    try {
      await api.post(
        `/claims/${claimId}/approve-stage?action=reject&feedback=${encodeURIComponent(reviseReason)}`,
        {},
      );
      showToast({ body: 'Claim rejected.', type: 'info' });
      setRevisingClaimId(null);
      setReviseReason('');
      await refreshClaims();
    } catch (err) {
      showToast({ body: `Could not reject this claim: ${describeError(err)}`, type: 'error' });
    }
  };

  const submitResubmit = async (claimId: string) => {
    const body: any = {};
    if (resubmitDateRange) body.date_range = `${resubmitDateRange.start} to ${resubmitDateRange.end}`;
    // Resubmit could previously only change the date range. The endpoint has
    // always accepted a corrected reason too, and that is the single most
    // common thing a claim is sent back for.
    if (resubmitReason.trim()) body.reason = resubmitReason.trim();
    try {
      await api.put(`/claims/${claimId}/resubmit`, body);
      showToast({ body: 'Claim resubmitted for review.', type: 'info' });
      setResubmittingClaimId(null);
      setResubmitDateRange(null);
      setResubmitReason('');
      await refreshClaims();
    } catch (err) {
      showToast({ body: `Could not resubmit this claim: ${describeError(err)}`, type: 'error' });
    }
  };

  // Faculty cannot submit claims (backend-enforced) — they get only the
  // Review Queue, no "All Claims"/"New Submission" tabs to be confused by.
  const navItems: { id: SubTab; label: string }[] = isFaculty
    ? [{ id: 'review_queue', label: 'Review Queue' }]
    : [
        { id: 'dashboard', label: 'Overview' },
        { id: 'my_claims', label: 'All Claims' },
      ];

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-slate-50 flex flex-col">
      {/* Sub Navbar (Horizontal Top Bar) */}
      <div className="w-full border-b border-slate-200/40 bg-white px-6 py-2.5 flex items-center justify-between gap-4 overflow-x-auto scrollbar-none z-10 shadow-sm">
        <div className="flex gap-4">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveSubTab(item.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap focus:outline-none ${
                activeSubTab === item.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {!isFaculty && (
          <Button
            label="New Claim"
            variant="primary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setActiveSubTab('new_claim')}
          />
        )}
      </div>

      {/* Workspace Content */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl w-full mx-auto">
        <div className="mb-6">
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">Attendance Claims Workflow</span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Claim Process Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            {isFaculty
              ? 'Review attendance claims awaiting your action.'
              : 'Submit medical certificates or pre-approved co-curricular attendance requests for faculty review.'}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map(i => <Skeleton key={i} height={72} index={i} />)}
          </div>
        ) : (
          <>
            {/* Tab 1: Dashboard Overview */}
            {activeSubTab === 'dashboard' && !isFaculty && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                  {[
                    { title: 'Total Submissions', count: claims.length, icon: FileText, color: 'text-indigo-500' },
                    { title: 'Approved Claims', count: claims.filter(c => c.status === 'approved' || c.status === 'closed').length, icon: CheckCircle, color: 'text-emerald-500' },
                    { title: 'Pending Review', count: claims.filter(c => c.status === 'submitted' || c.status === 'under_review').length, icon: Clock, color: 'text-yellow-500' },
                    { title: 'Action Required', count: claims.filter(c => c.status === 'returned').length, icon: AlertTriangle, color: 'text-rose-500' }
                  ].map((card, i) => (
                    <div key={i} className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-slate-400">{card.title}</div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{card.count}</div>
                      </div>
                      <card.icon className={`w-8 h-8 ${card.color}`} />
                    </div>
                  ))}
                </div>

                <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
                  <h3 className="font-bold text-slate-900 text-sm mb-4">Latest Claim Submissions</h3>
                  <div className="space-y-4">
                    {claims.slice(0, 3).map((claim, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-950">{claim.reference_number}</span>
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] uppercase font-bold">{claim.category}</span>
                          </div>
                          <p className="text-slate-500 mt-1">Duration: {claim.date_range}</p>
                        </div>
                        <ClaimStatusStepper
                          status={claim.status}
                          currentStage={claim.current_workflow_stage}
                          submissionType={claim.submission_type}
                          referenceNumber={claim.reference_number}
                          revisionReason={claim.revision_reason}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: All Claims */}
            {activeSubTab === 'my_claims' && !isFaculty && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-semibold uppercase">
                      <tr>
                        <th className="px-6 py-4">Reference No</th>
                        <th className="px-6 py-4">Category</th>
                        <th className="px-6 py-4">Date Range</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {claims.map(claim => (
                        <React.Fragment key={claim.id}>
                          <tr>
                            <td className="px-6 py-4 font-bold text-slate-900">{claim.reference_number}</td>
                            <td className="px-6 py-4 font-medium uppercase text-slate-500">{claim.category}</td>
                            <td className="px-6 py-4">{claim.date_range}</td>
                            <td className="px-6 py-4">
                              <ClaimStatusStepper
                                status={claim.status}
                                currentStage={claim.current_workflow_stage}
                                submissionType={claim.submission_type}
                                referenceNumber={claim.reference_number}
                                revisionReason={claim.revision_reason}
                              />
                            </td>
                            <td className="px-6 py-4">
                              {claim.status === 'returned' && (
                                <Button
                                  label="Resubmit"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setResubmittingClaimId(resubmittingClaimId === claim.id ? null : claim.id)}
                                />
                              )}
                            </td>
                          </tr>
                          {resubmittingClaimId === claim.id && (
                            <tr>
                              <td colSpan={5} className="px-6 py-4 bg-slate-50">
                                <div className="flex flex-col gap-3 max-w-sm">
                                  <p className="text-sm text-slate-600">
                                    Revision requested: {claim.revision_reason || 'No reason provided.'}
                                  </p>
                                  <DateRangeInput
                                    label="Updated Date Range"
                                    value={resubmitDateRange}
                                    onChange={setResubmitDateRange}
                                  />
                                  {/* Resubmit could only change the date range,
                                      even though a corrected reason is the most
                                      common thing a claim is sent back for. */}
                                  <label
                                    htmlFor={`resubmit-reason-${claim.id}`}
                                    className="text-sm font-semibold text-slate-600"
                                  >
                                    Updated reason
                                  </label>
                                  <textarea
                                    id={`resubmit-reason-${claim.id}`}
                                    rows={3}
                                    value={resubmitReason}
                                    onChange={(e) => setResubmitReason(e.target.value)}
                                    placeholder={claim.reason}
                                    className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                                  />
                                  <Button
                                    label="Submit Resubmission"
                                    variant="primary"
                                    size="sm"
                                    clickAction={() => submitResubmit(claim.id)}
                                  />
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 3: New Claim Submission */}
            {activeSubTab === 'new_claim' && !isFaculty && (
              <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm space-y-4">
                  <h3 className="font-bold text-slate-900 text-sm">Create New Attendance Claim</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-500">Claim Category</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as any)}
                        className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-950"
                      >
                        <option value="medical">Medical (Certificate Required)</option>
                        <option value="co_curricular">Co-Curricular (Pre-Approval Required)</option>
                      </select>
                    </div>
                    <DateRangeInput
                      label="Date Range"
                      value={dateRange}
                      onChange={setDateRange}
                      status={duplicateWarning ? { type: 'warning', message: duplicateWarning } : undefined}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500">Missed Timetable Sessions (Select all that apply)</label>
                    {visibleTimetable.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        {dateRange
                          ? 'No timetabled classes fall in the selected dates.'
                          : 'Pick a date range above to see the classes you missed.'}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {visibleTimetable.map(([day, slots]) => (
                          <div key={day}>
                            <h4 className="text-sm font-semibold text-slate-700 mb-2">{day}</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {slots.map(slot => (
                                <label
                                  key={slot.id}
                                  className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-3 cursor-pointer select-none"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedHours.includes(slot.id)}
                                    onChange={(e) => {
                                      setSelectedHours(prev =>
                                        e.target.checked
                                          ? [...prev, slot.id]
                                          : prev.filter(id => id !== slot.id)
                                      );
                                    }}
                                    className="mt-0.5"
                                  />
                                  <div className="text-sm">
                                    <div className="font-semibold text-slate-900">{slot.subject}</div>
                                    <div className="text-slate-500 mt-0.5">{slot.hour}</div>
                                    <div className="text-slate-500">{slot.faculty_name || 'Faculty TBC'}</div>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500">Detailed Explanation / Reason</label>
                    <textarea
                      rows={4}
                      placeholder="Explain why you missed these academic sessions..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                      className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-950"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500">
                      Upload Certificate PDF {category === 'medical' && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) => setCertificateFile(e.target.files?.[0] ?? null)}
                      required={category === 'medical'}
                      className="text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    label="Submit Form to Class Teacher"
                    variant="primary"
                    clickAction={handleSubmitClaim}
                  />
                </div>
              </div>
            )}

            {/* Tab 4: Faculty Review Queue */}
            {activeSubTab === 'review_queue' && isFaculty && (
              <div className="space-y-6">
                <h3 className="font-bold text-slate-900 text-sm">Review Queue</h3>
                <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-semibold uppercase">
                      <tr>
                        <th className="px-6 py-4">Reference No</th>
                        <th className="px-6 py-4">Student</th>
                        <th className="px-6 py-4">Reason</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Documents</th>
                        <th className="px-6 py-4">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {claims.length === 0 && (
                        <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">No claims currently awaiting your review.</td></tr>
                      )}
                      {claims.map(claim => (
                        <React.Fragment key={claim.id}>
                          <tr>
                            <td className="px-6 py-4 font-bold text-slate-900">{claim.reference_number}</td>
                            <td className="px-6 py-4 font-semibold text-slate-900">{claim.submitter_name}</td>
                            <td className="px-6 py-4 max-w-xs truncate">{claim.reason}</td>
                            <td className="px-6 py-4">
                              <ClaimStatusStepper
                                status={claim.status}
                                currentStage={claim.current_workflow_stage}
                                submissionType={claim.submission_type}
                                referenceNumber={claim.reference_number}
                                revisionReason={claim.revision_reason}
                              />
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => loadDocuments(claim.id)}
                                className="flex items-center gap-1 text-slate-500 hover:text-slate-900"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                                {documentsByClaimId[claim.id] ? documentsByClaimId[claim.id].length : '...'}
                              </button>
                            </td>
                            <td className="px-6 py-4 flex gap-2">
                              <Button
                                label="Approve"
                                variant="primary"
                                size="sm"
                                clickAction={() => approveClaim(claim.id)}
                              />
                              <Button
                                label="Revise or Reject"
                                variant="secondary"
                                size="sm"
                                clickAction={() => setRevisingClaimId(revisingClaimId === claim.id ? null : claim.id)}
                              />
                            </td>
                          </tr>
                          {documentsByClaimId[claim.id] && documentsByClaimId[claim.id].length > 0 && (
                            <tr>
                              <td colSpan={6} className="px-6 py-3 bg-slate-50">
                                <div className="flex gap-3 flex-wrap">
                                  {documentsByClaimId[claim.id].map(doc => (
                                    <button
                                      key={doc.id}
                                      onClick={() => openDocument(claim.id, doc.id)}
                                      className="text-[10px] px-2 py-1 rounded bg-white border border-slate-200 text-slate-600 hover:text-slate-900"
                                    >
                                      {doc.document_type}
                                    </button>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                          {revisingClaimId === claim.id && (
                            <tr>
                              <td colSpan={6} className="px-6 py-4 bg-slate-50">
                                <div className="flex flex-col gap-3 max-w-md">
                                  <label
                                    htmlFor={`review-reason-${claim.id}`}
                                    className="text-sm font-semibold text-slate-600"
                                  >
                                    Reason (required, visible to the student)
                                  </label>
                                  <textarea
                                    id={`review-reason-${claim.id}`}
                                    rows={2}
                                    value={reviseReason}
                                    onChange={(e) => setReviseReason(e.target.value)}
                                    className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      label="Send Back to Student"
                                      variant="secondary"
                                      size="sm"
                                      clickAction={() => submitRevision(claim.id)}
                                    />
                                    {/* Reject was absent from the UI entirely,
                                        though the backend has supported it at
                                        every stage. Without it a reviewer could
                                        only bounce a claim back forever. */}
                                    <Button
                                      label="Reject Claim"
                                      variant="destructive"
                                      size="sm"
                                      clickAction={() => rejectClaim(claim.id)}
                                    />
                                  </div>
                                  <p className="text-xs text-slate-500">
                                    Sending back lets the student correct and resubmit.
                                    Rejecting closes the claim permanently.
                                  </p>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
