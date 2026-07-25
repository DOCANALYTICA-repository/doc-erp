# **DOC Unified Digital Platform**

# **Product Requirements Document (PRD)**

# **Module 3 – Faculty Workspace Portal**

**Version:** 1.0

**Status:** Planning Complete – Phase 1 (Foundation, Architecture & Core Workspaces)

**Dependencies:**

* Master Platform PRD  
* Clubs Management Portal PRD  
* Attendance Claims Portal PRD  
* Shared Platform Services

---

# **1\. Overview**

## **1.1 Purpose**

The Faculty Workspace Portal (FWP) is the personal productivity workspace for every faculty member within the Department of Commerce.

Unlike operational modules such as the Clubs Management Portal or Attendance Claims Portal, the Faculty Workspace Portal does not own departmental workflows. Instead, it provides faculty members with a centralized personal workspace that improves organization, planning and day-to-day efficiency while surfacing relevant information from other modules.

The Faculty Workspace Portal acts as a productivity layer built on top of the DOC Unified Digital Platform.

---

## **1.2 Vision**

To provide every faculty member with a modern digital workspace that consolidates their personal schedules, meetings, tasks, reminders, documents and departmental context into a single, distraction-free interface.

---

## **1.3 Objectives**

The Faculty Workspace Portal shall:

* Improve faculty productivity.  
* Centralize personal workspaces.  
* Reduce context switching across modules.  
* Provide quick access to operational responsibilities.  
* Improve meeting management.  
* Improve task management.  
* Improve personal organization.  
* Surface relevant departmental information.  
* Integrate seamlessly with every platform module.

---

# **2\. Scope**

The Faculty Workspace Portal includes:

* Personal Dashboard  
* Personal Calendar  
* Meetings  
* Tasks  
* Notes  
* Documents  
* Faculty Directory  
* Reminders  
* Notification Summary  
* Department Reports  
* Personal Workspace Customization

The portal intentionally excludes:

* Attendance Claim approvals  
* Club Management  
* Student Management  
* Attendance processing  
* Cross-faculty collaboration  
* Student communication

Operational workflows remain within their respective modules.

---

# **3\. Design Philosophy**

## **3.1 Personal Productivity**

Every screen should answer one question:

**"How can this help the logged-in faculty member work more efficiently today?"**

The portal should never become another administrative system.

---

## **3.2 Module Ownership**

The Faculty Workspace Portal does not own workflows belonging to other modules.

Examples:

Attendance Claim approvals remain within the Attendance Claims Portal.

Club operations remain within the Clubs Management Portal.

The Faculty Workspace Portal simply provides awareness and navigation.

---

## **3.3 Minimal Cognitive Load**

The interface should minimize:

* unnecessary clicks,  
* excessive information,  
* duplicated functionality,  
* repetitive actions.

---

## **3.4 Mobile First**

Faculty should comfortably use the portal on:

* phones,  
* tablets,  
* laptops,  
* desktops.

Every interaction should remain responsive across devices.

---

## **3.5 Workspace Personalization**

Faculty members should be able to customize their own workspace without affecting other users.

---

# **4\. Platform Integration**

The Faculty Workspace Portal consumes shared platform services.

## **Shared Services**

* Authentication  
* User Management  
* RBAC  
* Notification Engine  
* Calendar Engine  
* Task Engine  
* Workspace Engine  
* Search  
* Reporting Engine  
* Audit Logs  
* File Storage

No shared functionality shall be independently implemented inside this module.

---

# **5\. Users**

Version 1 supports all Department of Commerce faculty.

This includes:

* Assistant Professors  
* Associate Professors  
* Professors  
* Class Teachers  
* Course Coordinators  
* HOD  
* Faculty Coordinators  
* Faculty Club Coordinators

Faculty responsibilities are determined through Role Tags rather than separate user types.

---

# **6\. Portal Philosophy**

The Faculty Workspace Portal serves as a **Personal Operating System** rather than a departmental management application.

Every faculty member receives:

* one dashboard,  
* one calendar,  
* one task list,  
* one meeting workspace,  
* one notes workspace,  
* one document workspace,

which dynamically adapts according to their platform permissions.

---

# **7\. Navigation**

The Faculty Workspace Portal follows the shared application shell.

Global navigation consists of:

* Top Navigation  
* Sidebar Navigation  
* Mobile Bottom Navigation  
* Global Search  
* User Menu

