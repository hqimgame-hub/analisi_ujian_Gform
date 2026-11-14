/**
 * supabaseDb.ts — Supabase Cloud Sync Service
 *
 * Layer sinkronisasi data antara localStorage (state lokal) dan Supabase PostgreSQL.
 * Berjalan secara asinkron di background — tidak memblokir UI.
 *
 * Strategi:
 * - Write-through: setiap mutasi lokal juga dikirim ke Supabase
 * - Read-on-empty: jika localStorage kosong, load dari Supabase (fresh device)
 * - Natural key upsert: gunakan email/nip/nisn untuk menghindari duplikat
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isValidUuid, generateUuid } from '../utils/idUtils';
import {
  User, Teacher, Student, ClassRoom, AcademicYear, Subject, ExamPackage, ExamPackageSubject, Tryout, SchoolProfile, Response, Score, Material, Competency, Question, Answer, Explanation
} from '../types/database';

// ============================================================
// TYPE MAPPINGS (Supabase snake_case ↔ TypeScript camelCase)
// ============================================================

function toSupabaseUser(u: User): Record<string, unknown> {
  return {
    email: u.email.toLowerCase(),
    role: u.role,
    name: u.name,
    avatar_url: u.avatarUrl || null,
  };
}

function fromSupabaseUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    role: (row.role as User['role']) || 'GURU',
    name: String(row.name),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function toSupabaseTeacher(
  t: Teacher,
  supabaseUserId: string,
  supabaseClassId?: string | null
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    user_id: supabaseUserId,
    nip: t.nip.trim(),
    name: t.name,
    email: t.email || `${t.nip.trim()}@guru.sekolah.id`,
    phone: t.phone || null,
    subject_permissions: t.subjectPermissions || [],
    class_permissions: t.classPermissions || [],
    is_wali_kelas: t.isWaliKelas || false,
    home_room_class_id: supabaseClassId !== undefined
      ? supabaseClassId
      : (t.homeRoomClassId && isValidUuid(t.homeRoomClassId) ? t.homeRoomClassId : null),
    // password_hint: plain password for demo-mode fallback login (optional)
    password_hint: t.password || null,
  };
  if (isValidUuid(t.id)) {
    payload.id = t.id;
  }
  return payload;
}

function fromSupabaseTeacher(
  row: Record<string, unknown>,
  supabaseUserIdToLocalId: Map<string, string>
): Teacher {
  const supabaseUserId = String(row.user_id);
  const localUserId = supabaseUserIdToLocalId.get(supabaseUserId) || supabaseUserId;
  return {
    id: String(row.id),
    userId: localUserId,
    nip: String(row.nip),
    name: String(row.name),
    email: row.email ? String(row.email) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    password: row.password_hint ? String(row.password_hint) : 'password123',
    subjectPermissions: Array.isArray(row.subject_permissions)
      ? (row.subject_permissions as string[])
      : [],
    classPermissions: Array.isArray(row.class_permissions)
      ? (row.class_permissions as string[])
      : [],
    isWaliKelas: Boolean(row.is_wali_kelas),
    homeRoomClassId: row.home_room_class_id ? String(row.home_room_class_id) : undefined,
  };
}

function toSupabaseStudent(s: Student, supabaseClassId: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    nisn: s.nisn.trim(),
    nis: s.nis ? s.nis.trim() : s.nisn.trim(),
    name: s.name.trim(),
    gender: s.gender || 'L',
    class_id: supabaseClassId,
    email: s.email || null,
    phone: s.phone || null,
    birth_date: s.birthDate || null,
    target_score: s.targetScore || 80,
    is_answer_key_account: Boolean(s.isAnswerKeyAccount),
  };
  if (isValidUuid(s.id)) {
    payload.id = s.id;
  }
  return payload;
}

function fromSupabaseStudent(
  row: Record<string, unknown>,
  supabaseClassIdToLocalId: Map<string, string>
): Student {
  const supabaseClassId = String(row.class_id);
  const localClassId = supabaseClassIdToLocalId.get(supabaseClassId) || supabaseClassId;
  return {
    id: String(row.id),
    nisn: String(row.nisn),
    nis: row.nis ? String(row.nis) : undefined,
    name: String(row.name),
    gender: (row.gender as 'L' | 'P') || 'L',
    classId: localClassId,
    email: row.email ? String(row.email) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    birthDate: row.birth_date ? String(row.birth_date) : undefined,
    targetScore: row.target_score ? Number(row.target_score) : undefined,
    isAnswerKeyAccount: Boolean(row.is_answer_key_account),
  };
}

function toSupabaseClass(
  c: ClassRoom,
  supabaseAcademicYearId: string,
  supabaseTeacherId?: string | null
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: c.name.trim(),
    grade_level: c.gradeLevel || 'X',
    academic_year_id: supabaseAcademicYearId,
    home_room_teacher_id: supabaseTeacherId !== undefined
      ? supabaseTeacherId
      : (c.homeRoomTeacherId && isValidUuid(c.homeRoomTeacherId) ? c.homeRoomTeacherId : null),
  };
  if (isValidUuid(c.id)) {
    payload.id = c.id;
  }
  return payload;
}

function fromSupabaseClass(
  row: Record<string, unknown>,
  supabaseAcademicYearIdToLocalId: Map<string, string>
): ClassRoom {
  const ayId = String(row.academic_year_id);
  const localAyId = supabaseAcademicYearIdToLocalId.get(ayId) || ayId;
  return {
    id: String(row.id),
    name: String(row.name),
    gradeLevel: String(row.grade_level),
    academicYearId: localAyId,
    homeRoomTeacherId: row.home_room_teacher_id ? String(row.home_room_teacher_id) : undefined,
  };
}

function toSupabaseAcademicYear(ay: AcademicYear): Record<string, unknown> {
  return {
    year_label: ay.yearLabel,
    semester: ay.semester,
    is_active: ay.isActive,
  };
}

function fromSupabaseAcademicYear(row: Record<string, unknown>): AcademicYear {
  return {
    id: String(row.id),
    yearLabel: String(row.year_label),
    semester: (row.semester as 'ODD' | 'EVEN') || 'ODD',
    isActive: Boolean(row.is_active),
  };
}

function toSupabaseSubject(s: Subject): Record<string, unknown> {
  return {
    code: s.code,
    name: s.name,
    category: s.category,
    passing_grade: s.passingGrade || 75,
  };
}

function fromSupabaseSubject(row: Record<string, unknown>): Subject {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    category: String(row.category) as Subject['category'],
    passingGrade: row.passing_grade ? Number(row.passing_grade) : 75,
  };
}

function toSupabaseExamPackage(pkg: ExamPackage, supabaseAcademicYearId?: string): Record<string, unknown> {
  const ayId = (supabaseAcademicYearId && isValidUuid(supabaseAcademicYearId))
    ? supabaseAcademicYearId
    : (isValidUuid(pkg.academicYearId) ? pkg.academicYearId : '0ffe2ac4-48bd-400b-ae8c-05ecff36e4a1');

  return {
    ...(isValidUuid(pkg.id) ? { id: pkg.id } : {}),
    code: pkg.code,
    title: pkg.title,
    assessment_type: pkg.assessmentType || 'TRYOUT',
    academic_year_id: ayId,
    target_grades: pkg.targetGrades || [],
    target_class_ids: pkg.targetClassIds || [],
    start_date: pkg.startDate || new Date().toISOString(),
    end_date: pkg.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: pkg.status || 'ACTIVE',
    description: pkg.description || null,
  };
}

function fromSupabaseExamPackage(row: Record<string, unknown>, subjects: ExamPackageSubject[] = []): ExamPackage {
  let assessmentType = (row.assessment_type as ExamPackage['assessmentType']) || 'TRYOUT';
  const desc = row.description ? String(row.description) : '';
  const code = String(row.code || '').toUpperCase();
  if (desc.includes('[TYPE:SAT]') || code.startsWith('SAT-')) {
    assessmentType = 'SAT';
  } else if (desc.includes('[TYPE:SAS]') || code.startsWith('SAS-')) {
    assessmentType = 'SAS';
  }

  const cleanDescription = desc.replace(/\[TYPE:(SAT|SAS)\]\s*/g, '').trim() || undefined;

  return {
    id: String(row.id),
    code: String(row.code),
    title: String(row.title),
    assessmentType,
    academicYearId: String(row.academic_year_id),
    targetGrades: Array.isArray(row.target_grades) ? (row.target_grades as string[]) : [],
    targetClassIds: Array.isArray(row.target_class_ids) ? (row.target_class_ids as string[]) : [],
    startDate: String(row.start_date || new Date().toISOString()),
    endDate: String(row.end_date || new Date().toISOString()),
    status: (row.status as ExamPackage['status']) || 'ACTIVE',
    description: cleanDescription,
    subjects: subjects,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function toSupabaseTryoutCoreOnly(to: Tryout, supabaseAcademicYearId?: string): Record<string, unknown> {
  const isExt = Boolean(to.isExternal || to.source === 'EXTERNAL');
  const existingMeta = ((to.scoringConfig as any)?._meta || {}) as Record<string, unknown>;
  const meta: Record<string, unknown> = {
    ...existingMeta,
    selectedQuestionColumns: to.selectedQuestionColumns,
    answerKey: to.answerKey,
    subjectId: to.subjectId,
    tryoutGroup: to.tryoutGroup ?? existingMeta.tryoutGroup,
    duplicateSubmissions: to.duplicateSubmissions ?? existingMeta.duplicateSubmissions,
    isExternal: isExt,
    source: isExt ? 'EXTERNAL' : 'INTERNAL',
    externalSubjects: to.externalSubjects,
    externalSubjectIds: to.externalSubjectIds,
    externalScoreScale: to.externalScoreScale,
  };

  const enhancedScoringConfig = {
    ...(to.scoringConfig || {}),
    _meta: meta,
  };

  const payload: Record<string, unknown> = {
    code: to.code,
    title: to.title,
    assessment_type: to.assessmentType || 'TRYOUT',
    academic_year_id: supabaseAcademicYearId || to.academicYearId,
    start_date: to.startDate || new Date().toISOString(),
    end_date: to.endDate || new Date().toISOString(),
    scoring_config: enhancedScoringConfig,
    status: to.status || 'DRAFT',
    description: to.description || null,
    google_form_url: to.googleFormUrl || null,
    google_sheet_url: to.googleSheetUrl || null,
    package_id: (to.packageId && isValidUuid(to.packageId)) ? to.packageId : null,
    target_class_ids: to.targetClassIds || [],
  };

  if (isValidUuid(to.id)) {
    payload.id = to.id;
  }

  return payload;
}

function toSupabaseTryout(to: Tryout, supabaseAcademicYearId?: string): Record<string, unknown> {
  const isExt = Boolean(to.isExternal || to.source === 'EXTERNAL');
  const existingMeta = ((to.scoringConfig as any)?._meta || {}) as Record<string, unknown>;
  const meta: Record<string, unknown> = {
    ...existingMeta,
    selectedQuestionColumns: to.selectedQuestionColumns,
    answerKey: to.answerKey,
    subjectId: to.subjectId,
    tryoutGroup: to.tryoutGroup ?? existingMeta.tryoutGroup,
    duplicateSubmissions: to.duplicateSubmissions ?? existingMeta.duplicateSubmissions,
    isExternal: isExt,
    source: isExt ? 'EXTERNAL' : 'INTERNAL',
    externalSubjects: to.externalSubjects,
    externalSubjectIds: to.externalSubjectIds,
    externalScoreScale: to.externalScoreScale,
  };

  const enhancedScoringConfig = {
    ...(to.scoringConfig || {}),
    _meta: meta,
  };

  const payload: Record<string, unknown> = {
    code: to.code,
    title: to.title,
    assessment_type: to.assessmentType || 'TRYOUT',
    academic_year_id: supabaseAcademicYearId || to.academicYearId,
    start_date: to.startDate || new Date().toISOString(),
    end_date: to.endDate || new Date().toISOString(),
    scoring_config: enhancedScoringConfig,
    status: to.status || 'DRAFT',
    description: to.description || null,
    google_form_url: to.googleFormUrl || null,
    google_sheet_url: to.googleSheetUrl || null,
    package_id: (to.packageId && isValidUuid(to.packageId)) ? to.packageId : null,
    target_class_ids: to.targetClassIds || [],
    is_external: isExt,
    source: isExt ? 'EXTERNAL' : 'INTERNAL',
    external_subjects: to.externalSubjects || [],
    external_subject_ids: to.externalSubjectIds || [],
    external_score_scale: to.externalScoreScale || 'SCALE_100',
  };

  if (to.subjectId && isValidUuid(to.subjectId)) {
    payload.subject_id = to.subjectId;
  } else {
    payload.subject_id = null;
  }

  if (to.selectedQuestionColumns && to.selectedQuestionColumns.length > 0) {
    payload.selected_question_columns = to.selectedQuestionColumns;
  }
  if (to.answerKey && to.answerKey.length > 0) {
    payload.answer_key = to.answerKey;
  }

  if (isValidUuid(to.id)) {
    payload.id = to.id;
  }

  return payload;
}

function fromSupabaseTryout(row: Record<string, unknown>): Tryout {
  const scoringConfigRaw = ((row.scoring_config as any) || { scoringType: 'ROUND_DOWN', maxScore: 100, correctScore: 1, wrongScore: 0, emptyScore: 0 });
  const meta = scoringConfigRaw._meta || {};

  // Periksa apakah ini TO Eksternal baik dari kolom tabel Supabase maupun dari metadata scoring_config
  const isExternal = Boolean(
    row.is_external === true ||
    meta.isExternal === true ||
    row.source === 'EXTERNAL' ||
    meta.source === 'EXTERNAL'
  );

  return {
    id: String(row.id),
    code: String(row.code),
    title: String(row.title),
    assessmentType: (row.assessment_type as Tryout['assessmentType']) || 'TRYOUT',
    academicYearId: String(row.academic_year_id),
    startDate: String(row.start_date || new Date().toISOString()),
    endDate: String(row.end_date || new Date().toISOString()),
    scoringConfig: scoringConfigRaw,
    status: (row.status as Tryout['status']) || 'ACTIVE',
    description: row.description ? String(row.description) : undefined,
    googleFormUrl: row.google_form_url ? String(row.google_form_url) : undefined,
    googleSheetUrl: row.google_sheet_url ? String(row.google_sheet_url) : undefined,
    packageId: row.package_id ? String(row.package_id) : undefined,
    tryoutGroup: meta.tryoutGroup ? String(meta.tryoutGroup) : undefined,
    targetClassIds: Array.isArray(row.target_class_ids) ? (row.target_class_ids as string[]) : [],
    answerKey: (Array.isArray(row.answer_key) && row.answer_key.length > 0)
      ? (row.answer_key as string[])
      : (Array.isArray(meta.answerKey) ? meta.answerKey : undefined),
    selectedQuestionColumns: (Array.isArray(row.selected_question_columns) && row.selected_question_columns.length > 0)
      ? (row.selected_question_columns as string[])
      : (Array.isArray(meta.selectedQuestionColumns) ? meta.selectedQuestionColumns : undefined),
    subjectId: (row.subject_id && isValidUuid(String(row.subject_id)))
      ? String(row.subject_id)
      : (meta.subjectId || undefined),
    isExternal,
    source: isExternal ? 'EXTERNAL' : ((row.source as any) || meta.source || 'INTERNAL'),
    externalSubjects: (Array.isArray(row.external_subjects) && row.external_subjects.length > 0)
      ? (row.external_subjects as string[])
      : (Array.isArray(meta.externalSubjects) ? meta.externalSubjects : undefined),
    externalSubjectIds: (Array.isArray(row.external_subject_ids) && row.external_subject_ids.length > 0)
      ? (row.external_subject_ids as string[])
      : (Array.isArray(meta.externalSubjectIds) ? meta.externalSubjectIds : undefined),
    externalScoreScale: (row.external_score_scale as any) || meta.externalScoreScale || (isExternal ? 'SCALE_100' : undefined),
    duplicateSubmissions: Array.isArray(meta.duplicateSubmissions) ? (meta.duplicateSubmissions as any) : undefined,
  };
}

function toSupabaseSchoolProfile(sp: SchoolProfile): Record<string, unknown> {
  return {
    id: 'default',
    name: sp.name,
    sub_header: sp.subHeader || '',
    address: sp.address || '',
    principal_name: sp.principalName || '',
    principal_nip: sp.principalNip || '',
    academic_year: sp.academicYear || '',
    logo_url: sp.logoUrl || null,
    updated_at: new Date().toISOString(),
  };
}

function fromSupabaseSchoolProfile(row: Record<string, unknown>): SchoolProfile {
  return {
    name: String(row.name || ''),
    subHeader: String(row.sub_header || ''),
    address: String(row.address || ''),
    principalName: String(row.principal_name || ''),
    principalNip: String(row.principal_nip || ''),
    academicYear: String(row.academic_year || ''),
    logoUrl: row.logo_url ? String(row.logo_url) : undefined,
  };
}

function fromSupabaseResponse(row: Record<string, unknown>): Response {
  return {
    id: String(row.id),
    tryoutId: String(row.tryout_id),
    studentId: String(row.student_id),
    nisnInput: String(row.nisn_input || ''),
    rawScoreGForm: Number(row.raw_score_gform) || 0,
    submittedAt: String(row.submitted_at || new Date().toISOString()),
    syncBatchId: row.sync_batch_id ? String(row.sync_batch_id) : undefined,
  };
}

function fromSupabaseScore(row: Record<string, unknown>): Score {
  return {
    id: String(row.id),
    responseId: row.response_id ? String(row.response_id) : undefined,
    studentId: String(row.student_id),
    tryoutId: String(row.tryout_id),
    subjectScores: (row.subject_scores as Record<string, number>) || {},
    googleFormScore: row.google_form_score !== null && row.google_form_score !== undefined ? Number(row.google_form_score) : undefined,
    calculatedScore: Number(row.calculated_score) || 0,
    scoreDifference: row.score_difference !== null && row.score_difference !== undefined ? Number(row.score_difference) : undefined,
    scoringStatus: (row.scoring_status as any) || 'MATCH',
    totalCorrect: Number(row.total_correct) || 0,
    totalIncorrect: Number(row.total_incorrect) || 0,
    totalUnanswered: Number(row.total_unanswered) || 0,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function toSupabaseMaterial(m: Material): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    subject_id: m.subjectId,
    code: m.code.trim(),
    title: m.title.trim(),
    description: m.description || null,
    google_form_url: m.googleFormUrl || null,
  };
  if (isValidUuid(m.id)) payload.id = m.id;
  return payload;
}

function fromSupabaseMaterial(row: Record<string, unknown>): Material {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    code: String(row.code),
    title: String(row.title),
    description: String(row.description || ''),
    googleFormUrl: row.google_form_url ? String(row.google_form_url) : undefined,
  };
}

