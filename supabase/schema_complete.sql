-- ============================================================
-- SKEMA LENGKAP SUPABASE UNTUK PROYEK BARU (MIGRATIONS 001-013)
-- Dibuat otomatis untuk inisialisasi 1-klik di SQL Editor Supabase
-- ============================================================

-- >>>>> MIGRATION: 001_initial_schema.sql <<<<<
-- ============================================================
-- SUPABASE DATABASE MIGRATION
-- School Try Out & Assessment Analytics System
-- Version: 1.0.0
-- ============================================================
-- Cara menjalankan:
-- 1. Buka https://app.supabase.com -> project Anda -> SQL Editor
-- 2. Copy-paste seluruh file ini lalu klik "Run"
-- ATAU gunakan Supabase CLI:
--   supabase db push (setelah setup supabase init)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        VARCHAR(255) UNIQUE NOT NULL,
  role         VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'GURU', 'WALI_KELAS', 'SISWA')),
  name         VARCHAR(255) NOT NULL,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ============================================================
-- 2. TEACHERS
-- ============================================================
CREATE TABLE IF NOT EXISTS teachers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nip                 VARCHAR(50) UNIQUE NOT NULL,
  name                VARCHAR(255) NOT NULL,
  email               VARCHAR(255) NOT NULL,
  phone               VARCHAR(30),
  subject_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  class_permissions   JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_wali_kelas       BOOLEAN NOT NULL DEFAULT false,
  home_room_class_id  UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers (user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_nip     ON teachers (nip);

-- ============================================================
-- 3. ACADEMIC YEARS
-- ============================================================
CREATE TABLE IF NOT EXISTS academic_years (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_label  VARCHAR(20) NOT NULL,
  semester    VARCHAR(10) NOT NULL CHECK (semester IN ('ODD', 'EVEN')),
  is_active   BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (year_label, semester)
);

-- ============================================================
-- 4. CLASSES
-- ============================================================
CREATE TABLE IF NOT EXISTS classes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 VARCHAR(50) NOT NULL,
  grade_level          VARCHAR(10) NOT NULL CHECK (grade_level IN ('X', 'XI', 'XII')),
  academic_year_id     UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  home_room_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_classes_academic_year ON classes (academic_year_id);

-- ============================================================
-- 5. STUDENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  nisn         VARCHAR(20) UNIQUE NOT NULL,
  nis          VARCHAR(20) UNIQUE NOT NULL,
  name         VARCHAR(255) NOT NULL,
  gender       CHAR(1) NOT NULL CHECK (gender IN ('L', 'P')),
  class_id     UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  birth_date   DATE,
  email        VARCHAR(255),
  phone        VARCHAR(30),
  target_score NUMERIC(5,2) DEFAULT 80.00,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_students_nisn     ON students (nisn);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students (class_id);

-- ============================================================
-- 6. STUDENT CLASSES (Riwayat kelas per tahun ajaran)
-- ============================================================
CREATE TABLE IF NOT EXISTS student_classes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id         UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  UNIQUE (student_id, academic_year_id)
);

-- ============================================================
-- 7. SUBJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(20) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  category      VARCHAR(20) NOT NULL CHECK (category IN ('WAJIB', 'PEMINATAN', 'VOKASI')),
  passing_grade NUMERIC(5,2) DEFAULT 75.00
);

-- ============================================================
-- 8. TEACHER SUBJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS teacher_subjects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id   UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  UNIQUE (teacher_id, subject_id, class_id)
);

-- ============================================================
-- 9. MATERIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS materials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id      UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  code            VARCHAR(30) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  google_form_url TEXT
);

-- ============================================================
-- 10. COMPETENCIES (Kompetensi Dasar / KD)
-- ============================================================
CREATE TABLE IF NOT EXISTS competencies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  code        VARCHAR(30) NOT NULL,
  statement   TEXT NOT NULL,
  grade_level VARCHAR(10) NOT NULL CHECK (grade_level IN ('X', 'XI', 'XII'))
);

-- ============================================================
-- 11. TRYOUTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tryouts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             VARCHAR(50) UNIQUE NOT NULL,
  title            VARCHAR(255) NOT NULL,
  assessment_type  VARCHAR(20) DEFAULT 'TRYOUT' CHECK (assessment_type IN ('TRYOUT', 'UH', 'PTS', 'PAS')),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  start_date       TIMESTAMPTZ NOT NULL,
  end_date         TIMESTAMPTZ NOT NULL,
  scoring_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  status           VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'CLOSED', 'ARCHIVED')),
  description      TEXT,
  google_form_url  TEXT,
  google_sheet_url TEXT
);

-- ============================================================
-- 12. TRYOUT SUBJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tryout_subjects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id        UUID NOT NULL REFERENCES tryouts(id) ON DELETE CASCADE,
  subject_id       UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  total_questions  INT NOT NULL DEFAULT 20,
  duration_minutes INT NOT NULL DEFAULT 60,
  passing_grade    NUMERIC(5,2) NOT NULL DEFAULT 75.00,
  google_form_url  TEXT,
  UNIQUE (tryout_id, subject_id)
);

-- ============================================================
-- 13. QUESTIONS (Bank Soal)
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unique_code     VARCHAR(50) UNIQUE NOT NULL,
  question_number INT,
  subject_id      UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  competency_id   UUID NOT NULL REFERENCES competencies(id) ON DELETE RESTRICT,
  question_text   TEXT NOT NULL,
  options         JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer  CHAR(1) NOT NULL CHECK (correct_answer IN ('A','B','C','D','E')),
  weight          NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  cognitive_level VARCHAR(5) CHECK (cognitive_level IN ('C1','C2','C3','C4','C5','C6')),
  status          VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DRAFT','ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS idx_questions_subject_id ON questions (subject_id);

