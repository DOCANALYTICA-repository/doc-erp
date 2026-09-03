import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Button } from '@astryxdesign/core/Button';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Plus, Trash2 } from 'lucide-react';

interface HierarchyLevel {
  id: string;
  club_id: string;
  level_order: number;
  title: string;
}

interface ClubHierarchyChartProps {
  clubId: string;
  members: any[];
  canEdit: boolean;
  onMembersChanged: () => void;
  /**
   * The hierarchy the PARENT already fetched.
   *
   * This component used to re-fetch /clubs/{id}/hierarchy on mount, which the
   * parent had loaded moments earlier — the endpoint was hit twice on every
   * workspace load. It still owns its own copy of the list so that local
   * edits (add/rename/delete a level) render immediately, but the initial
   * value now comes in as a prop.
   */
  levels: HierarchyLevel[];
  /** Ask the parent to refetch after a structural edit. */
  onLevelsChanged: () => void;
}

/** Read-only-by-default org-chart: one row per rank (ascending level_order,
 * i.e. top of the org at the top of the page), sibling titles at the same
 * rank rendered side-by-side. When canEdit (the club's assigned Faculty
 * Coordinator, or super_admin), each row/box gets add/rename/delete
 * affordances. Plain flex layout — no graph library needed for "all levels
 * visible at once, siblings side-by-side." */
export const ClubHierarchyChart: React.FC<ClubHierarchyChartProps> = ({
  clubId, members, canEdit, onMembersChanged, levels: levelsFromParent, onLevelsChanged,
}) => {
  const [levels, setLevels] = useState<HierarchyLevel[]>(levelsFromParent);
  const [isLoading, setIsLoading] = useState(false);
  const [newTitleByRank, setNewTitleByRank] = useState<Record<number, string>>({});
  const [newLevelTitle, setNewLevelTitle] = useState('');

  // Track the parent's copy rather than fetching our own.
  useEffect(() => { setLevels(levelsFromParent); }, [levelsFromParent]);

  // After a structural edit, re-read from the server via the parent so both
  // copies stay in step.
  const load = () => onLevelsChanged();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} height={56} index={i} />)}
      </div>
    );
  }

  const ranks: number[] = levels
    .map(l => l.level_order)
    .filter((order, idx, all) => all.indexOf(order) === idx)
    .sort((a, b) => a - b);
  const bottomRank = ranks.length > 0 ? Math.max(...ranks) : null;

  const renameLevel = async (id: string, title: string) => {
    await api.put(`/clubs/${clubId}/hierarchy/levels/${id}`, { title });
    load();
    onMembersChanged();
  };

  const deleteLevel = async (id: string) => {
    try {
      await api.delete(`/clubs/${clubId}/hierarchy/levels/${id}`);
      load();
    } catch (e) {
      // e.g. members still assigned to this level — surfaced inline is enough for now
      console.error(e);
    }
  };

  const addSibling = async (levelOrder: number) => {
    const title = newTitleByRank[levelOrder]?.trim();
    if (!title) return;
    await api.post(`/clubs/${clubId}/hierarchy/levels`, { level_order: levelOrder, title });
    setNewTitleByRank(prev => ({ ...prev, [levelOrder]: '' }));
    load();
  };

  const addNewBottomLevel = async () => {
    if (!newLevelTitle.trim()) return;
    const nextOrder = (bottomRank ?? 0) + 10;
    await api.post(`/clubs/${clubId}/hierarchy/levels`, { level_order: nextOrder, title: newLevelTitle.trim() });
    setNewLevelTitle('');
    load();
  };

  return (
    <div className="space-y-6">
      <h3 className="font-bold text-slate-900 text-sm">Club Structure</h3>
      <div className="p-8 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex flex-col items-center gap-0">
        {ranks.map((rank, rankIdx) => {
          const titlesAtRank = levels.filter(l => l.level_order === rank);
          const memberCountByLevel = (levelId: string) => members.filter(m => m.hierarchy_level_id === levelId).length;
          return (
            <React.Fragment key={rank}>
              {rankIdx > 0 && <div className="w-px h-6 bg-slate-200" />}
              <div className="flex flex-wrap gap-3 justify-center items-stretch">
                {titlesAtRank.map(level => (
                  <div key={level.id} className="px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-center min-w-[140px] relative group">
                    {canEdit ? (
                      <input
                        defaultValue={level.title}
                        onBlur={(e) => { if (e.target.value.trim() && e.target.value !== level.title) renameLevel(level.id, e.target.value.trim()); }}
                        className="w-full bg-transparent text-center font-bold text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-slate-300 rounded"
                      />
                    ) : (
                      <div className="font-bold text-slate-900 text-xs">{level.title}</div>
                    )}
                    <div className="text-[10px] text-slate-400 mt-1">{memberCountByLevel(level.id)} member(s)</div>
                    {canEdit && (
                      <button
                        onClick={() => deleteLevel(level.id)}
                        title="Delete position"
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-rose-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <input
                      placeholder="+ position"
                      value={newTitleByRank[rank] || ''}
                      onChange={e => setNewTitleByRank(prev => ({ ...prev, [rank]: e.target.value }))}
                      className="w-24 px-2 py-1 text-[10px] bg-white border border-dashed border-slate-300 rounded-lg"
                    />
                    <Button label="Add" size="sm" variant="secondary" onClick={() => addSibling(rank)} />
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {canEdit && (
        <div className="flex items-center gap-2">
          <input
            placeholder="New bottom-level position title"
            value={newLevelTitle}
            onChange={e => setNewLevelTitle(e.target.value)}
            className="text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg w-72"
          />
          <Button label="Add Level" size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={addNewBottomLevel} />
        </div>
      )}
    </div>
  );
};
