import {
  User, Teacher, Student, ClassRoom, StudentClass, AcademicYear, Subject,
  TeacherSubject, Material, Competency, Tryout, TryoutSubject, Question,
  TryoutQuestion, GoogleForm, Response, Answer, Score, QuestionAnalysis,
  Explanation, AuditLog
} from '../types/database';

export const INITIAL_ACADEMIC_YEARS: AcademicYear[] = [
  { id: '0ffe2ac4-48bd-400b-ae8c-05ecff36e4a1', yearLabel: '2025/2026', semester: 'EVEN', isActive: true },
];

export const INITIAL_USERS: User[] = [
  {
    id: 'u-admin-custom',
    email: 'admin@sekolah.com',
    role: 'ADMIN',
    name: 'Admin',
    password: 'admin123',
    createdAt: '2025-07-01T08:00:00Z',
  },
  {
    id: 'u-admin',
    email: 'admin@sekolah.sch.id',
    role: 'ADMIN',
    name: 'Administrator Sekolah',
    password: 'password123',
    createdAt: '2025-07-01T08:00:00Z',
  },
];

export const INITIAL_TEACHERS: Teacher[] = [
  {
    id: 't-admin-custom',
    userId: 'u-admin-custom',
    nip: 'ADMIN-001',
    name: 'Admin',
    email: 'admin@sekolah.com',
    phone: '',
    password: 'admin123',
    subjectPermissions: [],
    classPermissions: [],
    isWaliKelas: false,
  },
  {
    id: 't-admin',
    userId: 'u-admin',
    nip: 'NIP-ADMIN',
    name: 'Administrator Sekolah',
    email: 'admin@sekolah.sch.id',
    phone: '',
    password: 'password123',
    subjectPermissions: [],
    classPermissions: [],
    isWaliKelas: false,
  },
];

export const INITIAL_CLASSES: ClassRoom[] = [];

export const INITIAL_SUBJECTS: Subject[] = [];

export const INITIAL_TEACHER_SUBJECTS: TeacherSubject[] = [];

export const INITIAL_MATERIALS: Material[] = [];

export const INITIAL_COMPETENCIES: Competency[] = [];

export const INITIAL_STUDENTS: Student[] = [];

export const INITIAL_TRYOUTS: Tryout[] = [];

export const INITIAL_TRYOUT_SUBJECTS: TryoutSubject[] = [];

export const INITIAL_QUESTIONS: Question[] = [];

export const INITIAL_TRYOUT_QUESTIONS: TryoutQuestion[] = [];

export const INITIAL_EXPLANATIONS: Explanation[] = [];

export const INITIAL_RESPONSES: Response[] = [];

export const INITIAL_ANSWERS: Answer[] = [];

export const INITIAL_SCORES: Score[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];