-- ============================================================
-- 14. TRYOUT QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS tryout_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id      UUID NOT NULL REFERENCES tryouts(id) ON DELETE CASCADE,
  question_id    UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  question_order INT NOT NULL,
  UNIQUE (tryout_id, question_id)
);

-- ============================================================
-- 15. GOOGLE FORMS
-- ============================================================
CREATE TABLE IF NOT EXISTS google_forms (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id      UUID NOT NULL REFERENCES tryouts(id) ON DELETE CASCADE,
  subject_id     UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  form_id        VARCHAR(255),
  form_url       TEXT NOT NULL,
  sheet_url      TEXT NOT NULL,
  sync_status    VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('SYNCED','PENDING','ERROR')),
  last_synced_at TIMESTAMPTZ
);

-- ============================================================
-- 16. RESPONSES (Pengerjaan mentah siswa)
-- ============================================================
CREATE TABLE IF NOT EXISTS responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id       UUID NOT NULL REFERENCES tryouts(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  nisn_input      VARCHAR(20) NOT NULL,
  raw_score_gform NUMERIC(5,2) NOT NULL DEFAULT 0,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sync_batch_id   UUID,
  UNIQUE (tryout_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_responses_tryout_student ON responses (tryout_id, student_id);

-- ============================================================
-- 17. ANSWERS (Jawaban per butir soal)
-- ============================================================
CREATE TABLE IF NOT EXISTS answers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id    UUID NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  tryout_id      UUID NOT NULL REFERENCES tryouts(id) ON DELETE CASCADE,
  question_id    UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  student_answer CHAR(1) CHECK (student_answer IN ('A','B','C','D','E') OR student_answer IS NULL),
  correct_answer CHAR(1) NOT NULL,
  is_correct     BOOLEAN NOT NULL DEFAULT false,
  score          NUMERIC(5,2) NOT NULL DEFAULT 0,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_answers_response_id  ON answers (response_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id  ON answers (question_id);
CREATE INDEX IF NOT EXISTS idx_answers_tryout_id    ON answers (tryout_id);

-- ============================================================
-- 18. SCORES
-- ============================================================
CREATE TABLE IF NOT EXISTS scores (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id        UUID UNIQUE NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  student_id         UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  tryout_id          UUID NOT NULL REFERENCES tryouts(id) ON DELETE CASCADE,
  subject_scores     JSONB NOT NULL DEFAULT '{}'::jsonb,
  google_form_score  NUMERIC(5,2) NOT NULL DEFAULT 0,
  calculated_score   NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_difference   NUMERIC(5,2) NOT NULL DEFAULT 0,
  scoring_status     VARCHAR(20) NOT NULL DEFAULT 'MATCH'
                       CHECK (scoring_status IN ('MATCH','SCORING_MISMATCH')),
  total_correct      INT NOT NULL DEFAULT 0,
  total_incorrect    INT NOT NULL DEFAULT 0,
  total_unanswered   INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_scores_student_tryout ON scores (student_id, tryout_id);

-- ============================================================
-- 19. QUESTION ANALYSIS (Psikometri butir soal)
-- ============================================================
CREATE TABLE IF NOT EXISTS question_analysis (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id               UUID NOT NULL REFERENCES tryouts(id) ON DELETE CASCADE,
  question_id             UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  total_respondents       INT NOT NULL DEFAULT 0,
  correct_count           INT NOT NULL DEFAULT 0,
  incorrect_count         INT NOT NULL DEFAULT 0,
  unanswered_count        INT NOT NULL DEFAULT 0,
  correct_percentage      NUMERIC(5,2) NOT NULL DEFAULT 0,
  incorrect_percentage    NUMERIC(5,2) NOT NULL DEFAULT 0,
  unanswered_percentage   NUMERIC(5,2) NOT NULL DEFAULT 0,
  difficulty_index        NUMERIC(4,3) NOT NULL DEFAULT 0,  -- p-value
  difficulty_category     VARCHAR(30) NOT NULL DEFAULT 'SEDANG',
  discrimination_index    NUMERIC(4,3) NOT NULL DEFAULT 0,  -- D-value
  discrimination_category VARCHAR(30) NOT NULL DEFAULT 'CUKUP',
  distractor_counts       JSONB NOT NULL DEFAULT '{}'::jsonb,
  distractor_percentages  JSONB,
  review_recommendation   VARCHAR(50) DEFAULT 'Valid / Layak Digunakan',
  review_reasons          JSONB DEFAULT '[]'::jsonb,
  UNIQUE (tryout_id, question_id)
);

-- ============================================================
-- 20. EXPLANATIONS (Pembahasan soal)
-- ============================================================
CREATE TABLE IF NOT EXISTS explanations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id        UUID NOT NULL REFERENCES tryouts(id) ON DELETE CASCADE,
  subject_id       UUID REFERENCES subjects(id) ON DELETE SET NULL,
  question_id      UUID REFERENCES questions(id) ON DELETE SET NULL,
  title            VARCHAR(255) NOT NULL,
  content_text     TEXT NOT NULL DEFAULT '',
  pdf_url          TEXT,
  pdf_storage_path TEXT,
  pdf_file_name    VARCHAR(255),
  pdf_file_size    BIGINT,
  youtube_url      TEXT,
  external_url     TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name      VARCHAR(255),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_explanations_tryout_status ON explanations (tryout_id, status);

-- ============================================================
-- 21. REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        VARCHAR(255) NOT NULL,
  report_type  VARCHAR(30) NOT NULL CHECK (report_type IN ('STUDENT_PDF','TEACHER_PDF','EXCEL_SUMMARY')),
  tryout_id    UUID NOT NULL REFERENCES tryouts(id) ON DELETE CASCADE,
  generated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_path    TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 22. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name     VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL,
  action        VARCHAR(100) NOT NULL,
  target_entity VARCHAR(100) NOT NULL,
  details       TEXT NOT NULL DEFAULT '',
  ip_address    VARCHAR(45) NOT NULL DEFAULT '127.0.0.1',
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id   ON audit_logs (user_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS pada semua tabel
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_classes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_subjects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials         ENABLE ROW LEVEL SECURITY;
ALTER TABLE competencies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tryouts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tryout_subjects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tryout_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_forms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE explanations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- ADMIN: Full access semua tabel
CREATE POLICY "admin_all_access" ON users
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN'
  );

CREATE POLICY "admin_all_access" ON teachers
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN'
  );

CREATE POLICY "admin_all_access" ON students
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN'
  );

-- PUBLIC READ: Tabel referensi yang boleh dibaca semua authenticated user
CREATE POLICY "authenticated_read" ON academic_years
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read" ON classes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read" ON subjects
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read" ON materials
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read" ON competencies
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read" ON tryouts
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- STUDENT ISOLATION: Siswa hanya bisa lihat data dirinya sendiri
CREATE POLICY "student_own_scores" ON scores
  FOR SELECT USING (
    student_id = (SELECT id FROM students WHERE user_id = auth.uid())
    OR (SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'GURU', 'WALI_KELAS')
  );

CREATE POLICY "student_own_answers" ON answers
  FOR SELECT USING (
    student_id = (SELECT id FROM students WHERE user_id = auth.uid())
    OR (SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'GURU', 'WALI_KELAS')
  );

CREATE POLICY "student_own_responses" ON responses
  FOR SELECT USING (
    student_id = (SELECT id FROM students WHERE user_id = auth.uid())
    OR (SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'GURU', 'WALI_KELAS')
  );

-- ANON: Portal siswa (verifikasi NISN tanpa login)
-- Siswa bisa lookup berdasarkan NISN (read-only, no bulk listing)
CREATE POLICY "anon_student_lookup_by_nisn" ON students
  FOR SELECT USING (
    auth.role() = 'anon' -- Dibatasi di query dengan WHERE nisn = $1
    OR auth.role() = 'authenticated'
  );

-- EXPLANATIONS: Anon hanya bisa baca yang PUBLISHED
CREATE POLICY "public_published_explanations" ON explanations
  FOR SELECT USING (
    status = 'PUBLISHED'
    OR (SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'GURU', 'WALI_KELAS')
  );

-- GURU: Write access untuk question bank dan analisis pada subject yang ditugaskan
CREATE POLICY "guru_write_questions" ON questions
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'GURU', 'WALI_KELAS')
  );