function toSupabaseCompetency(c: Competency): Record<string, unknown> {
  let gl = c.gradeLevel || 'X';
  if (gl === '10') gl = 'X';
  else if (gl === '11') gl = 'XI';
  else if (gl === '12') gl = 'XII';
  else if (!['X', 'XI', 'XII'].includes(gl)) gl = 'X';

  const payload: Record<string, unknown> = {
    subject_id: c.subjectId,
    code: c.code.trim(),
    statement: c.statement.trim(),
    grade_level: gl,
  };
  if (isValidUuid(c.id)) payload.id = c.id;
  return payload;
}

function fromSupabaseCompetency(row: Record<string, unknown>): Competency {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    code: String(row.code),
    statement: String(row.statement),
    gradeLevel: String(row.grade_level || 'X'),
  };
}

function resolveOptionLetter(raw: string | undefined | null, options?: { key: string; text: string }[]): 'A' | 'B' | 'C' | 'D' | 'E' | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (['A', 'B', 'C', 'D', 'E'].includes(upper)) {
    return upper as 'A' | 'B' | 'C' | 'D' | 'E';
  }
  const prefixMatch = trimmed.match(/^\s*(?:\[([A-Ea-e])\]|(?:opsi|pilihan)\s+([A-Ea-e])(?:[\.\)\:\-\s]|$)|([A-Ea-e])[\.\)\:])/i);
  if (prefixMatch) {
    return (prefixMatch[1] || prefixMatch[2] || prefixMatch[3]).toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
  }
  if (upper === 'BENAR' || upper === 'TRUE') return 'A';
  if (upper === 'SALAH' || upper === 'FALSE') return 'B';

  if (Array.isArray(options)) {
    const matched = options.find(o => (o.text || '').trim().toUpperCase() === upper);
    if (matched && ['A', 'B', 'C', 'D', 'E'].includes(matched.key.toUpperCase())) {
      return matched.key.toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
    }
  }
  return null;
}

function toSupabaseQuestion(q: Question): Record<string, unknown> {
  const validCorr = resolveOptionLetter(q.correctAnswer, q.options) || 'A';
  const payload: Record<string, unknown> = {
    unique_code: q.uniqueCode.trim(),
    question_number: q.questionNumber || null,
    subject_id: q.subjectId,
    material_id: isValidUuid(q.materialId) ? q.materialId : null,
    competency_id: isValidUuid(q.competencyId) ? q.competencyId : null,
    question_text: q.questionText || '',
    options: Array.isArray(q.options) ? q.options : [],
    correct_answer: validCorr,
    weight: q.weight ?? 1.0,
    cognitive_level: q.cognitiveLevel || 'C3',
    status: q.status || 'ACTIVE',
  };
  if (isValidUuid(q.id)) {
    payload.id = q.id;
  }
  return payload;
}

function fromSupabaseQuestion(row: Record<string, unknown>): Question {
  return {
    id: String(row.id),
    uniqueCode: String(row.unique_code),
    questionNumber: row.question_number ? Number(row.question_number) : undefined,
    subjectId: String(row.subject_id),
    materialId: String(row.material_id),
    competencyId: String(row.competency_id),
    questionText: String(row.question_text || ''),
    options: Array.isArray(row.options) ? (row.options as any) : [],
    correctAnswer: String(row.correct_answer || 'A').toUpperCase(),
    weight: Number(row.weight) || 1,
    cognitiveLevel: (row.cognitive_level as any) || undefined,
    status: (row.status as any) || 'ACTIVE',
  };
}

