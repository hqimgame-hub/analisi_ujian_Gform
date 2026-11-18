-- ============================================================
-- SUPABASE MIGRATION: 014_add_live_monitoring_config.sql
-- Fitur: Sinkronisasi Status & Target Live Monitoring Antar-Perangkat
-- ============================================================
-- Mengizinkan perubahan konfigurasi live monitoring (aktif/nonaktif,
-- paket ujian target seperti SAT Kelas 7, 8, 9) tersinkron otomatis
-- ke seluruh perangkat pengawas, guru, dan portal login siswa.
--
-- CARA MENJALANKAN DI SUPABASE:
-- 1. Buka dashboard Supabase project Anda
-- 2. Masuk ke menu "SQL Editor" di bilah samping kiri
-- 3. Tempel kode ini, lalu klik "Run".
-- ============================================================

ALTER TABLE public.school_profile 
ADD COLUMN IF NOT EXISTS "live_monitoring_config" JSONB DEFAULT NULL;