CREATE POLICY "guru_write_explanations" ON explanations
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'GURU', 'WALI_KELAS')
  );

-- AUDIT LOGS: Hanya admin bisa baca
CREATE POLICY "admin_read_audit_logs" ON audit_logs
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN'
  );

-- Service role bisa write ke audit_logs
CREATE POLICY "service_write_audit_logs" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at pada explanations
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_explanations_updated_at
  BEFORE UPDATE ON explanations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STORAGE BUCKETS (Jalankan via Supabase Dashboard atau CLI)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('explanations-pdf', 'explanations-pdf', false)
--   ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SELESAI
-- Selanjutnya jalankan seed.sql untuk data awal
-- ============================================================


-- >>>>> MIGRATION: 002_exam_packages.sql <<<<<
-- ============================================================
-- SUPABASE MIGRATION: 002_exam_packages.sql
-- Fitur: Wadah / Paket Ujian (Exam Events & Multi-Subject Management)
-- ============================================================
-- Cara Eksekusi di Supabase:
-- 1. Buka dashboard https://app.supabase.com -> Pilih Project Anda
-- 2. Masuk ke menu "SQL Editor" di bilah kiri
-- 3. Klik "New Query", paste seluruh kode di bawah ini, lalu klik "Run"
-- ============================================================

-- 1. EXTENSION UUID (JIKA BELUM ADA)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABEL WADAH / PAKET UJIAN UTAMA
CREATE TABLE IF NOT EXISTS exam_packages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             VARCHAR(50) UNIQUE NOT NULL,
  title            VARCHAR(255) NOT NULL,
  assessment_type  VARCHAR(20) NOT NULL DEFAULT 'TRYOUT' CHECK (assessment_type IN ('TRYOUT', 'UH', 'PTS', 'PAS')),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  target_grades    JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_class_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_date       TIMESTAMPTZ NOT NULL,
  end_date         TIMESTAMPTZ NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'CLOSED', 'ARCHIVED')),
  description      TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exam_packages_code ON exam_packages (code);
CREATE INDEX IF NOT EXISTS idx_exam_packages_status ON exam_packages (status);
CREATE INDEX IF NOT EXISTS idx_exam_packages_ay ON exam_packages (academic_year_id);

