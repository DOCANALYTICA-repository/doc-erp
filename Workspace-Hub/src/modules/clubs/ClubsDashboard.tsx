import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { Users, Calendar, Wallet, FileText, Award, Layers, Plus, CheckCircle, Clock } from 'lucide-react';

const CURRENT_ACADEMIC_YEAR = '2025-2026';

export const ClubsDashboard: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'members' | 'events' | 'budget' | 'reimbursements' | 'sponsorships' | 'recruitment' | 'announcements' | 'annual-plan' | 'documents' | 'reports' | 'analytics' | 'settings'>('dashboard');

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

  // Bumped after any mutation (create/submit/review/upload/...) to force the
  // main data effect below to refetch. Toggling activeSubTab back and forth
  // does NOT work for this — React batches both setState calls into one
  // render, so the effect's dependency never actually changes and it never
  // re-runs.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    api.get<any[]>('/clubs/my-memberships').then(clubs => {
      setMyClubs(clubs);
      if (clubs.length > 0) setSelectedClubId(prev => prev ?? clubs[0].id);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedClubId) return;
    async function loadData() {
      try {
        const club = await api.get<any>(`/clubs/${selectedClubId}`);
        setClubInfo(club);

        const mbrs = await api.get<any[]>(`/clubs/${selectedClubId}/members`);
        setMembers(mbrs);

        const evts = await api.get<any[]>(`/clubs/${selectedClubId}/events`);
        setEvents(evts);

        const bdg = await api.get<any[]>(`/clubs/${selectedClubId}/budgets`);
        setBudgets(bdg);

        const re = await api.get<any[]>(`/clubs/${selectedClubId}/reimbursements`);
        setReimbursements(re);

        const sp = await api.get<any[]>(`/clubs/${selectedClubId}/sponsorships`);
        setSponsorships(sp);

        const ann = await api.get<any[]>(`/clubs/${selectedClubId}/announcements`);
        setAnnouncements(ann);

        const drives = await api.get<any[]>(`/clubs/${selectedClubId}/recruitment-drives`);
        setRecruitmentDrives(drives);

        const plans = await api.get<any[]>(`/clubs/${selectedClubId}/annual-plans`);
        setAnnualPlans(plans);

        const docs = await api.get<any[]>(`/clubs/${selectedClubId}/documents`);
        setDocuments(docs);

        const kb = await api.get<any[]>(`/clubs/${selectedClubId}/knowledge-base`);
        setKnowledgeBase(kb);
      } catch (e) {
        console.error(e);
      }
    }
    loadData();
  }, [activeSubTab, selectedClubId, reloadTick]);

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

  if (myClubs.length === 0) {
    return (
      <div className="w-full min-h-[calc(100vh-4rem)] flex items-center justify-center text-sm text-slate-400">
        You are not currently a member of any club.
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-[#0c0c0c] flex flex-col">
      {/* Club Selector */}
      {myClubs.length > 1 && (
        <div className="w-full border-b border-slate-200/40 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-2 flex gap-2 items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Club:</span>
          <select
            value={selectedClubId ?? ''}
            onChange={(e) => setSelectedClubId(e.target.value)}
            className="text-xs px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-950 dark:text-white"
          >
            {myClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Sub Navbar (Horizontal Top Bar) */}
      <div className="w-full border-b border-slate-200/40 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-2.5 flex gap-4 overflow-x-auto scrollbar-none z-10 shadow-sm">
        {[
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'members', label: 'Members' },
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
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap focus:outline-none ${
              activeSubTab === item.id
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Workspace Content */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl w-full mx-auto">
        {clubInfo && (
          <div className="mb-8 flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
              <img src={clubInfo.logo} className="w-full h-full object-cover" alt="Club Logo" />
            </div>
            <div>
              <span className="text-xs font-bold text-sky-500 uppercase tracking-wider">{clubInfo.category} Club</span>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{clubInfo.name}</h1>
              <p className="text-xs text-slate-500 mt-1">{clubInfo.description}</p>
            </div>
          </div>
        )}

        {/* Tab 1: Dashboard */}
        {activeSubTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-400">Total Members</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{members.length}</div>
                </div>
                <Users className="w-8 h-8 text-sky-500/80" />
              </div>
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-400">Total Events</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{events.length}</div>
                </div>
                <Calendar className="w-8 h-8 text-emerald-500/80" />
              </div>
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-400">Budget Spent</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    Rs {budgets[0]?.spent_amount.toLocaleString() || '0'}
                  </div>
                </div>
                <Wallet className="w-8 h-8 text-rose-500/80" />
              </div>
            </div>

            {/* Quick Activity List */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4 text-sm">Key Operational Indicators</h3>
              <div className="space-y-3">
                {events.map((evt, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/80 text-xs">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${evt.status === 'approved' ? 'bg-emerald-500' : 'bg-yellow-500'}`} />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{evt.title}</span>
                        <span className="text-[10px] text-slate-400 ml-2">({evt.date})</span>
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">Student Name</th>
                  <th className="px-6 py-4">Club Responsibility</th>
                  <th className="px-6 py-4">Academic Period</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {members.map(mbr => (
                  <tr key={mbr.id}>
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{mbr.name}</td>
                    <td className="px-6 py-4">{mbr.role}</td>
                    <td className="px-6 py-4">{mbr.academic_year}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-medium">
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
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Annual Event Schedule</h3>
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
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs"
              >
                <input required placeholder="Event title" value={eventTitle} onChange={e => setEventTitle(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
                <input required type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
                <input required placeholder="Venue" value={eventVenue} onChange={e => setEventVenue(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
                <input required type="number" placeholder="Budget (Rs)" value={eventBudget} onChange={e => setEventBudget(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
                <button type="submit" className="sm:col-span-4 py-2 bg-slate-900 text-white rounded-lg font-semibold">Submit Proposal</button>
              </form>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {events.map(evt => (
                <div key={evt.id} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        evt.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                      }`}>{evt.status}</span>
                      <span className="text-[10px] text-slate-400">{evt.date}</span>
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">{evt.title}</h4>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">{evt.description}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex justify-between text-[10px] text-slate-400">
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
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-2">Academic Year {budgets[0].academic_year}</h3>
              <div className="mt-6 flex flex-col gap-2">
                <div className="flex justify-between text-xs text-slate-400 font-medium">
                  <span>Usage Compliance</span>
                  <span>{Math.round((budgets[0].spent_amount / budgets[0].allocated_amount) * 100)}% Used</span>
                </div>
                <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-900 dark:bg-white rounded-full transition-all duration-500"
                    style={{ width: `${(budgets[0].spent_amount / budgets[0].allocated_amount) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mt-2">
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
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Reimbursement Vouchers</h3>
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
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs"
              >
                <input required type="number" placeholder="Amount (Rs)" value={voucherAmount} onChange={e => setVoucherAmount(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
                <input placeholder="Receipt link (optional)" value={voucherReceiptUrl} onChange={e => setVoucherReceiptUrl(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
                <button type="submit" className="py-2 bg-slate-900 text-white rounded-lg font-semibold">Submit Request</button>
              </form>
            )}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-4">Requestor</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {reimbursements.map(re => (
                    <tr key={re.id}>
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{re.requested_by}</td>
                      <td className="px-6 py-4">Rs {re.amount.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-medium">
                          {re.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-indigo-600 dark:text-indigo-400 cursor-pointer hover:underline">View Receipt</td>
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
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-4">Sponsorship Tracker</h3>
              <div className="space-y-4">
                {sponsorships.map(sp => (
                  <div key={sp.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">{sp.sponsor_name}</h4>
                      <span className="text-[10px] text-slate-400 mt-1 block uppercase font-medium">{sp.status}</span>
                    </div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">Rs {sp.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 7: Recruitment (Phase 4 — new) */}
        {activeSubTab === 'recruitment' && (
          <div className="space-y-6">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Recruitment Drives</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {recruitmentDrives.map(drive => (
                <div key={drive.id} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      drive.status === 'open' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'
                    }`}>{drive.status}</span>
                    <span className="text-[10px] text-slate-400">{drive.recruitment_period}</span>
                  </div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">{drive.title}</h4>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">{drive.eligibility}</p>
                  <div className="mt-3 text-[10px] text-slate-400">Positions available: {drive.positions_available}</div>
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
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Club Announcements</h3>
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
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm space-y-3 text-xs"
              >
                <input required placeholder="Title" value={announcementTitle} onChange={e => setAnnouncementTitle(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
                <textarea required rows={3} placeholder="Message" value={announcementBody} onChange={e => setAnnouncementBody(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
                <select value={announcementType} onChange={e => setAnnouncementType(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
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
                <div key={a.id} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900 dark:text-white">{a.title}</span>
                    <span className="text-[10px] uppercase text-slate-400">{a.announcement_type}</span>
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
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Annual Planning Workspace</h3>
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
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm space-y-3 text-xs"
              >
                <textarea required rows={2} placeholder="Vision" value={planVision} onChange={e => setPlanVision(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
                <textarea rows={2} placeholder="Objectives" value={planObjectives} onChange={e => setPlanObjectives(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
                <input type="number" placeholder="Budget allocation (Rs)" value={planBudget} onChange={e => setPlanBudget(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
                <button type="submit" className="py-2 px-4 bg-slate-900 text-white rounded-lg font-semibold">Save as Draft ({CURRENT_ACADEMIC_YEAR})</button>
              </form>
            )}
            <div className="space-y-4">
              {annualPlans.map(plan => {
                const stages = ['draft', 'faculty_coordinator_review', 'cultural_coordinator_review', 'hod_review', 'approved', 'locked'];
                const stageIdx = stages.indexOf(plan.status);
                return (
                  <div key={plan.id} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">Academic Year {plan.academic_year}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-50 text-sky-600">
                        {plan.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {/* Stage timeline */}
                    <div className="flex items-center gap-1 mb-4">
                      {stages.map((s, idx) => (
                        <div key={s} className={`h-1.5 flex-1 rounded-full ${idx <= stageIdx ? 'bg-emerald-500' : 'bg-slate-100 dark:bg-slate-800'}`} title={s} />
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{plan.vision}</p>
                    {plan.review_comments && (
                      <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[11px]">
                        Review comment: {plan.review_comments}
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                      {plan.status === 'draft' && (
                        <button
                          onClick={async () => { await api.post(`/clubs/annual-plans/${plan.id}/submit`, {}); setReloadTick(t => t + 1); }}
                          className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-semibold"
                        >Submit for Review</button>
                      )}
                      {['faculty_coordinator_review', 'cultural_coordinator_review', 'hod_review'].includes(plan.status) && (
                        <>
                          <button
                            onClick={async () => { await api.post(`/clubs/annual-plans/${plan.id}/review`, { action: 'approve' }); setReloadTick(t => t + 1); }}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold"
                          >Approve</button>
                          <button
                            onClick={async () => { await api.post(`/clubs/annual-plans/${plan.id}/review`, { action: 'reject', comments: 'Please revise.' }); setReloadTick(t => t + 1); }}
                            className="px-3 py-1.5 bg-rose-600 text-white rounded-lg font-semibold"
                          >Reject</button>
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
              className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs"
            >
              <input required type="file" onChange={e => setDocFile(e.target.files?.[0] ?? null)} className="sm:col-span-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
              <input placeholder="Display name (optional)" value={docName} onChange={e => setDocName(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
              <select value={docCategory} onChange={e => setDocCategory(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                {['Annual Plans', 'Reports', 'Meeting Documents', 'Policies', 'Templates', 'Recruitment Material', 'Financial Documents', 'Brand Assets', 'Presentations'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input placeholder="Tags (comma separated, e.g. sop,knowledge-base)" value={docTags} onChange={e => setDocTags(e.target.value)} className="sm:col-span-3 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg" />
              <button type="submit" className="py-2 bg-slate-900 text-white rounded-lg font-semibold">Upload</button>
            </form>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Version</th>
                    <th className="px-6 py-4">Tags</th>
                    <th className="px-6 py-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {(docsView === 'all' ? documents : knowledgeBase).map(d => (
                    <tr key={d.id}>
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{d.name}</td>
                      <td className="px-6 py-4">{d.category}</td>
                      <td className="px-6 py-4">v{d.version}</td>
                      <td className="px-6 py-4">{d.tags}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={async () => {
                            const { url } = await api.get<{ url: string }>(`/clubs/documents/${d.id}/download-url`);
                            window.open(url, '_blank');
                          }}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline"
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
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${reportType === id ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500'}`}
                >{label}</button>
              ))}
            </div>
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm">
              <pre className="text-[11px] whitespace-pre-wrap text-slate-600 dark:text-slate-300 leading-relaxed">
                {reportData ? JSON.stringify(reportData, null, 2) : 'Loading report…'}
              </pre>
            </div>
          </div>
        )}

        {/* Tab 12: Analytics Workspace — 9 widgets, PRD §48.2 priority order */}
        {activeSubTab === 'analytics' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {analytics?.widgets?.map((w: any) => (
              <div key={w.key} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm">
                <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-3">{w.title}</h4>
                <pre className="text-[11px] whitespace-pre-wrap text-slate-600 dark:text-slate-300 leading-relaxed">
                  {JSON.stringify(w.data, null, 2)}
                </pre>
              </div>
            ))}
            {!analytics && <div className="text-xs text-slate-400">Loading analytics…</div>}
          </div>
        )}

        {/* Tab 13: Club Settings — permission template assignment (Clubs PRD §17) */}
        {activeSubTab === 'settings' && (
          <div className="space-y-6">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Permission Templates</h3>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-4">Member</th>
                    <th className="px-6 py-4">Club Role</th>
                    <th className="px-6 py-4">Permission Template</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {members.map(m => (
                    <tr key={m.id}>
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{m.name ?? m.student_id}</td>
                      <td className="px-6 py-4">{m.role}</td>
                      <td className="px-6 py-4">
                        <select
                          defaultValue={m.permission_template ?? ''}
                          onChange={async (e) => {
                            await api.put(`/clubs/${selectedClubId}/members/${m.id}/permission-template`, {
                              permission_template: e.target.value || null,
                            });
                          }}
                          className="px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                        >
                          <option value="">Member</option>
                          <option value="Club Head">Club Head</option>
                          <option value="Documentation Head">Documentation Head</option>
                          <option value="Events Head">Events Head</option>
                          <option value="Sponsorship Head">Sponsorship Head</option>
                          <option value="Finance Head">Finance Head</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