Workspace navigation consists of:

* Dashboard  
* Calendar  
* Tasks  
* Meetings  
* Notes  
* Documents  
* Faculty Directory  
* Reports  
* Settings

---

# **8\. Dashboard**

## **8.1 Purpose**

The Dashboard acts as the faculty member's personal homepage.

Its purpose is to provide immediate awareness of today's responsibilities rather than historical information.

---

## **8.2 Default Widget Order**

Version 1 uses the following default layout.

1. Today's Schedule  
2. Tasks  
3. Notification Summary  
4. Calendar Preview  
5. Meetings  
6. Reminders  
7. Notes  
8. Quick Actions

Faculty members may customize this arrangement.

---

## **8.3 Dashboard Principles**

The dashboard should:

* load quickly,  
* surface actionable information,  
* minimize scrolling,  
* prioritize today's work.

---

# **9\. Dashboard Widgets**

## **Today's Schedule**

Displays:

* Teaching Timetable  
* Department Meetings  
* Club Meetings  
* Department Events  
* Personal Reminders

---

## **Tasks**

Displays:

* Due Today  
* Upcoming  
* Overdue

Tasks are aggregated from every supported source.

---

## **Notification Summary**

Displays summary cards only.

Examples:

Attendance Claims Portal

• 3 unread items

Clubs Portal

• 2 unread items

Selecting a card opens the respective module.

The Faculty Workspace Portal does not display individual notifications.

---

## **Calendar Preview**

Displays:

* Today's Events  
* Tomorrow's Events  
* Upcoming Week

---

## **Meetings**

Displays:

* Today's Meetings  
* Upcoming Meetings

---

## **Reminders**

Displays:

* Due Today  
* Upcoming  
* Overdue

---

## **Notes**

Displays:

* Recent Notes  
* Pinned Notes

---

## **Quick Actions**

Provides immediate access to:

* Create Task  
* Create Reminder  
* Schedule Meeting  
* Create Note  
* Upload Document  
* Open Calendar

---

# **10\. Workspace Personalization**

Faculty members may:

* Reorder widgets.  
* Collapse widgets.  
* Expand widgets.

Customization affects only the current user's workspace.

---

# **11\. Calendar Workspace**

## **11.1 Purpose**

The Calendar Workspace provides a unified personal schedule.

The calendar consumes events from multiple platform services while maintaining a single coherent view.

---

## **11.2 Calendar Sources**

The calendar displays:

* Teaching Timetable  
* Department Meetings  
* Club Meetings  
* Department Events  
* Personal Events  
* Personal Reminders

---

## **11.3 Visibility Controls**

Faculty members may independently toggle:

* Teaching Schedule  
* Meetings  
* Department Events  
* Club Events  
* Personal Events

Visibility preferences persist across sessions.

---

## **11.4 Calendar Views**

Version 1 supports:

* Day View  
* Week View  
* Month View

---

## **11.5 Calendar Behaviour**

Calendar events remain synchronized with their originating module.

Editing permissions depend upon the event owner.

---

# **12\. Tasks Workspace**

## **12.1 Purpose**

The Tasks Workspace consolidates actionable work into one personal task manager.

Tasks originate from multiple modules but appear as one unified list.

---

## **12.2 Task Sources**

Tasks may originate from:

* Personal Tasks  
* Meeting Action Items  
* Clubs Management Portal  
* Faculty-created Reminders

Attendance Claim approvals remain within the Attendance Claims Portal and do not appear as tasks.

---

## **12.3 Task Information**

Each task contains:

* Title  
* Description  
* Due Date  
* Priority  
* Source Module  
* Status  
* Related Entity  
* Assignee

---

## **12.4 Task States**

Tasks progress through:

Pending

↓

In Progress

↓

Completed

↓

Archived

---

## **12.5 Cross-Module Tasks**

Tasks generated from meetings or club activities automatically appear within the originating module where relevant.

The shared Task Engine maintains synchronization across all consuming modules.

---

# **13\. Meetings Workspace**

## **13.1 Purpose**

The Meetings Workspace manages planning, execution and documentation of faculty meetings.

Meetings become structured records rather than calendar events alone.

---

## **13.2 Meeting Types**

Version 1 supports:

* Department Meetings  
* Club Meetings  
* External Meetings

Personal meetings are intentionally excluded.