function toSupabaseAnswer(a: Answer): Record<string, unknown> {
  const validCorr = resolveOptionLetter(a.correctAnswer) || 'A';
  const rawAns = (a.studentAnswer || '').trim();
  let validAns: 'A' | 'B' | 'C' | 'D' | 'E' | null = null;

  if (rawAns) {
    validAns = resolveOptionLetter(rawAns);
    if (!validAns) {
      // Jangan pernah mengubah jawaban teks non-kosong menjadi NULL (Kosong)!
      // Jika benar, gunakan huruf kunci jawaban; jika salah, petakan secara deterministik ke salah satu opsi pengecoh (A..E selain kunci).
      if (a.isCorrect) {
        validAns = validCorr;
      } else {
        const distractors = (['A', 'B', 'C', 'D', 'E'] as const).filter(k => k !== validCorr);
        let hash = 0;
        const upper = rawAns.toUpperCase();
        for (let i = 0; i < upper.length; i++) {
          hash = (hash * 31 + upper.charCodeAt(i)) >>> 0;
        }
        validAns = distractors[hash % distractors.length];
      }
    }
  }

  const payload: Record<string, unknown> = {
    response_id: a.responseId,
    student_id: a.studentId,
    tryout_id: a.tryoutId,
    question_id: a.questionId,
    student_answer: validAns,
    correct_answer: validCorr,
    is_correct: Boolean(a.isCorrect),
    score: Number(a.score) || 0,
    submitted_at: a.submittedAt || new Date().toISOString(),
  };
  if (isValidUuid(a.id)) {
    payload.id = a.id;
  }
  return payload;
}

function fromSupabaseAnswer(row: Record<string, unknown>): Answer {
  return {
    id: String(row.id),
    responseId: String(row.response_id),
    studentId: String(row.student_id),
    tryoutId: String(row.tryout_id),
    questionId: String(row.question_id),
    studentAnswer: row.student_answer ? String(row.student_answer) : '',
    correctAnswer: String(row.correct_answer || ''),
    isCorrect: Boolean(row.is_correct),
    score: Number(row.score) || 0,
    submittedAt: String(row.submitted_at || new Date().toISOString()),
  };
}

function toSupabaseExplanation(exp: Explanation): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: exp.title.trim(),
    content_text: exp.contentText || '',
    pdf_url: exp.pdfUrl || null,
    pdf_storage_path: exp.pdfStoragePath || null,
    pdf_file_name: exp.pdfFileName || null,
    pdf_file_size: exp.pdfFileSize || null,
    youtube_url: exp.youtubeUrl || null,
    external_url: exp.externalUrl || null,
    status: exp.status || 'DRAFT',
    author_name: exp.authorName || null,
    question_numbers: Array.isArray(exp.questionNumbers) ? exp.questionNumbers : [],
    question_ids: Array.isArray(exp.questionIds) ? exp.questionIds : [],
    created_at: exp.createdAt || new Date().toISOString(),
    updated_at: exp.updatedAt || new Date().toISOString(),
  };

  if (isValidUuid(exp.id)) {
    payload.id = exp.id;
  }
  if (isValidUuid(exp.tryoutId)) {
    payload.tryout_id = exp.tryoutId;
  }
  if (exp.subjectId && isValidUuid(exp.subjectId)) {
    payload.subject_id = exp.subjectId;
  }
  if (exp.questionId && isValidUuid(exp.questionId)) {
    payload.question_id = exp.questionId;
  }
  if (exp.createdBy && isValidUuid(exp.createdBy)) {
    payload.created_by = exp.createdBy;
  }

  return payload;
}

