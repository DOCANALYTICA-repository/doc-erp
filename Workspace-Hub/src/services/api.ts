import { UserState } from '../context/useStore';

const BASE_URL = 'http://localhost:8000/api/v1';

// In-Memory Mock Database mimicking seeded SQLAlchemy models
const MOCK_DATA = {
  clubs: [
    {
      id: "club_commerce",
      name: "Commerce Club",
      category: "Academic",
      logo: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=150&h=150&fit=crop",
      description: "Fostering academic excellence, analytical reasoning and industrial insights in finance and economics.",
      brand_colors: "#1e3a8a,#3b82f6",
      contact_email: "commerce.club@christuniversity.in",
      status: "active"
    },
    {
      id: "club_cultural",
      name: "Cultural Committee",
      category: "Cultural",
      logo: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&h=150&fit=crop",
      description: "The heart of theatrical, musical, and artistic expression for the Department of Commerce.",
      brand_colors: "#9d174d,#ec4899",
      contact_email: "cultural.club@christuniversity.in",
      status: "active"
    }
  ],
  members: {
    club_commerce: [
      { id: "mbr_1", student_id: "std_president", name: "Rahul Sharma", role: "President", status: "active", academic_year: "2025-2026" },
      { id: "mbr_2", student_id: "std_vp", name: "Ananya Rao", role: "Vice President", status: "active", academic_year: "2025-2026" },
      { id: "mbr_3", student_id: "std_regular_1", name: "Vikram Aditya", role: "Core Member", status: "active", academic_year: "2025-2026" }
    ],
    club_cultural: [
      { id: "mbr_4", student_id: "std_regular_2", name: "Neha Kapoor", role: "Core Member", status: "active", academic_year: "2025-2026" }
    ]
  },
  events: {
    club_commerce: [
      { id: "evt_conclave", club_id: "club_commerce", title: "National Commerce Conclave 2026", description: "Annual national level panel discussions with CFOs and business executives.", date: "2026-07-15", venue: "Main Auditorium, CHRIST University", budget: 15000.0, status: "approved" },
      { id: "evt_orientation", club_id: "club_commerce", title: "Junior Recruitment Drive", description: "Introductory seminars and case study screening to recruit first year volunteers.", date: "2026-07-20", venue: "Seminar Room 402, Block B", budget: 2000.0, status: "draft" }
    ],
    club_cultural: [
      { id: "evt_drama", club_id: "club_cultural", title: "Street Play Auditions", description: "Auditions for the annual theater fest play.", date: "2026-07-22", venue: "Open Air Theater", budget: 1000.0, status: "approved" }
    ]
  },
  budgets: {
    club_commerce: [
      { id: "bud_comm_2025", club_id: "club_commerce", academic_year: "2025-2026", allocated_amount: 50000.0, spent_amount: 15000.0 }
    ],
    club_cultural: [
      { id: "bud_cult_2025", club_id: "club_cultural", academic_year: "2025-2026", allocated_amount: 40000.0, spent_amount: 1000.0 }
    ]
  },
  reimbursements: {
    club_commerce: [
      { id: "reimb_1", club_id: "club_commerce", requested_by: "Rahul Sharma", amount: 2500.0, status: "approved", receipt_url: "/receipt.pdf" }
    ]
  },
  sponsorships: {
    club_commerce: [
      { id: "spon_1", club_id: "club_commerce", sponsor_name: "HDFC Bank", amount: 25000.0, status: "committed" }
    ]
  },
  claims: [
    {
      id: "cl_med_1",
      reference_number: "ACP-2026-000101",
      category: "medical",
      academic_year: "2025-2026",
      semester: "5",
      programme: "B.Com (Hons)",
      section: "A",
      submission_type: "individual",
      submitted_by: "std_regular_1",
      submitted_name: "Vikram Aditya",
      submission_date: "2026-07-05",
      date_range: "2026-07-05 to 2026-07-06",
      reason: "Recovering from viral fever and advised absolute bed rest.",
      status: "under_review",
      late_submission_flag: false,
      current_workflow_stage: "subject_faculty",
      participants: [
        {
          id: "cp_1",
          claim_id: "cl_med_1",
          student_id: "std_regular_1",
          student_name: "Vikram Aditya",
          status: "pending",
          entries: [
            { id: "ae_1", subject: "Corporate Accounting", date: "2026-07-06", hour: "09:00 AM - 10:00 AM", subject_faculty: "Dr. Anil Kumar", status: "pending" },
            { id: "ae_2", subject: "Financial Management", date: "2026-07-06", hour: "10:00 AM - 11:00 AM", subject_faculty: "Prof. Sarah Abraham", status: "pending" }
          ]
        }
      ]
    }
  ],
  timetable: [
    { id: "tt_m1", day_of_week: "Monday", subject: "Corporate Accounting", hour: "09:00 AM - 10:00 AM", faculty: "Dr. Anil Kumar", faculty_id: "fac_subject_2", programme: "B.Com (Hons)", semester: "5", section: "A" },
    { id: "tt_m2", day_of_week: "Monday", subject: "Financial Management", hour: "10:00 AM - 11:00 AM", faculty: "Prof. Sarah Abraham", faculty_id: "fac_class_teacher", programme: "B.Com (Hons)", semester: "5", section: "A" },
    { id: "tt_m3", day_of_week: "Monday", subject: "Taxation Law", hour: "11:15 AM - 12:15 PM", faculty: "Dr. Anil Kumar", faculty_id: "fac_subject_2", programme: "B.Com (Hons)", semester: "5", section: "A" }
  ],
  notes: [
    { id: "nt_1", owner_id: "fac_class_teacher", title: "Syllabus Completion Targets", content: "Must complete Unit 3 (Direct Taxes) by July 18. Schedule revision test on July 21.", is_pinned: true, is_favorite: true, tags: "Syllabus,Academic" }
  ],
  documents: [
    { id: "doc_fac_1", owner_id: "fac_class_teacher", name: "Timetable Scheme A 2026.pdf", file_url: "/storage/timetable.pdf", folder_path: "/Timetables", tags: "Administrative", is_favorite: true, shared_link: "share_123", is_link_revoked: false }
  ],
  meetings: [
    { id: "mtg_dept_1", title: "Department Curriculum Review Meeting", type: "department", date: "2026-07-08", time: "02:30 PM", duration: "1.5 hours", venue: "Conference Room, Block A", organizer_id: "fac_hod", status: "scheduled" }
  ],
  tasks: [
    { id: "tsk_syllabus_audit", title: "Audit 3rd Semester Claim Files", description: "Verify medical documents submitted for claims in previous semester.", due_date: "2026-07-12", priority: "high", status: "pending", source_module: "faculty", assignee_id: "fac_class_teacher", creator_id: "fac_hod" }
  ],
  notifications: [
    { id: "not_1", user_id: "fac_class_teacher", title: "New Claim Pending Initial Review", content: "Student Vikram Aditya has submitted a Medical Claim: ACP-2026-000101.", is_read: false, source_module: "claims" },
    { id: "not_2", user_id: "std_president", title: "Recruitment Drive Created", content: "Your draft recruitment drive has been successfully registered.", is_read: true, source_module: "clubs" }
  ]
};

