-- ============================================================
-- SKEMA LENGKAP SUPABASE (UNIFIED 1-KLIK)
-- Analisis Ujian Sekolah
-- ============================================================
-- Skrip ini menggabungkan seluruh tabel, indeks, constraint, RLS,
-- dan konfigurasi Supabase Realtime secara terpadu tanpa dependensi bertingkat.
-- 
-- CARA PENGGUNAAN DI PROJECT SUPABASE BARU:
-- 1. Buka Supabase Dashboard -> Menu SQL Editor -> New Query
-- 2. Salin dan tempel seluruh isi file ini, lalu klik Run.
-- ============================================================

-- Aktifkan ekstensi UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'GURU', 'WALI_KELAS', 'SISWA')),
  avatar_url    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

-- ============================================================
-- 2. ACADEMIC YEARS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.academic_years (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_label  VARCHAR(20) NOT NULL,
  semester    VARCHAR(10) NOT NULL CHECK (semester IN ('ODD', 'EVEN')),
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. CLASSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.classes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(50) NOT NULL,
  grade_level      VARCHAR(10) NOT NULL,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_classes_academic_year ON public.classes (academic_year_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_classes_name_ay') THEN
    ALTER TABLE public.classes ADD CONSTRAINT uq_classes_name_ay UNIQUE (name, academic_year_id);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- 4. TEACHERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teachers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES public.users(id) ON DELETE SET NULL,
  nip                 VARCHAR(50) UNIQUE NOT NULL,
  name                VARCHAR(255) NOT NULL,
  email               VARCHAR(255) NOT NULL,
  phone               VARCHAR(30),
  password_hint       TEXT,
  subject_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  class_permissions   JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_wali_kelas       BOOLEAN NOT NULL DEFAULT false,
  home_room_class_id  UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS password_hint TEXT;
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON public.teachers (user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_nip     ON public.teachers (nip);

-- ============================================================
-- 5. STUDENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.students (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES public.users(id) ON DELETE SET NULL,
  nisn                  VARCHAR(20) UNIQUE NOT NULL,
  nis                   VARCHAR(20) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  gender                CHAR(1) NOT NULL CHECK (gender IN ('L', 'P')),
  class_id              UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  birth_date            DATE,
  email                 VARCHAR(255),
  phone                 VARCHAR(30),
  target_score          NUMERIC(5,2) DEFAULT 80.00,
  is_answer_key_account BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS is_answer_key_account BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_students_user_id  ON public.students (user_id);
CREATE INDEX IF NOT EXISTS idx_students_nisn     ON public.students (nisn);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students (class_id);

-- ============================================================
-- 6. STUDENT CLASSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_classes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id         UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  UNIQUE (student_id, academic_year_id)
);

-- ============================================================
-- 7. SUBJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(20) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  category      VARCHAR(20) NOT NULL CHECK (category IN ('WAJIB', 'PEMINATAN', 'VOKASI')),
  passing_grade NUMERIC(5,2) NOT NULL DEFAULT 75.00,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 8. TEACHER SUBJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  UNIQUE (teacher_id, subject_id)
);

-- ============================================================
-- 9. MATERIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.materials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  subject_id  UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  grade_level VARCHAR(10) NOT NULL,
  semester    VARCHAR(10) NOT NULL CHECK (semester IN ('ODD', 'EVEN')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_materials_subject ON public.materials (subject_id);

-- ============================================================
-- 10. COMPETENCIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competencies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) NOT NULL,
  description TEXT NOT NULL,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_competencies_material ON public.competencies (material_id);

-- ============================================================
-- 11. EXAM PACKAGES (SAT, SAS, TRYOUT, SUMATIF, FORMATIF)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exam_packages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             VARCHAR(50) UNIQUE NOT NULL,
  title            VARCHAR(255) NOT NULL,
  assessment_type  VARCHAR(20) NOT NULL DEFAULT 'TRYOUT',
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  target_grades    JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_class_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_date       TIMESTAMPTZ NOT NULL,
  end_date         TIMESTAMPTZ NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DRAFT')),
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_exam_packages_status ON public.exam_packages (status);

-- ============================================================
-- 12. EXAM PACKAGE SUBJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exam_package_subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id    UUID NOT NULL REFERENCES public.exam_packages(id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  tryout_id     UUID,
  "order"       INTEGER NOT NULL DEFAULT 1,
  is_required   BOOLEAN NOT NULL DEFAULT true,
  passing_grade NUMERIC(5,2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (package_id, subject_id)
);

-- ============================================================
-- 13. TRYOUTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tryouts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             VARCHAR(50) UNIQUE NOT NULL,
  title            VARCHAR(255) NOT NULL,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  start_date       TIMESTAMPTZ NOT NULL,
  end_date         TIMESTAMPTZ NOT NULL,
  scoring_config   JSONB NOT NULL,
  status           VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED')),
  description      TEXT,
  google_form_url  TEXT,
  google_sheet_url TEXT,
  package_id       UUID REFERENCES public.exam_packages(id) ON DELETE SET NULL,
  target_class_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_external      BOOLEAN DEFAULT false,
  source           VARCHAR(20) DEFAULT 'INTERNAL',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.tryouts ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false;
ALTER TABLE public.tryouts ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'INTERNAL';
ALTER TABLE public.tryouts ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES public.exam_packages(id) ON DELETE SET NULL;
ALTER TABLE public.tryouts ADD COLUMN IF NOT EXISTS target_class_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_tryouts_package_id ON public.tryouts (package_id);

-- ============================================================
-- 14. TRYOUT SUBJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tryout_subjects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id        UUID NOT NULL REFERENCES public.tryouts(id) ON DELETE CASCADE,
  subject_id       UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  question_count   INT NOT NULL DEFAULT 40,
  duration_minutes INT NOT NULL DEFAULT 90,
  passing_score    NUMERIC(5,2) NOT NULL DEFAULT 75.00,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tryout_id, subject_id)
);

-- ============================================================
-- 15. QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id      UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  material_id     UUID REFERENCES public.materials(id) ON DELETE SET NULL,
  competency_id   UUID REFERENCES public.competencies(id) ON DELETE SET NULL,
  question_number INT NOT NULL,
  question_text   TEXT NOT NULL,
  question_type   VARCHAR(20) NOT NULL CHECK (question_type IN ('MCQ', 'COMPLEX_MCQ', 'ASSOCIATION', 'SHORT_ANSWER', 'ESSAY')),
  options         JSONB,
  correct_answer  JSONB NOT NULL,
  difficulty      VARCHAR(10) NOT NULL CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
  cognitive_level VARCHAR(5) NOT NULL CHECK (cognitive_level IN ('C1', 'C2', 'C3', 'C4', 'C5', 'C6')),
  weight          NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON public.questions (subject_id);

-- ============================================================
-- 16. TRYOUT QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tryout_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id      UUID NOT NULL REFERENCES public.tryouts(id) ON DELETE CASCADE,
  question_id    UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  question_order INT NOT NULL,
  UNIQUE (tryout_id, question_id)
);

