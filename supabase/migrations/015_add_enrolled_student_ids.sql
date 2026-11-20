-- 015_add_enrolled_student_ids.sql
-- Menambahkan kolom enrolled_student_ids ke tabel exam_package_subjects
-- untuk mendukung pemilihan peserta ujian tertentu (Selective Subject Enrollment).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exam_package_subjects' AND column_name = 'enrolled_student_ids'
  ) THEN
    ALTER TABLE exam_package_subjects ADD COLUMN enrolled_student_ids JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;