// A real, reachable-backend error (4xx/5xx). Callers should catch this
// specifically and show ApiError.message / ApiError.body to the user —
// it must NEVER be silently swallowed and replaced with mock data.
export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(
      (body && typeof body.detail === 'string' && body.detail) ||
      `Request failed with status ${status}`
    );
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// Fetch wrapper. Mock failover is a DEV-ONLY convenience for when the
// backend process itself isn't reachable (offline, not started, DNS/CORS
// preflight failure) — it must never trigger for a real response from a
// reachable backend, including auth failures and validation errors.
// Confusing "wrong password" with "backend is down" was a real, shipped bug:
// both used to fall through to the same mock-success path.
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const tokenObj = localStorage.getItem('doc_user_session');
  let headers: HeadersInit = {};

  if (!(options?.body instanceof URLSearchParams)) {
    headers['Content-Type'] = 'application/json';
  }

  if (tokenObj) {
    try {
      const parsed = JSON.parse(tokenObj);
      headers['Authorization'] = `Bearer ${parsed.token}`;
    } catch (_) {}
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options?.headers
      }
    });
  } catch (networkError) {
    // fetch() itself throwing means no response was ever received — this is
    // the ONLY condition allowed to fall back to client-side mocks.
    console.warn(`Backend unreachable for ${endpoint}. Falling back to client-side mocks (dev only).`);
    return mockHandler<T>(endpoint, options);
  }

  if (!response.ok) {
    let body: any = null;
    try {
      body = await response.json();
    } catch (_) {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, body);
  }

  return await response.json();
}