-- ============================================================
-- 17. GOOGLE FORMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.google_forms (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id      UUID NOT NULL REFERENCES public.tryouts(id) ON DELETE CASCADE,
  form_id        VARCHAR(255) NOT NULL,
  form_title     VARCHAR(255) NOT NULL,
  responder_uri  TEXT,
  edit_uri       TEXT,
  sync_token     TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 18. RESPONSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.responses (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id          UUID NOT NULL REFERENCES public.tryouts(id) ON DELETE CASCADE,
  student_id         UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  google_response_id VARCHAR(255),
  submitted_at       TIMESTAMPTZ NOT NULL,
  is_valid           BOOLEAN NOT NULL DEFAULT TRUE,
  is_external        BOOLEAN DEFAULT false,
  source             VARCHAR(20) DEFAULT 'INTERNAL',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tryout_id, student_id)
);
ALTER TABLE public.responses ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false;
ALTER TABLE public.responses ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'INTERNAL';
CREATE INDEX IF NOT EXISTS idx_responses_tryout  ON public.responses (tryout_id);
CREATE INDEX IF NOT EXISTS idx_responses_student ON public.responses (student_id);

-- ============================================================
-- 19. ANSWERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.answers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id      UUID NOT NULL REFERENCES public.responses(id) ON DELETE CASCADE,
  question_id      UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  submitted_answer JSONB,
  is_correct       BOOLEAN,
  score_earned     NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_answers_response ON public.answers (response_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON public.answers (question_id);

-- ============================================================
-- 20. SCORES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scores (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id          UUID NOT NULL REFERENCES public.tryouts(id) ON DELETE CASCADE,
  student_id         UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id         UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  total_score        NUMERIC(6,2) NOT NULL,
  max_possible_score NUMERIC(6,2) NOT NULL DEFAULT 100.00,
  percentage         NUMERIC(5,2) NOT NULL,
  rank_in_class      INT,
  rank_in_school     INT,
  is_passed          BOOLEAN NOT NULL,
  is_external        BOOLEAN DEFAULT false,
  source             VARCHAR(20) DEFAULT 'INTERNAL',
  calculated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false;
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'INTERNAL';
CREATE INDEX IF NOT EXISTS idx_scores_tryout_student ON public.scores (tryout_id, student_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_scores_tryout_student_subject') THEN
    ALTER TABLE public.scores ADD CONSTRAINT uq_scores_tryout_student_subject UNIQUE (tryout_id, student_id, subject_id);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- 21. QUESTION ANALYSIS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.question_analysis (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id            UUID NOT NULL REFERENCES public.tryouts(id) ON DELETE CASCADE,
  question_id          UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  difficulty_index     NUMERIC(4,3),
  discrimination_index NUMERIC(4,3),
  distractor_analysis  JSONB,
  status               VARCHAR(20) CHECK (status IN ('VERY_EASY', 'EASY', 'MEDIUM', 'HARD', 'VERY_HARD')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tryout_id, question_id)
);

-- ============================================================
-- 22. EXPLANATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.explanations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id      UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  text_explanation TEXT NOT NULL,
  video_url        TEXT,
  ai_generated     BOOLEAN NOT NULL DEFAULT FALSE,
  status           VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEWED', 'PUBLISHED')),
  created_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_explanations_question ON public.explanations (question_id);

-- ============================================================
-- 23. REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id    UUID NOT NULL REFERENCES public.tryouts(id) ON DELETE CASCADE,
  report_type  VARCHAR(20) NOT NULL CHECK (report_type IN ('EXECUTIVE', 'SUBJECT', 'CLASS', 'STUDENT')),
  target_id    UUID,
  report_data  JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 24. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action     VARCHAR(50) NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  record_id  UUID,
  old_data   JSONB,
  new_data   JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);

-- ============================================================
-- 25. SCHOOL PROFILE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.school_profile (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL DEFAULT 'SMP AYO SINAU',
  npsn            VARCHAR(20) NOT NULL DEFAULT '12345678',
  address         TEXT,
  headmaster_name VARCHAR(255) NOT NULL DEFAULT 'Drs. H. Ahmad Fauzi, M.Pd.',
  headmaster_nip  VARCHAR(50) NOT NULL DEFAULT '196805141994031005',
  logo_url        TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.school_profile ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- ============================================================
-- KONFIGURASI ROW LEVEL SECURITY (RLS) MULTI-DEVICE
-- ============================================================
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'users', 'teachers', 'students', 'student_classes', 'classes', 'subjects',
    'teacher_subjects', 'materials', 'competencies', 'academic_years',
    'exam_packages', 'exam_package_subjects', 'tryouts', 'tryout_subjects',
    'questions', 'tryout_questions', 'google_forms', 'responses', 'answers',
    'scores', 'question_analysis', 'explanations', 'reports', 'audit_logs',
    'school_profile'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      -- Bersihkan semua policy lama agar tidak ada konflik
      EXECUTE format('DROP POLICY IF EXISTS "sync_all_access" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "admin_full_access" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "admin_all_access" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "teacher_manage_own" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "authenticated_read_teachers" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "staff_read_students" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "anon_student_lookup" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "anon_student_lookup_by_nisn" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "student_own_scores" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "student_own_answers" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "student_own_responses" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "scores_access" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "answers_access" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "responses_access" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "staff_write_scores" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "staff_write_answers" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "staff_write_responses" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "staff_manage_questions" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "public_published_explanations" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "staff_manage_explanations" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "admin_read_audit_logs" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "service_write_audit_logs" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "admin_manage_exam_packages" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "admin_guru_manage_package_subjects" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "authenticated_read" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "users_read_own" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "users_insert_own" ON public.%I', tbl);

      -- Pasang policy sinkronisasi terbuka untuk anon dan authenticated
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('CREATE POLICY "sync_all_access" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- KONFIGURASI SUPABASE REALTIME REPLICATION
-- ============================================================
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'users', 'teachers', 'students', 'classes', 'subjects', 'academic_years',
    'exam_packages', 'exam_package_subjects', 'tryouts', 'tryout_subjects',
    'scores', 'responses', 'questions', 'answers', 'explanations', 'school_profile'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      END IF;
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);
    END IF;
  END LOOP;
END $$;
