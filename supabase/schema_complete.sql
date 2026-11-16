-- ============================================================
-- SKEMA LENGKAP SUPABASE (UNIFIED 1-KLIK BERSIH)
-- WIKAN - Analisis Ujian Sekolah
-- ============================================================
-- Skrip ini membersihkan skema lama yang rusak/setengah jadi (CASCADE),
-- lalu membuat seluruh 25 tabel, indeks, RLS multi-device, dan Supabase Realtime
-- secara terurut, rapi, dan bebas error.
--
-- CARA MENJALANKAN DI SUPABASE BARU:
-- 1. Buka Supabase Dashboard (https://supabase.com/dashboard/project/skblhptwieauvtcwnrwf)
-- 2. Masuk ke menu "SQL Editor" -> "New Query"
-- 3. Tempel seluruh isi skrip ini lalu klik "Run".
-- ============================================================

-- Reset skema public agar sisa tabel yang gagal/tidak lengkap terhapus bersih
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- Berikan izin akses penuh ke role standar Supabase
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO service_role;

-- Aktifkan ekstensi UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USERS (Akun Login & Role)
-- ============================================================
CREATE TABLE public.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'GURU', 'WALI_KELAS', 'SISWA')),
  avatar_url    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_email ON public.users (email);

-- ============================================================
-- 2. ACADEMIC YEARS (Tahun Pelajaran & Semester)
-- ============================================================
CREATE TABLE public.academic_years (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_label  VARCHAR(20) NOT NULL,
  semester    VARCHAR(10) NOT NULL CHECK (semester IN ('ODD', 'EVEN')),
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. CLASSES (Rombel / Kelas)
-- ============================================================
CREATE TABLE public.classes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(50) NOT NULL,
  grade_level      VARCHAR(10) NOT NULL,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_classes_name_ay UNIQUE (name, academic_year_id)
);
CREATE INDEX idx_classes_academic_year ON public.classes (academic_year_id);

-- ============================================================
-- 4. TEACHERS (Guru & Wali Kelas)
-- ============================================================
CREATE TABLE public.teachers (
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
CREATE INDEX idx_teachers_user_id ON public.teachers (user_id);
CREATE INDEX idx_teachers_nip     ON public.teachers (nip);

-- ============================================================
-- 5. STUDENTS (Siswa)
-- ============================================================
CREATE TABLE public.students (
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
CREATE INDEX idx_students_user_id  ON public.students (user_id);
CREATE INDEX idx_students_nisn     ON public.students (nisn);
CREATE INDEX idx_students_class_id ON public.students (class_id);

-- ============================================================
-- 6. STUDENT CLASSES (Riwayat Penempatan Siswa di Kelas)
-- ============================================================
CREATE TABLE public.student_classes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id         UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  UNIQUE (student_id, academic_year_id)
);

-- ============================================================
-- 7. SUBJECTS (Mata Pelajaran)
-- ============================================================
CREATE TABLE public.subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(20) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  category      VARCHAR(20) NOT NULL CHECK (category IN ('WAJIB', 'PEMINATAN', 'VOKASI')),
  passing_grade NUMERIC(5,2) NOT NULL DEFAULT 75.00,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 8. TEACHER SUBJECTS (Penugasan Mapel ke Guru)
-- ============================================================
CREATE TABLE public.teacher_subjects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  UNIQUE (teacher_id, subject_id)
);

-- ============================================================
-- 9. MATERIALS (Materi Pembelajaran)
-- ============================================================
CREATE TABLE public.materials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  subject_id  UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  grade_level VARCHAR(10) NOT NULL,
  semester    VARCHAR(10) NOT NULL CHECK (semester IN ('ODD', 'EVEN')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_materials_subject ON public.materials (subject_id);

-- ============================================================
-- 10. COMPETENCIES (Kompetensi Dasar / Capaian Pembelajaran)
-- ============================================================
CREATE TABLE public.competencies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) NOT NULL,
  description TEXT NOT NULL,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_competencies_material ON public.competencies (material_id);