-- 3. TABEL SLOT MAPEL DI DALAM WADAH / PAKET
CREATE TABLE IF NOT EXISTS exam_package_subjects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id       UUID NOT NULL REFERENCES exam_packages(id) ON DELETE CASCADE,
  subject_id       UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id       UUID REFERENCES teachers(id) ON DELETE SET NULL,
  google_form_url  TEXT,
  google_sheet_url TEXT,
  answer_key       JSONB DEFAULT '[]'::jsonb,
  total_questions  INT NOT NULL DEFAULT 40,
  duration_minutes INT NOT NULL DEFAULT 60,
  passing_grade    NUMERIC(5,2) NOT NULL DEFAULT 75.00,
  sync_status      VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('SYNCED', 'PENDING', 'ERROR')),
  last_updated_by  VARCHAR(255),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (package_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_package_subjects_pkg ON exam_package_subjects (package_id);
CREATE INDEX IF NOT EXISTS idx_exam_package_subjects_sub ON exam_package_subjects (subject_id);

-- 4. MIGRASI KOLOM TAMBAHAN PADA TABEL TRYOUTS EKSISTING
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tryouts' AND column_name = 'package_id'
  ) THEN
    ALTER TABLE tryouts ADD COLUMN package_id UUID REFERENCES exam_packages(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tryouts' AND column_name = 'target_class_ids'
  ) THEN
    ALTER TABLE tryouts ADD COLUMN target_class_ids JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- 5. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE exam_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_package_subjects ENABLE ROW LEVEL SECURITY;

-- 6. RLS POLICIES (KEBIJAKAN HAK AKSES)
DROP POLICY IF EXISTS "public_read_exam_packages" ON exam_packages;
CREATE POLICY "public_read_exam_packages" ON exam_packages
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_read_exam_package_subjects" ON exam_package_subjects;
CREATE POLICY "public_read_exam_package_subjects" ON exam_package_subjects
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_manage_exam_packages" ON exam_packages;
CREATE POLICY "admin_manage_exam_packages" ON exam_packages
  FOR ALL USING (
    auth.role() = 'service_role' OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN'
  );

DROP POLICY IF EXISTS "admin_guru_manage_package_subjects" ON exam_package_subjects;
CREATE POLICY "admin_guru_manage_package_subjects" ON exam_package_subjects
  FOR ALL USING (
    auth.role() = 'service_role' OR
    (SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'GURU')
  );


-- >>>>> MIGRATION: 003_flexible_grade_level.sql <<<<<
-- ============================================================
-- Migration 003: Flexible Grade Level (SD–SMA Support)
-- ============================================================
-- Tujuan: Melepas batasan grade_level agar sistem mendukung semua
-- jenjang pendidikan: SD (1–6), SMP (7–9), SMA/SMK (10/X – 12/XII).
--
-- Sebelumnya grade_level dibatasi CHECK hanya untuk ('X', 'XI', 'XII').
-- Perubahan ini menghapus constraint tersebut dan menggantinya dengan
-- validasi yang lebih fleksibel.
-- ============================================================

-- 1. Hapus constraint CHECK lama di tabel classes
ALTER TABLE classes
  DROP CONSTRAINT IF EXISTS classes_grade_level_check;

-- 2. Tambah constraint baru yang mendukung SD–SMA/SMK
--    Format yang diterima: angka 1–12 atau romawi X/XI/XII (legacy)
ALTER TABLE classes
  ADD CONSTRAINT classes_grade_level_check
  CHECK (
    grade_level IN (
      -- SD
      '1', '2', '3', '4', '5', '6',
      -- SMP
      '7', '8', '9',
      -- SMA/SMK (format angka modern)
      '10', '11', '12',
      -- SMA/SMK (format romawi legacy — backward compatible)
      'X', 'XI', 'XII'
    )
  );

-- 3. Hapus constraint CHECK lama di tabel competencies (jika ada)
ALTER TABLE competencies
  DROP CONSTRAINT IF EXISTS competencies_grade_level_check;

-- 4. Tambah constraint baru yang sama untuk competencies
ALTER TABLE competencies
  ADD CONSTRAINT competencies_grade_level_check
  CHECK (
    grade_level IN (
      '1', '2', '3', '4', '5', '6',
      '7', '8', '9',
      '10', '11', '12',
      'X', 'XI', 'XII'
    )
  );

-- Catatan: Data lama yang menggunakan 'X', 'XI', 'XII' tetap valid
-- karena format tersebut masih diizinkan oleh constraint baru.


-- >>>>> MIGRATION: 004_fix_rls_policies.sql <<<<<
-- ============================================================
-- MIGRATION 004: Fix RLS Infinite Recursion
-- ============================================================
-- Masalah: Policy pada tabel `users` mengquery tabel `users`
-- itu sendiri → infinite recursion (error code 42P17).
--
-- Solusi: Buat fungsi SECURITY DEFINER yang bypass RLS,
-- lalu gunakan fungsi tersebut di semua policy.
--
-- Cara menjalankan:
-- 1. Buka https://app.supabase.com → Project → SQL Editor
-- 2. Paste seluruh isi file ini lalu klik Run
-- ============================================================

-- ============================================================
-- LANGKAH 1: Buat Security Definer Function
-- Fungsi ini membaca role user dari tabel users TANPA kena RLS
-- karena SECURITY DEFINER = berjalan dengan hak pemilik fungsi
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

-- ============================================================
-- LANGKAH 2: Hapus semua policy lama yang rekursif
-- ============================================================

