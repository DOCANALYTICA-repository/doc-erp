import os
import sys
from datetime import date, datetime, timezone, timedelta

# Adjust path to import backend modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from sqlalchemy.orm import Session
from app.core import clock
from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.core.yellow_form_workflow import PERIOD_IDS
from app.models import Base
from app.models.user import User
from app.models.club import Club, ClubMember, Event, Budget, Reimbursement, Sponsorship, RecruitmentDrive, AnnualPlan, ClubDocument, EventAttendance, ClubHierarchyLevel
from app.models.claim import Claim, ClaimParticipant, AttendanceEntry, SupportingDocument, TimetableSession
from app.models.faculty import Note, Document, Meeting, Task
from app.models.notification import Notification
from app.models.faculty_assignment import FacultyAssignment
from app.models.content import Programme, GalleryImage
from app.models.yellow_form import ClubClaimEntry, ClubClaimSheet, ClubClaimStudent, PreApprovalForm, PreApprovalStudent
from app.core.security import get_password_hash
from app.services.engines.club_hierarchy import club_hierarchy_engine

DESTRUCTIVE_ENV_FLAG = "ALLOW_DESTRUCTIVE_SEED"
DESTRUCTIVE_ENV_VALUE = "yes-destroy-this-database"

# Every seeded account shares one password. These are throwaway test fixtures
# on a local SQLite database — a memorable password beats five different ones
# nobody can remember, and no seeded account exists anywhere that matters.
# If this dataset is ever loaded somewhere reachable, change this first.
TEST_PASSWORD = "123"


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


# ---------------------------------------------------------------------------
# 6 B.Com AFA — the real cohort used for manual testing of the Claims module.
#
# Transcribed from the department timetable sheet "6BCOM AFA - OCT 2026"
# (2026-27, even semester). Everything here is deliberately separate from the
# generic B.Com (Hons) demo fixtures above: those exist to make every screen
# non-empty, this exists so that a tester can log in as a named student, raise
# a claim against a class that is genuinely on their timetable, and watch it
# move through every stage with the right reviewer waiting at each one.
#
# The number in a class name is the SEMESTER, not the year of study. The same
# students were 5 B.Com AFA last semester; next odd semester "5 B.Com AFA" is
# the cohort coming up from 4. Promoting a class is a change to AFA_SEMESTER,
# the timetable and its faculty — the students stay as they are.
# ---------------------------------------------------------------------------

AFA_PROGRAMME = "B.Com (Finance and Accountancy)"
AFA_SEMESTER = "6"
AFA_SECTION = "A"          # the sheet has a single AFA section, unlike F&I (A/B)
AFA_ACADEMIC_YEAR = "2026-2027"

# Period grid from the sheet. Mon-Fri run 7AM / 8AM / 9.45AM / 10.45AM /
# 11.45AM with lunch at 12.45PM; Saturday shifts to 7AM / 8AM / 9AM / 10AM.
# Saturday's 8AM hour is the same slot as the weekday one.
P_0700 = "07:00 AM - 08:00 AM"
P_0800 = "08:00 AM - 09:00 AM"
P_0945 = "09:45 AM - 10:45 AM"
P_1045 = "10:45 AM - 11:45 AM"
P_1145 = "11:45 AM - 12:45 PM"
S_0900 = "09:00 AM - 10:00 AM"
S_1000 = "10:00 AM - 11:00 AM"

# (subject, course code). Digital Marketing and HR Applications is one course
# taught to the two batches in separate hours, so it appears with one code.
SUBJ_DL, CODE_DL = "Deep Learning and Natural Language Processing", "COAF301-6"
SUBJ_RMD, CODE_RMD = "Risk Management & Derivatives", "COAF302-6"
SUBJ_TAX, CODE_TAX = "Taxation Laws II", "COAF303-6"
SUBJ_BF, CODE_BF = "Behavioural Finance", "COAF304-6"
SUBJ_DM, CODE_DM = "Digital Marketing and Human Resources Applications (LCA)", "COAF201-6"

# Courses the sheet lists under two names ("Nisha / Thirunavukkarasu"). The
# first name is the slot's faculty_id; this is the second, either of whom may
# sign a claimed hour. Keyed by course code so the timetable and the claims
# below cannot disagree about who co-teaches what.
AFA_CO_TEACHERS = {CODE_DL: "fac_afa_thirunavukkarasu"}

BATCH_1 = "Batch 1"
BATCH_2 = "Batch 2"