// DEV-FALLBACK-ONLY approximation of backend/app/core/rbac.py's resolution,
// used solely so the offline mock personas below behave sensibly when the
// real backend is unreachable. This is NOT a second production RBAC engine —
// nothing in the real (backend-connected) login path uses this; permissions
// there always come from the server's /auth/me response.
function mockPermissions(primaryRole: UserState['primary_role'], roleTagsStr: string): string[] {
  const byRole: Record<string, string[]> = {
    public: ['public:view'],
    student: ['public:view', 'claims:submit', 'claims:view_own', 'clubs:view', 'events:register', 'tasks:view_own'],
    faculty: ['public:view', 'claims:view_own', 'clubs:view', 'faculty:dashboard', 'notes:manage', 'documents:manage', 'meetings:manage', 'tasks:manage', 'directory:view', 'reports:view', 'claims:review_faculty'],
    super_admin: ['*'],
  };
  const byTag: Record<string, string[]> = {
    'Club President': ['clubs:manage_members', 'events:create', 'budget:manage', 'reimbursement:request', 'sponsorship:manage'],
    'Vice President': ['clubs:manage_members', 'events:create', 'budget:manage', 'reimbursement:request'],
    'Core Member': ['events:create', 'reimbursement:request'],
    'Class Teacher': ['claims:review_class_teacher'],
    'Club Faculty Coordinator': ['clubs:approve_plan', 'events:approve', 'budget:manage', 'reimbursement:approve', 'claims:review_faculty_coordinator'],
    'Course Coordinator': ['claims:approve_coordinator'],
    HOD: ['claims:approve_coordinator', 'clubs:approve_plan', 'events:approve', 'rbac:assign_roles'],
  };
  const perms = new Set(byRole[primaryRole] ?? []);
  roleTagsStr.split(',').map(t => t.trim()).filter(Boolean).forEach(tag => {
    (byTag[tag] ?? []).forEach(p => perms.add(p));
  });
  return Array.from(perms);
}

