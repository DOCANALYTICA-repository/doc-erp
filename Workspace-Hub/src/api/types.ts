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

// --- Claims ----------------------------------------------------------------
export type Claim = Schemas['ClaimOut'];
export type ClaimParticipant = Schemas['ClaimParticipantOut'];
export type AttendanceEntry = Schemas['AttendanceEntryOut'];
export type TimetableSession = Schemas['TimetableSessionOut'];
export type SupportingDocument = Schemas['SupportingDocumentOut'];

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
export type ActionKind = ActionItem['kind'];
export type Urgency = ActionItem['urgency'];

// --- Public content --------------------------------------------------------
export type Programme = Schemas['ProgrammeOut'];

/**
 * The few endpoints FastAPI types as a bare dict, so there is no generated
 * schema to alias. Declared by hand and kept deliberately small — if one of
 * these grows, give it a response_model on the server instead of widening it
 * here.
 */
export interface PublicStatistics {
  total_students: number;
  faculty_count: number;
  number_of_clubs: number;
  years_established: number;
  founded_year: number;
}

export interface GalleryImage {
  id: string;
  title: string;
  url: string;
  caption?: string | null;
}

export interface ShowcaseClub {
  id: string;
  name: string;
  category: string;
  logo: string | null;
  description: string | null;
  contact_email: string | null;
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
