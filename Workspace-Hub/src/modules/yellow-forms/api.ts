import { api } from '../../services/api';
import type {
  ClaimSheet,
  ClaimSheetUpsert,
  PreApproval,
  PreApprovalCreate,
  PreApprovalUpdate,
  ReviewAction,
  StudentLookup,
} from '../../api/types';

/**
 * Every yellow-form write, and the two imperative reads, with their paths in
 * one place. Reads that screens render go through the hooks in api/hooks.ts;
 * after any of these succeeds, call `useYellowFormInvalidator()`.
 */
export const yellowFormApi = {
  createPreApproval: (clubId: string, body: PreApprovalCreate) =>
    api.post<PreApproval>(`/yellow-forms/clubs/${clubId}/pre-approvals`, body),
  /** `students`, when present, REPLACES the list. */
  updatePreApproval: (id: string, body: PreApprovalUpdate) =>
    api.put<PreApproval>(`/yellow-forms/pre-approvals/${id}`, body),
  deletePreApproval: (id: string) => api.delete<void>(`/yellow-forms/pre-approvals/${id}`),
  submitPreApproval: (id: string) =>
    api.post<PreApproval>(`/yellow-forms/pre-approvals/${id}/submit`, {}),
  reviewPreApproval: (id: string, body: ReviewAction) =>
    api.post<PreApproval>(`/yellow-forms/pre-approvals/${id}/review`, body),

  createClaimSheet: (preApprovalId: string, body: ClaimSheetUpsert = { students: [] }) =>
    api.post<ClaimSheet>(`/yellow-forms/pre-approvals/${preApprovalId}/claim-sheet`, body),
  /** `students` REPLACES the list. */
  updateClaimSheet: (id: string, body: ClaimSheetUpsert) =>
    api.put<ClaimSheet>(`/yellow-forms/claim-sheets/${id}`, body),
  deleteClaimSheet: (id: string) => api.delete<void>(`/yellow-forms/claim-sheets/${id}`),
  submitClaimSheet: (id: string) =>
    api.post<ClaimSheet>(`/yellow-forms/claim-sheets/${id}/submit`, {}),
  reviewClaimSheet: (id: string, body: ReviewAction) =>
    api.post<ClaimSheet>(`/yellow-forms/claim-sheets/${id}/review`, body),

  lookupStudent: (clubId: string, registerNumber: string) =>
    api.get<StudentLookup>(
      `/yellow-forms/clubs/${clubId}/student-lookup?register_number=${encodeURIComponent(registerNumber.trim())}`,
    ),
  /** Saves the sheet as `<reference_number>.csv` in the department's template layout. */
  downloadClaimSheetCsv: (sheet: Pick<ClaimSheet, 'id' | 'reference_number'>) =>
    api.download(`/yellow-forms/claim-sheets/${sheet.id}/export.csv`, `${sheet.reference_number}.csv`),
};