// Client Mock Handler simulating API behavior
function mockHandler<T>(endpoint: string, options?: RequestInit): T {
  const method = options?.method || 'GET';

  if (endpoint.startsWith('/auth/login') && method === 'POST') {
    const body = new URLSearchParams(options?.body as any);
    const username = body.get('username') || '';

    // Simulate user logs based on role email
    let user: UserState;
    if (username.includes('admin')) {
      user = { id: 'admin_1', email: 'admin@christuniversity.in', name: 'Super Admin', primary_role: 'super_admin', role_tags_str: '', status: 'active', permissions: [] };
    } else if (username.includes('hod')) {
      user = { id: 'fac_hod', email: 'hod.commerce@christuniversity.in', name: 'Dr. Joy Kishor (HOD)', primary_role: 'faculty', role_tags_str: 'HOD', status: 'active', permissions: [] };
    } else if (username.includes('teacher') || username.includes('class')) {
      user = { id: 'fac_class_teacher', email: 'teacher.class@christuniversity.in', name: 'Prof. Sarah Abraham', primary_role: 'faculty', role_tags_str: 'Class Teacher,Course Coordinator', status: 'active', permissions: [] };
    } else if (username.includes('vp')) {
      user = { id: 'std_vp', email: 'student.vp@christuniversity.in', name: 'Ananya Rao', primary_role: 'student', role_tags_str: 'Vice President', status: 'active', permissions: [] };
    } else if (username.includes('president')) {
      user = { id: 'std_president', email: 'student.president@christuniversity.in', name: 'Rahul Sharma', primary_role: 'student', role_tags_str: 'Club President', status: 'active', permissions: [] };
    } else {
      user = { id: 'std_regular_1', email: 'student.regular@christuniversity.in', name: 'Vikram Aditya', primary_role: 'student', role_tags_str: '', status: 'active', permissions: [] };
    }
    user.permissions = mockPermissions(user.primary_role, user.role_tags_str);

    return { access_token: 'mock_jwt_token_payload', token_type: 'bearer', user_profile: user, capabilities: {} } as any;
  }
  
  if (endpoint.startsWith('/auth/me')) {
    const tokenObj = localStorage.getItem('doc_user_session');
    if (tokenObj) {
      return JSON.parse(tokenObj).user as any;
    }
    throw new Error("Unauthorized");
  }

  if (endpoint.startsWith('/clubs')) {
    if (endpoint === '/clubs' || endpoint === '/') return MOCK_DATA.clubs as any;
    const parts = endpoint.split('/');
    const clubId = parts[2];
    if (parts.length === 3) {
      return MOCK_DATA.clubs.find(c => c.id === clubId) as any;
    }
    const subRoute = parts[3];
    if (subRoute === 'members') return (MOCK_DATA.members[clubId as 'club_commerce'] || []) as any;
    if (subRoute === 'events') {
      if (method === 'POST') {
        const body = JSON.parse(options?.body as string);
        const newEv = { ...body, id: `evt_${Date.now()}` };
        if (!MOCK_DATA.events[clubId as 'club_commerce']) MOCK_DATA.events[clubId as 'club_commerce'] = [];
        MOCK_DATA.events[clubId as 'club_commerce'].push(newEv);
        return newEv as any;
      }
      return (MOCK_DATA.events[clubId as 'club_commerce'] || []) as any;
    }
    if (subRoute === 'budgets') return (MOCK_DATA.budgets[clubId as 'club_commerce'] || []) as any;
    if (subRoute === 'reimbursements') {
      if (method === 'POST') {
        const body = JSON.parse(options?.body as string);
        const newRe = { ...body, id: `reimb_${Date.now()}`, status: 'pending' };
        if (!MOCK_DATA.reimbursements[clubId as 'club_commerce']) MOCK_DATA.reimbursements[clubId as 'club_commerce'] = [];
        MOCK_DATA.reimbursements[clubId as 'club_commerce'].push(newRe);
        return newRe as any;
      }
      return (MOCK_DATA.reimbursements[clubId as 'club_commerce'] || []) as any;
    }
    if (subRoute === 'sponsorships') {
      if (method === 'POST') {
        const body = JSON.parse(options?.body as string);
        const newSp = { ...body, id: `spons_${Date.now()}` };
        if (!MOCK_DATA.sponsorships[clubId as 'club_commerce']) MOCK_DATA.sponsorships[clubId as 'club_commerce'] = [];
        MOCK_DATA.sponsorships[clubId as 'club_commerce'].push(newSp);
        return newSp as any;
      }
      return (MOCK_DATA.sponsorships[clubId as 'club_commerce'] || []) as any;
    }
  }

  if (endpoint.startsWith('/claims')) {
    if (endpoint.includes('timetable')) return MOCK_DATA.timetable as any;
    if (endpoint === '/claims' || endpoint === '/') return MOCK_DATA.claims as any;
    
    if (method === 'POST' && endpoint === '/') {
      const body = JSON.parse(options?.body as string);
      const newCl = {
        ...body,
        id: `cl_${Date.now()}`,
        reference_number: `ACP-2026-${Math.floor(1000 + Math.random()*9000)}`,
        submitted_by: 'std_regular_1',
        submitted_name: 'Vikram Aditya',
        submission_date: '2026-07-08',
        status: 'submitted',
        late_submission_flag: false,
        current_workflow_stage: 'initial_review',
        participants: [
          {
            id: `cp_${Date.now()}`,
            student_id: 'std_regular_1',
            student_name: 'Vikram Aditya',
            status: 'pending',
            entries: body.missed_classes.map((mc: any, i: number) => ({
              id: `ae_${Date.now()}_${i}`,
              ...mc,
              status: 'pending'
            }))
          }
        ]
      };
      MOCK_DATA.claims.push(newCl);
      return newCl as any;
    }
  }

  if (endpoint.startsWith('/faculty')) {
    if (endpoint.includes('notes')) {
      if (method === 'POST') {
        const body = JSON.parse(options?.body as string);
        const newNote = { ...body, id: `nt_${Date.now()}`, owner_id: 'fac_class_teacher' };
        MOCK_DATA.notes.push(newNote);
        return newNote as any;
      }
      return MOCK_DATA.notes as any;
    }
    if (endpoint.includes('documents')) {
      if (method === 'POST') {
        const body = JSON.parse(options?.body as string);
        const newDoc = { ...body, id: `doc_${Date.now()}`, owner_id: 'fac_class_teacher', shared_link: `share_${Date.now()}`, is_link_revoked: false };
        MOCK_DATA.documents.push(newDoc);
        return newDoc as any;
      }
      return MOCK_DATA.documents as any;
    }
    if (endpoint.includes('meetings')) {
      if (method === 'POST') {
        const body = JSON.parse(options?.body as string);
        const newMtg = { ...body, id: `meet_${Date.now()}`, organizer_id: 'fac_hod', status: 'scheduled' };
        MOCK_DATA.meetings.push(newMtg);
        return newMtg as any;
      }
      return MOCK_DATA.meetings as any;
    }
  }

  if (endpoint.startsWith('/tasks')) {
    if (method === 'POST') {
      const body = JSON.parse(options?.body as string);
      const newTask = { ...body, id: `task_${Date.now()}`, creator_id: 'fac_hod', status: 'pending' };
      MOCK_DATA.tasks.push(newTask);
      return newTask as any;
    }
    return MOCK_DATA.tasks as any;
  }

  if (endpoint.startsWith('/notifications')) {
    return MOCK_DATA.notifications as any;
  }

  return {} as any;
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body: any) => {
    const isForm = body instanceof URLSearchParams;
    return request<T>(endpoint, {
      method: 'POST',
      body: isForm ? body : JSON.stringify(body),
      headers: isForm ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}
    });
  },
  put: <T>(endpoint: string, body: any) => {
    const isForm = body instanceof URLSearchParams;
    return request<T>(endpoint, {
      method: 'PUT',
      body: isForm ? body : JSON.stringify(body),
      headers: isForm ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}
    });
  },
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};