-- Tabel: users
DROP POLICY IF EXISTS "admin_all_access" ON public.users;
DROP POLICY IF EXISTS "users_read_own" ON public.users;

-- Tabel: teachers
DROP POLICY IF EXISTS "admin_all_access" ON public.teachers;
DROP POLICY IF EXISTS "teacher_read_own" ON public.teachers;

-- Tabel: students
DROP POLICY IF EXISTS "admin_all_access" ON public.students;
DROP POLICY IF EXISTS "anon_student_lookup_by_nisn" ON public.students;

-- Tabel: scores
DROP POLICY IF EXISTS "student_own_scores" ON public.scores;

-- Tabel: answers
DROP POLICY IF EXISTS "student_own_answers" ON public.answers;

-- Tabel: responses
DROP POLICY IF EXISTS "student_own_responses" ON public.responses;

-- Tabel: explanations
DROP POLICY IF EXISTS "public_published_explanations" ON public.explanations;
DROP POLICY IF EXISTS "guru_write_explanations" ON public.explanations;

-- Tabel: questions
DROP POLICY IF EXISTS "guru_write_questions" ON public.questions;

-- Tabel: audit_logs
DROP POLICY IF EXISTS "admin_read_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "service_write_audit_logs" ON public.audit_logs;

-- Tabel: exam_packages (dari migration 002)
DROP POLICY IF EXISTS "admin_manage_exam_packages" ON public.exam_packages;
DROP POLICY IF EXISTS "admin_guru_manage_package_subjects" ON public.exam_package_subjects;

-- ============================================================
-- LANGKAH 3: Recreate policies dengan fungsi non-rekursif
-- ============================================================

-- === TABEL: users ===
-- Admin punya akses penuh
CREATE POLICY "admin_full_access" ON public.users
  FOR ALL
  USING (public.get_auth_role() = 'ADMIN')
  WITH CHECK (public.get_auth_role() = 'ADMIN');

-- User bisa baca data dirinya sendiri
CREATE POLICY "users_read_own" ON public.users
  FOR SELECT
  USING (id = auth.uid());

-- Anon bisa insert saat registrasi (dibutuhkan Supabase Auth)
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- === TABEL: teachers ===
-- Admin punya akses penuh
CREATE POLICY "admin_full_access" ON public.teachers
  FOR ALL
  USING (public.get_auth_role() = 'ADMIN')
  WITH CHECK (public.get_auth_role() = 'ADMIN');

-- Guru bisa baca semua profil teacher (untuk keperluan kolaborasi)
CREATE POLICY "authenticated_read_teachers" ON public.teachers
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Guru bisa baca & update profil dirinya sendiri
CREATE POLICY "teacher_manage_own" ON public.teachers
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- === TABEL: students ===
-- Admin punya akses penuh
CREATE POLICY "admin_full_access" ON public.students
  FOR ALL
  USING (public.get_auth_role() = 'ADMIN')
  WITH CHECK (public.get_auth_role() = 'ADMIN');

-- Guru & Wali Kelas bisa baca semua siswa
CREATE POLICY "staff_read_students" ON public.students
  FOR SELECT
  USING (
    public.get_auth_role() IN ('GURU', 'WALI_KELAS', 'ADMIN')
  );

-- Anon bisa lookup siswa berdasarkan NISN (portal hasil siswa)
CREATE POLICY "anon_student_lookup" ON public.students
  FOR SELECT
  USING (auth.role() = 'anon' OR auth.role() = 'authenticated');

-- === TABEL: scores ===
CREATE POLICY "scores_access" ON public.scores
  FOR SELECT
  USING (
    student_id = (SELECT id FROM public.students WHERE user_id = auth.uid())
    OR public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS')
    OR auth.role() = 'anon'
  );

