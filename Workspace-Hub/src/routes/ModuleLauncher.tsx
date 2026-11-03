import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/useStore';
import { LogOut } from 'lucide-react';
import { PageLoader } from '../components/ui/PageLoader';
import { MODULES, PRODUCT_NAME } from '../lib/navigation';

export const ModuleLauncher: React.FC = () => {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const hasPermission = useStore((state) => state.hasPermission);
  const navigate = useNavigate();

  if (!user) return <PageLoader label="Loading workspace..." />;

  return (
    <div className="min-h-screen bg-body flex items-center justify-center p-6">
      <div className="w-full max-w-4xl space-y-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-center gap-3">
            <img src="/icon-512.png" alt="" width={40} height={40} className="h-10 w-10 rounded-lg shadow-sm" />
            <div>
              <h1 className="font-heading text-xl font-semibold tracking-tight text-primary">{PRODUCT_NAME}</h1>
              <p className="text-xs text-secondary mt-0.5">Select a workspace according to your platform authorizations.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-secondary bg-muted px-3 py-1.5 rounded-full border border-border">
              Role: {user.primary_role} {user.role_tags_str && `(${user.role_tags_str})`}
            </span>
            <button onClick={logout} className="p-2 bg-error-muted text-error rounded-lg hover:bg-error-muted transition-colors shadow-sm">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {MODULES.map(m => {
            const eligible = hasPermission(m.permission);
            return (
              <div
                key={m.id}
                onClick={() => eligible && navigate(`/app/${m.id}`)}
                className={`p-6 rounded-lg border bg-card text-left transition-all duration-300 shadow-sm flex flex-col justify-between h-56 ${ eligible ? 'border-border cursor-pointer hover:shadow-lg hover:scale-[1.01]' : 'border-border opacity-40 cursor-not-allowed' }`}
              >
                <div>
                  <m.icon className={`w-8 h-8 ${eligible ? 'text-primary ' : 'text-secondary'}`} />
                  <h3 className="font-bold text-primary mt-4 text-base">{m.label}</h3>
                  <p className="text-xs text-secondary mt-2 leading-relaxed">{m.description}</p>
                </div>
                <div className="text-xs font-semibold pt-4 flex items-center justify-between">
                  <span className={eligible ? 'text-accent' : 'text-secondary'}>
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
