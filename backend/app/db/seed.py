import os
import sys
from datetime import datetime, timezone, timedelta

# Adjust path to import backend modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.models import Base
from app.models.user import User
from app.models.club import Club, ClubMember, Event, Budget, Reimbursement, Sponsorship, AnnualPlan, ClubDocument, EventAttendance, ClubHierarchyLevel
from app.models.claim import Claim, ClaimParticipant, AttendanceEntry, SupportingDocument, TimetableSession
from app.models.faculty import Note, Document, Meeting, Task
from app.models.notification import Notification
from app.models.faculty_assignment import FacultyAssignment
from app.models.content import Programme, GalleryImage
from app.core.security import get_password_hash

DESTRUCTIVE_ENV_FLAG = "ALLOW_DESTRUCTIVE_SEED"
DESTRUCTIVE_ENV_VALUE = "yes-destroy-this-database"


def _describe_target() -> str:
    """Human-readable target host, with any password stripped out."""
    url = settings.DATABASE_URL
    return url.rsplit("@", 1)[-1] if "@" in url else url


def reset_schema() -> None:
    """DROP and re-CREATE every table.

    This is destructive and irreversible. It refuses to run against anything
    that is not SQLite unless the caller has explicitly opted in through the
    environment, so that a bare `python app/db/seed.py` can never take out a
    remote database.
    """
    is_sqlite = settings.DATABASE_URL.startswith("sqlite")
    opted_in = os.environ.get(DESTRUCTIVE_ENV_FLAG) == DESTRUCTIVE_ENV_VALUE

    if not is_sqlite and not opted_in:
        raise RuntimeError(
            f"Refusing to drop every table on '{_describe_target()}'. "
            f"This is not a SQLite database. If you really mean it, set "
            f"{DESTRUCTIVE_ENV_FLAG}={DESTRUCTIVE_ENV_VALUE} and run again."
        )

    print(f"Resetting database schema on {_describe_target()} ...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def seed_database():
    """Insert the demo dataset. Non-destructive and safe against a migrated DB.

    Call reset_schema() first if you want a clean slate.
    """
    print("Seeding database...")
    Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()
    try:
        print("Generating mock users...")
        # 1. Super Admin
        admin = User(
            id="admin_1",
            email="admin@christuniversity.in",
            hashed_password=get_password_hash("admin123"),
            name="Super Admin",
            primary_role="super_admin",
            status="active"
        )
        db.add(admin)

        # 2. HOD
        hod = User(
            id="fac_hod",
            email="hod.commerce@christuniversity.in",
            hashed_password=get_password_hash("faculty123"),
            name="Dr. Joy Kishor (HOD)",
            primary_role="faculty",
            status="active",
            role_tags_str="HOD",
            designation="Professor & HOD",
            office_location="Block IV, Room 401",
            office_hours="Mon-Fri, 10:00 AM - 12:00 PM",
            bio="Head of the Department of Commerce.",
        )
        db.add(hod)

        # 3. Class Teachers and Subject Faculty
        fac1 = User(
            id="fac_class_teacher",
            email="teacher.class@christuniversity.in",
            hashed_password=get_password_hash("faculty123"),
            name="Prof. Sarah Abraham",
            primary_role="faculty",
            status="active",
            role_tags_str="Class Teacher,Course Coordinator",
            designation="Assistant Professor",
            office_location="Block IV, Room 210",
            office_hours="Mon/Wed/Fri, 02:00 PM - 03:00 PM",
        )
        fac2 = User(
            id="fac_subject_1",
            email="faculty.finance@christuniversity.in",
            hashed_password=get_password_hash("faculty123"),
            name="Dr. Anil Kumar",
            primary_role="faculty",
            status="active",
            role_tags_str="Subject Faculty",
            designation="Associate Professor",
            office_location="Block IV, Room 215",
        )
        fac3 = User(
            id="fac_subject_2",
            email="faculty.accounting@christuniversity.in",
            hashed_password=get_password_hash("faculty123"),
            name="Prof. David D'Souza",
            primary_role="faculty",
            status="active",
            role_tags_str="Club Faculty Coordinator", # Co-ordinates commerce club
            designation="Assistant Professor",
            office_location="Block IV, Room 218",
        )
        fac4 = User(
            id="fac_cultural_coordinator",
            email="faculty.cultural@christuniversity.in",
            hashed_password=get_password_hash("faculty123"),
            name="Dr. Meera Nair",
            primary_role="faculty",
            status="active",
            role_tags_str="Cultural Coordinator",
            designation="Associate Professor",
            office_location="Block IV, Room 220",
        )
        db.add_all([fac1, fac2, fac3, fac4])

        # 4. Students
        std_leader = User(
            id="std_president",
            email="student.president@christuniversity.in",
            hashed_password=get_password_hash("student123"),
            name="Rahul Sharma",
            primary_role="student",
            status="active",
            role_tags_str="Club President",
            programme="B.Com (Hons)", semester="5", section="A", enrollment_no="21COM5A001",
        )
        std_vp = User(
            id="std_vp",
            email="student.vp@christuniversity.in",
            hashed_password=get_password_hash("student123"),
            name="Ananya Rao",
            primary_role="student",
            status="active",
            role_tags_str="Vice President",
            programme="B.Com (Hons)", semester="5", section="A", enrollment_no="21COM5A002",
        )
        std_regular = User(
            id="std_regular_1",
            email="student.regular@christuniversity.in",
            hashed_password=get_password_hash("student123"),
            name="Vikram Aditya",
            primary_role="student",
            status="active",
            role_tags_str="",
            programme="B.Com (Hons)", semester="5", section="A", enrollment_no="21COM5A003",
        )
        std_regular2 = User(
            id="std_regular_2",
            email="student.regular2@christuniversity.in",
            hashed_password=get_password_hash("student123"),
            name="Neha Kapoor",
            primary_role="student",
            status="active",
            role_tags_str="",
            programme="B.Com (Hons)", semester="5", section="A", enrollment_no="21COM5A004",
        )
        db.add_all([std_leader, std_vp, std_regular, std_regular2])
        db.commit()

        print("Generating mock clubs...")
        club_comm = Club(
            id="club_commerce",
            name="Commerce Club",
            category="Academic",
            logo=None,  # no third-party host for the most-viewed element on the page; the UI renders initials
            description="Fostering academic excellence, analytical reasoning and industrial insights in finance and economics.",
            brand_colors="#1e3a8a,#3b82f6",
            contact_email="commerce.club@christuniversity.in",
            status="active"
        )
        club_cult = Club(
            id="club_cultural",
            name="Cultural Committee",
            category="Cultural",
            logo=None,
            description="The heart of theatrical, musical, and artistic expression for the Department of Commerce.",
            brand_colors="#9d174d,#ec4899",
            contact_email="cultural.club@christuniversity.in",
            status="active"
        )
        db.add_all([club_comm, club_cult])
        db.commit()

        print("Generating scoped faculty assignments...")
        fa1 = FacultyAssignment(
            id="fa_1", faculty_id="fac_class_teacher", role_tag="Class Teacher",
            programme="B.Com (Hons)", semester="5", section="A", status="active",
        )
        fa2 = FacultyAssignment(
            id="fa_2", faculty_id="fac_class_teacher", role_tag="Course Coordinator",
            programme="B.Com (Hons)", status="active",
        )
        fa3 = FacultyAssignment(
            id="fa_3", faculty_id="fac_subject_2", role_tag="Club Faculty Coordinator",
            club_id="club_commerce", status="active",
        )
        db.add_all([fa1, fa2, fa3])
        db.commit()

        print("Generating default club hierarchies...")
        DEFAULT_LEVELS = [(10, "President"), (20, "Vice President"), (30, "Core Member"), (40, "Member")]
        hierarchy_by_club_and_title = {}
        for club_id in ("club_commerce", "club_cultural"):
            for level_order, title in DEFAULT_LEVELS:
                level_id = f"chl_{club_id}_{level_order}"
                db.add(ClubHierarchyLevel(id=level_id, club_id=club_id, level_order=level_order, title=title))
                hierarchy_by_club_and_title[(club_id, title)] = level_id
        db.commit()

        print("Generating memberships...")
        m1 = ClubMember(
            id="mbr_1", student_id="std_president", club_id="club_commerce",
            role="President", status="active", academic_year="2025-2026",
            join_date="2025-06-10", hierarchy_level_id=hierarchy_by_club_and_title[("club_commerce", "President")],
        )
        m2 = ClubMember(
            id="mbr_2", student_id="std_vp", club_id="club_commerce",
            role="Vice President", status="active", academic_year="2025-2026",
            join_date="2025-06-10", hierarchy_level_id=hierarchy_by_club_and_title[("club_commerce", "Vice President")],
        )
        m3 = ClubMember(
            id="mbr_3", student_id="std_regular_1", club_id="club_commerce",
            role="Core Member", status="active", academic_year="2025-2026",
            join_date="2025-07-01", hierarchy_level_id=hierarchy_by_club_and_title[("club_commerce", "Core Member")],
        )
        m4 = ClubMember(
            id="mbr_4", student_id="std_regular_2", club_id="club_cultural",
            role="Core Member", status="active", academic_year="2025-2026",
            join_date="2025-07-02", hierarchy_level_id=hierarchy_by_club_and_title[("club_cultural", "Core Member")],
        )
        db.add_all([m1, m2, m3, m4])

        print("Generating club events & budgets...")
        budget_comm = Budget(
            id="bud_comm_2025", club_id="club_commerce", academic_year="2025-2026",
            allocated_amount=50000.0, spent_amount=15000.0
        )
        db.add(budget_comm)

        evt1 = Event(
            id="evt_conclave",
            club_id="club_commerce",
            title="National Commerce Conclave 2026",
            description="Annual national level panel discussions with CFOs and business executives.",
            date="2026-07-15",
            venue="Main Auditorium, CHRIST University",
            budget=15000.0,
            status="approved"
        )
        evt2 = Event(
            id="evt_orientation",
            club_id="club_commerce",
            title="Junior Recruitment Drive",
            description="Introductory seminars and case study screening to recruit first year volunteers.",
            date="2026-07-20",
            venue="Seminar Room 402, Block B",
            budget=2000.0,
            status="draft"
        )
        db.add_all([evt1, evt2])
        db.commit()

        print("Generating sponsorships...")
        spon1 = Sponsorship(
            id="spon_1",
            club_id="club_commerce",
            sponsor_name="HDFC Bank Limited",
            amount=25000.0,
            status="committed",
            contract_url="/storage/sponsorships/hdfc_agreement.pdf"
        )
        db.add(spon1)

        print("Generating annual plan, club documents & attendance...")
        aplan1 = AnnualPlan(
            id="aplan_comm_2025",
            club_id="club_commerce",
            academic_year="2025-2026",
            vision="Become the department's leading platform for applied finance and economics learning.",
            objectives="Run 4 flagship events; onboard 30 new members; secure 2 new sponsors.",
            major_initiatives="National Commerce Conclave, Junior Recruitment Drive, Alumni Mentorship Series.",
            tentative_event_calendar="Conclave: July 2026; Recruitment: Aug 2026; Mentorship: Sept 2026.",
            budget_allocation=50000.0,
            expected_outcomes="Higher event attendance and stronger sponsor relationships.",
            strategic_priorities="Industry engagement, member retention.",
            key_deadlines="Conclave venue booking by June 30, 2026.",
            status="faculty_coordinator_review",
            submitted_by="std_president",
        )
        db.add(aplan1)

        doc1_club = ClubDocument(
            id="cdoc_1",
            club_id="club_commerce",
            uploaded_by="std_president",
            name="Commerce Club Brand Guidelines.pdf",
            file_url="/storage/club_documents/club_commerce/brand_guidelines.pdf",
            category="Brand Assets",
            tags="branding,knowledge-base",
            version="1",
        )
        db.add(doc1_club)

        att1 = EventAttendance(id="att_1", event_id="evt_conclave", student_id="std_regular_1", attended="present")
        att2 = EventAttendance(id="att_2", event_id="evt_conclave", student_id="std_regular_2", attended="absent")
        db.add_all([att1, att2])
        db.commit()

        print("Generating timetable template sessions...")
        # Create standard timetable sessions for B.Com 5th Sem Sec A
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
        # Monday timetable
        t1 = TimetableSession(id="tt_m1", day_of_week="Monday", subject="Corporate Accounting", hour="09:00 AM - 10:00 AM", faculty_id="fac_subject_2", programme="B.Com (Hons)", semester="5", section="A")
        t2 = TimetableSession(id="tt_m2", day_of_week="Monday", subject="Financial Management", hour="10:00 AM - 11:00 AM", faculty_id="fac_subject_1", programme="B.Com (Hons)", semester="5", section="A")
        t3 = TimetableSession(id="tt_m3", day_of_week="Monday", subject="Taxation Law", hour="11:15 AM - 12:15 PM", faculty_id="fac_class_teacher", programme="B.Com (Hons)", semester="5", section="A")
        # Tuesday timetable
        t4 = TimetableSession(id="tt_t1", day_of_week="Tuesday", subject="Corporate Accounting", hour="09:00 AM - 10:00 AM", faculty_id="fac_subject_2", programme="B.Com (Hons)", semester="5", section="A")
        t5 = TimetableSession(id="tt_t2", day_of_week="Tuesday", subject="Financial Management", hour="10:00 AM - 11:00 AM", faculty_id="fac_subject_1", programme="B.Com (Hons)", semester="5", section="A")
        db.add_all([t1, t2, t3, t4, t5])
        db.commit()

        print("Generating mock attendance claims...")
        claim1 = Claim(
            id="cl_med_1",
            reference_number="ACP-2026-000101",
            category="medical",
            academic_year="2025-2026",
            semester="5",
            programme="B.Com (Hons)",
            section="A",
            submission_type="individual",
            submitted_by="std_regular_1",
            submission_date="2026-07-05",
            date_range="2026-07-05 to 2026-07-06",
            reason="Recovering from viral fever and advised absolute bed rest.",
            status="under_review",
            late_submission_flag=False,
            current_workflow_stage="subject_faculty"
        )
        db.add(claim1)
        db.commit()

        cp1 = ClaimParticipant(
            id="cp_1",
            claim_id="cl_med_1",
            student_id="std_regular_1",
            status="pending"
        )
        db.add(cp1)
        db.commit()

        # Missed classes for student Vikram Aditya
        entry1 = AttendanceEntry(
            id="ae_1",
            claim_participant_id="cp_1",
            subject="Corporate Accounting",
            date="2026-07-06",
            hour="09:00 AM - 10:00 AM",
            subject_faculty_id="fac_subject_2",
            status="pending"
        )
        entry2 = AttendanceEntry(
            id="ae_2",
            claim_participant_id="cp_1",
            subject="Financial Management",
            date="2026-07-06",
            hour="10:00 AM - 11:00 AM",
            subject_faculty_id="fac_subject_1",
            status="pending"
        )
        db.add_all([entry1, entry2])

        doc1 = SupportingDocument(
            id="doc_med_1",
            claim_id="cl_med_1",
            document_type="medical_certificate",
            file_url="/storage/medical/certificate_regular_1.pdf"
        )
        db.add(doc1)
        db.commit()

        print("Generating mock club-submission claim...")
        claim2 = Claim(
            id="cl_club_1",
            reference_number="ACP-2026-000102",
            category="co_curricular",
            academic_year="2025-2026",
            semester="5",
            programme="B.Com (Hons)",
            section="A",
            submission_type="club",
            club_id="club_commerce",
            submitted_by="std_president",
            submission_date="2026-07-10",
            date_range="2026-07-15 to 2026-07-15",
            reason="National Commerce Conclave 2026 — co-curricular participation as event organizer.",
            status="submitted",
            late_submission_flag=False,
            current_workflow_stage="initial_review",
        )
        db.add(claim2)
        db.commit()

        print("Generating faculty workspace items...")
        note1 = Note(
            id="nt_1",
            owner_id="fac_class_teacher",
            title="Syllabus Completion Targets",
            content="Must complete Unit 3 (Direct Taxes) by July 18. Schedule revision test on July 21.",
            is_pinned=True,
            is_favorite=True,
            tags="Syllabus,Academic"
        )
        db.add(note1)

        doc_fac = Document(
            id="doc_fac_1",
            owner_id="fac_class_teacher",
            name="Timetable Scheme A 2026.pdf",
            file_url="/storage/faculty_docs/timetable_scheme_a.pdf",
            folder_path="/Timetables",
            tags="Administrative",
            is_favorite=True
        )
        db.add(doc_fac)

        meet1 = Meeting(
            id="mtg_dept_1",
            title="Department Curriculum Review Meeting",
            type="department",
            date="2026-07-08",
            time="02:30 PM",
            duration="1.5 hours",
            venue="Conference Room, Block A",
            organizer_id="fac_hod",
            status="scheduled"
        )
        db.add(meet1)

        task1 = Task(
            id="tsk_syllabus_audit",
            title="Audit 3rd Semester Claim Files",
            description="Verify medical documents submitted for claims in previous semester.",
            due_date="2026-07-12",
            priority="high",
            status="pending",
            source_module="faculty",
            assignee_id="fac_class_teacher",
            creator_id="fac_hod"
        )
        db.add(task1)

        print("Generating mock notifications...")
        n1 = Notification(
            id="not_1",
            user_id="fac_class_teacher",
            title="New Claim Pending Initial Review",
            content="Student Vikram Aditya has submitted a Medical Claim: ACP-2026-000101.",
            is_read=False,
            source_module="claims"
        )
        n2 = Notification(
            id="not_2",
            user_id="std_president",
            title="Recruitment Drive Created",
            content="Your draft recruitment drive has been successfully registered. Submit annual plan for faculty coordinator approval.",
            is_read=True,
            source_module="clubs"
        )
        db.add_all([n1, n2])
        db.commit()

        print("Generating department content (programmes + gallery)...")
        # These used to be hardcoded Python lists in content.py. brochure_url
        # is deliberately left NULL — the previous list advertised three PDFs
        # that were never in the repository, so every link 404'd. A missing
        # link is better than a broken one.
        programmes = [
            Programme(
                id="bcom_regular", display_order=10,
                name="B.Com (Regular)",
                description="A comprehensive undergraduate programme covering commerce, accounting and business finance.",
                outcomes="Strong foundation in accounting principles,Understanding of financial markets,Business law literacy",
                careers="Financial Analyst,Audit Associate,Accountant",
            ),
            Programme(
                id="bcom_hons", display_order=20,
                name="B.Com (Honours)",
                description="Advanced commerce curriculum with specialisation tracks in finance, investment and business analytics.",
                outcomes="Mastery of corporate valuation,Proficiency in data analytics tools,Advanced taxation concepts",
                careers="Investment Banker,Risk Analyst,Data Consultant",
            ),
            Programme(
                id="bcom_fna", display_order=30,
                name="B.Com (Finance and Accountancy)",
                description="Professional programme integrated with globally recognised accounting curricula (ACCA / CPA).",
                outcomes="Exemptions in global certification exams,Strategic business leadership insight,Taxation compliance expertise",
                careers="Chartered Accountant,Management Consultant,Corporate Secretary",
            ),
        ]
        db.add_all(programmes)

        # No gallery images are seeded. The four that were here were
        # picsum.photos placeholders standing in for photographs of a real
        # department; an empty, honestly-empty gallery is better than four
        # stock images presented as departmental events. The HOD adds real
        # ones through /content/admin/gallery.
        db.commit()

        print("Seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    reset_schema()
    seed_database()