def seed_afa_cohort(db: Session) -> None:
    print("Generating 6 B.Com AFA cohort (faculty, students, timetable)...")

    # --- Faculty -----------------------------------------------------------
    # Simon Giri is the Class Teacher (stage 1 of every individual claim from
    # this class) as well as teaching Risk Management & Derivatives. The two
    # Course Coordinators (stage 3) carry over unchanged from semester 5.
    fac_simon = User(
        id="fac_afa_simon",
        email="simon.giri@christuniversity.in",
        hashed_password=get_password_hash(TEST_PASSWORD),
        name="Simon Giri",
        primary_role="faculty",
        status="active",
        role_tags_str="Subject Faculty,Class Teacher",
        designation="Assistant Professor",
        bio="Teaches Risk Management & Derivatives; Class Teacher for 6 B.Com AFA.",
    )
    fac_sruthi = User(
        id="fac_afa_sruthi",
        email="sruthi.nr@christuniversity.in",
        hashed_password=get_password_hash(TEST_PASSWORD),
        name="Dr. Sruthi N. R",
        primary_role="faculty",
        status="active",
        role_tags_str="Course Coordinator",
        designation="Assistant Professor",
        office_location="Block IV, Room 225",
        bio="Course Coordinator for B.Com (F&A).",
    )
    # Neither coordinator teaches on this timetable. Both are seeded because
    # either may approve at stage 3 — a claim must not stall because one of
    # the two is away, and that is exactly the case a single-coordinator
    # fixture would never catch.
    fac_saravana = User(
        id="fac_afa_saravana",
        email="saravanakrishnan@christuniversity.in",
        hashed_password=get_password_hash(TEST_PASSWORD),
        name="Dr. Saravanakrishnan",
        primary_role="faculty",
        status="active",
        role_tags_str="Course Coordinator",
        designation="Associate Professor",
        office_location="Block IV, Room 230",
        bio="Course Coordinator for B.Com (F&A).",
    )
    fac_sukanya = User(
        id="fac_afa_sukanya",
        email="sukanya@christuniversity.in",
        hashed_password=get_password_hash(TEST_PASSWORD),
        name="Dr. Sukanya",
        primary_role="faculty",
        status="active",
        role_tags_str="Subject Faculty",
        designation="Associate Professor",
        office_location="Block IV, Room 226",
        bio="Teaches Taxation Laws II.",
    )
    # Nisha and Thirunavukkarasu co-teach Deep Learning and NLP — see
    # AFA_CO_TEACHERS.
    fac_nisha = User(
        id="fac_afa_nisha",
        email="nisha@christuniversity.in",
        hashed_password=get_password_hash(TEST_PASSWORD),
        name="Nisha",
        primary_role="faculty",
        status="active",
        role_tags_str="Subject Faculty",
        designation="Assistant Professor",
        bio="Teaches Deep Learning and Natural Language Processing.",
    )
    fac_thirunavukkarasu = User(
        id="fac_afa_thirunavukkarasu",
        email="thirunavukkarasu@christuniversity.in",
        hashed_password=get_password_hash(TEST_PASSWORD),
        name="Thirunavukkarasu",
        primary_role="faculty",
        status="active",
        role_tags_str="Subject Faculty",
        designation="Assistant Professor",
        bio="Teaches Deep Learning and Natural Language Processing.",
    )
    fac_anson = User(
        id="fac_afa_anson",
        email="anson.kj@christuniversity.in",
        hashed_password=get_password_hash(TEST_PASSWORD),
        name="Anson K J",
        primary_role="faculty",
        status="active",
        role_tags_str="Subject Faculty",
        designation="Assistant Professor",
        bio="Teaches Behavioural Finance.",
    )
    fac_dharma = User(
        id="fac_afa_dharma",
        email="dharma.vignesh@christuniversity.in",
        hashed_password=get_password_hash(TEST_PASSWORD),
        name="Dharma Vignesh",
        primary_role="faculty",
        status="active",
        role_tags_str="Subject Faculty",
        designation="Assistant Professor",
        bio="Digital Marketing and Human Resources Applications — Batches 1 and 2.",
    )
    db.add_all([
        fac_simon, fac_sruthi, fac_saravana, fac_sukanya,
        fac_nisha, fac_thirunavukkarasu, fac_anson, fac_dharma,
    ])
    db.commit()

    db.add_all([
        FacultyAssignment(
            id="fa_afa_class_teacher", faculty_id="fac_afa_simon", role_tag="Class Teacher",
            programme=AFA_PROGRAMME, semester=AFA_SEMESTER, section=AFA_SECTION, status="active",
        ),
        # Two rows, one per coordinator: is_course_coordinator_for() matches
        # ANY active assignment, so both are independently scoped to approve.
        FacultyAssignment(
            id="fa_afa_course_coordinator_1", faculty_id="fac_afa_sruthi", role_tag="Course Coordinator",
            programme=AFA_PROGRAMME, status="active",
        ),
        FacultyAssignment(
            id="fa_afa_course_coordinator_2", faculty_id="fac_afa_saravana", role_tag="Course Coordinator",
            programme=AFA_PROGRAMME, status="active",
        ),
    ])
    db.commit()

    # --- Students ----------------------------------------------------------
    # enrollment_no is the register number from the class list. Only Lionel is
    # in Batch 1, which is the useful shape for testing: the batch filter is
    # wrong in an obvious way the moment it lets the other four see his hours.
    AFA_STUDENTS = [
        ("2411162", "Shiva Prakash", "shiva.prakash", BATCH_2),
        ("2411134", "Lionel DSouza", "lionel.dsouza", BATCH_1),
        ("2411181", "Varun Adhitya", "varun.m", BATCH_2),
        ("2411151", "Rafael Goveas", "rafael.goveas", BATCH_2),
        ("2411155", "Roshan Sajit", "roshan.sajit", BATCH_2),
    ]
    for reg, name, handle, batch in AFA_STUDENTS:
        db.add(User(
            id=f"std_{reg}",
            email=f"{handle}@bcomafh.christuniversity.in",
            hashed_password=get_password_hash(TEST_PASSWORD),
            name=name,
            primary_role="student",
            status="active",
            programme=AFA_PROGRAMME,
            semester=AFA_SEMESTER,
            section=AFA_SECTION,
            batch=batch,
            enrollment_no=reg,
        ))
    db.commit()

    # --- Timetable ---------------------------------------------------------
    # Straight transcription of the sheet, as
    # (day, hour, subject, course code, faculty, batch).
    #
    # Monday 10.45AM is "Blocked for 6F" on the sheet — another class's hour,
    # not this one's — so it is not seeded.
    AFA_TIMETABLE = [
        ("Monday",    P_0700, SUBJ_RMD, CODE_RMD, "fac_afa_simon",   None),
        ("Monday",    P_0945, SUBJ_DL,  CODE_DL,  "fac_afa_nisha",   None),
        ("Monday",    P_1145, SUBJ_BF,  CODE_BF,  "fac_afa_anson",   None),

        ("Tuesday",   P_0700, SUBJ_DM,  CODE_DM,  "fac_afa_dharma",  BATCH_1),
        ("Tuesday",   P_0800, SUBJ_DM,  CODE_DM,  "fac_afa_dharma",  BATCH_1),
        ("Tuesday",   P_0945, SUBJ_TAX, CODE_TAX, "fac_afa_sukanya", None),
        ("Tuesday",   P_1045, SUBJ_BF,  CODE_BF,  "fac_afa_anson",   None),

        ("Wednesday", P_0700, SUBJ_RMD, CODE_RMD, "fac_afa_simon",   None),
        ("Wednesday", P_0800, SUBJ_DL,  CODE_DL,  "fac_afa_nisha",   None),
        ("Wednesday", P_0945, SUBJ_BF,  CODE_BF,  "fac_afa_anson",   None),
        ("Wednesday", P_1045, SUBJ_DM,  CODE_DM,  "fac_afa_dharma",  BATCH_2),
        ("Wednesday", P_1145, SUBJ_DM,  CODE_DM,  "fac_afa_dharma",  BATCH_2),

        ("Thursday",  P_0700, SUBJ_DM,  CODE_DM,  "fac_afa_dharma",  BATCH_2),
        ("Thursday",  P_0800, SUBJ_DM,  CODE_DM,  "fac_afa_dharma",  BATCH_2),
        ("Thursday",  P_0945, SUBJ_RMD, CODE_RMD, "fac_afa_simon",   None),
        ("Thursday",  P_1045, SUBJ_BF,  CODE_BF,  "fac_afa_anson",   None),
        ("Thursday",  P_1145, SUBJ_DL,  CODE_DL,  "fac_afa_nisha",   None),

        ("Friday",    P_0800, SUBJ_DL,  CODE_DL,  "fac_afa_nisha",   None),
        ("Friday",    P_0945, SUBJ_TAX, CODE_TAX, "fac_afa_sukanya", None),
        ("Friday",    P_1045, SUBJ_DM,  CODE_DM,  "fac_afa_dharma",  BATCH_1),
        ("Friday",    P_1145, SUBJ_DM,  CODE_DM,  "fac_afa_dharma",  BATCH_1),

        ("Saturday",  P_0800, SUBJ_RMD, CODE_RMD, "fac_afa_simon",   None),
        ("Saturday",  S_0900, SUBJ_TAX, CODE_TAX, "fac_afa_sukanya", None),
        ("Saturday",  S_1000, SUBJ_TAX, CODE_TAX, "fac_afa_sukanya", None),
    ]
    for i, (day, hour, subject, code, faculty_id, batch) in enumerate(AFA_TIMETABLE, start=1):
        db.add(TimetableSession(
            id=f"tt_afa_{i:02d}",
            day_of_week=day,
            hour=hour,
            subject=subject,
            course_code=code,
            batch=batch,
            faculty_id=faculty_id,
            co_faculty_id=AFA_CO_TEACHERS.get(code),
            programme=AFA_PROGRAMME,
            semester=AFA_SEMESTER,
            section=AFA_SECTION,
        ))
    db.commit()

    _seed_afa_claims(db)


def _afa_claim(
    db: Session, *, claim_id, ref, student_id, category, status, stage, submission_date,
    date_range, reason, entries, participant_status="pending", late=False,
    revision_reason=None, last_revised_by=None, last_revised_stage=None,
    document=None,
):
    """One claim, its single participant and its missed-class entries.

    `entries` is a list of (subject, course_code, date, hour, faculty_id,
    status) — the same shape the claim wizard posts, so a seeded claim is
    indistinguishable from one raised through the UI.
    """
    db.add(Claim(
        id=claim_id,
        reference_number=ref,
        category=category,
        academic_year=AFA_ACADEMIC_YEAR,
        semester=AFA_SEMESTER,
        programme=AFA_PROGRAMME,
        section=AFA_SECTION,
        submission_type="individual",
        submitted_by=student_id,
        submission_date=submission_date,
        date_range=date_range,
        reason=reason,
        status=status,
        late_submission_flag=late,
        current_workflow_stage=stage,
        revision_reason=revision_reason,
        last_revised_by=last_revised_by,
        last_revised_stage=last_revised_stage,
    ))
    db.commit()

    participant_id = f"cp_{claim_id}"
    db.add(ClaimParticipant(
        id=participant_id, claim_id=claim_id, student_id=student_id, status=participant_status,
    ))
    db.commit()

    for i, (subject, code, date, hour, faculty_id, entry_status) in enumerate(entries, start=1):
        db.add(AttendanceEntry(
            id=f"ae_{claim_id}_{i}",
            claim_participant_id=participant_id,
            subject=subject,
            course_code=code,
            date=date,
            hour=hour,
            subject_faculty_id=faculty_id,
            co_faculty_id=AFA_CO_TEACHERS.get(code),
            status=entry_status,
        ))
    if document:
        doc_type, url = document
        db.add(SupportingDocument(
            id=f"doc_{claim_id}", claim_id=claim_id, document_type=doc_type, file_url=url,
        ))
    db.commit()