-- ============================================================
-- 11. EXAM PACKAGES (Paket Ujian: SAT, SAS, TRYOUT, SUMATIF)
-- ============================================================
CREATE TABLE public.exam_packages (
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
CREATE INDEX idx_exam_packages_status ON public.exam_packages (status);

-- ============================================================
-- 12. EXAM PACKAGE SUBJECTS (Mapel di dalam Paket Ujian)
-- ============================================================
CREATE TABLE public.exam_package_subjects (
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
-- 13. TRYOUTS (Ujian / Try Out / Penilaian)
-- ============================================================
CREATE TABLE public.tryouts (
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
CREATE INDEX idx_tryouts_package_id ON public.tryouts (package_id);

-- ============================================================
-- 14. TRYOUT SUBJECTS
-- ============================================================
CREATE TABLE public.tryout_subjects (
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
-- 15. QUESTIONS (Bank Soal)
-- ============================================================
CREATE TABLE public.questions (
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
CREATE INDEX idx_questions_subject ON public.questions (subject_id);

-- ============================================================
-- 16. TRYOUT QUESTIONS
-- ============================================================
CREATE TABLE public.tryout_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id      UUID NOT NULL REFERENCES public.tryouts(id) ON DELETE CASCADE,
  question_id    UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  question_order INT NOT NULL,
  UNIQUE (tryout_id, question_id)
);

-- ============================================================
-- 17. GOOGLE FORMS (Koneksi Sinkronisasi Google Form)
-- ============================================================
CREATE TABLE public.google_forms (
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
-- 18. RESPONSES (Hasil Pengumpulan Jawaban Siswa)
-- ============================================================
CREATE TABLE public.responses (
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
CREATE INDEX idx_responses_tryout  ON public.responses (tryout_id);
CREATE INDEX idx_responses_student ON public.responses (student_id);

-- ============================================================
-- 19. ANSWERS (Rincian Jawaban Butir Soal Per Siswa)
-- ============================================================
CREATE TABLE public.answers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id      UUID NOT NULL REFERENCES public.responses(id) ON DELETE CASCADE,
  question_id      UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  submitted_answer JSONB,
  is_correct       BOOLEAN,
  score_earned     NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_answers_response ON public.answers (response_id);
CREATE INDEX idx_answers_question ON public.answers (question_id);

-- ============================================================
-- 20. SCORES (Rekap Nilai Siswa)
-- ============================================================
CREATE TABLE public.scores (
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
  calculated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_scores_tryout_student_subject UNIQUE (tryout_id, student_id, subject_id)
);
CREATE INDEX idx_scores_tryout_student ON public.scores (tryout_id, student_id);

-- ============================================================
-- 21. QUESTION ANALYSIS (Analisis Butir Soal)
-- ============================================================
CREATE TABLE public.question_analysis (
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
-- 22. EXPLANATIONS (Pembahasan Soal)
-- ============================================================
CREATE TABLE public.explanations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id      UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  text_explanation TEXT NOT NULL,
  video_url        TEXT,
  ai_generated     BOOLEAN NOT NULL DEFAULT FALSE,
  status           VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEWED', 'PUBLISHED')),
  created_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_explanations_question ON public.explanations (question_id);

-- ============================================================
-- 23. REPORTS (Laporan Eksekutif & Statistik)
-- ============================================================
CREATE TABLE public.reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id    UUID NOT NULL REFERENCES public.tryouts(id) ON DELETE CASCADE,
  report_type  VARCHAR(20) NOT NULL CHECK (report_type IN ('EXECUTIVE', 'SUBJECT', 'CLASS', 'STUDENT')),
  target_id    UUID,
  report_data  JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 24. AUDIT LOGS (Riwayat Aktivitas)
-- ============================================================
CREATE TABLE public.audit_logs (
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
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs (user_id);

-- ============================================================
-- 25. SCHOOL PROFILE (Identitas Lembaga Sekolah)
-- ============================================================
CREATE TABLE public.school_profile (
  id             VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  name           VARCHAR(255) NOT NULL,
  sub_header     TEXT,
  address        TEXT,
  principal_name VARCHAR(255),
  principal_nip  VARCHAR(50),
  academic_year  VARCHAR(100),
  logo_url       TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY "sync_all_access" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', tbl);
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
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);
  END LOOP;
END $$;