---

## **13.3 Meeting Creation**

Every faculty member may create meetings.

The creator becomes the meeting owner.

---

## **13.4 Meeting Participants**

Meetings may include:

* Faculty  
* Clubs  
* External Guests

Participant invitations generate corresponding calendar entries.

---

## **13.5 Meeting Information**

Each meeting stores:

* Title  
* Type  
* Date  
* Time  
* Duration  
* Venue  
* Participants  
* Attachments

---

## **13.6 Recurring Meetings**

Recurring meetings are supported.

Examples include:

* Weekly Department Meetings  
* Monthly Coordinator Meetings  
* Club Review Meetings

---

## **13.7 Meeting Attendance**

Attendance records include:

* Present  
* Absent  
* Reason for Absence

Attendance contributes to the meeting history but does not affect any attendance-related workflows elsewhere in the platform.

---

## **13.8 Meeting Completion**

Before marking a meeting complete, the organizer must provide:

* Minutes  
* Decisions  
* Action Items

This ensures that meetings produce actionable outcomes rather than static records.

---

## **13.9 Meeting Outputs**

Meetings may generate:

* Tasks  
* Reminders  
* Calendar Updates  
* Notifications (within the originating module)

Meeting outcomes integrate automatically with the shared Task Engine and Calendar Engine.

---

# **14\. Notes Workspace**

## **14.1 Purpose**

The Notes Workspace provides a lightweight personal knowledge repository.

It is designed for individual organization rather than collaboration.

---

## **14.2 Note Types**

Faculty may create:

* Quick Notes  
* Teaching Notes  
* Meeting Notes  
* Personal Notes

---

## **14.3 Note Features**

Version 1 supports:

* Rich Text  
* Pinning  
* Search  
* Tags  
* Favorites  
* Recent Notes

---

## **14.4 Privacy**

Notes are strictly personal.

Notes cannot be:

* shared,  
* assigned,  
* commented on,  
* collaboratively edited.

This maintains the portal's personal productivity philosophy.

---

# **15\. Reminders Workspace**

## **15.1 Purpose**

The Reminders Workspace helps faculty manage important dates independently of formal tasks.

---

## **15.2 Reminder Types**

Version 1 supports:

* One-Time Reminders  
* Recurring Reminders  
* Due-Date Reminders

---

## **15.3 Reminder Visibility**

Reminders appear within:

* Dashboard  
* Calendar  
* Task Workspace

ensuring visibility regardless of how faculty organize their work.

---

## **15.4 Reminder Lifecycle**

Reminders progress through:

Scheduled

↓

Active

↓

Completed

↓

Archived

---

# **16\. Workspace Engine**

The Faculty Workspace Portal is the primary consumer of the shared Workspace Engine.

The Workspace Engine provides reusable capabilities including:

* Dashboard Widgets  
* Widget Layouts  
* Widget Personalization  
* Quick Actions  
* Workspace Preferences  
* Dashboard Configuration

Future platform modules may reuse these capabilities without implementing separate dashboard systems.

# **17\. Documents Workspace**

## **17.1 Purpose**

The Documents Workspace provides every faculty member with a personal, organized repository for storing and managing work-related documents.

Unlike the document repositories in other modules, this workspace is personal in nature and is intended to improve day-to-day productivity rather than facilitate departmental document management.

---

## **17.2 Document Types**

The workspace supports:

* Personal Documents  
* Meeting Attachments  
* Teaching Resources  
* Templates  
* Administrative Files  
* Reference Material

Documents remain independent of operational workflows unless explicitly attached to meetings.

---

## **17.3 Folder Management**

Faculty members may create unlimited folders and subfolders to organize documents.

Folder operations include:

* Create  
* Rename  
* Move  
* Delete  
* Favorite

Folder structures remain private to the owner.

---

## **17.4 Document Features**

Version 1 supports:

* File Upload  
* Folder Hierarchy  
* Tags  
* Favorites  
* Recent Documents  
* Download  
* Share via Link

---

## **17.5 Document Sharing**

Documents may be shared using secure links.

The platform shall generate shareable links without requiring recipient accounts.

Document owners may revoke shared links at any time.

Shared links provide controlled access without exposing the owner's workspace.

---

## **17.6 Recent Documents**

The workspace maintains a dynamic "Recent Documents" section based on recent access and modification history.

---