function fromSupabaseExplanation(row: Record<string, unknown>): Explanation {
  return {
    id: String(row.id),
    tryoutId: String(row.tryout_id || ''),
    subjectId: row.subject_id ? String(row.subject_id) : undefined,
    questionId: row.question_id ? String(row.question_id) : undefined,
    questionNumbers: Array.isArray(row.question_numbers) ? (row.question_numbers as number[]) : undefined,
    questionIds: Array.isArray(row.question_ids) ? (row.question_ids as string[]) : undefined,
    title: String(row.title || ''),
    contentText: String(row.content_text || ''),
    pdfUrl: row.pdf_url ? String(row.pdf_url) : undefined,
    pdfStoragePath: row.pdf_storage_path ? String(row.pdf_storage_path) : undefined,
    pdfFileName: row.pdf_file_name ? String(row.pdf_file_name) : undefined,
    pdfFileSize: row.pdf_file_size ? Number(row.pdf_file_size) : undefined,
    youtubeUrl: row.youtube_url ? String(row.youtube_url) : undefined,
    externalUrl: row.external_url ? String(row.external_url) : undefined,
    status: (row.status as any) || 'DRAFT',
    createdBy: row.created_by ? String(row.created_by) : undefined,
    authorName: row.author_name ? String(row.author_name) : undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

// ============================================================
// CORE SYNC SERVICE
// ============================================================

export interface SupabaseCoreState {
  users: User[];
  teachers: Teacher[];
  students: Student[];
  classes: ClassRoom[];
  academicYears: AcademicYear[];
  subjects: Subject[];
  materials?: Material[];
  competencies?: Competency[];
  examPackages?: ExamPackage[];
  tryouts?: Tryout[];
  questions?: Question[];
  answers?: Answer[];
  schoolProfile?: SchoolProfile;
  responses?: Response[];
  scores?: Score[];
  explanations?: Explanation[];
}

class SupabaseDbService {
  private cachedAcademicYearId: string | null = null;
  private classIdMap = new Map<string, string>();
  private teacherIdMap = new Map<string, string>();

  private log(msg: string, level: 'info' | 'warn' | 'error' = 'info') {
    const prefix = '[SupabaseDB]';
    if (level === 'error') console.error(prefix, msg);
    else if (level === 'warn') console.warn(prefix, msg);
    else console.info(prefix, msg);
  }

  public isAvailable(): boolean {
    return isSupabaseConfigured() && !!supabase;
  }

  /**
   * Mengembalikan UUID tahun ajaran aktif dari Supabase.
   */
  public async resolveAcademicYearId(localAyId?: string): Promise<string> {
    if (localAyId && isValidUuid(localAyId)) {
      this.cachedAcademicYearId = localAyId;
      return localAyId;
    }
    if (this.cachedAcademicYearId) return this.cachedAcademicYearId;
    if (!supabase) return '0ffe2ac4-48bd-400b-ae8c-05ecff36e4a1';

    try {
      const { data } = await supabase
        .from('academic_years')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (data?.id) {
        this.cachedAcademicYearId = String(data.id);
        return this.cachedAcademicYearId;
      }
    } catch (e) {
      this.log('Gagal query academic year UUID: ' + e, 'warn');
    }

    return '0ffe2ac4-48bd-400b-ae8c-05ecff36e4a1';
  }

  /**
   * Mengembalikan UUID kelas dari Supabase berdasarkan ID lokal atau nama kelas.
   */
  public async resolveClassId(localClassId: string, className?: string): Promise<string | null> {
    if (isValidUuid(localClassId)) {
      this.classIdMap.set(localClassId, localClassId);
      return localClassId;
    }
    if (this.classIdMap.has(localClassId)) {
      return this.classIdMap.get(localClassId)!;
    }
    if (className && this.classIdMap.has(className.toLowerCase())) {
      return this.classIdMap.get(className.toLowerCase())!;
    }

    if (!supabase) return null;

    try {
      if (className) {
        const { data: byName } = await supabase
          .from('classes')
          .select('id')
          .ilike('name', className.trim())
          .maybeSingle();

        if (byName?.id) {
          const uid = String(byName.id);
          this.classIdMap.set(localClassId, uid);
          this.classIdMap.set(className.toLowerCase(), uid);
          return uid;
        }
      }

      // Cari dari seluruh kelas di Supabase
      const { data: allCls } = await supabase.from('classes').select('id, name');
      if (allCls && allCls.length > 0) {
        allCls.forEach(c => {
          this.classIdMap.set(String(c.name).toLowerCase(), String(c.id));
        });
        if (className && this.classIdMap.has(className.toLowerCase())) {
          const uid = this.classIdMap.get(className.toLowerCase())!;
          this.classIdMap.set(localClassId, uid);
          return uid;
        }
      }
    } catch (e) {
      this.log('resolveClassId error: ' + e, 'warn');
    }

    return null;
  }

  /**
   * Mengembalikan UUID guru dari Supabase berdasarkan ID lokal atau NIP.
   */
  public async resolveTeacherId(localTeacherId: string, nipFallback?: string): Promise<string | null> {
    if (isValidUuid(localTeacherId)) {
      this.teacherIdMap.set(localTeacherId, localTeacherId);
      return localTeacherId;
    }
    if (this.teacherIdMap.has(localTeacherId)) {
      return this.teacherIdMap.get(localTeacherId)!;
    }
    if (nipFallback && this.teacherIdMap.has(nipFallback.trim())) {
      return this.teacherIdMap.get(nipFallback.trim())!;
    }
    if (!supabase) return null;

    try {
      // 1. Cari berdasarkan ID
      const { data: byId } = await supabase
        .from('teachers')
        .select('id, nip')
        .eq('id', localTeacherId)
        .maybeSingle();

      if (byId?.id) {
        const uid = String(byId.id);
        this.teacherIdMap.set(localTeacherId, uid);
        if (byId.nip) this.teacherIdMap.set(String(byId.nip).trim(), uid);
        return uid;
      }

      // 2. Cari berdasarkan NIP
      const targetNip = (nipFallback || localTeacherId).trim();
      const { data: byNip } = await supabase
        .from('teachers')
        .select('id, nip')
        .eq('nip', targetNip)
        .maybeSingle();

      if (byNip?.id) {
        const uid = String(byNip.id);
        this.teacherIdMap.set(localTeacherId, uid);
        this.teacherIdMap.set(targetNip, uid);
        return uid;
      }
    } catch (e) {
      this.log('resolveTeacherId error: ' + e, 'warn');
    }

    return null;
  }

  /**
   * Helper: Mengambil seluruh baris dari tabel Supabase secara bertahap (paginated)
   * untuk melewati batas maksimal 1.000 baris per request milik PostgREST (db-max-rows = 1000).
   * Diurutkan berdasarkan primary key `id` agar urutan halaman deterministik 100%.
   */
  private async fetchAllRows<T = Record<string, unknown>>(
    table: string,
    pageSize = 1000,
    maxPages = 100
  ): Promise<{ data: T[]; error: { message: string } | null }> {
    if (!supabase) return { data: [], error: null };
    const allRows: T[] = [];
    let from = 0;

    for (let page = 0; page < maxPages; page++) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        return { data: allRows, error: { message: error.message } };
      }
      if (!data || data.length === 0) {
        break;
      }
      allRows.push(...(data as T[]));
      if (data.length < pageSize) {
        break;
      }
      from += pageSize;
    }

    return { data: allRows, error: null };
  }

  // ----------------------------------------------------------
  // FETCH: Load all core state from Supabase
  // Used on fresh devices and background cloud sync
  // ----------------------------------------------------------
  public async fetchCoreState(): Promise<SupabaseCoreState | null> {
    if (!this.isAvailable() || !supabase) return null;

    try {
      // Fetch semua data secara paralel (gunakan fetchAllRows untuk tabel besar >1.000 baris)
      const [
        ayRes, classRes, subjectRes, userRes, teacherRes, studentRes,
        pkgRes, pkgSubRes, toRes, spRes, respRes, scRes,
        matRes, compRes, qRes, ansRes, expRes
      ] = await Promise.all([
        supabase.from('academic_years').select('*'),
        supabase.from('classes').select('*'),
        supabase.from('subjects').select('*'),
        supabase.from('users').select('*'),
        supabase.from('teachers').select('*'),
        this.fetchAllRows('students'),
        supabase.from('exam_packages').select('*'),
        supabase.from('exam_package_subjects').select('*'),
        supabase.from('tryouts').select('*'),
        supabase.from('school_profile').select('*').limit(1).maybeSingle(),
        this.fetchAllRows('responses'),
        this.fetchAllRows('scores'),
        supabase.from('materials').select('*'),
        supabase.from('competencies').select('*'),
        this.fetchAllRows('questions'),
        this.fetchAllRows('answers'),
        supabase.from('explanations').select('*'),
      ]);

      if (ayRes.error) throw new Error('academic_years: ' + ayRes.error.message);
      if (classRes.error) throw new Error('classes: ' + classRes.error.message);
      if (subjectRes.error) throw new Error('subjects: ' + subjectRes.error.message);
      if (userRes.error) throw new Error('users: ' + userRes.error.message);
      if (teacherRes.error) throw new Error('teachers: ' + teacherRes.error.message);
      if (studentRes.error) throw new Error('students: ' + studentRes.error.message);
      if (respRes.error) throw new Error('responses: ' + respRes.error.message);
      if (scRes.error) throw new Error('scores: ' + scRes.error.message);

      // Build mapping: Supabase UUID → local data
      const academicYears: AcademicYear[] = (ayRes.data || []).map(fromSupabaseAcademicYear);
      const supabaseAyIdToLocalId = new Map<string, string>();
      academicYears.forEach(ay => {
        supabaseAyIdToLocalId.set(ay.id, ay.id);
        if (ay.isActive) this.cachedAcademicYearId = ay.id;
      });
      if (!this.cachedAcademicYearId && academicYears.length > 0) {
        this.cachedAcademicYearId = academicYears[0].id;
      }

      const classes: ClassRoom[] = (classRes.data || []).map(
        (row: Record<string, unknown>) => fromSupabaseClass(row, supabaseAyIdToLocalId)
      );
      const supabaseClassIdToLocalId = new Map<string, string>();
      classes.forEach(c => {
        supabaseClassIdToLocalId.set(c.id, c.id);
        this.classIdMap.set(c.id, c.id);
        this.classIdMap.set(c.name.trim().toLowerCase(), c.id);
      });

      const subjects: Subject[] = (subjectRes.data || []).map(fromSupabaseSubject);

      const users: User[] = (userRes.data || []).map(fromSupabaseUser);
      const supabaseUserIdToLocalId = new Map<string, string>();
      users.forEach(u => supabaseUserIdToLocalId.set(u.id, u.id));

      const teachers: Teacher[] = (teacherRes.data || []).map(
        (row: Record<string, unknown>) => fromSupabaseTeacher(row, supabaseUserIdToLocalId)
      );
      teachers.forEach(t => {
        this.teacherIdMap.set(t.id, t.id);
        if (t.nip) this.teacherIdMap.set(t.nip.trim(), t.id);
      });

      // Cross-link homeroom consistency between classes & teachers
      teachers.forEach(t => {
        if (t.isWaliKelas && t.homeRoomClassId) {
          const cls = classes.find(c => c.id === t.homeRoomClassId);
          if (cls && !cls.homeRoomTeacherId) {
            cls.homeRoomTeacherId = t.id;
          }
        }
      });
      classes.forEach(c => {
        if (c.homeRoomTeacherId) {
          const t = teachers.find(tch => tch.id === c.homeRoomTeacherId);
          if (t) {
            t.isWaliKelas = true;
            if (!t.homeRoomClassId) t.homeRoomClassId = c.id;
          }
        }
      });

      // Hubungkan password guru (dari password_hint) ke User object agar login multi-device berhasil
      users.forEach(u => {
        const matchedT = teachers.find(
          t => t.userId === u.id || (t.email && t.email.toLowerCase() === u.email.toLowerCase())
        );
        if (matchedT && matchedT.password) {
          (u as any).password = matchedT.password;
        } else if (u.email === 'admin@sekolah.com') {
          (u as any).password = 'admin123';
        } else if (!u.password) {
          (u as any).password = 'password123';
        }
      });

      const students: Student[] = (studentRes.data || []).map(
        (row: Record<string, unknown>) => fromSupabaseStudent(row, supabaseClassIdToLocalId)
      );

      // Exam packages & Tryouts
      const examPackagesData = pkgRes?.data || [];
      const examPackageSubjectsData = pkgSubRes?.data || [];
      const tryoutsData = toRes?.data || [];

      const subjectsByPkg = new Map<string, ExamPackageSubject[]>();
      examPackageSubjectsData.forEach((row: any) => {
        const pkgId = String(row.package_id);
        const list = subjectsByPkg.get(pkgId) || [];
        list.push({
          id: String(row.id),
          packageId: pkgId,
          subjectId: String(row.subject_id),
          teacherId: row.teacher_id ? String(row.teacher_id) : undefined,
          googleFormUrl: row.google_form_url ? String(row.google_form_url) : undefined,
          googleSheetUrl: row.google_sheet_url ? String(row.google_sheet_url) : undefined,
          answerKey: Array.isArray(row.answer_key) ? row.answer_key : [],
          totalQuestions: Number(row.total_questions) || 40,
          durationMinutes: Number(row.duration_minutes) || 60,
          passingGrade: Number(row.passing_grade) || 75,
          syncStatus: row.sync_status || 'SYNCED',
          lastUpdatedBy: row.last_updated_by ? String(row.last_updated_by) : undefined,
          updatedAt: row.updated_at ? String(row.updated_at) : undefined,
        });
        subjectsByPkg.set(pkgId, list);
      });

      const examPackages: ExamPackage[] = examPackagesData.map((row: any) =>
        fromSupabaseExamPackage(row, subjectsByPkg.get(String(row.id)) || [])
      );

      const tryouts: Tryout[] = tryoutsData.map((row: any) => fromSupabaseTryout(row));

      const responses: Response[] = (respRes?.data || []).map((row: any) => fromSupabaseResponse(row));
      const scores: Score[] = (scRes?.data || []).map((row: any) => fromSupabaseScore(row));

      const materials: Material[] = (matRes?.data || []).map(fromSupabaseMaterial);
      const competencies: Competency[] = (compRes?.data || []).map(fromSupabaseCompetency);
      const questions: Question[] = (qRes?.data || []).map(fromSupabaseQuestion);
      const answers: Answer[] = (ansRes?.data || []).map(fromSupabaseAnswer);
      const explanations: Explanation[] = (expRes?.data || []).map((row: any) => fromSupabaseExplanation(row));

      const schoolProfile: SchoolProfile | undefined = spRes?.data
        ? fromSupabaseSchoolProfile(spRes.data as Record<string, unknown>)
        : undefined;

      this.log(`Loaded from Supabase: ${users.length} users, ${teachers.length} teachers, ${students.length} students, ${classes.length} classes, ${examPackages.length} packages, ${tryouts.length} tryouts, ${questions.length} questions, ${answers.length} answers, ${explanations.length} explanations, ${responses.length} responses, ${scores.length} scores${schoolProfile ? ', school profile' : ''}`);

      return {
        users, teachers, students, classes, academicYears, subjects,
        materials, competencies, questions, answers,
        examPackages, tryouts, schoolProfile, responses, scores, explanations
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('fetchCoreState failed: ' + msg, 'warn');
      return null;
    }
  }

  // ----------------------------------------------------------
  // UPSERT METHODS: Sync individual entities to Supabase
  // All fire-and-forget safe (catch errors internally)
  // ----------------------------------------------------------

  public async syncUser(user: User): Promise<void> {
    if (!this.isAvailable() || !supabase) return;
    try {
      const { error } = await supabase
        .from('users')
        .upsert(toSupabaseUser(user), { onConflict: 'email' });
      if (error) this.log('syncUser error: ' + error.message, 'warn');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('syncUser exception: ' + msg, 'warn');
    }
  }

  public async syncTeacher(teacher: Teacher, user?: User): Promise<string | null> {
    if (!this.isAvailable() || !supabase) return null;
    try {
      // 1. Upsert user record first
      let supabaseUserId: string | null = null;
      const targetEmail = (teacher.email || `${teacher.nip.trim()}@guru.sekolah.id`).toLowerCase();

      if (user) {
        const { data: uData, error: uErr } = await supabase
          .from('users')
          .upsert(toSupabaseUser({ ...user, email: targetEmail }), { onConflict: 'email' })
          .select('id')
          .single();
        if (!uErr && uData) supabaseUserId = (uData as Record<string, unknown>).id as string;
      }

      if (!supabaseUserId) {
        // Try to find existing user
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', targetEmail)
          .single();
        supabaseUserId = existingUser ? (existingUser as Record<string, unknown>).id as string : null;
      }

      if (!supabaseUserId) {
        this.log('syncTeacher: cannot find or create user for ' + targetEmail, 'warn');
        return null;
      }

      // 2. Resolve homeroom class UUID if set
      let homeRoomClassUuid: string | null = null;
      if (teacher.isWaliKelas && teacher.homeRoomClassId) {
        homeRoomClassUuid = await this.resolveClassId(teacher.homeRoomClassId);
      }

      // 3. Upsert teacher record
      const payload = toSupabaseTeacher(teacher, supabaseUserId, homeRoomClassUuid);
      const { data: tData, error } = await supabase
        .from('teachers')
        .upsert(payload, { onConflict: 'nip' })
        .select('id')
        .single();

      if (error) {
        this.log('syncTeacher error: ' + error.message, 'warn');
        return null;
      }

      const teacherUuid = tData ? String((tData as any).id) : (isValidUuid(teacher.id) ? teacher.id : null);
      if (teacherUuid) {
        this.teacherIdMap.set(teacher.id, teacherUuid);
        this.teacherIdMap.set(teacher.nip.trim(), teacherUuid);

        // 4. Update bidirectional link in classes table
        if (teacher.isWaliKelas && homeRoomClassUuid) {
          await supabase
            .from('classes')
            .update({ home_room_teacher_id: teacherUuid })
            .eq('id', homeRoomClassUuid);
        } else if (!teacher.isWaliKelas) {
          await supabase
            .from('classes')
            .update({ home_room_teacher_id: null })
            .eq('home_room_teacher_id', teacherUuid);
        }
      }

      return teacherUuid;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('syncTeacher exception: ' + msg, 'warn');
      return null;
    }
  }

  public async syncStudent(
    student: Student,
    supabaseClassId?: string,
    classNameFallback?: string
  ): Promise<string | null> {
    if (!this.isAvailable() || !supabase) return null;
    try {
      let classId = supabaseClassId;
      if (!classId || !isValidUuid(classId)) {
        classId = await this.resolveClassId(student.classId, classNameFallback) || undefined;
      }

      if (!classId || !isValidUuid(classId)) {
        this.log('syncStudent: no valid UUID class ID found for student ' + student.nisn, 'warn');
        return null;
      }

      const payload = toSupabaseStudent(student, classId);
      let { data: res, error } = await supabase
        .from('students')
        .upsert(payload, { onConflict: 'nisn' })
        .select('id')
        .single();

      // Fallback jika kolom is_answer_key_account belum ditambahkan lewat migrasi 007
      if (error && (error.message?.includes('is_answer_key_account') || (error as any).details?.includes('is_answer_key_account'))) {
        this.log('syncStudent: kolom is_answer_key_account belum ada di database, mencoba upsert tanpa kolom tersebut...', 'warn');
        const fallbackPayload = { ...payload };
        delete fallbackPayload.is_answer_key_account;
        const retry = await supabase
          .from('students')
          .upsert(fallbackPayload, { onConflict: 'nisn' })
          .select('id')
          .single();
        if (!retry.error) {
          res = retry.data;
          error = null;
        } else {
          error = retry.error;
        }
      }

      if (error) {
        this.log('syncStudent error: ' + error.message, 'warn');
        return null;
      }
      return res ? String((res as any).id) : null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('syncStudent exception: ' + msg, 'warn');
      return null;
    }
  }

  public async syncClass(cls: ClassRoom, supabaseAcademicYearId?: string): Promise<string | null> {
    if (!this.isAvailable() || !supabase) return null;
    try {
      const ayId = await this.resolveAcademicYearId(supabaseAcademicYearId || cls.academicYearId);
      const { data: existing } = await supabase
        .from('classes')
        .select('id')
        .eq('name', cls.name.trim())
        .maybeSingle();

      let homeRoomTeacherUuid: string | null = null;
      if (cls.homeRoomTeacherId) {
        homeRoomTeacherUuid = await this.resolveTeacherId(cls.homeRoomTeacherId);
      }

      const payload = toSupabaseClass(cls, ayId, homeRoomTeacherUuid);
      let classUuid: string | null = null;

      if (existing?.id) {
        classUuid = String(existing.id);
        const { error } = await supabase.from('classes').update(payload).eq('id', classUuid);
        if (error) this.log('syncClass update error: ' + error.message, 'warn');
      } else {
        const { data: inserted, error } = await supabase
          .from('classes')
          .insert(payload)
          .select('id')
          .single();

        if (error) {
          this.log('syncClass insert error: ' + error.message, 'warn');
        } else if (inserted) {
          classUuid = String((inserted as any).id);
        }
      }

      if (classUuid) {
        this.classIdMap.set(cls.id, classUuid);
        this.classIdMap.set(cls.name.trim().toLowerCase(), classUuid);

        // Bidirectional update on teacher if set
        if (homeRoomTeacherUuid) {
          await supabase
            .from('teachers')
            .update({ is_wali_kelas: true, home_room_class_id: classUuid })
            .eq('id', homeRoomTeacherUuid);
        }
      }
      return classUuid;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('syncClass exception: ' + msg, 'warn');
      return null;
    }
  }

  public async syncAcademicYear(ay: AcademicYear): Promise<void> {
    if (!this.isAvailable() || !supabase) return;
    try {
      const payload = toSupabaseAcademicYear(ay);
      if (isValidUuid(ay.id)) {
        (payload as any).id = ay.id;
      }
      const { data, error } = await supabase
        .from('academic_years')
        .upsert(payload, { onConflict: 'year_label,semester' })
        .select('id')
        .single();

      if (error) {
        this.log('syncAcademicYear error: ' + error.message, 'warn');
      } else if (data?.id) {
        this.cachedAcademicYearId = String(data.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('syncAcademicYear exception: ' + msg, 'warn');
    }
  }

  public async syncSubject(subject: Subject): Promise<void> {
    if (!this.isAvailable() || !supabase) return;
    try {
      const { error } = await supabase
        .from('subjects')
        .upsert(toSupabaseSubject(subject), { onConflict: 'code' });
      if (error) this.log('syncSubject error: ' + error.message, 'warn');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('syncSubject exception: ' + msg, 'warn');
    }
  }

  public async syncExamPackage(pkg: ExamPackage, supabaseAcademicYearId?: string): Promise<void> {
    if (!this.isAvailable() || !supabase) return;
    try {
      const ayId = supabaseAcademicYearId || (isValidUuid(pkg.academicYearId) ? pkg.academicYearId : this.cachedAcademicYearId || '0ffe2ac4-48bd-400b-ae8c-05ecff36e4a1');
      let existing: { id: string } | null = null;

      if (isValidUuid(pkg.id)) {
        const { data: byId } = await supabase
          .from('exam_packages')
          .select('id')
          .eq('id', pkg.id)
          .maybeSingle();
        if (byId?.id) existing = byId as any;
      }

      if (!existing && pkg.code) {
        const { data: byCode } = await supabase
          .from('exam_packages')
          .select('id')
          .eq('code', pkg.code)
          .maybeSingle();
        if (byCode?.id) existing = byCode as any;
      }

      const payload = toSupabaseExamPackage(pkg, ayId);
      let pkgId: string | null = null;

      if (existing?.id) {
        pkgId = String(existing.id);
        const { error } = await supabase.from('exam_packages').update(payload).eq('id', pkgId);
        if (error) {
          if (error.message && (error.message.includes('check constraint') || (error as any).code === '23514')) {
            const fallbackType = (pkg.assessmentType === 'SAT' || pkg.assessmentType === 'SAS') ? 'PAS' : 'TRYOUT';
            const fallbackDesc = `[TYPE:${pkg.assessmentType}] ${payload.description || ''}`.trim();
            const { error: retryErr } = await supabase.from('exam_packages').update({
              ...payload,
              assessment_type: fallbackType,
              description: fallbackDesc
            }).eq('id', pkgId);
            if (retryErr) this.log('syncExamPackage update retry error: ' + retryErr.message, 'warn');
          } else {
            this.log('syncExamPackage update error: ' + error.message, 'warn');
          }
        }
      } else {
        const { data: inserted, error } = await supabase.from('exam_packages').insert(payload).select('id').single();
        if (error) {
          if (error.message && (error.message.includes('check constraint') || (error as any).code === '23514')) {
            const fallbackType = (pkg.assessmentType === 'SAT' || pkg.assessmentType === 'SAS') ? 'PAS' : 'TRYOUT';
            const fallbackDesc = `[TYPE:${pkg.assessmentType}] ${payload.description || ''}`.trim();
            const { data: retryData, error: retryErr } = await supabase.from('exam_packages').insert({
              ...payload,
              assessment_type: fallbackType,
              description: fallbackDesc
            }).select('id').single();
            if (retryErr) {
              this.log('syncExamPackage insert retry error: ' + retryErr.message, 'warn');
            } else if (retryData) {
              pkgId = String((retryData as any).id);
            }
          } else {
            this.log('syncExamPackage insert error: ' + error.message, 'warn');
          }
        } else if (inserted) {
          pkgId = String((inserted as any).id);
        }
      }

      // Sync slot mapel exam_package_subjects jika pkgId tersedia
      if (pkgId && Array.isArray(pkg.subjects) && pkg.subjects.length > 0) {
        for (const sub of pkg.subjects) {
          const subPayload = {
            package_id: pkgId,
            subject_id: sub.subjectId,
            teacher_id: sub.teacherId || null,
            google_form_url: sub.googleFormUrl || null,
            google_sheet_url: sub.googleSheetUrl || null,
            answer_key: sub.answerKey || [],
            total_questions: sub.totalQuestions || 40,
            duration_minutes: sub.durationMinutes || 60,
            passing_grade: sub.passingGrade || 75,
            sync_status: sub.syncStatus || 'SYNCED',
            last_updated_by: sub.lastUpdatedBy || null,
          };
          await supabase.from('exam_package_subjects').upsert(subPayload, { onConflict: 'package_id,subject_id' });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('syncExamPackage exception: ' + msg, 'warn');
    }
  }

  public async removeExamPackageByCode(code: string): Promise<void> {
    if (!this.isAvailable() || !supabase) return;
    try {
      const { error } = await supabase.from('exam_packages').delete().eq('code', code.trim());
      if (error) this.log('removeExamPackageByCode error: ' + error.message, 'warn');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('removeExamPackageByCode exception: ' + msg, 'warn');
    }
  }

  public async syncTryout(to: Tryout, supabaseAcademicYearId?: string): Promise<void> {
    if (!this.isAvailable() || !supabase) return;
    try {
      const ayId = await this.resolveAcademicYearId(supabaseAcademicYearId || to.academicYearId);
      let existingId: string | null = null;
      if (isValidUuid(to.id)) {
        const { data: byId } = await supabase.from('tryouts').select('id').eq('id', to.id).maybeSingle();
        if (byId?.id) existingId = byId.id;
      }
      if (!existingId && to.code) {
        const { data: byCode } = await supabase.from('tryouts').select('id').eq('code', to.code.trim()).maybeSingle();
        if (byCode?.id) existingId = byCode.id;
      }

      const payload = toSupabaseTryout(to, ayId);
      if (existingId) {
        const { error } = await supabase.from('tryouts').update(payload).eq('id', existingId);
        if (error) {
          this.log('syncTryout update error: ' + error.message, 'warn');
          if (error.message.includes('column') || error.code === '42703' || error.code === 'PGRST204') {
            const fallbackPayload = toSupabaseTryoutCoreOnly(to, ayId);
            await supabase.from('tryouts').update(fallbackPayload).eq('id', existingId);
          }
        }
      } else {
        const { error } = await supabase.from('tryouts').insert(payload);
        if (error) {
          this.log('syncTryout insert error: ' + error.message, 'warn');
          if (error.message.includes('column') || error.code === '42703' || error.code === 'PGRST204') {
            const fallbackPayload = toSupabaseTryoutCoreOnly(to, ayId);
            await supabase.from('tryouts').insert(fallbackPayload);
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('syncTryout exception: ' + msg, 'warn');
    }
  }

  public async removeTryout(id?: string, code?: string): Promise<void> {
    if (!this.isAvailable() || !supabase) return;
    try {
      let targetId = id && isValidUuid(id) ? id : null;
      if (!targetId && code) {
        const { data } = await supabase.from('tryouts').select('id').ilike('code', code.trim()).maybeSingle();
        if (data?.id) targetId = data.id;
      }

      if (targetId) {
        // Hapus entitas relasi anak terlebih dahulu agar foreign key cascade bersih
        await supabase.from('scores').delete().eq('tryout_id', targetId);
        await supabase.from('responses').delete().eq('tryout_id', targetId);
        await supabase.from('answers').delete().eq('tryout_id', targetId);
        await supabase.from('tryout_questions').delete().eq('tryout_id', targetId);
        await supabase.from('tryout_subjects').delete().eq('tryout_id', targetId);
        const { error } = await supabase.from('tryouts').delete().eq('id', targetId);
        if (error) this.log('removeTryout by id error: ' + error.message, 'warn');
      }

      if (code) {
        await supabase.from('tryouts').delete().ilike('code', code.trim());
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('removeTryout exception: ' + msg, 'warn');
    }
  }

  public async removeTryoutByCode(code: string): Promise<void> {
    return this.removeTryout(undefined, code);
  }

  public async syncResponsesAndScores(
    tryoutId: string,
    responses: Response[],
    scores: Score[]
  ): Promise<void> {
    if (!this.isAvailable() || !supabase) return;
    if (!isValidUuid(tryoutId)) {
      this.log('syncResponsesAndScores: invalid tryoutId: ' + tryoutId, 'warn');
      return;
    }

    try {
      // 1. Ambil pemetaan response dan score secara PARALEL dari Supabase untuk tryout ini
      const cloudRespMap = new Map<string, string>(); // student_id -> response_id
      const cloudScoreMap = new Map<string, string>(); // student_id -> score_id
      const cloudScoreByRespMap = new Map<string, string>(); // response_id -> score_id

      try {
        const [respLookup, scoreLookup] = await Promise.all([
          supabase.from('responses').select('id, student_id').eq('tryout_id', tryoutId),
          supabase.from('scores').select('id, student_id, response_id').eq('tryout_id', tryoutId),
        ]);

        (respLookup.data || []).forEach((cr: any) => {
          if (cr.student_id && cr.id) cloudRespMap.set(String(cr.student_id), String(cr.id));
        });
        (scoreLookup.data || []).forEach((cs: any) => {
          if (cs.student_id && cs.id) cloudScoreMap.set(String(cs.student_id), String(cs.id));
          if (cs.response_id && cs.id) cloudScoreByRespMap.set(String(cs.response_id), String(cs.id));
        });
      } catch (e) {
        // Abaikan fetch error jika tabel masih kosong
      }

      // 2. Susun response payloads:
      // Setiap score (khususnya nilai TO Eksternal) wajib memiliki record di tabel responses
      // untuk memenuhi foreign key constraint PostgreSQL
      const respPayloadsMap = new Map<string, any>(); // student_id -> payload

      // A. Masukkan respons dari parameter responses
      responses.forEach(r => {
        if (!isValidUuid(r.studentId) || !isValidUuid(r.tryoutId)) return;
        const resolvedRespId = cloudRespMap.get(r.studentId) || (isValidUuid(r.id) ? r.id : generateUuid());
        r.id = resolvedRespId;
        respPayloadsMap.set(r.studentId, {
          id: resolvedRespId,
          tryout_id: r.tryoutId,
          student_id: r.studentId,
          nisn_input: r.nisnInput || 'EXTERNAL',
          raw_score_gform: r.rawScoreGForm || 0,
          submitted_at: r.submittedAt || new Date().toISOString(),
        });
      });

      // B. Untuk setiap score yang belum memiliki response, buatkan response record
      scores.forEach(sc => {
        if (!isValidUuid(sc.studentId) || !isValidUuid(sc.tryoutId)) return;
        let assignedRespId = cloudRespMap.get(sc.studentId) || respPayloadsMap.get(sc.studentId)?.id;
        if (!assignedRespId) {
          if (sc.responseId && isValidUuid(sc.responseId)) {
            assignedRespId = sc.responseId;
          } else {
            assignedRespId = generateUuid();
          }
        }
        sc.responseId = assignedRespId;

        if (!respPayloadsMap.has(sc.studentId)) {
          respPayloadsMap.set(sc.studentId, {
            id: assignedRespId,
            tryout_id: sc.tryoutId,
            student_id: sc.studentId,
            nisn_input: 'EXTERNAL',
            raw_score_gform: sc.calculatedScore || 0,
            submitted_at: sc.createdAt || new Date().toISOString(),
          });
        }
      });

      const respPayloadList = Array.from(respPayloadsMap.values());
      if (respPayloadList.length > 0) {
        for (let i = 0; i < respPayloadList.length; i += 200) {
          const chunk = respPayloadList.slice(i, i + 200);
          const { data: upsertedResps, error: rErr } = await supabase
            .from('responses')
            .upsert(chunk, { onConflict: 'tryout_id,student_id' })
            .select('id, student_id');
          if (!rErr && upsertedResps) {
            upsertedResps.forEach((cr: any) => {
              if (cr.student_id && cr.id) cloudRespMap.set(String(cr.student_id), String(cr.id));
            });
          } else if (rErr) {
            const { data: upsertedById, error: rErr2 } = await supabase
              .from('responses')
              .upsert(chunk, { onConflict: 'id' })
              .select('id, student_id');
            if (!rErr2 && upsertedById) {
              upsertedById.forEach((cr: any) => {
                if (cr.student_id && cr.id) cloudRespMap.set(String(cr.student_id), String(cr.id));
              });
            } else if (rErr2) {
              this.log('syncResponses error: ' + rErr2.message, 'warn');
            }
          }
        }
      }

      // 3. Susun score payloads (deduplikasi per student_id) dan sinkronkan ke tabel scores
      if (scores.length > 0) {
        const dedupedScoreMap = new Map<string, any>();
        scores
          .filter(s => isValidUuid(s.tryoutId) && isValidUuid(s.studentId))
          .forEach(s => {
            const resolvedResponseId =
              cloudRespMap.get(s.studentId) ||
              respPayloadsMap.get(s.studentId)?.id ||
              (s.responseId && isValidUuid(s.responseId) ? s.responseId : null);

            if (!resolvedResponseId) return;
            s.responseId = resolvedResponseId;

            const resolvedScoreId =
              cloudScoreByRespMap.get(resolvedResponseId) ||
              cloudScoreMap.get(s.studentId) ||
              (isValidUuid(s.id) ? s.id : generateUuid());
            s.id = resolvedScoreId;

            dedupedScoreMap.set(s.studentId, {
              id: resolvedScoreId,
              response_id: resolvedResponseId,
              student_id: s.studentId,
              tryout_id: s.tryoutId,
              subject_scores: s.subjectScores || {},
              google_form_score: s.googleFormScore !== undefined ? s.googleFormScore : 0,
              calculated_score: s.calculatedScore || 0,
              score_difference: s.scoreDifference !== undefined ? s.scoreDifference : 0,
              scoring_status: s.scoringStatus || 'MATCH',
              total_correct: s.totalCorrect || 0,
              total_incorrect: s.totalIncorrect || 0,
              total_unanswered: s.totalUnanswered || 0,
              created_at: s.createdAt || new Date().toISOString(),
            });
          });

        const scorePayloads = Array.from(dedupedScoreMap.values());
        if (scorePayloads.length > 0) {
          for (let i = 0; i < scorePayloads.length; i += 200) {
            const chunk = scorePayloads.slice(i, i + 200);
            const { error: sErr } = await supabase
              .from('scores')
              .upsert(chunk, { onConflict: 'id' });
            if (sErr) {
              this.log('syncScores upsert by id: ' + sErr.message + ', retrying onConflict response_id', 'warn');
              const { error: sErr2 } = await supabase
                .from('scores')
                .upsert(chunk, { onConflict: 'response_id' });
              if (sErr2) {
                // Fallback terakhir: hapus skor lama pada tryout & student_id terkait lalu insert bersih
                const studentIdsInChunk = chunk.map((c: any) => c.student_id);
                await supabase
                  .from('scores')
                  .delete()
                  .eq('tryout_id', tryoutId)
                  .in('student_id', studentIdsInChunk);
                const { error: sErr3 } = await supabase.from('scores').insert(chunk);
                if (sErr3) {
                  this.log('syncScores critical error: ' + sErr3.message, 'warn');
                  throw new Error('Gagal menyimpan nilai ke Supabase: ' + sErr3.message);
                }
              }
            }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('syncResponsesAndScores exception: ' + msg, 'warn');
      throw err;
    }
  }

  public async syncMaterial(m: Material): Promise<string | null> {
    if (!this.isAvailable() || !supabase) return null;
    try {
      const payload = toSupabaseMaterial(m);
      const { data, error } = await supabase
        .from('materials')
        .upsert(payload, { onConflict: 'id' })
        .select('id')
        .maybeSingle();
      if (error) {
        this.log('syncMaterial error: ' + error.message, 'warn');
        return null;
      }
      return data?.id ? String(data.id) : null;
    } catch (err: unknown) {
      this.log('syncMaterial exception: ' + String(err), 'warn');
      return null;
    }
  }

  public async syncCompetency(c: Competency): Promise<string | null> {
    if (!this.isAvailable() || !supabase) return null;
    try {
      const payload = toSupabaseCompetency(c);
      const { data, error } = await supabase
        .from('competencies')
        .upsert(payload, { onConflict: 'id' })
        .select('id')
        .maybeSingle();
      if (error) {
        this.log('syncCompetency error: ' + error.message, 'warn');
        return null;
      }
      return data?.id ? String(data.id) : null;
    } catch (err: unknown) {
      this.log('syncCompetency exception: ' + String(err), 'warn');
      return null;
    }
  }

  public async syncQuestionsBatch(questions: Question[]): Promise<void> {
    if (!this.isAvailable() || !supabase || questions.length === 0) return;
    try {
      const validQuestions = questions.filter(q => q.uniqueCode && q.subjectId && isValidUuid(q.subjectId));
      if (validQuestions.length === 0) return;

      // Pastikan setiap subjectId memiliki material_id & competency_id UUID yang valid di Supabase (karena kolom NOT NULL)
      const subjectIds = Array.from(new Set(validQuestions.map(q => q.subjectId)));
      const fallbackMaterialBySubject = new Map<string, string>();
      const fallbackCompetencyBySubject = new Map<string, string>();

      for (const subjId of subjectIds) {
        const { data: matRows } = await supabase
          .from('materials')
          .select('id')
          .eq('subject_id', subjId)
          .limit(1);
        if (matRows && matRows.length > 0 && matRows[0].id) {
          fallbackMaterialBySubject.set(subjId, String(matRows[0].id));
        } else {
          const { data: createdMat } = await supabase
            .from('materials')
            .upsert(
              {
                subject_id: subjId,
                code: `MAT-${subjId.slice(0, 4).toUpperCase()}-01`,
                title: 'Materi Pokok Umum',
                description: 'Materi dasar mata pelajaran',
              },
              { onConflict: 'subject_id,code' }
            )
            .select('id')
            .single();
          if (createdMat?.id) {
            fallbackMaterialBySubject.set(subjId, String(createdMat.id));
          }
        }

        const { data: compRows } = await supabase
          .from('competencies')
          .select('id')
          .eq('subject_id', subjId)
          .limit(1);
        if (compRows && compRows.length > 0 && compRows[0].id) {
          fallbackCompetencyBySubject.set(subjId, String(compRows[0].id));
        } else {
          const { data: createdComp } = await supabase
            .from('competencies')
            .upsert(
              {
                subject_id: subjId,
                code: 'KD-3.1',
                statement: 'Memahami dan menguasai konsep dasar mata pelajaran',
                grade_level: 'XII',
              },
              { onConflict: 'subject_id,code' }
            )
            .select('id')
            .single();
          if (createdComp?.id) {
            fallbackCompetencyBySubject.set(subjId, String(createdComp.id));
          }
        }
      }

      // Selaraskan ID soal dengan yang sudah ada di Supabase berdasarkan unique_code agar foreign key answers.question_id selalu cocok
      const uniqueCodes = validQuestions.map(q => q.uniqueCode.trim());
      const existingIdByCode = new Map<string, string>();
      for (let i = 0; i < uniqueCodes.length; i += 100) {
        const codeChunk = uniqueCodes.slice(i, i + 100);
        const { data: existingRows } = await supabase
          .from('questions')
          .select('id, unique_code')
          .in('unique_code', codeChunk);
        if (existingRows) {
          for (const r of existingRows as Array<{ id: string; unique_code: string }>) {
            existingIdByCode.set(String(r.unique_code).trim(), String(r.id));
          }
        }
      }

      const payloads = validQuestions
        .map(q => {
          const canonicalId = existingIdByCode.get(q.uniqueCode.trim());
          if (canonicalId) {
            q.id = canonicalId;
          }
          const matId = isValidUuid(q.materialId) ? q.materialId : (fallbackMaterialBySubject.get(q.subjectId) || '');
          const compId = isValidUuid(q.competencyId) ? q.competencyId : (fallbackCompetencyBySubject.get(q.subjectId) || '');
          if (matId) q.materialId = matId;
          if (compId) q.competencyId = compId;
          return toSupabaseQuestion(q);
        })
        .filter(p => Boolean(p.material_id && p.competency_id));

      if (payloads.length === 0) return;

      for (let i = 0; i < payloads.length; i += 100) {
        const chunk = payloads.slice(i, i + 100);
        const { error } = await supabase
          .from('questions')
          .upsert(chunk, { onConflict: 'unique_code' });
        if (error) this.log('syncQuestionsBatch error: ' + error.message, 'warn');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('syncQuestionsBatch exception: ' + msg, 'warn');
    }
  }

  public async removeQuestionsBatch(ids: string[]): Promise<void> {
    if (!this.isAvailable() || !supabase || ids.length === 0) return;
    try {
      const validUuids = ids.filter(isValidUuid);
      if (validUuids.length === 0) return;
      const { error } = await supabase
        .from('questions')
        .delete()
        .in('id', validUuids);
      if (error) this.log('removeQuestionsBatch error: ' + error.message, 'warn');
    } catch (err: unknown) {
      this.log('removeQuestionsBatch exception: ' + String(err), 'warn');
    }
  }

  public async syncAnswersBatch(answers: Answer[]): Promise<void> {
    if (!this.isAvailable() || !supabase || answers.length === 0) return;
    try {
      const validAnswers = answers.filter(
        a => isValidUuid(a.responseId) && isValidUuid(a.studentId) && isValidUuid(a.tryoutId) && isValidUuid(a.questionId)
      );
      if (validAnswers.length === 0) return;

      // 1. Deduplikasi di memori berdasarkan (tryoutId, studentId, questionId)
      const dedupedByKey = new Map<string, Answer>();
      validAnswers.forEach(a => {
        dedupedByKey.set(`${a.tryoutId}_${a.studentId}_${a.questionId}`, a);
      });
      const uniqueAnswers = Array.from(dedupedByKey.values());

      // 2. Selaraskan ID dengan baris yang sudah ada di Supabase & bersihkan duplikat lama jika ada
      const tryoutIds = Array.from(new Set(uniqueAnswers.map(a => a.tryoutId)));
      const existingIdByComposite = new Map<string, string>();
      const duplicateIdsToDelete: string[] = [];

      for (const toId of tryoutIds) {
        let from = 0;
        const pageSize = 1000;
        for (let page = 0; page < 100; page++) {
          const { data, error } = await supabase
            .from('answers')
            .select('id, student_id, question_id')
            .eq('tryout_id', toId)
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);
          if (error || !data || data.length === 0) break;
          for (const row of data as Array<{ id: string; student_id: string; question_id: string }>) {
            const compKey = `${toId}_${row.student_id}_${row.question_id}`;
            if (!existingIdByComposite.has(compKey)) {
              existingIdByComposite.set(compKey, String(row.id));
            } else {
              duplicateIdsToDelete.push(String(row.id));
            }
          }
          if (data.length < pageSize) break;
          from += pageSize;
        }
      }

      if (duplicateIdsToDelete.length > 0) {
        for (let i = 0; i < duplicateIdsToDelete.length; i += 200) {
          const delChunk = duplicateIdsToDelete.slice(i, i + 200);
          await supabase.from('answers').delete().in('id', delChunk);
        }
      }

      const payloads = uniqueAnswers.map(a => {
        const compKey = `${a.tryoutId}_${a.studentId}_${a.questionId}`;
        const canonicalId = existingIdByComposite.get(compKey);
        if (canonicalId) {
          a.id = canonicalId;
        }
        return toSupabaseAnswer(a);
      });

      for (let i = 0; i < payloads.length; i += 200) {
        const chunk = payloads.slice(i, i + 200);
        const { error } = await supabase
          .from('answers')
          .upsert(chunk, { onConflict: 'id' });
        if (error) this.log('syncAnswersBatch error: ' + error.message, 'warn');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('syncAnswersBatch exception: ' + msg, 'warn');
    }
  }
  // ----------------------------------------------------------
  // DELETE METHODS
  // ----------------------------------------------------------

  public async removeTeacherByNip(nip: string): Promise<void> {
    if (!this.isAvailable() || !supabase) return;
    try {
      const { error } = await supabase
        .from('teachers')
        .delete()
        .eq('nip', nip.trim());
      if (error) this.log('removeTeacherByNip error: ' + error.message, 'warn');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('removeTeacherByNip exception: ' + msg, 'warn');
    }
  }

  public async removeTeachersBatchByNip(nips: string[]): Promise<void> {
    if (!this.isAvailable() || !supabase || !nips.length) return;
    try {
      const cleanNips = nips.map(n => n.trim()).filter(Boolean);
      const { error } = await supabase.from('teachers').delete().in('nip', cleanNips);
      if (error) this.log('removeTeachersBatchByNip error: ' + error.message, 'warn');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('removeTeachersBatchByNip exception: ' + msg, 'warn');
    }
  }

  public async removeStudentByNisn(nisn: string): Promise<void> {
    if (!this.isAvailable() || !supabase) return;
    try {
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('nisn', nisn.trim());
      if (error) this.log('removeStudentByNisn error: ' + error.message, 'warn');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('removeStudentByNisn exception: ' + msg, 'warn');
    }
  }

  public async removeStudentsBatchByNisn(nisns: string[]): Promise<void> {
    if (!this.isAvailable() || !supabase || !nisns.length) return;
    try {
      const cleanNisns = nisns.map(n => n.trim()).filter(Boolean);
      const { error } = await supabase
        .from('students')
        .delete()
        .in('nisn', cleanNisns);
      if (error) this.log('removeStudentsBatchByNisn error: ' + error.message, 'warn');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('removeStudentsBatchByNisn exception: ' + msg, 'warn');
    }
  }

  public async removeSubjectByCode(code: string): Promise<void> {
    if (!this.isAvailable() || !supabase || !code.trim()) return;
    await this.removeSubjectsBatchByCode([code.trim()]);
  }

  public async removeSubjectsBatchByCode(codes: string[]): Promise<void> {
    if (!this.isAvailable() || !supabase || !codes.length) return;
    try {
      const cleanCodes = codes.map(c => c.trim()).filter(Boolean);
      const { data: foundSubjects } = await supabase
        .from('subjects')
        .select('id, code')
        .in('code', cleanCodes);

      const subjectIds = (foundSubjects || []).map((r: any) => String(r.id)).filter(isValidUuid);
      if (subjectIds.length > 0) {
        // Bersihkan entitas anak yang memiliki constraint ON DELETE RESTRICT terlebih dahulu
        await supabase.from('questions').delete().in('subject_id', subjectIds);
        await supabase.from('materials').delete().in('subject_id', subjectIds);
        await supabase.from('competencies').delete().in('subject_id', subjectIds);
        await supabase.from('exam_package_subjects').delete().in('subject_id', subjectIds);
        await supabase.from('teacher_subjects').delete().in('subject_id', subjectIds);
        await supabase.from('tryout_subjects').delete().in('subject_id', subjectIds);
        await supabase.from('tryouts').update({ subject_id: null }).in('subject_id', subjectIds);
      }

      const { error } = await supabase.from('subjects').delete().in('code', cleanCodes);
      if (error) this.log('removeSubjectsBatchByCode error: ' + error.message, 'warn');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('removeSubjectsBatchByCode exception: ' + msg, 'warn');
    }
  }

  public async removeClassByName(name: string): Promise<void> {
    if (!this.isAvailable() || !supabase) return;
    try {
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('name', name.trim());
      if (error) this.log('removeClassByName error: ' + error.message, 'warn');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('removeClassByName exception: ' + msg, 'warn');
    }
  }

  public async removeClassesBatch(ids: string[]): Promise<void> {
    if (!this.isAvailable() || !supabase || !ids.length) return;
    try {
      const uuids = ids.map(id => this.classIdMap.get(id) || id).filter(isValidUuid);
      if (uuids.length) {
        const { error } = await supabase.from('classes').delete().in('id', uuids);
        if (error) this.log('removeClassesBatch error: ' + error.message, 'warn');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('removeClassesBatch exception: ' + msg, 'warn');
    }
  }

  public async fetchSchoolProfile(): Promise<SchoolProfile | null> {
    if (!this.isAvailable() || !supabase) return null;
    try {
      const { data, error } = await supabase
        .from('school_profile')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        this.log('fetchSchoolProfile error: ' + error.message, 'warn');
        return null;
      }
      return data ? fromSupabaseSchoolProfile(data as Record<string, unknown>) : null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('fetchSchoolProfile exception: ' + msg, 'warn');
      return null;
    }
  }

  public async syncSchoolProfile(sp: SchoolProfile): Promise<void> {
    if (!this.isAvailable() || !supabase) return;
    try {
      const payload = toSupabaseSchoolProfile(sp);
      const { error } = await supabase
        .from('school_profile')
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        // Fallback jika kolom logo_url belum ditambahkan di SQL Supabase oleh admin
        if (error.message && error.message.includes('logo_url')) {
          this.log('Kolom logo_url belum ada di tabel school_profile Supabase. Mencoba upsert tanpa kolom logo_url...', 'warn');
          const fallbackPayload = { ...payload };
          delete fallbackPayload.logo_url;
          const { error: fallbackError } = await supabase
            .from('school_profile')
            .upsert(fallbackPayload, { onConflict: 'id' });
          if (fallbackError) {
            this.log('syncSchoolProfile fallback error: ' + fallbackError.message, 'warn');
          }
        } else {
          this.log('syncSchoolProfile error: ' + error.message, 'warn');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('syncSchoolProfile exception: ' + msg, 'warn');
    }
  }

  public async fetchExplanations(): Promise<Explanation[]> {
    if (!this.isAvailable() || !supabase) return [];
    try {
      const { data, error } = await supabase.from('explanations').select('*');
      if (error) {
        this.log('fetchExplanations error: ' + error.message, 'warn');
        return [];
      }
      return (data || []).map((row: any) => fromSupabaseExplanation(row));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('fetchExplanations exception: ' + msg, 'warn');
      return [];
    }
  }

  public async syncExplanation(exp: Explanation): Promise<void> {
    if (!this.isAvailable() || !supabase) return;
    try {
      // 1. Resolve tryout_id to valid Supabase UUID without crashing PostgREST
      let resolvedTryoutId = exp.tryoutId;
      if (!isValidUuid(resolvedTryoutId)) {
        const cleanCode = (exp.tryoutId || '').trim();
        const { data: toByCode } = await supabase
          .from('tryouts')
          .select('id, code, title')
          .ilike('code', cleanCode)
          .maybeSingle();

        if (toByCode?.id) {
          resolvedTryoutId = toByCode.id;
        } else {
          // Fetch tryouts list to match by code, title, or index
          const { data: allTo } = await supabase.from('tryouts').select('id, code, title');
          if (allTo && allTo.length > 0) {
            const cleanLower = cleanCode.toLowerCase();
            const matched = allTo.find(t =>
              t.id === cleanCode ||
              (t.code && t.code.toLowerCase().trim() === cleanLower) ||
              (t.title && t.title.toLowerCase().trim() === cleanLower)
            );
            if (matched) {
              resolvedTryoutId = matched.id;
            } else {
              const numMatch = cleanCode.match(/\d+/);
              if (numMatch) {
                const targetIdx = parseInt(numMatch[0], 10) - 1;
                if (allTo[targetIdx]) {
                  resolvedTryoutId = allTo[targetIdx].id;
                }
              }
              if (!isValidUuid(resolvedTryoutId)) {
                resolvedTryoutId = allTo[0].id;
              }
            }
          }
        }
      }

      if (!isValidUuid(resolvedTryoutId)) {
        this.log(`syncExplanation: Tryout ID '${exp.tryoutId}' tidak valid untuk cloud UUID, lewati sync Supabase`, 'warn');
        return;
      }

      // Update in-memory / local tryoutId to resolved UUID so they always match
      exp.tryoutId = resolvedTryoutId;

      // 1b. Resolve subject_id to valid Supabase UUID if needed
      let resolvedSubjectId = exp.subjectId;
      if (resolvedSubjectId && !isValidUuid(resolvedSubjectId)) {
        const cleanSubj = resolvedSubjectId.trim().toLowerCase();
        const { data: allSubj } = await supabase.from('subjects').select('id, code, name');
        if (allSubj && allSubj.length > 0) {
          const matchedSubj = allSubj.find(s =>
            (s.code && s.code.toLowerCase().trim() === cleanSubj) ||
            (s.name && s.name.toLowerCase().trim() === cleanSubj) ||
            cleanSubj.includes((s.code || '').toLowerCase().trim())
          );
          if (matchedSubj) {
            resolvedSubjectId = matchedSubj.id;
            exp.subjectId = resolvedSubjectId;
          }
        }
      }

      // 2. Ensure id is valid UUID
      let targetId = isValidUuid(exp.id) ? exp.id : null;
      if (!targetId) {
        targetId = generateUuid();
        exp.id = targetId;
      }

      const payload = toSupabaseExplanation({
        ...exp,
        id: targetId,
        tryoutId: resolvedTryoutId,
        subjectId: resolvedSubjectId,
      });

      const { error } = await supabase
        .from('explanations')
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        this.log('syncExplanation upsert error: ' + error.message, 'warn');
        // Fallback jika kolom question_numbers belum ada di SQL Supabase
        if (error.message && (error.message.includes('question_numbers') || error.message.includes('question_ids'))) {
          const fallbackPayload = { ...payload };
          delete fallbackPayload.question_numbers;
          delete fallbackPayload.question_ids;
          const { error: fbErr } = await supabase.from('explanations').upsert(fallbackPayload, { onConflict: 'id' });
          if (fbErr) this.log('syncExplanation fallback error: ' + fbErr.message, 'warn');
        }
      } else {
        this.log(`Pembahasan '${exp.title}' berhasil disinkronkan ke Supabase Cloud`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('syncExplanation exception: ' + msg, 'warn');
    }
  }

  public async removeExplanation(id: string): Promise<void> {
    if (!this.isAvailable() || !supabase || !id) return;
    try {
      if (isValidUuid(id)) {
        const { error } = await supabase.from('explanations').delete().eq('id', id);
        if (error) this.log('removeExplanation error: ' + error.message, 'warn');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('removeExplanation exception: ' + msg, 'warn');
    }
  }

  // ----------------------------------------------------------
  // REALTIME: Subscribe to changes from other devices
  // ----------------------------------------------------------

  /**
   * Subscribe ke Supabase Realtime untuk tabel-tabel inti.
   * Callback `onchange` dipanggil saat ada INSERT/UPDATE/DELETE dari perangkat lain.
   * @returns channel object (gunakan di unsubscribe() saat cleanup)
   */
  public subscribeToChanges(onchange: () => void): unknown {
    if (!this.isAvailable() || !supabase) return null;

    const TABLES = [
      'teachers', 'students', 'classes', 'subjects', 'academic_years', 'users',
      'exam_packages', 'exam_package_subjects', 'tryouts', 'responses', 'scores', 'school_profile',
      'questions', 'answers', 'materials', 'competencies', 'explanations'
    ];
    const channel = (supabase as any).channel('db-realtime-sync');

    TABLES.forEach((table: string) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (_payload: unknown) => { onchange(); }
      );
    });

    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        console.info('[SupabaseDB] Realtime aktif — perubahan dari perangkat lain disinkronkan otomatis.');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[SupabaseDB] Realtime error/timeout, fallback ke polling 30s.');
      }
    });

    return channel;
  }

  /**
   * Unsubscribe dari Realtime channel untuk cleanup.
   */
  public unsubscribe(channel: unknown): void {
    if (channel && supabase) {
      (supabase as any).removeChannel(channel).catch(() => {});
    }
  }

  // ----------------------------------------------------------
  // BULK EXPORT: Push all local state to Supabase
  // Called from Settings panel "Sync to Cloud" button
  // ----------------------------------------------------------
  public async exportAllToSupabase(state: {
    users: User[];
    teachers: Teacher[];
    students: Student[];
    classes: ClassRoom[];
    academicYears: AcademicYear[];
    subjects: Subject[];
    materials?: Material[];
    competencies?: Competency[];
    questions?: Question[];
    answers?: Answer[];
    examPackages?: ExamPackage[];
    tryouts?: Tryout[];
    schoolProfile?: SchoolProfile;
    responses?: Response[];
    scores?: Score[];
    explanations?: Explanation[];
  }): Promise<{ success: number; failed: number; errors: string[] }> {
    if (!this.isAvailable() || !supabase) {
      return { success: 0, failed: 0, errors: ['Supabase tidak terkonfigurasi.'] };
    }

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const attempt = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
        success++;
      } catch (err: unknown) {
        failed++;
        errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    // 1. Academic Years
    for (const ay of state.academicYears) {
      await attempt(`AcademicYear ${ay.yearLabel}`, () => this.syncAcademicYear(ay));
    }

    // 2. Subjects (batch upsert)
    if (state.subjects.length > 0) {
      await attempt(`Subjects (${state.subjects.length})`, async () => {
        const subjPayloads = state.subjects.map(toSupabaseSubject);
        const { error } = await supabase!.from('subjects').upsert(subjPayloads, { onConflict: 'code' });
        if (error) throw new Error(error.message);
      });
    }

    // 3. Classes — sync and build class map
    const localClassMap = new Map<string, string>();
    for (const c of state.classes) {
      await attempt(`Class ${c.name}`, async () => {
        const classUuid = await this.syncClass(c);
        if (classUuid) {
          localClassMap.set(c.id, classUuid);
          localClassMap.set(c.name.trim().toLowerCase(), classUuid);
        }
      });
    }

    // 4. Users + Teachers (paired)
    for (const t of state.teachers) {
      const user = state.users.find(u => u.id === t.userId || u.email.toLowerCase() === (t.email || '').toLowerCase());
      await attempt(`Teacher ${t.nip}`, async () => { await this.syncTeacher(t, user); });
    }

    // 4b. Re-link homeroom between classes and teachers in Supabase
    for (const c of state.classes) {
      if (c.homeRoomTeacherId) {
        const classUuid = localClassMap.get(c.id) || localClassMap.get(c.name.trim().toLowerCase());
        const teacherUuid = await this.resolveTeacherId(c.homeRoomTeacherId);
        if (classUuid && teacherUuid) {
          await supabase.from('classes').update({ home_room_teacher_id: teacherUuid }).eq('id', classUuid);
          await supabase.from('teachers').update({ is_wali_kelas: true, home_room_class_id: classUuid }).eq('id', teacherUuid);
        }
      }
    }

    // 5. Students — batch upsert dalam chunk 200 (jauh lebih cepat dibanding satu-per-satu)
    if (state.students.length > 0) {
      const studentPayloads = state.students
        .map(s => {
          const classRef = state.classes.find(c => c.id === s.classId);
          const resolvedClassId = localClassMap.get(s.classId) ||
                                  (classRef ? localClassMap.get(classRef.name.trim().toLowerCase()) : undefined) ||
                                  s.classId;
          if (!resolvedClassId || !isValidUuid(resolvedClassId)) return null;
          return toSupabaseStudent(s, resolvedClassId);
        })
        .filter(Boolean) as Record<string, unknown>[];

      for (let i = 0; i < studentPayloads.length; i += 200) {
        const chunk = studentPayloads.slice(i, i + 200);
        await attempt(`Students batch ${i + 1}-${i + chunk.length}`, async () => {
          let { error } = await supabase!.from('students').upsert(chunk, { onConflict: 'nisn' });
          if (error && (error.message?.includes('is_answer_key_account') || (error as any).details?.includes('is_answer_key_account'))) {
            const fallbackChunk = chunk.map(p => {
              const copy = { ...p };
              delete copy.is_answer_key_account;
              return copy;
            });
            const retry = await supabase!.from('students').upsert(fallbackChunk, { onConflict: 'nisn' });
            error = retry.error;
          }
          if (error) throw new Error(error.message);
        });
      }
    }

    // 6. Exam Packages (jika ada)
    if (state.examPackages && state.examPackages.length > 0) {
      for (const pkg of state.examPackages) {
        await attempt(`ExamPackage ${pkg.code}`, () => this.syncExamPackage(pkg));
      }
    }

    // 7. Tryouts (jika ada)
    if (state.tryouts && state.tryouts.length > 0) {
      for (const to of state.tryouts) {
        await attempt(`Tryout ${to.code}`, () => this.syncTryout(to));
      }
    }

    // 7b. Responses & Scores (jika ada, termasuk nilai TO Eksternal)
    if (state.tryouts && state.tryouts.length > 0) {
      for (const to of state.tryouts) {
        const toResponses = (state.responses || []).filter(r => r.tryoutId === to.id);
        const toScores = (state.scores || []).filter(s => s.tryoutId === to.id);
        if (toResponses.length > 0 || toScores.length > 0) {
          await attempt(`Responses/Scores ${to.code}`, () =>
            this.syncResponsesAndScores(to.id, toResponses, toScores)
          );
        }
      }
    }

    // 7c. Materials & Competencies
    if (state.materials && state.materials.length > 0) {
      for (const m of state.materials) {
        await attempt('Material ' + m.code, async () => { await this.syncMaterial(m); });
      }
    }
    if (state.competencies && state.competencies.length > 0) {
      for (const comp of state.competencies) {
        await attempt('Competency ' + comp.code, async () => { await this.syncCompetency(comp); });
      }
    }

    // 7d. Questions & Answers
    if (state.questions && state.questions.length > 0) {
      await attempt('Questions (' + state.questions.length + ')', () => this.syncQuestionsBatch(state.questions!));
    }
    if (state.answers && state.answers.length > 0) {
      await attempt('Answers (' + state.answers.length + ')', () => this.syncAnswersBatch(state.answers!));
    }

    // 7e. Explanations (Pembahasan Soal)
    if (state.explanations && state.explanations.length > 0) {
      for (const exp of state.explanations) {
        await attempt(`Explanation '${exp.title}'`, () => this.syncExplanation(exp));
      }
    }

    // 8. School Profile (jika ada)
    if (state.schoolProfile) {
      await attempt('SchoolProfile', () => this.syncSchoolProfile(state.schoolProfile!));
    }

    console.info(`[SupabaseDB] Export done: ${success} synced, ${failed} failed`);
    return { success, failed, errors };
  }
}

export const sdb = new SupabaseDbService();
