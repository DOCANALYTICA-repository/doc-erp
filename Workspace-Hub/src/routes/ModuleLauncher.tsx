import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/useStore';
import { Sparkles, LogOut, Award, Compass, FolderOpen } from 'lucide-react';
import { PageLoader } from '../components/ui/PageLoader';

const MODULES = [
  { id: 'clubs', title: 'Clubs Management', desc: 'Recruitments, annual planning, budget requests, and sponsorship tracking.', icon: Award, perm: 'clubs:view' },
  { id: 'claims', title: 'Attendance Claims', desc: 'Submit medical claims, co-curricular exemptions, and check review queues.', icon: Compass, perm: 'claims:view_own' },
  { id: 'faculty', title: 'Faculty Workspace', desc: 'Meetings agenda planner, curriculum tracking, personal folders, and notes.', icon: FolderOpen, perm: 'faculty:dashboard' },
];

export const ModuleLauncher: React.FC = () => {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const hasPermission = useStore((state) => state.hasPermission);
  const navigate = useNavigate();

  if (!user) return <PageLoader label="Loading workspace..." />;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl space-y-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-200/50 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shadow">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-xl text-slate-900 tracking-tight">DOC Unified Digital Platform</h1>
              <p className="text-xs text-slate-400 mt-0.5">Select a workspace according to your platform authorizations.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200/50">
              Role: {user.primary_role} {user.role_tags_str && `(${user.role_tags_str})`}
            </span>
            <button onClick={logout} className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors shadow-sm">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {MODULES.map(m => {
            const eligible = hasPermission(m.perm);
            return (
              <div
                key={m.id}
                onClick={() => eligible && navigate(`/app/${m.id}`)}
                className={`p-6 rounded-2xl border bg-white text-left transition-all duration-300 shadow-sm flex flex-col justify-between h-56 ${ eligible ? 'border-slate-200/60 cursor-pointer hover:shadow-lg hover:scale-[1.01]' : 'border-slate-100 opacity-40 cursor-not-allowed' }`}
              >
                <div>
                  <m.icon className={`w-8 h-8 ${eligible ? 'text-slate-900 ' : 'text-slate-400'}`} />
                  <h3 className="font-bold text-slate-900 mt-4 text-base">{m.title}</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">{m.desc}</p>
                </div>
                <div className="text-xs font-semibold pt-4 flex items-center justify-between">
                  <span className={eligible ? 'text-indigo-500' : 'text-slate-400'}>
                    {eligible ? 'Open Workspace →' : 'Access Restricted'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
