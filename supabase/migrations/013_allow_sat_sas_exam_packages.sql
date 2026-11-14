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
