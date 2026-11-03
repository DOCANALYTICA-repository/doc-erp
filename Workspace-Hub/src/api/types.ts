import type { components } from './schema';

/**
 * The shapes the server actually returns — DERIVED, not hand-written.
 *
 * `schema.d.ts` is generated from the FastAPI app's own /api/v1/openapi.json
 * (`npm run generate:api`). Every type below is an alias into it, so the
 * frontend literally cannot name a field the server does not send.
 *
 * This removes the whole class of bug that BLK-04 and BLK-05 belonged to: a
 * `logo` the API never serialized, and a timetable field the dev mock supplied
 * under a different key than the real endpoint. Both rendered as blank space
 * and both were invisible until production. They are now compile errors.
 *
 * Rerun the generator after ANY change to a Pydantic schema.
 */
type Schemas = components['schemas'];

// --- Clubs -----------------------------------------------------------------
export type Club = Schemas['ClubOut'];
export type MyClub = Schemas['MyClubOut'];
export type ClubDetail = Schemas['ClubDetailOut'];
export type ClubCapabilities = Schemas['ClubCapabilities'];
export type ClubCounters = Schemas['ClubCounters'];
export type ClubBootstrap = Schemas['ClubBootstrap'];
export type ClubRelationship = MyClub['relationship'];
export type ClubMember = Schemas['ClubMemberOut'];
export type HierarchyLevel = Schemas['ClubHierarchyLevelOut'];
export type ClubEvent = Schemas['EventOut'];
export type Budget = Schemas['BudgetOut'];
export type Reimbursement = Schemas['ReimbursementOut'];
export type Sponsorship = Schemas['SponsorshipOut'];
export type Announcement = Schemas['AnnouncementOut'];
export type RecruitmentDrive = Schemas['RecruitmentDriveOut'];
export type AnnualPlan = Schemas['AnnualPlanOut'];
export type AwaitingReviewPlan = Schemas['AwaitingReviewPlanOut'];
export type ClubDocument = Schemas['ClubDocumentOut'];
export type EventAttendance = Schemas['EventAttendanceOut'];

// --- Claims ----------------------------------------------------------------
export type Claim = Schemas['ClaimOut'];
/** GET /claims returns an envelope with a total, not a bare array. */
export type ClaimPage = Schemas['Page_ClaimOut_'];
export type ClaimParticipant = Schemas['ClaimParticipantOut'];
export type AttendanceEntry = Schemas['AttendanceEntryOut'];
export type PendingApproval = Schemas['PendingApprovalOut'];
/** Which slice of a reviewer's claims to fetch: their to-do list, or their history. */
export type ClaimView = 'pending' | 'actioned';
export type TimetableSession = Schemas['TimetableSessionOut'];
export type SupportingDocument = Schemas['SupportingDocumentOut'];

// --- Yellow forms (club co-curricular attendance claims) --------------------
export type PreApproval = Schemas['PreApprovalOut'];
export type PreApprovalStudent = Schemas['PreApprovalStudentOut'];
/** The approved list a claim sheet is filed against, as attached to the sheet. */
export type PreApprovalSummary = Schemas['PreApprovalSummary'];
export type PreApprovalCreate = Schemas['PreApprovalCreate'];
export type PreApprovalUpdate = Schemas['PreApprovalUpdate'];
export type PreApprovalStudentInput = Schemas['PreApprovalStudentIn'];
export type ClaimSheet = Schemas['ClaimSheetOut'];
export type ClaimSheetStudent = Schemas['ClaimSheetStudentOut'];
export type ClaimSheetEntry = Schemas['ClaimSheetEntryOut'];
export type ClaimSheetUpsert = Schemas['ClaimSheetUpsert'];
export type ClaimSheetStudentInput = Schemas['ClaimSheetStudentIn'];
export type ClaimSheetEntryInput = Schemas['ClaimSheetEntryIn'];
/** GET /yellow-forms/queue, /reviewed and /mine all return this pair of lists. */
export type YellowFormBundle = Schemas['YellowFormBundle'];
export type EligibleStudent = Schemas['EligibleStudentOut'];
export type StudentLookup = Schemas['StudentLookupOut'];
export type ReviewAction = Schemas['ReviewAction'];
export type ReviewActionKind = ReviewAction['action'];

