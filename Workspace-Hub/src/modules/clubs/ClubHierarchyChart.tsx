import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Button } from '@astryxdesign/core/Button';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Plus, Trash2 } from 'lucide-react';
import type { ClubMember } from '../../api/types';
import { describeError } from '../../services/errors';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

interface HierarchyLevel {
  id: string;
  club_id: string;
  level_order: number;
  title: string;
}

interface ClubHierarchyChartProps {
  clubId: string;
  members: ClubMember[];
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
  // The hierarchy now arrives as a prop from the shell, so this component
  // never fetches and is never in a loading state of its own.
  const isLoading = false;
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

  /*
   * Deleting a level, behind a confirmation.
   *
   * Two things were wrong before. It fired on a single click of a
   * hover-revealed icon — permanently removing a position from the club's
   * structure with nothing in between — and the failure path was
   * `console.error(e)`. The server refuses a level that still has members
   * assigned, so the common failure showed the user NOTHING: the level simply
   * did not disappear, with no explanation anywhere they would look.
   */
  const [pendingDelete, setPendingDelete] = useState<HierarchyLevel | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/clubs/${clubId}/hierarchy/levels/${pendingDelete.id}`);
      setPendingDelete(null);
      load();
      // The member list is keyed by level, so a removed level changes it.
      onMembersChanged();
    } catch (e) {
      // Shown IN the dialog, which stays open: the usual reason is "members are
      // still assigned to this level", and that is actionable.
      setDeleteError(describeError(e));
    } finally {
      setIsDeleting(false);
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
    <>
    <div className="space-y-6">
      <h3 className="font-heading font-semibold text-primary text-sm">Club Structure</h3>
      <div className="p-8 rounded-lg bg-card border border-border shadow-sm flex flex-col items-center gap-0">
        {ranks.map((rank, rankIdx) => {
          const titlesAtRank = levels.filter(l => l.level_order === rank);
          const memberCountByLevel = (levelId: string) => members.filter(m => m.hierarchy_level_id === levelId).length;
          return (
            <React.Fragment key={rank}>
              {rankIdx > 0 && <div className="w-px h-6 bg-sand-300" />}
              <div className="flex flex-wrap gap-3 justify-center items-stretch">
                {titlesAtRank.map(level => (
                  <div key={level.id} className="px-4 py-3 rounded-lg border border-border bg-body text-center min-w-[140px] relative group">
                    {canEdit ? (
                      <input
                        defaultValue={level.title}
                        onBlur={(e) => { if (e.target.value.trim() && e.target.value !== level.title) renameLevel(level.id, e.target.value.trim()); }}
                        className="w-full bg-transparent text-center font-bold text-primary text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                      />
                    ) : (
                      <div className="font-bold text-primary text-xs">{level.title}</div>
                    )}
                    <div className="text-xs text-secondary mt-1">{memberCountByLevel(level.id)} member(s)</div>
                    {canEdit && (
                      <button
                        onClick={() => setPendingDelete(level)}
                        aria-label={`Delete the ${level.title} position`}
                        title="Delete position"
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-card border border-border text-secondary hover:text-error flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
                      className="w-24 px-2 py-1 text-xs bg-card border border-dashed border-border-strong rounded-lg"
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
            className="text-xs px-3 py-2 bg-card border border-border rounded-lg w-72"
          />
          <Button label="Add Level" size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={addNewBottomLevel} />
        </div>
      )}
    </div>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Delete this position?"
        body={
          pendingDelete
            ? `"${pendingDelete.title}" will be removed from the club's structure. This cannot be undone, and it will fail if members are still assigned to it.`
            : ''
        }
        confirmLabel="Delete position"
        isBusy={isDeleting}
        error={deleteError ?? undefined}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteError(null);
        }}
      />
    </>
  );
};