CREATE POLICY "staff_write_scores" ON public.scores
  FOR ALL
  USING (public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS'))
  WITH CHECK (public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS'));

-- === TABEL: answers ===
CREATE POLICY "answers_access" ON public.answers
  FOR SELECT
  USING (
    student_id = (SELECT id FROM public.students WHERE user_id = auth.uid())
    OR public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS')
    OR auth.role() = 'anon'
  );

CREATE POLICY "staff_write_answers" ON public.answers
  FOR ALL
  USING (public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS'))
  WITH CHECK (public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS'));

-- === TABEL: responses ===
CREATE POLICY "responses_access" ON public.responses
  FOR SELECT
  USING (
    student_id = (SELECT id FROM public.students WHERE user_id = auth.uid())
    OR public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS')
    OR auth.role() = 'anon'
  );

CREATE POLICY "staff_write_responses" ON public.responses
  FOR ALL
  USING (public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS'))
  WITH CHECK (public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS'));

-- === TABEL: questions ===
CREATE POLICY "staff_manage_questions" ON public.questions
  FOR ALL
  USING (public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS'))
  WITH CHECK (public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS'));

-- === TABEL: explanations ===
-- Anon hanya baca yang PUBLISHED
CREATE POLICY "public_published_explanations" ON public.explanations
  FOR SELECT
  USING (
    status = 'PUBLISHED'
    OR public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS')
  );

CREATE POLICY "staff_manage_explanations" ON public.explanations
  FOR ALL
  USING (public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS'))
  WITH CHECK (public.get_auth_role() IN ('ADMIN', 'GURU', 'WALI_KELAS'));

-- === TABEL: audit_logs ===
CREATE POLICY "admin_read_audit_logs" ON public.audit_logs
  FOR SELECT
  USING (public.get_auth_role() = 'ADMIN');

CREATE POLICY "service_write_audit_logs" ON public.audit_logs
  FOR INSERT
  WITH CHECK (true);

-- === TABEL: exam_packages (dari migration 002) ===
CREATE POLICY "admin_manage_exam_packages" ON public.exam_packages
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR public.get_auth_role() = 'ADMIN'
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.get_auth_role() = 'ADMIN'
  );

CREATE POLICY "admin_guru_manage_package_subjects" ON public.exam_package_subjects
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR public.get_auth_role() IN ('ADMIN', 'GURU')
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.get_auth_role() IN ('ADMIN', 'GURU')
  );

-- ============================================================
-- LANGKAH 4: Tambah kolom `password_hint` di teachers
-- Untuk menyimpan password yang diset admin (opsional, tidak aman untuk produksi penuh)
-- Ini hanya untuk keperluan demo/sekolah kecil
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teachers' AND column_name = 'password_hint'
  ) THEN
    ALTER TABLE public.teachers ADD COLUMN password_hint TEXT;
  END IF;
END $$;

-- ============================================================
-- SELESAI
-- Verifikasi: coba query SELECT * FROM teachers LIMIT 1;
-- Jika tidak ada error infinite recursion, migration berhasil.
-- ============================================================


-- >>>>> MIGRATION: 005_enable_realtime_and_sync_rls.sql <<<<<
-- ============================================================
-- SUPABASE MIGRATION: 005_enable_realtime_and_sync_rls.sql
-- Fitur: Membuka Akses Sinkronisasi Cloud Multi-Device & Mengaktifkan Supabase Realtime
-- ============================================================
-- Masalah yang Diselesaikan:
-- 1. Error RLS (42501): "new row violates row-level security policy"
--    karena aplikasi menggunakan autentikasi aplikasi internal (bukan auth.users).
-- 2. Realtime WebSocket tidak aktif karena tabel belum dimasukkan
--    ke dalam publikasi `supabase_realtime`.
-- 3. Menambahkan UNIQUE constraint pada classes(name, academic_year_id)
--    agar upsert data kelas berjalan mulus.
--
-- CARA MENJALANKAN DI SUPABASE:
-- 1. Buka dashboard https://supabase.com/dashboard/project/tgnbbdixdxpuhqskdedd
-- 2. Masuk ke menu "SQL Editor" di bilah samping kiri
-- 3. Klik "New Query", tempel (paste) seluruh isi skrip ini, lalu klik "Run".
-- ============================================================

-- ============================================================
-- LANGKAH 1: Constraint Helpers
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_classes_name_ay'
  ) THEN
    ALTER TABLE public.classes ADD CONSTRAINT uq_classes_name_ay UNIQUE (name, academic_year_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Lanjutkan jika constraint sudah ada atau struktur berbeda
END $$;

-- ============================================================
-- LANGKAH 2: Set Permissive RLS Policies untuk Sinkronisasi Multi-Device
-- ============================================================
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'users', 'teachers', 'students', 'classes', 'subjects', 'academic_years',
    'exam_packages', 'exam_package_subjects', 'tryouts', 'tryout_subjects',
    'questions', 'tryout_questions', 'responses', 'answers', 'scores', 'audit_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      -- Hapus policy lama yang membatasi akses sync
      EXECUTE format('DROP POLICY IF EXISTS "sync_all_access" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "admin_full_access" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "admin_all_access" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "anon_read_all" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "users_read_own" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "users_insert_own" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "authenticated_read_teachers" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "public_read_exam_packages" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "public_read_exam_package_subjects" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "admin_manage_exam_packages" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "admin_guru_manage_package_subjects" ON public.%I', tbl);

      -- Aktifkan RLS dan pasang policy permissive untuk client sync (anon & authenticated)
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('CREATE POLICY "sync_all_access" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- LANGKAH 3: Daftarkan Tabel ke Supabase Realtime Publication
-- ============================================================
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'users', 'teachers', 'students', 'classes', 'subjects', 'academic_years',
    'exam_packages', 'exam_package_subjects', 'tryouts', 'tryout_subjects',
    'scores'
  ];
BEGIN
  -- Pastikan publication supabase_realtime ada
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      -- Cek apakah tabel sudah terdaftar di publication
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      END IF;

      -- Set REPLICA IDENTITY FULL agar payload realtime mengirim old and new record lengkap
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);
    END IF;
  END LOOP;
END $$;


-- >>>>> MIGRATION: 006_create_school_profile_table.sql <<<<<
-- ============================================================
-- SUPABASE MIGRATION: 006_create_school_profile_table.sql
-- Fitur: Sinkronisasi Informasi Profil Sekolah Antar-Perangkat
-- ============================================================
-- Mengatasi:
-- Perubahan "Informasi Sekolah" tidak terupdate di perangkat lain
-- karena belum ada tabel penampung school_profile di database Supabase.
--
-- CARA MENJALANKAN DI SUPABASE:
-- 1. Buka dashboard https://supabase.com/dashboard/project/tgnbbdixdxpuhqskdedd
-- 2. Masuk ke menu "SQL Editor" di bilah samping kiri
-- 3. Klik "New Query", tempel kode ini, lalu klik "Run".
-- ============================================================

-- 1. Buat Tabel school_profile
CREATE TABLE IF NOT EXISTS public.school_profile (
  id             VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  name           VARCHAR(255) NOT NULL,
  sub_header     TEXT,
  address        TEXT,
  principal_name VARCHAR(255),
  principal_nip  VARCHAR(50),
  academic_year  VARCHAR(100),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Aktifkan RLS & Kebijakan Permissive untuk Sinkronisasi Multi-Device
ALTER TABLE public.school_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_all_access" ON public.school_profile;
CREATE POLICY "sync_all_access" ON public.school_profile
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Daftarkan ke Supabase Realtime Engine
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'school_profile'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.school_profile;
  END IF;

  ALTER TABLE public.school_profile REPLICA IDENTITY FULL;
END $$;


-- >>>>> MIGRATION: 007_add_is_answer_key_account.sql <<<<<
-- ============================================================
-- 007: Tambah kolom is_answer_key_account pada tabel students
-- Untuk menandai akun siswa khusus yang difungsikan sebagai Kunci Jawaban
-- ============================================================
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS is_answer_key_account BOOLEAN DEFAULT false;

COMMENT ON COLUMN students.is_answer_key_account IS 'Menandakan akun ini khusus sebagai respon kunci jawaban tryout (dikecualikan dari statistik & rapor siswa nyata)';


-- >>>>> MIGRATION: 008_tryout_sync_metadata.sql <<<<<
-- ============================================================
-- 008: Tryout Sync Metadata & Column Mapping Persistence
-- ============================================================

-- Tambahkan kolom untuk menyimpan konfigurasi kolom Google Sheet yang dipilih guru
ALTER TABLE tryouts 
ADD COLUMN IF NOT EXISTS selected_question_columns JSONB DEFAULT '[]'::jsonb;

-- Tambahkan kolom untuk kunci jawaban resmi yang otomatis diekstrak
ALTER TABLE tryouts 
ADD COLUMN IF NOT EXISTS answer_key JSONB DEFAULT '[]'::jsonb;

-- Tambahkan kolom mata pelajaran acuan untuk Try Out internal
ALTER TABLE tryouts 
ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;

-- Tambahkan metadata pendukung Try Out Eksternal
ALTER TABLE tryouts 
ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'INTERNAL',
ADD COLUMN IF NOT EXISTS external_subjects JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS external_subject_ids JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS external_score_scale VARCHAR(50) DEFAULT 'SCALE_100';

-- Komentar dokumentasi
COMMENT ON COLUMN tryouts.selected_question_columns IS 'Daftar nama kolom butir soal Google Sheet yang dipilih guru untuk dianalisis';
COMMENT ON COLUMN tryouts.answer_key IS 'Array kunci jawaban per nomor soal (Index 0 = Soal 1)';
COMMENT ON COLUMN tryouts.subject_id IS 'ID mata pelajaran acuan untuk Try Out internal';


-- >>>>> MIGRATION: 009_allow_external_scores_and_realtime.sql <<<<<
-- ============================================================
-- 009: Allow External Scores, Complete Realtime Publication & Full Sync RLS
-- ============================================================

-- 1. Buat response_id di scores nullable agar Try Out Eksternal dapat disimpan langsung
DO $$
BEGIN
  ALTER TABLE public.scores ALTER COLUMN response_id DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Buat material_id dan competency_id di questions nullable
-- agar butir soal dari Google Form dapat langsung diimpor tanpa dependensi paksa
DO $$
BEGIN
  ALTER TABLE public.questions ALTER COLUMN material_id DROP NOT NULL;
  ALTER TABLE public.questions ALTER COLUMN competency_id DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 3. Pastikan kolom metadata di tryouts tersedia
ALTER TABLE public.tryouts 
ADD COLUMN IF NOT EXISTS selected_question_columns JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS answer_key JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'INTERNAL',
ADD COLUMN IF NOT EXISTS external_subjects JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS external_subject_ids JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS external_score_scale VARCHAR(50) DEFAULT 'SCALE_100';

-- 4. RLS Permissive untuk seluruh tabel sinkronisasi cloud
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'users', 'teachers', 'students', 'classes', 'subjects', 'academic_years',
    'exam_packages', 'exam_package_subjects', 'tryouts', 'tryout_subjects',
    'questions', 'answers', 'materials', 'competencies', 'responses', 'scores', 'school_profile', 'audit_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS "sync_all_access" ON public.%I', tbl);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('CREATE POLICY "sync_all_access" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', tbl);
    END IF;
  END LOOP;
END $$;

-- 5. Daftarkan seluruh tabel ke publikasi supabase_realtime
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'users', 'teachers', 'students', 'classes', 'subjects', 'academic_years',
    'exam_packages', 'exam_package_subjects', 'tryouts', 'tryout_subjects',
    'responses', 'scores', 'questions', 'answers', 'materials', 'competencies', 'school_profile'
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


-- >>>>> MIGRATION: 010_scores_unique_and_external_sync.sql <<<<<
-- ============================================================
-- 010: Ensure clean constraint on scores for multi-device sync
-- ============================================================

-- 1. Buat response_id di scores nullable jika belum
DO $$
BEGIN
  ALTER TABLE public.scores ALTER COLUMN response_id DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Pastikan unique constraint pada (tryout_id, student_id) jika ada duplikat dibersihkan
DO $$
BEGIN
  -- Hapus duplikat lama jika pernah ada sebelum memasang unique constraint
  DELETE FROM public.scores a
  USING public.scores b
  WHERE a.ctid < b.ctid
    AND a.tryout_id = b.tryout_id
    AND a.student_id = b.student_id;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scores_tryout_student_unique'
  ) THEN
    ALTER TABLE public.scores ADD CONSTRAINT scores_tryout_student_unique UNIQUE (tryout_id, student_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;


-- >>>>> MIGRATION: 011_add_logo_url_to_school_profile.sql <<<<<
-- ============================================================
-- SUPABASE MIGRATION: 011_add_logo_url_to_school_profile.sql
-- Fitur: Sinkronisasi Logo Sekolah Antar-Perangkat (Multi-Device)
-- ============================================================
-- Mengatasi:
-- Logo sekolah yang diunggah Admin di laptop dapat otomatis muncul
-- di HP siswa, HP guru, dan laptop wali kelas via Supabase Realtime Sync.
--
-- CARA MENJALANKAN DI SUPABASE:
-- 1. Buka dashboard https://supabase.com/dashboard/project/tgnbbdixdxpuhqskdedd
-- 2. Masuk ke menu "SQL Editor" di bilah samping kiri
-- 3. Klik "New Query", tempel kode di bawah ini, lalu klik "Run".
-- ============================================================

-- 1. Tambahkan kolom logo_url bertipe TEXT ke tabel school_profile
ALTER TABLE public.school_profile 
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. Beri komentar dokumentasi kolom
COMMENT ON COLUMN public.school_profile.logo_url IS 'Data URL Base64 atau URL gambar logo resmi sekolah untuk branding di seluruh perangkat';


-- >>>>> MIGRATION: 012_enable_explanations_sync_and_multi_questions.sql <<<<<
-- ============================================================
-- SUPABASE MIGRATION: 012_enable_explanations_sync_and_multi_questions.sql
-- Fitur: Sinkronisasi Cloud Multi-Device untuk Pembahasan & Dukungan Multi-Nomor Soal
-- ============================================================
-- Masalah yang Diselesaikan:
-- 1. Pembahasan soal tidak tersimpan di Supabase karena RLS policy memblokir akses (error 42501).
-- 2. Pembahasan soal tidak sinkron realtime ke perangkat lain karena tabel explanations
--    belum didaftarkan ke publikasi `supabase_realtime`.
-- 3. Menambahkan kolom `question_numbers` (INTEGER[]) dan `question_ids` (TEXT[])
--    untuk mendukung fitur pembahasan multi-nomor butir soal.
--
-- CARA MENJALANKAN DI SUPABASE:
-- 1. Buka dashboard https://supabase.com/dashboard/project/tgnbbdixdxpuhqskdedd
-- 2. Masuk ke menu "SQL Editor" di bilah samping kiri
-- 3. Klik "New Query", tempel (paste) seluruh isi skrip ini, lalu klik "Run".
-- ============================================================

-- 1. Tambahkan kolom question_numbers dan question_ids jika belum ada
ALTER TABLE public.explanations 
ADD COLUMN IF NOT EXISTS question_numbers INTEGER[] DEFAULT '{}'::integer[],
ADD COLUMN IF NOT EXISTS question_ids TEXT[] DEFAULT '{}'::text[];

-- 2. Longgarkan constraint foreign key jika ada dependensi yang menghalangi sync
DO $$
BEGIN
  ALTER TABLE public.explanations ALTER COLUMN created_by DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.explanations ALTER COLUMN subject_id DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.explanations ALTER COLUMN question_id DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. Set Permissive RLS Policy agar client (anon & authenticated) dapat membaca dan menyimpan pembahasan
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'explanations'
  ) THEN
    DROP POLICY IF EXISTS "sync_all_access" ON public.explanations;
    DROP POLICY IF EXISTS "public_published_explanations" ON public.explanations;
    DROP POLICY IF EXISTS "staff_manage_explanations" ON public.explanations;
    DROP POLICY IF EXISTS "guru_write_explanations" ON public.explanations;

    ALTER TABLE public.explanations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "sync_all_access" ON public.explanations 
      FOR ALL TO anon, authenticated 
      USING (true) 
      WITH CHECK (true);
  END IF;
END $$;

-- 4. Daftarkan tabel explanations ke publikasi supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'explanations'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'explanations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.explanations;
    END IF;
  END IF;
END $$;


-- >>>>> MIGRATION: 013_allow_sat_sas_exam_packages.sql <<<<<
-- ============================================================
-- SUPABASE MIGRATION: 013_allow_sat_sas_exam_packages.sql
-- Fitur: Menambahkan Dukungan Asesmen Sumatif (SAS & SAT) pada Tabel exam_packages
-- ============================================================
-- Cara Eksekusi di Supabase:
-- 1. Buka dashboard https://app.supabase.com -> Pilih Project Anda
-- 2. Masuk ke menu "SQL Editor" di bilah kiri
-- 3. Klik "New Query", paste seluruh kode di bawah ini, lalu klik "Run"
-- ============================================================

DO $$
BEGIN
  -- 1. Lepas constraint lama yang hanya mengizinkan ('TRYOUT', 'UH', 'PTS', 'PAS')
  ALTER TABLE public.exam_packages DROP CONSTRAINT IF EXISTS exam_packages_assessment_type_check;

  -- 2. Pasang constraint baru yang mendukung asesmen Kurikulum Merdeka ('SAS', 'SAT')
  ALTER TABLE public.exam_packages ADD CONSTRAINT exam_packages_assessment_type_check
    CHECK (assessment_type IN ('TRYOUT', 'UH', 'PTS', 'PAS', 'SAS', 'SAT'));

  -- 3. Pastikan kolom default tetap 'TRYOUT'
  ALTER TABLE public.exam_packages ALTER COLUMN assessment_type SET DEFAULT 'TRYOUT';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Constraint update warning: %', SQLERRM;
END $$;