// --- Faculty workspace -----------------------------------------------------
export type Note = Schemas['NoteOut'];
export type FacultyDocument = Schemas['DocumentOut'];
export type Meeting = Schemas['MeetingOut'];
export type MeetingActionItem = Schemas['MeetingActionItem'];
export type Reminder = Schemas['ReminderOut'];
export type DirectoryEntry = Schemas['UserDirectoryOut'];
export type Task = Schemas['TaskOut'];

// --- Platform --------------------------------------------------------------
export type Notification = Schemas['NotificationOut'];
export type ActionItem = Schemas['ActionItem'];
export type ActionQueue = Schemas['ActionQueue'];
export type Pipeline = Schemas['Pipeline'];
export type PipelineStage = Schemas['PipelineStage'];
export type PipelineItem = Schemas['PipelineItem'];
export type ActionKind = ActionItem['kind'];
export type Urgency = ActionItem['urgency'];

// --- Public content --------------------------------------------------------
/** The PUBLIC shape: outcomes/careers as real lists, not the storage strings. */
export type Programme = Schemas['PublicProgrammeOut'];
/** The admin/storage shape, where those two are comma-joined. */
export type ProgrammeRecord = Schemas['ProgrammeOut'];

export type PublicStatistics = Schemas['PublicStatisticsOut'];
export type GalleryImage = Schemas['PublicGalleryImageOut'];
export type ShowcaseClub = Schemas['ShowcaseClubOut'];

/**
 * The remaining endpoint FastAPI types as a bare dict. Declared by hand and
 * kept deliberately small — if it grows, give it a response_model on the
 * server instead of widening it here.
 */
/**
 * GET /claims/workflow — the claim state machine, served from the same table
 * the backend enforces (backend/app/core/claim_workflow.py).
 */
export interface ClaimWorkflowStage {
  id: string;
  label: string;
  club_label: string;
  is_terminal: boolean;
  is_parallel: boolean;
  next_on_approve: string | null;
}

export interface ClaimWorkflow {
  stage_order: string[];
  actions: string[];
  stages: ClaimWorkflowStage[];
}

/**
 * GET /yellow-forms/workflow — both yellow-form state machines and the claim
 * sheet's period columns, served from backend/app/core/yellow_form_workflow.py.
 */
export interface ClaimSheetPeriod {
  id: string;
  /** Human label, e.g. "9:45 AM". */
  label: string;
  /** The department template's column header, e.g. "Period 9_45AM". */
  column: string;
}

/** One step of the happy path; `is_review` marks the steps a reviewer signs. */
export interface YellowFormWorkflowStep {
  id: string;
  label: string;
  is_review: boolean;
}

export interface YellowFormWorkflowPart {
  stage_order: string[];
  stages: YellowFormWorkflowStep[];
  status_labels: Record<string, string>;
}

export interface YellowFormWorkflow {
  actions: ReviewActionKind[];
  periods: ClaimSheetPeriod[];
  pre_approval: YellowFormWorkflowPart;
  claim_sheet: YellowFormWorkflowPart;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  type: string;
  venue?: string;
  priority?: string;
  hour?: string;
}

/** GET /search — FastAPI types this as a bare dict, so it is declared here. */
export interface SearchResults {
  users: { id: string; name: string; email: string; role: string }[];
  clubs: { id: string; name: string; category: string }[];
  meetings: { id: string; title: string; date: string; venue: string }[];
  tasks: { id: string; title: string; priority: string; status: string }[];
}

export const EMPTY_SEARCH_RESULTS: SearchResults = {
  users: [], clubs: [], meetings: [], tasks: [],
};

/** POST /auth/login */
export type LoginResponse = Schemas['Token'] & {
  /** Present only from the dev-only offline mocks; the real API omits it. */
  user_profile?: unknown;
  capabilities?: Record<string, string>;
};

/** GET /auth/me */
export type UserProfile = Schemas['UserProfileOut'];