## **17.7 Favorites**

Faculty members may mark frequently used documents as Favorites.

Favorites appear on the dashboard for quick access.

---

# **18\. Faculty Directory**

## **18.1 Purpose**

The Faculty Directory provides a searchable internal directory of all Department of Commerce faculty members.

The directory exists to improve discoverability and communication within the department.

---

## **18.2 Directory Information**

Each faculty profile displays:

* Name  
* Designation  
* Department Role Tags  
* Clubs Coordinated  
* Official Email  
* Office Location  
* Office Hours  
* Profile Picture  
* Bio  
* Availability Status

---

## **18.3 Search**

Faculty may search the directory using:

* Name  
* Designation  
* Role Tags  
* Club Coordination  
* Office Location

---

## **18.4 Filters**

The directory supports filtering by:

* Designation  
* Role Tags  
* Club Coordinator  
* Office Location

Multiple filters may be combined simultaneously.

---

## **18.5 Faculty Availability**

Faculty members may manually set their availability status.

Supported statuses include:

* Available  
* Busy  
* On Leave

Availability is informational only and does not affect permissions or workflow routing.

---

## **18.6 Editable Profile Fields**

Faculty members may update:

* Phone Number  
* Office Hours  
* Profile Picture  
* Bio

Institutional information such as designation, official email and department affiliation is managed centrally and remains read-only.

---

# **19\. Reports Workspace**

## **19.1 Purpose**

The Reports Workspace provides faculty members with access to departmental operational reports relevant to their responsibilities.

This workspace does not replace reports generated within individual modules but serves as a consolidated reporting interface for faculty-level insights.

---

## **19.2 Available Reports**

Version 1 includes:

* Personal Task Summary  
* Meeting Summary  
* Calendar Summary  
* Department Operational Reports (permission-based)

Future modules may contribute additional reports through the shared Reporting Engine.

---

## **19.3 Export**

Reports support export through the shared Reporting Engine.

Version 1 supports:

* PDF

The architecture remains prepared for Excel and CSV exports.

---

# **20\. Search**

## **20.1 Scope**

The Faculty Workspace Portal provides a dedicated workspace search separate from the platform-wide search.

Workspace Search includes:

* Notes  
* Documents  
* Tasks  
* Meetings  
* Faculty Directory

Global platform search remains available through the shared application shell.

---

## **20.2 Search Behaviour**

Search prioritizes:

* Exact matches  
* Recent items  
* Frequently accessed content

Results are grouped by content type for easier navigation.

---

# **21\. Offline & Progressive Web App Behaviour**

## **21.1 Offline Support**

The Faculty Workspace Portal supports offline access for personal productivity features.

Available offline:

* Calendar (cached)  
* Tasks  
* Notes  
* Reminders  
* Recently Accessed Documents (metadata)

Operational modules continue to require connectivity.

---

## **21.2 Synchronization**

Changes made while offline synchronize automatically when connectivity is restored.

Synchronization shall preserve data integrity and prevent duplicate records.

---

# **22\. Notification Summary**

## **22.1 Philosophy**

Notifications remain owned by their originating modules.

The Faculty Workspace Portal provides only a summary of unread activity.

---

## **22.2 Summary Cards**

Examples:

Attendance Claims Portal

• 4 unread items

Clubs Management Portal

• 2 unread items

Selecting a summary opens the originating module.

The Faculty Workspace Portal never displays detailed notification feeds.

---

# **23\. Quick Actions**

The dashboard provides immediate access to frequently used actions.

Version 1 includes:

* Create Task  
* Create Reminder  
* Create Note  
* Schedule Meeting  
* Upload Document  
* Open Calendar

Quick Actions are configurable through the shared Workspace Engine.

---

# **24\. Business Rules**

## **24.1 Ownership**

All personal workspace data belongs exclusively to the logged-in faculty member.

This includes:

* Tasks  
* Notes  
* Documents  
* Reminders  
* Dashboard Preferences

---

## **24.2 Meetings**

Every faculty member may create meetings.

Meeting organizers are responsible for:

* Minutes  
* Decisions  
* Action Items

Meetings cannot be marked complete until these fields are populated.

---

## **24.3 Documents**

Documents remain private by default.

Sharing occurs only through generated links.

Downloads are permitted for authorized users accessing shared documents.

---

## **24.4 Calendar**

Calendar entries retain ownership within their originating module.

