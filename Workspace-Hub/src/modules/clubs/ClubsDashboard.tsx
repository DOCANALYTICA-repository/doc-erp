import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { Users, Calendar, Wallet, FileText, Award, Layers, Plus, CheckCircle, Clock } from 'lucide-react';

export const ClubsDashboard: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'members' | 'events' | 'budget' | 'reimbursements' | 'sponsorships' | 'recruitment' | 'announcements'>('dashboard');

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
      } catch (e) {
        console.error(e);
      }
    }
    loadData();
  }, [activeSubTab, selectedClubId]);

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
          { id: 'sponsorships', label: 'Sponsorships' }
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
                  setActiveSubTab('dashboard'); setActiveSubTab('events');
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
                  setActiveSubTab('dashboard'); setActiveSubTab('reimbursements');
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
                  setActiveSubTab('dashboard'); setActiveSubTab('announcements');
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
      </main>
    </div>
  );
};
