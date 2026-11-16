-- ============================================================
-- SCRIPT EXPORT DATA LENGKAP DARI SUPABASE LAMA (FORMAT JSON)
-- Jalankan skrip ini di SQL Editor Supabase Lama:
-- Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================

SELECT json_build_object(
  'school_profile', COALESCE((SELECT json_agg(t) FROM school_profile t), '[]'::json),
  'academic_years', COALESCE((SELECT json_agg(t) FROM academic_years t), '[]'::json),
  'classes', COALESCE((SELECT json_agg(t) FROM classes t), '[]'::json),
  'subjects', COALESCE((SELECT json_agg(t) FROM subjects t), '[]'::json),
  'teachers', COALESCE((SELECT json_agg(t) FROM teachers t), '[]'::json),
  'users', COALESCE((SELECT json_agg(t) FROM users t), '[]'::json),
  'students', COALESCE((SELECT json_agg(t) FROM students t), '[]'::json),
  'student_classes', COALESCE((SELECT json_agg(t) FROM student_classes t), '[]'::json),
  'teacher_subjects', COALESCE((SELECT json_agg(t) FROM teacher_subjects t), '[]'::json),
  'materials', COALESCE((SELECT json_agg(t) FROM materials t), '[]'::json),
  'competencies', COALESCE((SELECT json_agg(t) FROM competencies t), '[]'::json),
  'tryouts', COALESCE((SELECT json_agg(t) FROM tryouts t), '[]'::json),
  'tryout_subjects', COALESCE((SELECT json_agg(t) FROM tryout_subjects t), '[]'::json),
  'questions', COALESCE((SELECT json_agg(t) FROM questions t), '[]'::json),
  'tryout_questions', COALESCE((SELECT json_agg(t) FROM tryout_questions t), '[]'::json),
  'google_forms', COALESCE((SELECT json_agg(t) FROM google_forms t), '[]'::json),
  'responses', COALESCE((SELECT json_agg(t) FROM responses t), '[]'::json),
  'answers', COALESCE((SELECT json_agg(t) FROM answers t), '[]'::json),
  'scores', COALESCE((SELECT json_agg(t) FROM scores t), '[]'::json),
  'question_analysis', COALESCE((SELECT json_agg(t) FROM question_analysis t), '[]'::json),
  'explanations', COALESCE((SELECT json_agg(t) FROM explanations t), '[]'::json),
  'reports', COALESCE((SELECT json_agg(t) FROM reports t), '[]'::json),
  'exam_packages', COALESCE((SELECT json_agg(t) FROM exam_packages t), '[]'::json),
  'exam_package_subjects', COALESCE((SELECT json_agg(t) FROM exam_package_subjects t), '[]'::json),
  'audit_logs', COALESCE((SELECT json_agg(t) FROM audit_logs t), '[]'::json)
) AS database_backup_json;