def _seed_afa_claims(db: Session) -> None:
    """One claim parked at each stage, so every review screen has something in it.

    The week of Mon 2026-10-26 to Sat 2026-10-31 is used throughout. Every
    entry is a real slot from the timetable above — correct weekday, correct
    hour, correct batch, routed to the faculty member who actually teaches it.
    Get any of those wrong and the claim is unreviewable, which is precisely
    what these fixtures exist to prove does not happen.
    """
    print("Generating AFA claims, one per workflow stage...")

    # 1. Draft — Shiva Prakash (Batch 2) has started a claim but not sent it.
    _afa_claim(
        db,
        claim_id="cl_afa_draft", ref="ACP-2026-000501", student_id="std_2411162",
        category="medical", status="draft", stage="initial_review",
        submission_date="2026-10-29", date_range="2026-10-29 to 2026-10-29",
        reason="Migraine; left after the 8AM class.",
        entries=[
            (SUBJ_RMD, CODE_RMD, "2026-10-29", P_0945, "fac_afa_simon", "pending"),
            (SUBJ_BF,  CODE_BF,  "2026-10-29", P_1045, "fac_afa_anson", "pending"),
        ],
    )

    # 2. Submitted — waiting on the Class Teacher (Simon Giri) at stage 1.
    #    Lionel is the one Batch 1 student, so this is also the claim that
    #    puts Dharma Vignesh's Batch 1 hours into the workflow.
    _afa_claim(
        db,
        claim_id="cl_afa_submitted", ref="ACP-2026-000502", student_id="std_2411134",
        category="medical", status="submitted", stage="initial_review",
        submission_date="2026-10-28", date_range="2026-10-26 to 2026-10-27",
        reason="Viral fever; advised two days' rest by the university health centre.",
        entries=[
            (SUBJ_RMD, CODE_RMD, "2026-10-26", P_0700, "fac_afa_simon",   "pending"),
            (SUBJ_DL,  CODE_DL,  "2026-10-26", P_0945, "fac_afa_nisha",   "pending"),
            (SUBJ_DM,  CODE_DM,  "2026-10-27", P_0700, "fac_afa_dharma",  "pending"),
            (SUBJ_TAX, CODE_TAX, "2026-10-27", P_0945, "fac_afa_sukanya", "pending"),
        ],
        document=("medical_certificate", "/storage/medical/certificate_2411134.pdf"),
    )

    # 3. Under review at stage 2 — three different subject faculty each hold
    #    one entry, which is the case the parallel-approval rule exists for.
    _afa_claim(
        db,
        claim_id="cl_afa_subject", ref="ACP-2026-000503", student_id="std_2411181",
        category="medical", status="under_review", stage="subject_faculty",
        submission_date="2026-10-29", date_range="2026-10-28 to 2026-10-28",
        reason="Sprained ankle; advised a day's rest by the campus clinic.",
        entries=[
            (SUBJ_RMD, CODE_RMD, "2026-10-28", P_0700, "fac_afa_simon", "pending"),
            (SUBJ_DL,  CODE_DL,  "2026-10-28", P_0800, "fac_afa_nisha", "approved"),
            (SUBJ_BF,  CODE_BF,  "2026-10-28", P_0945, "fac_afa_anson", "pending"),
        ],
        document=("medical_certificate", "/storage/medical/certificate_2411181.pdf"),
    )

    # 4. Cleared subject faculty — now with the Course Coordinators. Either
    #    Dr. Sruthi N. R or Dr. Saravanakrishnan can approve it.
    _afa_claim(
        db,
        claim_id="cl_afa_coordinator", ref="ACP-2026-000504", student_id="std_2411151",
        category="medical", status="under_review", stage="course_coordinator",
        submission_date="2026-10-30", date_range="2026-10-29 to 2026-10-29",
        reason="Acute gastroenteritis; treated at the university health centre and advised rest.",
        entries=[
            (SUBJ_RMD, CODE_RMD, "2026-10-29", P_0945, "fac_afa_simon", "approved"),
            (SUBJ_BF,  CODE_BF,  "2026-10-29", P_1045, "fac_afa_anson", "approved"),
            (SUBJ_DL,  CODE_DL,  "2026-10-29", P_1145, "fac_afa_nisha", "approved"),
        ],
        participant_status="approved",
        document=("medical_certificate", "/storage/medical/certificate_2411151.pdf"),
    )

    # 5. Returned for revision — exercises the revise/resubmit path, including
    #    the reason the student is shown and the stage it came back from.
    _afa_claim(
        db,
        claim_id="cl_afa_returned", ref="ACP-2026-000505", student_id="std_2411155",
        # stage "closed" with status "returned" is exactly what send_back()
        # writes: the claim has left the review chain and is with the student.
        category="medical", status="returned", stage="closed",
        submission_date="2026-10-30", date_range="2026-10-28 to 2026-10-29",
        reason="Dental surgery and follow-up review.",
        entries=[
            (SUBJ_RMD, CODE_RMD, "2026-10-28", P_0700, "fac_afa_simon",  "pending"),
            (SUBJ_BF,  CODE_BF,  "2026-10-28", P_0945, "fac_afa_anson",  "pending"),
            (SUBJ_DM,  CODE_DM,  "2026-10-29", P_0700, "fac_afa_dharma", "pending"),
        ],
        revision_reason="The certificate is unsigned and does not cover 29 October. Please re-upload.",
        last_revised_by="fac_afa_simon",
        last_revised_stage="initial_review",
        document=("medical_certificate", "/storage/medical/certificate_2411155.pdf"),
    )

    # 6. Finished — approved and forwarded to the attendance office, which is
    #    the terminal state of the happy path. Gives "My Claims" some history
    #    and the stepper a completed example. Submitted 9 days after the
    #    absence, which is past the SLA, hence the late flag.
    _afa_claim(
        db,
        claim_id="cl_afa_forwarded", ref="ACP-2026-000506", student_id="std_2411162",
        category="medical", status="approved", stage="attendance_office",
        submission_date="2026-10-28", date_range="2026-10-19 to 2026-10-19",
        reason="Food poisoning; treated at the campus clinic.",
        entries=[
            (SUBJ_RMD, CODE_RMD, "2026-10-19", P_0700, "fac_afa_simon", "approved"),
            (SUBJ_DL,  CODE_DL,  "2026-10-19", P_0945, "fac_afa_nisha", "approved"),
            (SUBJ_BF,  CODE_BF,  "2026-10-19", P_1145, "fac_afa_anson", "approved"),
        ],
        participant_status="approved",
        late=True,
        document=("medical_certificate", "/storage/medical/certificate_2411162_oct.pdf"),
    )

    print("Generating AFA notifications...")
    # Each of these points at a claim that is genuinely sitting at that stage
    # with that person as its reviewer, so the bell tray and the review queue
    # agree with one another.
    db.add_all([
        Notification(
            id="not_afa_1", user_id="fac_afa_simon",
            title="New Claim Pending Initial Review",
            content="Lionel DSouza has submitted a Medical Claim: ACP-2026-000502 for your review as Class Teacher.",
            is_read=False, source_module="claims",
        ),
        Notification(
            id="not_afa_2", user_id="fac_afa_anson",
            title="Claim Pending Subject Faculty Review",
            content="Varun Adhitya's Medical Claim ACP-2026-000503 is awaiting your review for Behavioural Finance (COAF304-6).",
            is_read=False, source_module="claims",
        ),
        Notification(
            id="not_afa_3", user_id="fac_afa_simon",
            title="Claim Pending Subject Faculty Review",
            content="Varun Adhitya's Medical Claim ACP-2026-000503 is awaiting your review for Risk Management & Derivatives (COAF302-6).",
            is_read=False, source_module="claims",
        ),
        Notification(
            id="not_afa_4", user_id="fac_afa_sruthi",
            title="Claim Pending Course Coordinator Approval",
            content="Rafael Goveas's Medical Claim ACP-2026-000504 has cleared subject faculty and awaits Course Coordinator approval.",
            is_read=False, source_module="claims",
        ),
        Notification(
            id="not_afa_5", user_id="fac_afa_saravana",
            title="Claim Pending Course Coordinator Approval",
            content="Rafael Goveas's Medical Claim ACP-2026-000504 has cleared subject faculty and awaits Course Coordinator approval.",
            is_read=False, source_module="claims",
        ),
        Notification(
            id="not_afa_6", user_id="std_2411155",
            title="Claim Returned for Revision",
            content="Your Medical Claim ACP-2026-000505 was returned: the certificate is unsigned and does not cover 29 October.",
            is_read=False, source_module="claims",
        ),
    ])
    db.commit()


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
            hashed_password=get_password_hash(TEST_PASSWORD),
            name="Super Admin",
            primary_role="super_admin",
            status="active"
        )
        db.add(admin)

        # 2. HOD
        hod = User(
            id="fac_hod",
            email="hod.commerce@christuniversity.in",
            hashed_password=get_password_hash(TEST_PASSWORD),
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
            hashed_password=get_password_hash(TEST_PASSWORD),
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
            hashed_password=get_password_hash(TEST_PASSWORD),
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
            hashed_password=get_password_hash(TEST_PASSWORD),
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
            hashed_password=get_password_hash(TEST_PASSWORD),
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
            hashed_password=get_password_hash(TEST_PASSWORD),
            name="Rahul Sharma",
            primary_role="student",
            status="active",
            role_tags_str="Club President",
            programme="B.Com (Hons)", semester="5", section="A", enrollment_no="21COM5A001",
        )
        std_vp = User(
            id="std_vp",
            email="student.vp@christuniversity.in",
            hashed_password=get_password_hash(TEST_PASSWORD),
            name="Ananya Rao",
            primary_role="student",
            status="active",
            role_tags_str="Vice President",
            programme="B.Com (Hons)", semester="5", section="A", enrollment_no="21COM5A002",
        )
        std_regular = User(
            id="std_regular_1",
            email="student.regular@christuniversity.in",
            hashed_password=get_password_hash(TEST_PASSWORD),
            name="Vikram Aditya",
            primary_role="student",
            status="active",
            role_tags_str="",
            programme="B.Com (Hons)", semester="5", section="A", enrollment_no="21COM5A003",
        )
        std_regular2 = User(
            id="std_regular_2",
            email="student.regular2@christuniversity.in",
            hashed_password=get_password_hash(TEST_PASSWORD),
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

        # club_cultural had no budget or events at all — the only club a
        # newly-onboarded student could see was Commerce, which made every
        # Cultural Committee screen (Budget, Events, Dashboard) look broken
        # rather than merely quiet.
        budget_cult = Budget(
            id="bud_cult_2025", club_id="club_cultural", academic_year="2025-2026",
            allocated_amount=40000.0, spent_amount=1000.0
        )
        db.add(budget_cult)

        evt3 = Event(
            id="evt_drama",
            club_id="club_cultural",
            title="Street Play Auditions",
            description="Auditions for the annual theater fest play.",
            date="2026-07-22",
            venue="Open Air Theater",
            budget=1000.0,
            status="approved"
        )
        db.add(evt3)
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

        print("Generating reimbursements...")
        # requested_by is a User.id (see Reimbursement model / the
        # POST /clubs/{id}/reimbursements handler, which always stores
        # current_user.id) — the UI renders this field verbatim with no
        # name lookup, so it must be an id, not a display name.
        reimb1 = Reimbursement(
            id="reimb_1",
            club_id="club_commerce",
            requested_by="std_president",
            amount=2500.0,
            status="approved",
            receipt_url="/storage/reimbursements/receipt_reimb_1.pdf"
        )
        reimb2 = Reimbursement(
            id="reimb_2",
            club_id="club_commerce",
            requested_by="std_vp",
            amount=1200.0,
            status="pending",
            receipt_url="/storage/reimbursements/receipt_reimb_2.pdf"
        )
        db.add_all([reimb1, reimb2])

        print("Generating recruitment drives...")
        drive1 = RecruitmentDrive(
            id="rd_1",
            club_id="club_commerce",
            title="Junior Core Team Recruitment 2026",
            recruitment_period="Aug 2026",
            eligibility="1st year B.Com students",
            positions_available="5",
            status="open",
        )
        db.add(drive1)

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
        # Each notification below names a claim/stage/recipient that must
        # agree with the Claim/AttendanceEntry rows above — this is exactly
        # what the review queue and action-queue engine query against, so a
        # notification pointing at the wrong stage or the wrong person shows
        # up in the bell tray with nothing to match it in Claims Review.
        #
        # cl_med_1 (ACP-2026-000101) has already cleared initial_review and
        # sits at "subject_faculty" — awaiting both entry-1's and entry-2's
        # assigned faculty (fac_subject_2 and fac_subject_1 respectively).
        n2 = Notification(
            id="not_2",
            user_id="fac_subject_2",
            title="Claim Pending Subject Faculty Review",
            content="Vikram Aditya's Medical Claim ACP-2026-000101 is awaiting your review for Corporate Accounting.",
            is_read=False,
            source_module="claims"
        )
        n3 = Notification(
            id="not_3",
            user_id="fac_subject_1",
            title="Claim Pending Subject Faculty Review",
            content="Vikram Aditya's Medical Claim ACP-2026-000101 is awaiting your review for Financial Management.",
            is_read=False,
            source_module="claims"
        )
        n4 = Notification(
            id="not_4",
            user_id="std_president",
            title="Recruitment Drive Created",
            content="Your recruitment drive \"Junior Core Team Recruitment 2026\" has been published and is now accepting applications.",
            is_read=True,
            source_module="clubs"
        )
        db.add_all([n2, n3, n4])
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

        seed_afa_cohort(db)

        print("Generating DOC Analytica (real club data)...")

        # Faculty Coordinator
        fac_reynal = User(
            id="fac_reynal",
            email="reynal@christuniversity.in",
            hashed_password=get_password_hash(TEST_PASSWORD),
            name="Dr. Reynal",
            primary_role="faculty",
            status="active",
            role_tags_str="Club Faculty Coordinator",
            designation="Assistant Professor",
        )
        db.add(fac_reynal)

        # --- DOC Analytica: Core + Directors ---
        # std_2411162 (Shiva Prakash), std_2411134 (Lionel D'Souza),
        # std_2411181 (Varun Adhitya), std_2411151 (Rafael Goveas) and
        # std_2411155 (Roshan Sajit) already exist — seed_afa_cohort() above
        # created these same five people (same register numbers and emails)
        # as the 6 B.Com AFA cohort used by Claims/Timetable. Reused here by
        # id rather than re-created, since email is a unique column.
        std_2511159 = User(id="std_2511159", email="samrit.puhan@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Samrit Puhan", primary_role="student", status="active", enrollment_no="2511159")
        std_2511132 = User(id="std_2511132", email="keshav.mulgund@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Keshav Mulgund", primary_role="student", status="active", enrollment_no="2511132")
        std_2411180 = User(id="std_2411180", email="v.praveen@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Praveen", primary_role="student", status="active", enrollment_no="2411180")
        std_2411188 = User(id="std_2411188", email="sooraj.v@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Sooraj", primary_role="student", status="active", enrollment_no="2411188")
        std_2410411 = User(id="std_2410411", email="anumitha.v@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Anumitha V", primary_role="student", status="active", enrollment_no="2410411")
        std_2511721 = User(id="std_2511721", email="dia.paul@bscaah.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Dia", primary_role="student", status="active", enrollment_no="2511721")
        std_2410407 = User(id="std_2410407", email="alekhya.kumar@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Alekhya Ajay Kumar", primary_role="student", status="active", enrollment_no="2410407")
        std_2410148 = User(id="std_2410148", email="pl.muthiah@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="PL Muthiah", primary_role="student", status="active", enrollment_no="2410148")
        std_2501251 = User(id="std_2501251", email="rishab.kevlani@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Rishab Kevlani", primary_role="student", status="active", enrollment_no="2501251")

        # --- DOC Analytica: Associates ---
        std_2511148 = User(id="std_2511148", email="r.hariharan@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Hariharan", primary_role="student", status="active", enrollment_no="2511148", phone="7892774909")
        std_2611114 = User(id="std_2611114", email="calvin.anoop@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Calvin Anoop", primary_role="student", status="active", enrollment_no="2611114", phone="9187488779")
        std_2411121 = User(id="std_2411121", email="erin.george@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Erin Sona George", primary_role="student", status="active", enrollment_no="2411121", phone="8111832425")
        std_2611117 = User(id="std_2611117", email="dev.krishnan@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Dev Rakesh Krishnan", primary_role="student", status="active", enrollment_no="2611117")
        std_2610118 = User(id="std_2610118", email="garima.pitaria@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Garima Pitaria", primary_role="student", status="active", enrollment_no="2610118", phone="7727964975")
        std_2511146 = User(id="std_2511146", email="pranamya.adinath@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Pranamya Adinath", primary_role="student", status="active", enrollment_no="2511146")
        std_2610224 = User(id="std_2610224", email="dhrub.jain@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Dhrub Jain", primary_role="student", status="active", enrollment_no="2610224", phone="7578847767")
        std_2610243 = User(id="std_2610243", email="manjari.choubisa@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Manjari Choubisa", primary_role="student", status="active", enrollment_no="2610243", phone="9972913355")
        std_2610310 = User(id="std_2610310", email="avni.kothari@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Avni Kothari", primary_role="student", status="active", enrollment_no="2610310")
        std_2610204 = User(id="std_2610204", email="ahaana.singhal@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Ahaana Singhal", primary_role="student", status="active", enrollment_no="2610204")
        std_2510365 = User(id="std_2510365", email="soham.anand@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Soham Anand", primary_role="student", status="active", enrollment_no="2510365", phone="9036625539")
        std_2611461 = User(id="std_2611461", email="sanjay.er@bcomfih.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Sanjay E.R.", primary_role="student", status="active", enrollment_no="2611461", phone="6382489449")
        std_2511431 = User(id="std_2511431", email="kushaal.karthik@bcomfih.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Kushaal Karthik", primary_role="student", status="active", enrollment_no="2511431", phone="9036190185")
        std_2510562 = User(id="std_2510562", email="syed.saad@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Syed Saad", primary_role="student", status="active", enrollment_no="2510562", phone="6363704362")
        std_2511587 = User(id="std_2511587", email="vrishti.bhatia@bcomsfh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Vrishti Bhatia", primary_role="student", status="active", enrollment_no="2511587", phone="6397509393")
        std_2511119 = User(id="std_2511119", email="Devna.goyal@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Devna Goyal", primary_role="student", status="active", enrollment_no="2511119", phone="9781950729")
        std_2611163 = User(id="std_2611163", email="rikhil.ksheersagar@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Rikhil Ksheersagar", primary_role="student", status="active", enrollment_no="2611163", phone="9886337978")
        std_2611507 = User(id="std_2611507", email="affan.a@bcomsfh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Affan Ahmed A", primary_role="student", status="active", enrollment_no="2611507", phone="9980033786")
        std_2610125 = User(id="std_2610125", email="kartik.sharma@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Kartik Sharma", primary_role="student", status="active", enrollment_no="2610125")
        std_2611470 = User(id="std_2611470", email="shriya.cutinha@bcomfih.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Shriya Catherine Cutinha", primary_role="student", status="active", enrollment_no="2611470", phone="9538399599")
        std_2611724 = User(id="std_2611724", email="tanish.barua@bscaah.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Tanish Barua", primary_role="student", status="active", enrollment_no="2611724", phone="9849154883")
        std_2610308 = User(id="std_2610308", email="aratrika.ghosh@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Aratrika Ghosh", primary_role="student", status="active", enrollment_no="2610308", phone="8904713904")
        std_2511103 = User(id="std_2511103", email="Abhay.alladi@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Abhay Alladi", primary_role="student", status="active", enrollment_no="2511103", phone="9036330410")
        std_2611341 = User(id="std_2611341", email="neev.sukhadia@bcomfih.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Neev Sukhadia", primary_role="student", status="active", enrollment_no="2611341")
        std_2611353 = User(id="std_2611353", email="rehan.nafsal@bcomfih.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Rehan Nafsal", primary_role="student", status="active", enrollment_no="2611353")
        std_2611149 = User(id="std_2611149", email="neeti.deora@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Neeti Deora", primary_role="student", status="active", enrollment_no="2611149", phone="9978225085")
        std_2611549 = User(id="std_2611549", email="nidhish.j@bcomsfh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="NIDHISH J", primary_role="student", status="active", enrollment_no="2611549", phone="9003032430")
        std_2611137 = User(id="std_2611137", email="pratheek.padiyar@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="K PRATHEEK PADIYAR", primary_role="student", status="active", enrollment_no="2611137")
        std_2611554 = User(id="std_2611554", email="rohit.dey@bcomsfh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Rohit Dey", primary_role="student", status="active", enrollment_no="2611554", phone="8481025376")
        std_2511016 = User(id="std_2511016", email="ashmith.jose@bcomath.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Ashmith Jose", primary_role="student", status="active", enrollment_no="2511016", phone="7592846984")
        std_2611706 = User(id="std_2611706", email="hitansh.khattar@bscaah.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Hitansh Khattar", primary_role="student", status="active", enrollment_no="2611706")
        std_2610456 = User(id="std_2610456", email="prisha.m@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Prisha M", primary_role="student", status="active", enrollment_no="2610456", phone="6381453984")
        std_2611338 = User(id="std_2611338", email="hemakshi.jain@bcomfih.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Hemakshi Jain", primary_role="student", status="active", enrollment_no="2611338", phone="6363902008")
        std_2611179 = User(id="std_2611179", email="sudhanva.bharadwaj@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Sudhanva Bharadwaj", primary_role="student", status="active", enrollment_no="2611179", phone="9008714807")
        std_2611103 = User(id="std_2611103", email="aarya.baldwa@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Aarya Baldwa", primary_role="student", status="active", enrollment_no="2611103")
        std_2611174 = User(id="std_2611174", email="shaurya.kalgaonkar@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Shaurya Kalgaonkar", primary_role="student", status="active", enrollment_no="2611174")
        std_2611708 = User(id="std_2611708", email="karthikeyaarudhra.sirimamilla@bscaah.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Karthikeya Arudhra Sirimamilla", primary_role="student", status="active", enrollment_no="2611708", phone="9849553658")
        std_2510326 = User(id="std_2510326", email="guhan.g@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Guhan G", primary_role="student", status="active", enrollment_no="2510326", phone="9363839530")
        std_2511109 = User(id="std_2511109", email="amulya.jain@bcomafh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Amulya Jain", primary_role="student", status="active", enrollment_no="2511109", phone="9914309952")
        std_2610161 = User(id="std_2610161", email="sasmithaa.n@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Sasmithaa.N", primary_role="student", status="active", enrollment_no="2610161", phone="9486926613")
        std_2510313 = User(id="std_2510313", email="Arshia.narang@bcomh.christuniversity.in", hashed_password=get_password_hash(TEST_PASSWORD), name="Arshia Narang", primary_role="student", status="active", enrollment_no="2510313")

        db.add_all([
            std_2511159,
            std_2511132,
            std_2411180,
            std_2411188,
            std_2410411,
            std_2511721,
            std_2410407,
            std_2410148,
            std_2501251,
            std_2511148,
            std_2611114,
            std_2411121,
            std_2611117,
            std_2610118,
            std_2511146,
            std_2610224,
            std_2610243,
            std_2610310,
            std_2610204,
            std_2510365,
            std_2611461,
            std_2511431,
            std_2510562,
            std_2511587,
            std_2511119,
            std_2611163,
            std_2611507,
            std_2610125,
            std_2611470,
            std_2611724,
            std_2610308,
            std_2511103,
            std_2611341,
            std_2611353,
            std_2611149,
            std_2611549,
            std_2611137,
            std_2611554,
            std_2511016,
            std_2611706,
            std_2610456,
            std_2611338,
            std_2611179,
            std_2611103,
            std_2611174,
            std_2611708,
            std_2510326,
            std_2511109,
            std_2610161,
            std_2510313,
        ])

        db.commit()

        club_da = Club(
            id="club_doc_analytica",
            name="DOC Analytica",
            category="Business",
            logo="/club-logos/doc-analytica.jpeg",
            description=(
                "DOC Analytica is a student-led analytics and innovation club that bridges "
                "business, finance, data, and technology. We empower students to turn "
                "real-world problems into data-driven solutions through hands-on projects, "
                "experimentation, industry exposure, and interdisciplinary collaboration."
            ),
            brand_colors="#00B0F0,#353D52,#D9D9D9",
            contact_email="docanalytica@gmail.com",
            status="active",
            restrict_non_core_access=True,
            faculty_coordinator_full_access=True,
        )
        db.add(club_da)
        db.commit()

        fa_da = FacultyAssignment(
            id="fa_da_1", faculty_id="fac_reynal", role_tag="Club Faculty Coordinator",
            club_id="club_doc_analytica", status="active",
        )
        db.add(fa_da)
        db.commit()

        print("Generating DOC Analytica club hierarchy...")
        da_hierarchy = {}
        da_hierarchy["core"] = "chl_da_10"
        db.add(ClubHierarchyLevel(id="chl_da_10", club_id="club_doc_analytica", level_order=10, title="Core"))
        da_hierarchy["director_ai_devops"] = "chl_da_20_ai_devops"
        db.add(ClubHierarchyLevel(id="chl_da_20_ai_devops", club_id="club_doc_analytica", level_order=20, title="Director – AI & DevOps"))
        da_hierarchy["director_business_analytics"] = "chl_da_20_business_analytics"
        db.add(ClubHierarchyLevel(id="chl_da_20_business_analytics", club_id="club_doc_analytica", level_order=20, title="Director – Business Analytics"))
        da_hierarchy["director_corporate_relations"] = "chl_da_20_corporate_relations"
        db.add(ClubHierarchyLevel(id="chl_da_20_corporate_relations", club_id="club_doc_analytica", level_order=20, title="Director – Corporate Relations"))
        da_hierarchy["director_design_promotions"] = "chl_da_20_design_promotions"
        db.add(ClubHierarchyLevel(id="chl_da_20_design_promotions", club_id="club_doc_analytica", level_order=20, title="Director – Design & Promotions"))
        da_hierarchy["director_audit"] = "chl_da_20_audit"
        db.add(ClubHierarchyLevel(id="chl_da_20_audit", club_id="club_doc_analytica", level_order=20, title="Director – Audit"))
        da_hierarchy["associate_ai_devops"] = "chl_da_30_ai_devops"
        db.add(ClubHierarchyLevel(id="chl_da_30_ai_devops", club_id="club_doc_analytica", level_order=30, title="Associate – AI & DevOps"))
        da_hierarchy["associate_business_analytics"] = "chl_da_30_business_analytics"
        db.add(ClubHierarchyLevel(id="chl_da_30_business_analytics", club_id="club_doc_analytica", level_order=30, title="Associate – Business Analytics"))
        da_hierarchy["associate_corporate_relations"] = "chl_da_30_corporate_relations"
        db.add(ClubHierarchyLevel(id="chl_da_30_corporate_relations", club_id="club_doc_analytica", level_order=30, title="Associate – Corporate Relations"))
        da_hierarchy["associate_design_promotions"] = "chl_da_30_design_promotions"
        db.add(ClubHierarchyLevel(id="chl_da_30_design_promotions", club_id="club_doc_analytica", level_order=30, title="Associate – Design & Promotions"))
        da_hierarchy["associate_audit"] = "chl_da_30_audit"
        db.add(ClubHierarchyLevel(id="chl_da_30_audit", club_id="club_doc_analytica", level_order=30, title="Associate – Audit"))
        db.commit()

        print("Generating DOC Analytica memberships...")
        da_members = []
        da_members.append(ClubMember(id="mbr_da_1", student_id="std_2411162", club_id="club_doc_analytica", role="Core", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["core"]))
        da_members.append(ClubMember(id="mbr_da_2", student_id="std_2411134", club_id="club_doc_analytica", role="Core", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["core"]))
        da_members.append(ClubMember(id="mbr_da_3", student_id="std_2411181", club_id="club_doc_analytica", role="Core", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["core"]))
        da_members.append(ClubMember(id="mbr_da_4", student_id="std_2511159", club_id="club_doc_analytica", role="Director – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["director_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_5", student_id="std_2511132", club_id="club_doc_analytica", role="Director – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["director_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_6", student_id="std_2411151", club_id="club_doc_analytica", role="Director – AI & DevOps", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["director_ai_devops"]))
        da_members.append(ClubMember(id="mbr_da_7", student_id="std_2411155", club_id="club_doc_analytica", role="Director – AI & DevOps", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["director_ai_devops"]))
        da_members.append(ClubMember(id="mbr_da_8", student_id="std_2411180", club_id="club_doc_analytica", role="Director – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["director_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_9", student_id="std_2411188", club_id="club_doc_analytica", role="Director – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["director_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_10", student_id="std_2410411", club_id="club_doc_analytica", role="Director – Design & Promotions", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["director_design_promotions"]))
        da_members.append(ClubMember(id="mbr_da_11", student_id="std_2511721", club_id="club_doc_analytica", role="Director – Design & Promotions", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["director_design_promotions"]))
        da_members.append(ClubMember(id="mbr_da_12", student_id="std_2410407", club_id="club_doc_analytica", role="Director – Audit", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["director_audit"]))
        da_members.append(ClubMember(id="mbr_da_13", student_id="std_2410148", club_id="club_doc_analytica", role="Director – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["director_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_14", student_id="std_2501251", club_id="club_doc_analytica", role="Director – AI & DevOps", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["director_ai_devops"]))
        da_members.append(ClubMember(id="mbr_da_15", student_id="std_2511148", club_id="club_doc_analytica", role="Associate – AI & DevOps", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_ai_devops"]))
        da_members.append(ClubMember(id="mbr_da_16", student_id="std_2611114", club_id="club_doc_analytica", role="Associate – AI & DevOps", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_ai_devops"]))
        da_members.append(ClubMember(id="mbr_da_17", student_id="std_2411121", club_id="club_doc_analytica", role="Associate – AI & DevOps", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_ai_devops"]))
        da_members.append(ClubMember(id="mbr_da_18", student_id="std_2611117", club_id="club_doc_analytica", role="Associate – AI & DevOps", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_ai_devops"]))
        da_members.append(ClubMember(id="mbr_da_19", student_id="std_2610118", club_id="club_doc_analytica", role="Associate – AI & DevOps", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_ai_devops"]))
        da_members.append(ClubMember(id="mbr_da_20", student_id="std_2511146", club_id="club_doc_analytica", role="Associate – AI & DevOps", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_ai_devops"]))
        da_members.append(ClubMember(id="mbr_da_21", student_id="std_2610224", club_id="club_doc_analytica", role="Associate – AI & DevOps", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_ai_devops"]))
        da_members.append(ClubMember(id="mbr_da_22", student_id="std_2610243", club_id="club_doc_analytica", role="Associate – AI & DevOps", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_ai_devops"]))
        da_members.append(ClubMember(id="mbr_da_23", student_id="std_2610310", club_id="club_doc_analytica", role="Associate – AI & DevOps", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_ai_devops"]))
        da_members.append(ClubMember(id="mbr_da_24", student_id="std_2610204", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_25", student_id="std_2510365", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_26", student_id="std_2611461", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_27", student_id="std_2511431", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_28", student_id="std_2510562", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_29", student_id="std_2511587", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_30", student_id="std_2511119", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_31", student_id="std_2611163", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_32", student_id="std_2611507", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_33", student_id="std_2610125", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_34", student_id="std_2611470", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_35", student_id="std_2611724", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_36", student_id="std_2610308", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_37", student_id="std_2511103", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_38", student_id="std_2611341", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_39", student_id="std_2611353", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_40", student_id="std_2611149", club_id="club_doc_analytica", role="Associate – Business Analytics", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_business_analytics"]))
        da_members.append(ClubMember(id="mbr_da_41", student_id="std_2611549", club_id="club_doc_analytica", role="Associate – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_42", student_id="std_2611137", club_id="club_doc_analytica", role="Associate – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_43", student_id="std_2611554", club_id="club_doc_analytica", role="Associate – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_44", student_id="std_2511016", club_id="club_doc_analytica", role="Associate – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_45", student_id="std_2611706", club_id="club_doc_analytica", role="Associate – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_46", student_id="std_2610456", club_id="club_doc_analytica", role="Associate – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_47", student_id="std_2611338", club_id="club_doc_analytica", role="Associate – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_48", student_id="std_2611179", club_id="club_doc_analytica", role="Associate – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_49", student_id="std_2611103", club_id="club_doc_analytica", role="Associate – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_50", student_id="std_2611174", club_id="club_doc_analytica", role="Associate – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_51", student_id="std_2611708", club_id="club_doc_analytica", role="Associate – Corporate Relations", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_corporate_relations"]))
        da_members.append(ClubMember(id="mbr_da_52", student_id="std_2510326", club_id="club_doc_analytica", role="Associate – Design & Promotions", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_design_promotions"]))
        da_members.append(ClubMember(id="mbr_da_53", student_id="std_2511109", club_id="club_doc_analytica", role="Associate – Design & Promotions", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_design_promotions"]))
        da_members.append(ClubMember(id="mbr_da_54", student_id="std_2610161", club_id="club_doc_analytica", role="Associate – Design & Promotions", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_design_promotions"]))
        da_members.append(ClubMember(id="mbr_da_55", student_id="std_2510313", club_id="club_doc_analytica", role="Associate – Design & Promotions", status="active", academic_year="2026-2027", hierarchy_level_id=da_hierarchy["associate_design_promotions"]))
        db.add_all(da_members)
        db.commit()

        print("Generating DOC Analytica budget, events & reimbursement...")
        budget_da = Budget(
            id="bud_da_2026", club_id="club_doc_analytica", academic_year="2026-2027",
            allocated_amount=126880.0, spent_amount=0.0,
        )
        db.add(budget_da)

        evt_acumen = Event(
            id="evt_da_acumen", club_id="club_doc_analytica", title="Acumen",
            description=(
                "A competitive, hands-on business challenge where participants apply "
                "analytical thinking, financial reasoning, and problem-solving to "
                "real-world business scenarios."
            ),
            date="TBD", venue="TBD", budget=100380.0, status="draft",
        )
        evt_intellect = Event(
            id="evt_da_intellect", club_id="club_doc_analytica", title="Intellect",
            description=(
                "A flagship industry panel that brings together accomplished professionals "
                "and business leaders to explore emerging trends at the intersection of "
                "analytics, AI, finance, and business leadership."
            ),
            date="TBD", venue="TBD", budget=26500.0, status="draft",
        )
        db.add_all([evt_acumen, evt_intellect])
        db.commit()

        reimb_da = Reimbursement(
            id="reimb_da_1", club_id="club_doc_analytica", event_id="evt_da_intellect",
            requested_by="std_2411181", amount=5000.0, status="pending",
        )
        db.add(reimb_da)
        db.commit()

        print("Generating DOC Analytica annual plan...")
        aplan_da = AnnualPlan(
            id="aplan_da_2026", club_id="club_doc_analytica", academic_year="2026-2027",
            vision=(
                "To make DOC Analytica Christ University's hub for applied analytics, AI, and "
                "business problem-solving — turning real-world business, finance, and technology "
                "challenges into hands-on, data-driven projects across four wings: AI & DevOps, "
                "Business Analytics, Corporate Relations, and Design & Promotions."
            ),
            objectives=(
                "AI & DevOps — open-source student/department essentials (target 15-20 "
                "associates). Business Analytics — real-world problem solving (target 15-20). "
                "Corporate Relations — sponsors + outreach to BA-identified companies (target "
                "10-15). Design & Promotions — support all wings (team of under 5)."
            ),
            major_initiatives=(
                "AI & DevOps: Capstone/Flagship Unified DOC Portal (80%), DOC Clubs websites "
                "by end of June (10%), EquityLab (5%), Corporate Restructuring Project frontend "
                "with Dr. Reynal, the Claims app, internal AI integration. Business Analytics: "
                "Consulting for low/mid-size companies and startups (75%), Club reports as part "
                "of the DOC Portal (20%), Festing Analytics (3%), Placement Reports (2%)."
            ),
            tentative_event_calendar=(
                "Acumen (AI + Analytics fest) and Intellect (AI-powered analytics industry "
                "panel) — dates and venues to be finalized for the 2026-2027 academic year."
            ),
            budget_allocation=126880.0,
            expected_outcomes=(
                "A functioning Unified DOC Portal for all clubs and faculty; at least one "
                "consulting engagement delivered end-to-end by the Business Analytics wing; "
                "50+ active associates across four wings; both flagship events executed "
                "within budget; a stronger corporate sponsorship pipeline."
            ),
            strategic_priorities=(
                "Interdisciplinary collaboration across analytics, finance, design and "
                "outreach; an open-source contribution culture in AI & DevOps; converting "
                "classroom theory into applied, real-world business consulting."
            ),
            key_deadlines=(
                "DOC Clubs website development targeted for completion by end of June 2027. "
                "Acumen and Intellect flagship events — dates TBD."
            ),
            status="draft",
            submitted_by="std_2411162",
        )
        db.add(aplan_da)
        db.commit()

        seed_yellow_forms(db)

        print("Seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
        raise e
    finally:
        db.close()


def seed_yellow_forms(db: Session) -> None:
    """Yellow forms: the two department-wide reviewers.

    A club's pre-approval goes to its own Faculty Coordinator and then to the
    Associate HOD; its claim sheet goes to the Claims Coordinator, who forwards
    approved sheets to the attendance office.
    """
    print("Generating yellow-form reviewers...")
    db.add_all([
        User(
            id="fac_anusha",
            email="anusha.iyer@christuniversity.in",
            hashed_password=get_password_hash(TEST_PASSWORD),
            name="Dr. Anusha Iyer",
            primary_role="faculty",
            status="active",
            role_tags_str="Associate HOD",
            designation="Associate HOD",
        ),
        User(
            id="fac_sharath",
            email="sharath@christuniversity.in",
            hashed_password=get_password_hash(TEST_PASSWORD),
            name="Sharath",
            primary_role="faculty",
            status="active",
            role_tags_str="Claims Coordinator",
            designation="Claims Coordinator",
        ),
    ])
    db.commit()

    _seed_yellow_form_fixtures(db)


# Class is free text on the department's sheet: semester, then programme
# ("1 BCom SF" is a first-semester B.Com Strategic Finance student). The number
# is the semester, never the year of study. These forms are for events in the
# odd semester of 2026-27, so the 2024 intake is in 5, 2025 in 3, 2026 in 1.
YF_CLASS_NAMES = {
    "2411162": "5 BCom AFA", "2411134": "5 BCom AFA", "2411181": "5 BCom AFA",
    "2411151": "5 BCom AFA", "2411155": "5 BCom AFA", "2411121": "5 BCom AFA",
    "2410411": "5 BCom", "2410407": "5 BCom",
    "2511159": "3 BCom AFA", "2511132": "3 BCom AFA", "2511148": "3 BCom AFA",
    "2511587": "3 BCom SF", "2510365": "3 BCom",
    "2611507": "1 BCom SF", "2611549": "1 BCom SF", "2611554": "1 BCom SF",
    "2611114": "1 BCom AFA", "2611117": "1 BCom AFA", "2611163": "1 BCom AFA",
    "2611461": "1 BCom F&I", "2610118": "1 BCom", "2610224": "1 BCom", "2610308": "1 BCom",
    "21COM5A001": "5 BCom A", "21COM5A002": "5 BCom A", "21COM5A003": "5 BCom A",
}


def _yf_academic_year(start: date) -> str:
    return f"{start.year}-{start.year + 1}" if start.month >= 6 else f"{start.year - 1}-{start.year}"


def _dmy(day: date) -> str:
    return day.strftime("%d/%m/%Y")


def _yf_span(start: date, end: date) -> str:
    return _dmy(start) if start == end else f"{_dmy(start)} – {_dmy(end)}"


def _pre_approval(
    db: Session, accounts: dict, *, form_id, ref, club_id, created_by, event_name, start, end, status,
    students, description=None, venue=None, submitted=None, fc=None, ahod=None,
    review_comments=None, last_reviewed_by=None, last_reviewed_stage=None,
) -> PreApprovalForm:
    """`students` is [(register_number, role)] in the club's row order; `fc`
    and `ahod` are (approver_id, date) for approvals already given."""
    suffix = form_id[len("paf_"):]
    form = PreApprovalForm(
        id=form_id,
        reference_number=ref,
        club_id=club_id,
        academic_year=_yf_academic_year(start),
        event_name=event_name,
        event_description=description,
        venue=venue,
        event_start_date=start.isoformat(),
        event_end_date=end.isoformat(),
        status=status,
        created_by=created_by,
        submitted_at=submitted.isoformat() if submitted else None,
        faculty_coordinator_approved_by=fc[0] if fc else None,
        faculty_coordinator_approved_at=fc[1].isoformat() if fc else None,
        associate_hod_approved_by=ahod[0] if ahod else None,
        associate_hod_approved_at=ahod[1].isoformat() if ahod else None,
        review_comments=review_comments,
        last_reviewed_by=last_reviewed_by,
        last_reviewed_stage=last_reviewed_stage,
    )
    for position, (register_number, role) in enumerate(students):
        student_id, name = accounts[register_number]
        form.students.append(PreApprovalStudent(
            id=f"pas_{suffix}_{position + 1}",
            student_id=student_id,
            register_number=register_number,
            student_name=name,
            class_name=YF_CLASS_NAMES[register_number],
            role=role,
            position=position,
        ))
    db.add(form)
    return form


def _claim_sheet(
    db: Session, form: PreApprovalForm, *, sheet_id, ref, status, submitted, rows,
    reviewed=None, review_comments=None,
) -> ClubClaimSheet:
    """`rows` is [(register_number, attendance with claims, without claims,
    [(date, [period ids])])] — only students on the pre-approval."""
    suffix = sheet_id[len("ccs_"):]
    listed = {s.register_number: s for s in form.students}
    sheet = ClubClaimSheet(
        id=sheet_id,
        reference_number=ref,
        pre_approval_id=form.id,
        club_id=form.club_id,
        status=status,
        created_by=form.created_by,
        submitted_at=submitted.isoformat(),
        late_submission_flag=(
            (submitted - date.fromisoformat(form.event_end_date)).days > settings.CLAIM_SUBMISSION_SLA_DAYS
        ),
        reviewed_by=reviewed[0] if reviewed else None,
        reviewed_at=reviewed[1].isoformat() if reviewed else None,
        review_comments=review_comments,
    )
    for position, (register_number, with_claims, without_claims, entries) in enumerate(rows):
        pre_approved = listed[register_number]
        sheet.students.append(ClubClaimStudent(
            id=f"ccst_{suffix}_{position + 1}",
            pre_approval_student_id=pre_approved.id,
            student_id=pre_approved.student_id,
            register_number=pre_approved.register_number,
            student_name=pre_approved.student_name,
            class_name=pre_approved.class_name,
            role=pre_approved.role,
            attendance_with_claims=with_claims,
            attendance_without_claims=without_claims,
            position=position,
            entries=[
                ClubClaimEntry(
                    id=f"cce_{suffix}_{position + 1}_{n}",
                    date=day.isoformat(),
                    periods=",".join(p for p in PERIOD_IDS if p in periods),
                )
                for n, (day, periods) in enumerate(entries, start=1)
            ],
        ))
    db.add(sheet)
    return sheet


def _club_leadership_ids(db: Session, club_id: str) -> list:
    """Who the live workflow notifies as a club's leadership: active members
    in its top two ranks."""
    levels = db.query(ClubHierarchyLevel).filter(ClubHierarchyLevel.club_id == club_id).all()
    top_ranks = sorted({level.level_order for level in levels})[:2]
    members = db.query(ClubMember).filter(ClubMember.club_id == club_id, ClubMember.status == "active").all()
    return [m.student_id for m in members if club_hierarchy_engine.get_level_order_for_member(db, m) in top_ranks]


def _seed_yellow_form_fixtures(db: Session) -> None:
    """One DOC Analytica form parked at every point of both workflows, plus a
    Commerce Club form that proves Faculty Coordinator scoping.

    Anything that has to lie in the future is relative to clock.today() at
    seed time, so the approval windows are still open whenever this runs.
    Every fixture obeys the rules the API enforces: approvals dated before the
    event starts, claim sheets only on approved pre-approvals whose events are
    over, and sheet rows only for pre-approved students on event dates.
    """
    print("Generating yellow forms (pre-approvals, claim sheets)...")
    today = clock.today()

    def day(offset: int) -> date:
        return today + timedelta(days=offset)

    accounts = {
        register_number: (user_id, name)
        for register_number, user_id, name in db.query(User.enrollment_no, User.id, User.name)
        .filter(User.primary_role == "student", User.enrollment_no.isnot(None))
    }

    da_club, da_role, shiva = "club_doc_analytica", "DOC Analytica", "std_2411162"
    reynal, anusha, sharath = "fac_reynal", "fac_anusha", "fac_sharath"

    def da_form(form_id, number, event_name, start, end, status, registers, **kw):
        return _pre_approval(
            db, accounts, form_id=form_id, ref=f"PAF-2026-{number:06d}", club_id=da_club, created_by=shiva,
            event_name=event_name, start=start, end=end, status=status,
            students=[r if isinstance(r, tuple) else (r, da_role) for r in registers], **kw,
        )

    da_form(
        "paf_da_1", 701, "Intellect — Industry Panel", day(21), day(21), "draft",
        ["2411134", "2511159", "2611507"],
        description="Flagship industry panel on analytics, AI and finance leadership.",
        venue="Main Auditorium, Central Block",
    )
    acumen = da_form(
        "paf_da_2", 702, "Acumen — Business Challenge", day(10), day(11), "faculty_coordinator_review",
        ["2411181", "2511132", "2611507", "2611114", "2511587", "2510365"],
        description="Two-day business challenge: teams solve live finance and analytics cases.",
        venue="Seminar Hall, Block IV", submitted=day(-1),
    )
    bootcamp = da_form(
        "paf_da_3", 703, "Analytics Bootcamp", day(6), day(6), "associate_hod_review",
        ["2411151", "2411121", "2611117", "2610224"],
        description="Hands-on Python and Power BI bootcamp run by the Business Analytics wing.",
        venue="Computer Lab 3, Block IV", submitted=day(-2), fc=(reynal, day(-1)),
    )
    corporate_connect = da_form(
        "paf_da_4", 704, "Corporate Connect Visit", day(14), day(14), "returned",
        ["2410407", "2611549", "2611554"],
        description="Industry visit to a Bengaluru analytics consultancy.",
        # Sent back by the Associate HOD, so it had passed the Faculty
        # Coordinator; only resubmitting clears that approval.
        submitted=day(-5), fc=(reynal, day(-4)),
        review_comments="Add the venue and the faculty member accompanying the students.",
        last_reviewed_by=anusha, last_reviewed_stage="associate_hod_review",
    )
    da_form(
        "paf_da_5", 705, "Data Storytelling Workshop", day(4), day(4), "approved",
        ["2410411", "2511148", "2610308", "2611461"],
        description="Workshop on presenting analysis to non-technical audiences.",
        venue="Seminar Room 402, Block B", submitted=day(-6), fc=(reynal, day(-4)), ahod=(anusha, day(-2)),
    )
    orientation = da_form(
        "paf_da_6", 706, "DOC Analytica Orientation", day(-2), day(-2), "approved",
        ["2411162", "2411155", "2611507", "2611163", "2611114"],
        description="Orientation for the new associates of all four wings.",
        venue="Main Auditorium, Central Block", submitted=day(-12), fc=(reynal, day(-10)), ahod=(anusha, day(-8)),
    )
    excel = da_form(
        "paf_da_7", 707, "Excel Masterclass", date(2026, 8, 17), date(2026, 8, 17), "approved",
        ["2611507", "2511148", "2511587", "2611117", "2611554"],
        description="Advanced Excel for financial modelling, taught by the Business Analytics wing.",
        venue="Computer Lab 1, Block IV", submitted=date(2026, 8, 4),
        fc=(reynal, date(2026, 8, 6)), ahod=(anusha, date(2026, 8, 10)),
    )
    hackathon = da_form(
        "paf_da_8", 708, "Hackathon Mentoring", date(2026, 8, 5), date(2026, 8, 6), "approved",
        [("2411181", "Lead Mentor"), ("2411134", "Mentor"), ("2511159", "Mentor"), ("2411121", "Mentor"), "2611461"],
        description="Mentoring teams at the university's inter-department hackathon.",
        venue="Innovation Centre, Central Block", submitted=date(2026, 7, 27),
        fc=(reynal, date(2026, 7, 29)), ahod=(anusha, date(2026, 7, 31)),
    )
    guest_lecture = da_form(
        "paf_da_9", 709, "Guest Lecture — AI in Finance", date(2026, 9, 10), date(2026, 9, 10), "approved",
        ["2511148", "2510365", "2610224", "2610308"],
        description="Guest lecture on AI in credit risk and trading, hosted for the department.",
        venue="Seminar Hall, Block IV", submitted=date(2026, 8, 31),
        fc=(reynal, date(2026, 9, 2)), ahod=(anusha, date(2026, 9, 4)),
    )
    da_form(
        "paf_da_10", 710, "Startup Pitch Day", day(-1), day(1), "faculty_coordinator_review",
        ["2511132", "2611163", "2611549"],
        description="Student founders pitch to alumni investors.",
        venue="Innovation Centre, Central Block", submitted=day(-6),
    )
    da_form(
        "paf_da_11", 711, "Case Study League", day(18), day(18), "rejected",
        ["2510365", "2511587", "2611114"],
        description="Inter-club case study competition.",
        venue="Seminar Hall, Block IV", submitted=day(-4),
        review_comments="This is an inter-club event — the organising club should file it.",
        last_reviewed_by=reynal, last_reviewed_stage="faculty_coordinator_review",
    )
    _pre_approval(
        db, accounts, form_id="paf_cc_1", ref="PAF-2026-000721", club_id="club_commerce",
        created_by="std_president", event_name="National Commerce Conclave", start=day(9), end=day(9),
        status="faculty_coordinator_review",
        students=[(r, "Commerce Club") for r in ("21COM5A001", "21COM5A002", "21COM5A003")],
        description="Annual national-level panel discussions with CFOs and business executives.",
        venue="Main Auditorium, CHRIST University", submitted=day(-1),
    )
    db.commit()

    aug_17 = date(2026, 8, 17)
    excel_sheet = _claim_sheet(
        db, excel, sheet_id="ccs_da_7", ref="YF-2026-000801", status="claims_coordinator_review",
        submitted=date(2026, 8, 19),
        rows=[
            # The department's reference row, exactly.
            ("2611507", 97.78, 97.78, [(aug_17, ["9_45AM"])]),
            ("2511148", 88.5, 84.25, [(aug_17, ["8AM", "9_45AM"])]),
            ("2511587", 91.3, 88.7, [(aug_17, ["9_45AM", "10_45AM"])]),
            ("2611117", 82.61, 78.26, [(aug_17, ["7AM", "8AM"])]),
        ],
    )
    aug_5, aug_6 = date(2026, 8, 5), date(2026, 8, 6)
    _claim_sheet(
        db, hackathon, sheet_id="ccs_da_8", ref="YF-2026-000802", status="approved",
        submitted=date(2026, 8, 7), reviewed=(sharath, date(2026, 8, 10)),
        rows=[
            ("2411181", 86.4, 80.9, [(aug_5, ["9_45AM", "10_45AM"]), (aug_6, ["7AM", "8AM"])]),
            ("2411134", 90.12, 86.42, [(aug_5, ["9_45AM"]), (aug_6, ["9_45AM", "10_45AM"])]),
            ("2511159", 93.75, 91.67, [(aug_5, ["8AM", "9_45AM"])]),
            ("2411121", 95.0, 93.33, [(aug_6, ["8AM"])]),
            ("2611461", 89.47, 86.84, [(aug_5, ["10_45AM"]), (aug_6, ["10_45AM"])]),
        ],
    )
    sep_10 = date(2026, 9, 10)
    guest_sheet = _claim_sheet(
        db, guest_lecture, sheet_id="ccs_da_9", ref="YF-2026-000803", status="returned",
        submitted=date(2026, 9, 14), reviewed=(sharath, date(2026, 9, 16)),
        review_comments="Please re-check the 8 AM period for Hariharan — the timetable shows a lab he attended.",
        rows=[
            ("2511148", 84.44, 80.0, [(sep_10, ["8AM", "9_45AM"])]),
            ("2510365", 92.31, 90.77, [(sep_10, ["9_45AM"])]),
            ("2610224", 87.5, 83.33, [(sep_10, ["9_45AM", "10_45AM"])]),
            ("2610308", 96.0, 94.67, [(sep_10, ["9_45AM"])]),
        ],
    )
    db.commit()

    print("Generating yellow-form notifications...")
    # Each points at an entity genuinely waiting on its recipient, in the
    # words the live workflow uses, so the bell tray agrees with the queues.
    club_audience = list(dict.fromkeys([shiva, *_club_leadership_ids(db, da_club)]))

    def notify(user_ids, entity_type, entity_id, title, content):
        db.add_all([
            Notification(
                id=f"not_yf_{entity_id}_{user_id}", user_id=user_id, title=title, content=content,
                is_read=False, source_module="claims", entity_type=entity_type, entity_id=entity_id,
            )
            for user_id in user_ids
        ])

    notify(
        [reynal], "pre_approval", acumen.id, "DOC Analytica pre-approval needs your approval",
        f"DOC Analytica has asked for pre-approval of “{acumen.event_name}” ({_yf_span(day(10), day(11))}, "
        f"{len(acumen.students)} student(s)). Approve by {_dmy(day(9))} — pre-approval cannot be granted "
        f"once the event starts.",
    )
    notify(
        [anusha], "pre_approval", bootcamp.id, "DOC Analytica pre-approval needs your approval",
        f"The Faculty Coordinator approved “{bootcamp.event_name}” ({_yf_span(day(6), day(6))}, "
        f"{len(bootcamp.students)} student(s)). It needs your final approval by {_dmy(day(5))}.",
    )
    notify(
        [sharath], "claim_sheet", excel_sheet.id, "DOC Analytica claim sheet needs your review",
        f"DOC Analytica filed claim sheet {excel_sheet.reference_number} for “{excel.event_name}” "
        f"({_yf_span(aug_17, aug_17)}, {len(excel_sheet.students)} student(s)).",
    )
    notify(
        club_audience, "pre_approval", corporate_connect.id,
        f"Pre-approval {corporate_connect.reference_number} returned",
        f"The Associate HOD sent back “{corporate_connect.event_name}”: {corporate_connect.review_comments}",
    )
    notify(
        club_audience, "claim_sheet", guest_sheet.id, f"Claim sheet {guest_sheet.reference_number} returned",
        f"The Claims Coordinator sent back the claim sheet for “{guest_lecture.event_name}”: "
        f"{guest_sheet.review_comments}",
    )
    notify(
        club_audience, "pre_approval", orientation.id, f"File the claim sheet for “{orientation.event_name}”",
        f"“{orientation.event_name}” is over and was pre-approved ({orientation.reference_number}). File its "
        f"claim sheet with the pre-approved students attached and submit it to the Claims Coordinator.",
    )
    db.commit()


if __name__ == "__main__":
    reset_schema()
    seed_database()