The Faculty Workspace Portal serves only as the unified viewing interface.

---

## **24.5 Tasks**

Tasks generated from meetings or clubs synchronize automatically through the shared Task Engine.

Task completion status remains consistent across all consuming modules.

---

## **24.6 Notes**

Notes are strictly personal.

No collaborative editing, commenting or sharing is supported.

---

# **25\. Security & Permissions**

## **25.1 RBAC**

The Faculty Workspace Portal consumes the shared platform RBAC framework.

Permissions are determined by:

* Primary Role  
* Role Tags  
* Functional Permissions

---

## **25.2 Personal Data**

Faculty may access only:

* Their personal workspace  
* Shared resources they are authorized to view  
* Department reports permitted by role

---

## **25.3 Module Boundaries**

The Faculty Workspace Portal shall not bypass permissions established within operational modules.

For example:

A faculty member without access to a specific club or attendance claim cannot gain access through this portal.

---

# **26\. Screen Inventory**

## **Dashboard**

* Dashboard  
* Widget Customization

---

## **Calendar**

* Calendar  
* Event Details

---

## **Tasks**

* Task List  
* Task Details

---

## **Meetings**

* Meeting List  
* Meeting Details  
* Create Meeting  
* Meeting Completion

---

## **Notes**

* Notes List  
* Note Editor

---

## **Documents**

* Document Library  
* Folder View  
* Document Details

---

## **Directory**

* Faculty Directory  
* Faculty Profile

---

## **Reports**

* Reports Dashboard  
* Report Viewer

---

## **Settings**

* Workspace Preferences  
* Notification Preferences  
* Widget Preferences

---

# **27\. Non-Functional Requirements**

## **Performance**

The portal shall:

* Load rapidly.  
* Support SPA-style navigation.  
* Minimize unnecessary network requests.  
* Synchronize efficiently across devices.  
* Remain responsive under slow network conditions.

---

## **Reliability**

The workspace shall preserve user data through automatic saving where appropriate.

Synchronization failures shall not result in data loss.

---

## **Scalability\*\***

The architecture shall support future additions including:

* Student Workspace  
* Administrative Workspace  
* Shared Workspaces  
* AI Productivity Tools

without redesign.

---

## **Maintainability**

Most yearly maintenance should consist of:

* Faculty imports  
* Academic year updates  
* Calendar configuration  
* Role updates

No structural modifications should be required.

---

# **28\. Acceptance Criteria**

The Faculty Workspace Portal shall successfully provide:

* A customizable personal dashboard  
* Unified personal calendar  
* Personal task management  
* Meeting management  
* Reminder management  
* Personal notes  
* Personal documents  
* Faculty directory  
* Notification summaries  
* Department reports  
* Offline productivity features

while preserving clear ownership boundaries with operational modules.

---

# **29\. Version 1 Deliverables**

Version 1 includes:

* Personal Dashboard  
* Workspace Personalization  
* Calendar  
* Tasks  
* Meetings  
* Meeting Attendance  
* Meeting Minutes  
* Reminders  
* Notes  
* Documents  
* Faculty Directory  
* Reports  
* Notification Summary  
* Offline Support  
* Search Integration

---

# **30\. Future Roadmap**

The architecture remains prepared for:

* Native mobile application  
* AI productivity assistant  
* Shared workspaces  
* Document versioning  
* Advanced calendar integrations  
* Smart scheduling  
* Voice notes  
* Meeting transcription  
* AI meeting summaries  
* Microsoft 365 / Google Workspace synchronization  
* Cross-department faculty collaboration

These enhancements should build upon the shared Workspace Engine, Task Engine and Calendar Engine introduced by the DOC Unified Digital Platform.

---

# **31\. Conclusion**

The Faculty Workspace Portal serves as the personal productivity layer of the DOC Unified Digital Platform.

Unlike the operational modules responsible for club management and attendance claims, the Faculty Workspace Portal focuses exclusively on helping faculty members organize, prioritize and manage their daily responsibilities through a unified digital workspace.

By integrating shared platform services such as the Workspace Engine, Task Engine, Calendar Engine and Reporting Engine, the portal eliminates unnecessary duplication while providing a consistent user experience across the entire platform.

The result is a modern, lightweight and extensible workspace that enables faculty members to remain organized, informed and productive while allowing operational workflows to remain within their respective modules.

