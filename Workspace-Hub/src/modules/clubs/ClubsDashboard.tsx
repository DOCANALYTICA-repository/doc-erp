import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useStore } from '../../context/useStore';
import { ClubAvatar } from '../../components/ui/ClubAvatar';
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { Button } from '@astryxdesign/core/Button';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { useToast } from '@astryxdesign/core/Toast';
import { Users, Calendar, Wallet, FileText, Award, Layers, Plus, CheckCircle, Clock } from 'lucide-react';
import { ClubHierarchyChart } from './ClubHierarchyChart';
import { PageLoader } from '../../components/ui/PageLoader';
import { asIsoDate } from '../../lib/date';
import { describeError } from '../../services/errors';

const CURRENT_ACADEMIC_YEAR = '2025-2026';

const ANNUAL_PLAN_STAGE_PERMISSIONS: Record<string, string> = {
  faculty_coordinator_review: 'clubs:approve_plan_faculty_coordinator',
  cultural_coordinator_review: 'clubs:approve_plan_cultural_coordinator',
  hod_review: 'clubs:approve_plan_hod',
};

export const ClubsDashboard: React.FC = () => {
  const hasPermission = useStore(state => state.hasPermission);
  const showToast = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'members' | 'structure' | 'tasks' | 'events' | 'budget' | 'reimbursements' | 'sponsorships' | 'recruitment' | 'announcements' | 'annual-plan' | 'documents' | 'reports' | 'analytics' | 'settings'>('dashboard');

  // Club selector (Phase 4) — replaces the previous hardcoded club_commerce.
  // A user only ever sees/switches between clubs they're actually a member
  // of (or every club, for super_admin) — see GET /clubs/my-memberships.
  const [myClubs, setMyClubs] = useState<any[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);

  const [clubInfo, setClubInfo] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [reimbursements, setReimbursements] = useState<any[]>([]);
  const [sponsorships, setSponsorships] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [recruitmentDrives, setRecruitmentDrives] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [annualPlans, setAnnualPlans] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [reportType, setReportType] = useState<'annual' | 'budget-summary' | 'sponsorship-summary' | 'attendance' | 'contribution'>('annual');
  const [reportData, setReportData] = useState<any>(null);

  // Event proposal form (fixes the previously dead "Submit Event Proposal" button)
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventVenue, setEventVenue] = useState('');
  const [eventBudget, setEventBudget] = useState('');

  // Reimbursement request form (fixes the previously dead "New Voucher Request" button)
  const [voucherFormOpen, setVoucherFormOpen] = useState(false);
  const [voucherAmount, setVoucherAmount] = useState('');
  const [voucherReceiptUrl, setVoucherReceiptUrl] = useState('');

  // Announcement form
  const [announcementFormOpen, setAnnouncementFormOpen] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [announcementType, setAnnouncementType] = useState('general');

  // Annual Plan draft form
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [planVision, setPlanVision] = useState('');
  const [planObjectives, setPlanObjectives] = useState('');
  const [planBudget, setPlanBudget] = useState('');

  // Document upload form
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docName, setDocName] = useState('');
  const [docCategory, setDocCategory] = useState('Templates');
  const [docTags, setDocTags] = useState('');
  const [docsView, setDocsView] = useState<'all' | 'knowledge-base'>('all');

  // Task Manager (club-scoped, wraps the existing Task engine)
  const [clubTasks, setClubTasks] = useState<any[]>([]);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState('medium');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');

  // Club settings (contact email)
  const [contactEmailDraft, setContactEmailDraft] = useState('');

  const [isLoadingMemberships, setIsLoadingMemberships] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [hierarchyLevels, setHierarchyLevels] = useState<any[]>([]);

  // Bumped after any mutation (create/submit/review/upload/...) to force the
  // main data effect below to refetch. Toggling activeSubTab back and forth
  // does NOT work for this — React batches both setState calls into one
  // render, so the effect's dependency never actually changes and it never
  // re-runs.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    setIsLoadingMemberships(true);
    api.get<any[]>('/clubs/my-memberships').then(clubs => {
      setMyClubs(clubs);
      if (clubs.length > 0) setSelectedClubId(prev => prev ?? clubs[0].id);
    }).catch(console.error).finally(() => setIsLoadingMemberships(false));
  }, []);

  /**
   * The club workspace payloads.
   *
   * activeSubTab is deliberately NOT a dependency. It used to be, which meant
   * all thirteen of these requests re-ran on every one of the fifteen tab
   * clicks — about 8.7 seconds of network per click — even though the tab
   * bodies render entirely from state that is already loaded. Removing that
   * one identifier costs nothing: no tab reads anything this effect does not
   * already fetch.
   *
   * The thirteen calls also now run CONCURRENTLY rather than one after
   * another, which is most of the remaining mount time.
   *
   * reloadTick is the explicit refetch signal after a write.
   */
  useEffect(() => {
    if (!selectedClubId) return;
    const clubId = selectedClubId;
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      try {
        const [
          club, mbrs, evts, bdgts, reimb, spons, drives, anns, plans, docs, kb, tsk, hier,
        ] = await Promise.all([
          api.get<any>(`/clubs/${clubId}`),
          api.get<any[]>(`/clubs/${clubId}/members`),
          api.get<any[]>(`/clubs/${clubId}/events`),
          api.get<any[]>(`/clubs/${clubId}/budgets`),
          api.get<any[]>(`/clubs/${clubId}/reimbursements`),
          api.get<any[]>(`/clubs/${clubId}/sponsorships`),
          api.get<any[]>(`/clubs/${clubId}/recruitment-drives`),
          api.get<any[]>(`/clubs/${clubId}/announcements`),
          api.get<any[]>(`/clubs/${clubId}/annual-plans`),
          api.get<any[]>(`/clubs/${clubId}/documents`),
          api.get<any[]>(`/clubs/${clubId}/knowledge-base`),
          api.get<any[]>(`/clubs/${clubId}/tasks`),
          api.get<any[]>(`/clubs/${clubId}/hierarchy`),
        ]);

        if (cancelled) return;

        setClubInfo(club);
        setContactEmailDraft(club.contact_email || '');
        setMembers(mbrs);
        setEvents(evts);
        setBudgets(bdgts);
        setReimbursements(reimb);
        setSponsorships(spons);
        setRecruitmentDrives(drives);
        setAnnouncements(anns);
        setAnnualPlans(plans);
        setDocuments(docs);
        setKnowledgeBase(kb);
        setClubTasks(tsk);
        setHierarchyLevels(hier);
        setLoadError(null);
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          // A failed load is not an empty club.
          setLoadError(describeError(e));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [selectedClubId, reloadTick]);

  // Analytics — loaded lazily only when that tab is opened (heavier aggregate query)
  useEffect(() => {
    if (activeSubTab === 'analytics' && selectedClubId) {
      api.get<any>(`/clubs/${selectedClubId}/analytics?academic_year=${CURRENT_ACADEMIC_YEAR}`)
        .then(setAnalytics).catch(console.error);
    }
  }, [activeSubTab, selectedClubId]);

  // Reports — refetch whenever the selected report type changes
  useEffect(() => {
    if (activeSubTab !== 'reports' || !selectedClubId) return;
    const endpoints: Record<string, string> = {
      annual: `/clubs/${selectedClubId}/reports/annual?academic_year=${CURRENT_ACADEMIC_YEAR}`,
      'budget-summary': `/clubs/${selectedClubId}/reports/budget-summary?academic_year=${CURRENT_ACADEMIC_YEAR}`,
      'sponsorship-summary': `/clubs/${selectedClubId}/reports/sponsorship-summary`,
      attendance: `/clubs/${selectedClubId}/reports/attendance`,
      contribution: `/clubs/${selectedClubId}/reports/contribution`,
    };
    api.get<any>(endpoints[reportType]).then(setReportData).catch(console.error);
  }, [activeSubTab, selectedClubId, reportType]);

  if (isLoadingMemberships) {
    return <PageLoader label="Loading your clubs..." />;
  }

  if (myClubs.length === 0) {
    return (
      <div className="w-full min-h-[calc(100vh-4rem)] flex items-center justify-center text-sm text-slate-400">
        You are not currently a member of any club.
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-slate-50 flex flex-col">
      {/* Club Selector */}
      {myClubs.length > 1 && (
        <div className="w-full border-b border-slate-200/40 bg-white px-6 py-2 flex gap-2 items-center">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Club:</span>
          <select
            value={selectedClubId ?? ''}
            onChange={(e) => setSelectedClubId(e.target.value)}
            className="text-xs px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-950"
          >
            {myClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Sub Navbar (Horizontal Top Bar) */}
      <div className="w-full border-b border-slate-200/40 bg-white px-6 py-2.5 flex gap-4 overflow-x-auto scrollbar-none z-10 shadow-sm">
        {[
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'members', label: 'Members' },
          { id: 'structure', label: 'Structure' },
          { id: 'tasks', label: 'Tasks' },
          { id: 'recruitment', label: 'Recruitment' },
          { id: 'events', label: 'Annual Events' },
          { id: 'announcements', label: 'Announcements' },
          { id: 'budget', label: 'Club Budget' },
          { id: 'reimbursements', label: 'Reimbursements' },
          { id: 'sponsorships', label: 'Sponsorships' },
          { id: 'annual-plan', label: 'Annual Planning' },
          { id: 'documents', label: 'Documents' },
          { id: 'reports', label: 'Reports' },
          { id: 'analytics', label: 'Analytics' },
          { id: 'settings', label: 'Settings' }
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setActiveSubTab(item.id as any)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap focus:outline-none ${ activeSubTab === item.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 ' }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Workspace Content */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl w-full mx-auto">
        {loadError && !isLoading ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 flex flex-col items-start gap-3">
            <div>
              <h3 className="font-semibold text-rose-900">This club's workspace didn't load</h3>
              <p className="text-sm text-rose-800 mt-1">{loadError}</p>
            </div>
            <Button label="Try again" variant="secondary" clickAction={() => setReloadTick(t => t + 1)} />
          </div>
        ) : isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map(i => <Skeleton key={i} height={80} index={i} />)}
          </div>
        ) : (
        <>
        {clubInfo && (
          <div className="mb-8 flex items-center gap-4">
            <ClubAvatar name={clubInfo.name} logo={clubInfo.logo} />
            <div>
              <span className="text-xs font-bold text-sky-500 uppercase tracking-wider">{clubInfo.category} Club</span>
              <h1 className="text-2xl font-bold text-slate-900">{clubInfo.name}</h1>
              <p className="text-xs text-slate-500 mt-1">{clubInfo.description}</p>
            </div>
          </div>
        )}

        {/* Tab 1: Dashboard */}
        {activeSubTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-400">Total Members</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{members.length}</div>
                </div>
                <Users className="w-8 h-8 text-sky-500/80" />
              </div>
              <div className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-400">Total Events</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{events.length}</div>
                </div>
                <Calendar className="w-8 h-8 text-emerald-500/80" />
              </div>
              <div className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-400">Budget Spent</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    Rs {budgets[0]?.spent_amount.toLocaleString() || '0'}
                  </div>
                </div>
                <Wallet className="w-8 h-8 text-rose-500/80" />
              </div>
            </div>

            {/* Quick Activity List */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
              <h3 className="font-bold text-slate-900 mb-4 text-sm">Key Operational Indicators</h3>
              <div className="space-y-3">
                {events.map((evt, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${evt.status === 'approved' ? 'bg-emerald-500' : 'bg-yellow-500'}`} />
                      <div>
                        <span className="font-semibold text-slate-800">{evt.title}</span>
                        <span className="text-xs text-slate-400 ml-2">({evt.date})</span>
                      </div>
                    </div>
                    <span className="font-medium text-slate-500">{evt.venue}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Members */}
        {activeSubTab === 'members' && (
          <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">Student Name</th>
                  <th className="px-6 py-4">Club Responsibility</th>
                  <th className="px-6 py-4">Academic Period</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {members.map(mbr => (
                  <tr key={mbr.id}>
                    <td className="px-6 py-4 font-semibold text-slate-900">{mbr.student_name ?? mbr.student_id}</td>
                    <td className="px-6 py-4">
                      {clubInfo?.viewer_can_manage_settings && hierarchyLevels.length > 0 ? (
                        <select
                          defaultValue={mbr.hierarchy_level_id ?? ''}
                          onChange={async (e) => {
                            if (!e.target.value) return;
                            await api.put(`/clubs/${selectedClubId}/members/${mbr.id}/hierarchy-level`, {
                              hierarchy_level_id: e.target.value,
                            });
                            setReloadTick(t => t + 1);
                          }}
                          className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg"
                        >
                          <option value="" disabled>{mbr.role}</option>
                          {[...hierarchyLevels].sort((a, b) => a.level_order - b.level_order).map(l => (
                            <option key={l.id} value={l.id}>{l.title}</option>
                          ))}
                        </select>
                      ) : mbr.role}
                    </td>
                    <td className="px-6 py-4">{mbr.academic_year}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">
                        {mbr.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Events */}
        {activeSubTab === 'events' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Annual Event Schedule</h3>
              <button
                onClick={() => setEventFormOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Submit Event Proposal
              </button>
            </div>
            {eventFormOpen && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await api.post(`/clubs/${selectedClubId}/events`, {
                    club_id: selectedClubId, title: eventTitle, date: eventDate, venue: eventVenue, budget: Number(eventBudget) || 0,
                  });
                  setEventTitle(''); setEventDate(''); setEventVenue(''); setEventBudget('');
                  setEventFormOpen(false);
                  setReloadTick(t => t + 1);
                }}
                className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs"
              >
                <input required placeholder="Event title" value={eventTitle} onChange={e => setEventTitle(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                <DateInput label="Event date" isLabelHidden value={asIsoDate(eventDate)} onChange={(v) => setEventDate(v || '')} isRequired />
                <input required placeholder="Venue" value={eventVenue} onChange={e => setEventVenue(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                <input required type="number" placeholder="Budget (Rs)" value={eventBudget} onChange={e => setEventBudget(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                <button type="submit" className="sm:col-span-4 py-2 bg-slate-900 text-white rounded-lg font-semibold">Submit Proposal</button>
              </form>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {events.map(evt => (
                <div key={evt.id} className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${ evt.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600' }`}>{evt.status}</span>
                      <span className="text-xs text-slate-400">{evt.date}</span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm">{evt.title}</h4>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">{evt.description}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between text-xs text-slate-400">
                    <span>Venue: {evt.venue}</span>
                    <span>Budget: Rs {evt.budget.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Budget */}
        {activeSubTab === 'budget' && budgets.length > 0 && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
              <h3 className="font-bold text-slate-900 text-sm mb-2">Academic Year {budgets[0].academic_year}</h3>
              <div className="mt-6 flex flex-col gap-2">
                <div className="flex justify-between text-xs text-slate-400 font-medium">
                  <span>Usage Compliance</span>
                  <span>{Math.round((budgets[0].spent_amount / budgets[0].allocated_amount) * 100)}% Used</span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-900 rounded-full transition-all duration-500"
                    style={{ width: `${(budgets[0].spent_amount / budgets[0].allocated_amount) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mt-2">
                  <span>Spent: Rs {budgets[0].spent_amount.toLocaleString()}</span>
                  <span>Allocated: Rs {budgets[0].allocated_amount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Reimbursements */}
        {activeSubTab === 'reimbursements' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-sm">Reimbursement Vouchers</h3>
              <button
                onClick={() => setVoucherFormOpen(true)}
                className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                New Voucher Request
              </button>
            </div>
            {voucherFormOpen && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await api.post(`/clubs/${selectedClubId}/reimbursements`, {
                    club_id: selectedClubId, amount: Number(voucherAmount) || 0, receipt_url: voucherReceiptUrl || null,
                  });
                  setVoucherAmount(''); setVoucherReceiptUrl('');
                  setVoucherFormOpen(false);
                  setReloadTick(t => t + 1);
                }}
                className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs"
              >
                <input required type="number" placeholder="Amount (Rs)" value={voucherAmount} onChange={e => setVoucherAmount(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                <input placeholder="Receipt link (optional)" value={voucherReceiptUrl} onChange={e => setVoucherReceiptUrl(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                <button type="submit" className="py-2 bg-slate-900 text-white rounded-lg font-semibold">Submit Request</button>
              </form>
            )}
            <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-4">Requestor</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {reimbursements.map(re => (
                    <tr key={re.id}>
                      <td className="px-6 py-4 font-semibold text-slate-900">{re.requested_by}</td>
                      <td className="px-6 py-4">Rs {re.amount.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">
                          {re.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-indigo-600 cursor-pointer hover:underline">View Receipt</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 6: Sponsorships */}
        {activeSubTab === 'sponsorships' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
              <h3 className="font-bold text-slate-900 text-sm mb-4">Sponsorship Tracker</h3>
              <div className="space-y-4">
                {sponsorships.map(sp => (
                  <div key={sp.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <h4 className="font-bold text-slate-900">{sp.sponsor_name}</h4>
                      <span className="text-xs text-slate-400 mt-1 block uppercase font-medium">{sp.status}</span>
                    </div>
                    <span className="font-bold text-slate-800">Rs {sp.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 7: Recruitment (Phase 4 — new) */}
        {activeSubTab === 'recruitment' && (
          <div className="space-y-6">
            <h3 className="font-bold text-slate-900 text-sm">Recruitment Drives</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {recruitmentDrives.map(drive => (
                <div key={drive.id} className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${ drive.status === 'open' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600' }`}>{drive.status}</span>
                    <span className="text-xs text-slate-400">{drive.recruitment_period}</span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">{drive.title}</h4>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">{drive.eligibility}</p>
                  <div className="mt-3 text-xs text-slate-400">Positions available: {drive.positions_available}</div>
                </div>
              ))}
              {recruitmentDrives.length === 0 && (
                <div className="text-xs text-slate-400">No recruitment drives yet for this club.</div>
              )}
            </div>
          </div>
        )}

        {/* Tab 8: Announcements (Phase 4 — new) */}
        {activeSubTab === 'announcements' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-sm">Club Announcements</h3>
              <button
                onClick={() => setAnnouncementFormOpen(true)}
                className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                New Announcement
              </button>
            </div>
            {announcementFormOpen && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await api.post(`/clubs/${selectedClubId}/announcements`, {
                    club_id: selectedClubId, title: announcementTitle, body: announcementBody, announcement_type: announcementType,
                  });
                  setAnnouncementTitle(''); setAnnouncementBody('');
                  setAnnouncementFormOpen(false);
                  setReloadTick(t => t + 1);
                }}
                className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm space-y-3 text-xs"
              >
                <input required placeholder="Title" value={announcementTitle} onChange={e => setAnnouncementTitle(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                <textarea required rows={3} placeholder="Message" value={announcementBody} onChange={e => setAnnouncementBody(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                <select value={announcementType} onChange={e => setAnnouncementType(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <option value="general">General Update</option>
                  <option value="recruitment">Recruitment</option>
                  <option value="event">Event Update</option>
                  <option value="deadline">Deadline Reminder</option>
                </select>
                <button type="submit" className="py-2 px-4 bg-slate-900 text-white rounded-lg font-semibold">Publish</button>
              </form>
            )}
            <div className="space-y-4">
              {announcements.map(a => (
                <div key={a.id} className="p-4 rounded-xl bg-white border border-slate-200/60 shadow-sm text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900">{a.title}</span>
                    <span className="text-xs uppercase text-slate-400">{a.announcement_type}</span>
                  </div>
                  <p className="text-slate-500 mt-2 leading-relaxed">{a.body}</p>
                </div>
              ))}
              {announcements.length === 0 && <div className="text-xs text-slate-400">No announcements yet.</div>}
            </div>
          </div>
        )}

        {/* Tab 9: Annual Planning (Phase 4 remainder — new) */}
        {activeSubTab === 'annual-plan' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Annual Planning Workspace</h3>
              <button
                onClick={() => setPlanFormOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> New Annual Plan
              </button>
            </div>
            {planFormOpen && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await api.post(`/clubs/${selectedClubId}/annual-plans`, {
                    academic_year: CURRENT_ACADEMIC_YEAR, vision: planVision, objectives: planObjectives,
                    budget_allocation: Number(planBudget) || 0,
                  });
                  setPlanVision(''); setPlanObjectives(''); setPlanBudget('');
                  setPlanFormOpen(false);
                  setReloadTick(t => t + 1);
                }}
                className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm space-y-3 text-xs"
              >
                <textarea required rows={2} placeholder="Vision" value={planVision} onChange={e => setPlanVision(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                <textarea rows={2} placeholder="Objectives" value={planObjectives} onChange={e => setPlanObjectives(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                <input type="number" placeholder="Budget allocation (Rs)" value={planBudget} onChange={e => setPlanBudget(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                <button type="submit" className="py-2 px-4 bg-slate-900 text-white rounded-lg font-semibold">Save as Draft ({CURRENT_ACADEMIC_YEAR})</button>
              </form>
            )}
            <div className="space-y-4">
              {annualPlans.map(plan => {
                const stages = ['draft', 'faculty_coordinator_review', 'cultural_coordinator_review', 'hod_review', 'approved', 'locked'];
                const stageIdx = stages.indexOf(plan.status);
                return (
                  <div key={plan.id} className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-slate-900 text-sm">Academic Year {plan.academic_year}</span>
                      <span className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-sky-50 text-sky-600">
                        {plan.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {/* Stage timeline */}
                    <div className="flex items-center gap-1 mb-4">
                      {stages.map((s, idx) => (
                        <div key={s} className={`h-1.5 flex-1 rounded-full ${idx <= stageIdx ? 'bg-emerald-500' : 'bg-slate-100 '}`} title={s} />
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{plan.vision}</p>
                    {plan.review_comments && (
                      <div className="mt-3 p-3 rounded-lg bg-amber-50 text-amber-700 text-xs">
                        Review comment: {plan.review_comments}
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      {plan.status === 'draft' && (
                        <button
                          onClick={async () => { await api.post(`/clubs/annual-plans/${plan.id}/submit`, {}); setReloadTick(t => t + 1); }}
                          className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-semibold"
                        >Submit for Review</button>
                      )}
                      {ANNUAL_PLAN_STAGE_PERMISSIONS[plan.status] && hasPermission(ANNUAL_PLAN_STAGE_PERMISSIONS[plan.status]) && (
                        <>
                          <Button
                            label="Approve"
                            variant="primary"
                            size="sm"
                            clickAction={async () => { await api.post(`/clubs/annual-plans/${plan.id}/review`, { action: 'approve' }); setReloadTick(t => t + 1); }}
                          />
                          <Button
                            label="Reject"
                            variant="destructive"
                            size="sm"
                            clickAction={async () => { await api.post(`/clubs/annual-plans/${plan.id}/review`, { action: 'reject', comments: 'Please revise.' }); setReloadTick(t => t + 1); }}
                          />
                        </>
                      )}
                      {plan.status === 'approved' && (
                        <button
                          onClick={async () => { await api.post(`/clubs/annual-plans/${plan.id}/lock`, {}); setReloadTick(t => t + 1); }}
                          className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-semibold"
                        >Lock Plan</button>
                      )}
                    </div>
                  </div>
                );
              })}
              {annualPlans.length === 0 && <div className="text-xs text-slate-400">No annual plan yet for this club.</div>}
            </div>
          </div>
        )}

        {/* Tab 10: Documents Workspace + Knowledge Base (Phase 4 remainder — new) */}
        {activeSubTab === 'documents' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button onClick={() => setDocsView('all')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${docsView === 'all' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>All Documents</button>
                <button onClick={() => setDocsView('knowledge-base')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${docsView === 'knowledge-base' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>Knowledge Base</button>
              </div>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!docFile) return;
                const fd = new FormData();
                fd.append('file', docFile);
                fd.append('name', docName || docFile.name);
                fd.append('category', docCategory);
                fd.append('tags', docTags);
                await api.upload(`/clubs/${selectedClubId}/documents`, fd);
                setDocFile(null); setDocName(''); setDocTags('');
                setReloadTick(t => t + 1);
              }}
              className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs"
            >
              <input required type="file" onChange={e => setDocFile(e.target.files?.[0] ?? null)} className="sm:col-span-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
              <input placeholder="Display name (optional)" value={docName} onChange={e => setDocName(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
              <select value={docCategory} onChange={e => setDocCategory(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                {['Annual Plans', 'Reports', 'Meeting Documents', 'Policies', 'Templates', 'Recruitment Material', 'Financial Documents', 'Brand Assets', 'Presentations'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input placeholder="Tags (comma separated, e.g. sop,knowledge-base)" value={docTags} onChange={e => setDocTags(e.target.value)} className="sm:col-span-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
              <button type="submit" className="py-2 bg-slate-900 text-white rounded-lg font-semibold">Upload</button>
            </form>
            <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Version</th>
                    <th className="px-6 py-4">Tags</th>
                    <th className="px-6 py-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {(docsView === 'all' ? documents : knowledgeBase).map(d => (
                    <tr key={d.id}>
                      <td className="px-6 py-4 font-semibold text-slate-900">{d.name}</td>
                      <td className="px-6 py-4">{d.category}</td>
                      <td className="px-6 py-4">v{d.version}</td>
                      <td className="px-6 py-4">{d.tags}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={async () => {
                            const { url } = await api.get<{ url: string }>(`/clubs/documents/${d.id}/download-url`);
                            window.open(url, '_blank');
                          }}
                          className="text-indigo-600 hover:underline"
                        >Download</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(docsView === 'all' ? documents : knowledgeBase).length === 0 && (
                <div className="p-6 text-xs text-slate-400">No documents yet.</div>
              )}
            </div>
          </div>
        )}

        {/* Tab 11: Reports (Phase 4 remainder — 6 additional report types) */}
        {activeSubTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex gap-2 flex-wrap">
              {([
                ['annual', 'Annual Club Report'],
                ['budget-summary', 'Budget Summary'],
                ['sponsorship-summary', 'Sponsorship Summary'],
                ['attendance', 'Attendance Report'],
                ['contribution', 'Contribution Report'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setReportType(id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${reportType === id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}
                >{label}</button>
              ))}
            </div>
            <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
              <pre className="text-xs whitespace-pre-wrap text-slate-600 leading-relaxed">
                {reportData ? JSON.stringify(reportData, null, 2) : 'Loading report…'}
              </pre>
            </div>
          </div>
        )}

        {/* Tab 12: Analytics Workspace — 9 widgets, PRD §48.2 priority order */}
        {activeSubTab === 'analytics' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {analytics?.widgets?.map((w: any) => (
              <div key={w.key} className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
                <h4 className="font-bold text-slate-900 text-sm mb-3">{w.title}</h4>
                <pre className="text-xs whitespace-pre-wrap text-slate-600 leading-relaxed">
                  {JSON.stringify(w.data, null, 2)}
                </pre>
              </div>
            ))}
            {!analytics && <div className="text-xs text-slate-400">Loading analytics…</div>}
          </div>
        )}

        {/* Tab 13: Club Settings — contact email + permission template assignment (Clubs PRD §17) */}
        {activeSubTab === 'settings' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm space-y-3 max-w-md">
              <h3 className="font-bold text-slate-900 text-sm">Official Contact Email</h3>
              {clubInfo?.viewer_can_manage_settings ? (
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={contactEmailDraft}
                    onChange={e => setContactEmailDraft(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                    placeholder="club@christuniversity.in"
                  />
                  <Button
                    label="Save"
                    variant="primary"
                    size="sm"
                    clickAction={async () => {
                      await api.put(`/clubs/${selectedClubId}/settings`, { contact_email: contactEmailDraft });
                      showToast({ body: 'Contact email updated.', type: 'info' });
                      setReloadTick(t => t + 1);
                    }}
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-500">{clubInfo?.contact_email || 'Not set.'}</p>
              )}
            </div>

            <h3 className="font-bold text-slate-900 text-sm">Permission Templates</h3>
            <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-4">Member</th>
                    <th className="px-6 py-4">Club Role</th>
                    <th className="px-6 py-4">Permission Template</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {members.map(m => (
                    <tr key={m.id}>
                      <td className="px-6 py-4 font-semibold text-slate-900">{m.student_name ?? m.student_id}</td>
                      <td className="px-6 py-4">{m.role}</td>
                      <td className="px-6 py-4">
                        {clubInfo?.viewer_can_manage_settings ? (
                          <select
                            defaultValue={m.permission_template ?? ''}
                            onChange={async (e) => {
                              await api.put(`/clubs/${selectedClubId}/members/${m.id}/permission-template`, {
                                permission_template: e.target.value || null,
                              });
                              showToast({ body: 'Permission template updated.', type: 'info' });
                            }}
                            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg"
                          >
                            <option value="">Member</option>
                            <option value="Club Head">Club Head</option>
                            <option value="Documentation Head">Documentation Head</option>
                            <option value="Events Head">Events Head</option>
                            <option value="Sponsorship Head">Sponsorship Head</option>
                            <option value="Finance Head">Finance Head</option>
                          </select>
                        ) : (
                          <span className="text-slate-500">{m.permission_template || 'Member'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab: Structure — configurable club hierarchy */}
        {activeSubTab === 'structure' && selectedClubId && (
          <ClubHierarchyChart
            clubId={selectedClubId}
            members={members}
            canEdit={!!clubInfo?.viewer_can_edit_hierarchy}
            levels={hierarchyLevels}
            onLevelsChanged={() => setReloadTick(t => t + 1)}
            onMembersChanged={() => setReloadTick(t => t + 1)}
          />
        )}

        {/* Tab: Tasks — club-scoped task manager (allocation + review of contribution work) */}
        {activeSubTab === 'tasks' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Task Manager</h3>
              {clubInfo?.viewer_can_assign_tasks && (
                <Button
                  label="Assign Task"
                  variant="primary"
                  size="sm"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => setTaskFormOpen(true)}
                />
              )}
            </div>
            {taskFormOpen && (
              <div className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <input required placeholder="Task title" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                <DateInput label="Due date" isLabelHidden value={asIsoDate(taskDueDate)} onChange={(v) => setTaskDueDate(v || '')} isRequired />
                <select value={taskPriority} onChange={e => setTaskPriority(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <select value={taskAssigneeId} onChange={e => setTaskAssigneeId(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <option value="">Select assignee</option>
                  {members.filter(m => m.status === 'active').map(m => (
                    <option key={m.id} value={m.student_id}>{m.student_name ?? m.student_id}</option>
                  ))}
                </select>
                <Button
                  label="Submit"
                  variant="primary"
                  size="sm"
                  isDisabled={!taskTitle || !taskDueDate || !taskAssigneeId}
                  clickAction={async () => {
                    await api.post(`/clubs/${selectedClubId}/tasks`, {
                      title: taskTitle, due_date: taskDueDate, priority: taskPriority, assignee_id: taskAssigneeId,
                    });
                    setTaskTitle(''); setTaskDueDate(''); setTaskAssigneeId('');
                    setTaskFormOpen(false);
                    showToast({ body: 'Task assigned.', type: 'info' });
                    setReloadTick(t => t + 1);
                  }}
                />
              </div>
            )}
            <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-4">Title</th>
                    <th className="px-6 py-4">Due Date</th>
                    <th className="px-6 py-4">Priority</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {clubTasks.map(t => (
                    <tr key={t.id}>
                      <td className="px-6 py-4 font-bold text-slate-900">{t.title}</td>
                      <td className="px-6 py-4">{t.due_date}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${t.priority === 'high' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>{t.priority}</span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-500">{t.status.replace(/_/g, ' ')}</td>
                      <td className="px-6 py-4 flex gap-2">
                        {t.status !== 'completed' && t.status !== 'pending_review' && (
                          <Button
                            label="Mark Done"
                            variant="secondary"
                            size="sm"
                            clickAction={async () => {
                              await api.put(`/tasks/${t.id}`, { status: 'pending_review' });
                              setReloadTick(x => x + 1);
                            }}
                          />
                        )}
                        {t.status === 'pending_review' && clubInfo?.viewer_can_assign_tasks && (
                          <>
                            <Button
                              label="Approve"
                              variant="primary"
                              size="sm"
                              clickAction={async () => {
                                await api.post(`/clubs/${selectedClubId}/tasks/${t.id}/review`, { action: 'approve' });
                                setReloadTick(x => x + 1);
                              }}
                            />
                            <Button
                              label="Send Back"
                              variant="secondary"
                              size="sm"
                              clickAction={async () => {
                                await api.post(`/clubs/${selectedClubId}/tasks/${t.id}/review`, { action: 'reject' });
                                setReloadTick(x => x + 1);
                              }}
                            />
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {clubTasks.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No tasks assigned yet.</td></tr>
                  )}
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
