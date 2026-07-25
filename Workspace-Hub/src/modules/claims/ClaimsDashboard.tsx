import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useStore } from '../../context/useStore';
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { FileText, Plus, Calendar, Compass, ShieldAlert, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

export const ClaimsDashboard: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'my_claims' | 'new_claim' | 'review_queue'>('dashboard');
  const user = useStore(state => state.user);
  
  const [claims, setClaims] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);
  
  // Submit claim form state
  const [category, setCategory] = useState<'medical' | 'co_curricular'>('medical');
  const [dateRange, setDateRange] = useState('');
  const [reason, setReason] = useState('');
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  
  useEffect(() => {
    async function loadData() {
      try {
        const list = await api.get<any[]>('/claims');
        setClaims(list);
        
        const tt = await api.get<any[]>('/claims/timetable?programme=B.Com%20(Hons)&semester=5&section=A');
        setTimetable(tt);
      } catch (e) {
        console.error(e);
      }
    }
    loadData();
  }, [activeSubTab]);

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedHours.length === 0) {
      alert("Please select at least one missed class hour from the timetable.");
      return;
    }

    const missedClasses = selectedHours.map(hourId => {
      const slot = timetable.find(t => t.id === hourId);
      return {
        subject: slot.subject,
        date: "2026-07-06", // Default date for mock submission
        hour: slot.hour,
        subject_faculty_id: slot.faculty_id
      };
    });

    const payload = {
      category,
      academic_year: "2025-2026",
      semester: "5",
      programme: "B.Com (Hons)",
      section: "A",
      date_range: dateRange,
      reason,
      missed_classes: missedClasses
    };

    try {
      await api.post('/claims', payload);
      alert("Claim submitted successfully!");
      setActiveSubTab('my_claims');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-[#0c0c0c] flex flex-col">
      {/* Sub Navbar (Horizontal Top Bar) */}
      <div className="w-full border-b border-slate-200/40 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-2.5 flex gap-4 overflow-x-auto scrollbar-none z-10 shadow-sm">
        {[
          { id: 'dashboard', label: 'Overview' },
          { id: 'my_claims', label: 'My Claims' },
          { id: 'new_claim', label: 'New Submission' },
          ...(user?.primary_role === 'faculty' ? [{ id: 'review_queue', label: 'Review Queue' }] : [])
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
        <div className="mb-6">
          <span className="text-xs font-bold text-sky-500 uppercase tracking-wider">Attendance Claims Workflow</span>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">Claim Process Management</h1>
          <p className="text-xs text-slate-500 mt-1">Submit medical certificates or pre-approved co-curricular attendance requests for faculty review.</p>
        </div>

        {/* Tab 1: Dashboard Overview */}
        {activeSubTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { title: 'Total Submissions', count: claims.length, icon: FileText, color: 'text-indigo-500' },
                { title: 'Approved Claims', count: claims.filter(c => c.status === 'approved' || c.status === 'closed').length, icon: CheckCircle, color: 'text-emerald-500' },
                { title: 'Pending Review', count: claims.filter(c => c.status === 'submitted' || c.status === 'under_review').length, icon: Clock, color: 'text-yellow-500' },
                { title: 'Action Required', count: claims.filter(c => c.status === 'returned').length, icon: AlertTriangle, color: 'text-rose-500' }
              ].map((card, i) => (
                <div key={i} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-400">{card.title}</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{card.count}</div>
                  </div>
                  <card.icon className={`w-8 h-8 ${card.color}`} />
                </div>
              ))}
            </div>

            {/* Quick Claims List */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-4">Latest Claim Submissions</h3>
              <div className="space-y-4">
                {claims.slice(0, 3).map((claim, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-950 dark:text-white">{claim.reference_number}</span>
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] uppercase font-bold">{claim.category}</span>
                      </div>
                      <p className="text-slate-500 mt-1">Duration: {claim.date_range} | Stage: <span className="font-semibold text-slate-700 dark:text-slate-300">{claim.current_workflow_stage}</span></p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full font-bold uppercase text-[10px] ${
                      claim.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-yellow-50 text-yellow-600'
                    }`}>{claim.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Claims List */}
        {activeSubTab === 'my_claims' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-4">Reference No</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Date Range</th>
                    <th className="px-6 py-4">Current Workflow Stage</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {claims.map(claim => (
                    <tr key={claim.id}>
                      <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{claim.reference_number}</td>
                      <td className="px-6 py-4 font-medium uppercase text-slate-500">{claim.category}</td>
                      <td className="px-6 py-4">{claim.date_range}</td>
                      <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">{claim.current_workflow_stage}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                          claim.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-yellow-50 text-yellow-600'
                        }`}>
                          {claim.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: New Claim Submission */}
        {activeSubTab === 'new_claim' && (
          <form onSubmit={handleSubmitClaim} className="space-y-6">
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Create New Attendance Claim</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-500">Claim Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-slate-950 dark:text-white"
                  >
                    <option value="medical">Medical (Certificate Required)</option>
                    <option value="co_curricular">Co-Curricular (Pre-Approval Required)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-500">Date Range</label>
                  <input
                    type="text"
                    placeholder="YYYY-MM-DD to YYYY-MM-DD"
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    required
                    className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-slate-950 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500">Missed Timetable Sessions (Select all that apply)</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {timetable.map(slot => (
                    <label key={slot.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={selectedHours.includes(slot.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedHours([...selectedHours, slot.id]);
                          } else {
                            setSelectedHours(selectedHours.filter(id => id !== slot.id));
                          }
                        }}
                        className="mt-0.5"
                      />
                      <div className="text-[10px]">
                        <div className="font-bold text-slate-900 dark:text-white">{slot.subject}</div>
                        <div className="text-slate-400 mt-0.5">{slot.hour}</div>
                        <div className="text-slate-400">Faculty: {slot.faculty}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500">Detailed Explanation / Reason</label>
                <textarea
                  rows={4}
                  placeholder="Explain why you missed these academic sessions..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-slate-950 dark:text-white"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500">Upload Certificate PDF</label>
                <input type="file" className="text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white" />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={user?.primary_role === 'super_admin'}
                className="px-5 py-2.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow"
              >
                {user?.primary_role === 'super_admin' ? 'View-Only Admin Mode' : 'Submit Form to Class Teacher'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 4: Faculty Review Queue */}
        {activeSubTab === 'review_queue' && (
          <div className="space-y-6">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Review Queue</h3>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-4">Reference No</th>
                    <th className="px-6 py-4">Student</th>
                    <th className="px-6 py-4">Reason</th>
                    <th className="px-6 py-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {claims.map(claim => (
                    <tr key={claim.id}>
                      <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{claim.reference_number}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{claim.submitted_name || 'Vikram Aditya'}</td>
                      <td className="px-6 py-4 max-w-xs truncate">{claim.reason}</td>
                      <td className="px-6 py-4 flex gap-2">
                        <button
                          disabled={user?.primary_role === 'super_admin'}
                          onClick={async () => {
                            await api.post(`/claims/${claim.id}/approve-stage?action=approve`, {});
                            alert("Approved!");
                            setActiveSubTab('dashboard');
                          }}
                          className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-semibold text-[10px]"
                        >
                          Approve
                        </button>
                        <button
                          disabled={user?.primary_role === 'super_admin'}
                          onClick={async () => {
                            await api.post(`/claims/${claim.id}/approve-stage?action=revise`, {});
                            alert("Returned for revision!");
                            setActiveSubTab('dashboard');
                          }}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-semibold text-[10px]"
                        >
                          Revise
                        </button>
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
