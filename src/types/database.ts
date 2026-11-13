/**
 * Database Entity Definitions — School Try Out & Assessment Analytics System
 * 21 Core Schema Entities matching PostgreSQL / Supabase specifications
 *
 * PERBAIKAN v1.1.0:
 * - Role: Ditambahkan 'WALI_KELAS' (sinkron dengan kode, perlu juga di database schema)
 * - TryoutStatus: Distandarisasi 5 status (DRAFT|ACTIVE|COMPLETED|ARCHIVED|CLOSED)
 * - QuestionAnalysis: Distandarisasi ke bahasa Indonesia konsisten
 */

export type Role = 'ADMIN' | 'GURU' | 'WALI_KELAS' | 'SISWA';
export type Semester = 'ODD' | 'EVEN';
export type TryoutStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CLOSED' | 'ARCHIVED';
export type ScoringStatus = 'MATCH' | 'SCORING_MISMATCH';
export type ScoringType = 'EQUAL_WEIGHT' | 'CUSTOM_WEIGHT';
export type ExplanationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type ReportType = 'STUDENT_PDF' | 'TEACHER_PDF' | 'EXCEL_SUMMARY';
export type CognitiveLevel = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';
export type QuestionStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';

/** Kategori tingkat kesukaran soal (p-value) */
export type DifficultyCategory =
  | 'SANGAT_MUDAH'  // p > 0.80
  | 'MUDAH'         // 0.60 < p <= 0.80
  | 'SEDANG'        // 0.40 < p <= 0.60
  | 'SULIT'         // 0.20 < p <= 0.40
  | 'SANGAT_SULIT'; // p <= 0.20

/** Kategori daya pembeda soal (D-value) */
export type DiscriminationCategory =
  | 'SANGAT_BAIK'  // D >= 0.40
  | 'BAIK'         // 0.30 <= D < 0.40
  | 'CUKUP'        // 0.20 <= D < 0.30
  | 'BURUK';       // D < 0.20

/** Status informatif analisis soal (untuk UI) - Mendukung Bahasa Indonesia dan Internasional */
export type QuestionInformativeStatus = 'Mudah' | 'Sedang' | 'Sulit' | 'Easy' | 'Medium' | 'Difficult';
export type QuestionDiscriminationStatus =
  | 'Daya Beda Baik'
  | 'Daya Beda Sedang'
  | 'Daya Beda Rendah'
  | 'Good Discrimination'
  | 'Moderate Discrimination'
  | 'Poor Discrimination'
  | 'Low Discrimination';
export type QuestionReviewRecommendation =
  | 'Perlu Ditinjau'
  | 'Valid / Layak Digunakan'
  | 'Needs Review'
  | 'Good / Valid Question';

export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  /** Password hanya ada di mockData untuk demo mode. Tidak pernah disimpan ke localStorage. */
  password?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Teacher {
  id: string;
  userId: string;
  nip: string;
  name: string;
  email?: string;
  phone?: string;
  /** Password hanya ada di mockData untuk demo mode. Tidak pernah disimpan ke localStorage. */
  password?: string;
  subjectPermissions: string[]; // subjectIds
  classPermissions?: string[]; // classIds
  isWaliKelas?: boolean;
  homeRoomClassId?: string; // classId e.g. 'c-xii-ipa1'
}

export interface Student {
  id: string;
  userId?: string;
  nisn: string;
  nis?: string;
  name: string;
  gender: 'L' | 'P';
  classId: string;
  birthDate?: string; // Format YYYY-MM-DD, e.g. '2008-05-14'
  email?: string;
  phone?: string;
  targetScore?: number;
  /** Menandakan akun khusus ini digunakan oleh Guru sebagai Kunci Jawaban resmi (dikecualikan dari statistik & rapor) */
  isAnswerKeyAccount?: boolean;
}

export interface ClassRoom {
  id: string;
  name: string;
  /**
   * Tingkatan kelas. Mendukung semua jenjang:
   * - SD: '1', '2', '3', '4', '5', '6'
   * - SMP: '7', '8', '9'
   * - SMA/SMK: '10' (atau 'X'), '11' (atau 'XI'), '12' (atau 'XII')
   * Disimpan sebagai string fleksibel.
   */
  gradeLevel: string;
  academicYearId: string;
  homeRoomTeacherId?: string;
}

export interface StudentClass {
  id: string;
  studentId: string;
  classId: string;
  academicYearId: string;
}

export interface AcademicYear {
  id: string;
  yearLabel: string; // e.g. "2025/2026"
  semester: Semester;
  isActive: boolean;
}

export interface Subject {
  id: string;
  code: string; // e.g. "MAT", "FIS", "BIN"
  name: string; // e.g. "Matematika", "Fisika"
  category: 'WAJIB' | 'PEMINATAN' | 'VOKASI';
  passingGrade?: number; // KKM / KKTP
}

export interface TeacherSubject {
  id: string;
  teacherId: string;
  subjectId: string;
  classId: string;
}

export interface Material {
  id: string;
  subjectId: string;
  code: string; // e.g. "MAT-01"
  title: string;
  description: string;
  googleFormUrl?: string;
}

export interface Competency {
  id: string;
  subjectId: string;
  code: string; // e.g. "KD-3.1"
  statement: string;
  gradeLevel: string; // Fleksibel: '1'-'6' (SD), '7'-'9' (SMP), '10'/'X' - '12'/'XII' (SMA)
}

export type AssessmentType = 'TRYOUT' | 'SAS' | 'SAT';

export interface ScoringConfig {
  scoreSource?: 'GOOGLE_FORM' | 'CUSTOM_ENGINE';
  scoringType: ScoringType;
  maxScore: number;
  correctScore: number;
  wrongScore: number;
  unansweredScore: number;
  allowNegativeMarking: boolean;
  hasEssay?: boolean;
  essayWeightPercent?: number;
  passingGrade?: number;
}

export interface ExamPackageSubject {
  id: string;
  packageId: string;
  subjectId: string;
  teacherId?: string;
  googleFormUrl?: string;
  googleSheetUrl?: string;
  answerKey?: string[];
  totalQuestions: number;
  durationMinutes?: number;
  passingGrade: number;
  syncStatus?: 'PENDING' | 'SYNCED' | 'ERROR';
  lastUpdatedBy?: string;
  updatedAt?: string;
}

export interface ExamPackage {
  id: string;
  code: string;
  title: string;
  assessmentType: AssessmentType;
  academicYearId: string;
  targetGrades: string[]; // e.g. ['7', '8', '9'] or ['X', 'XI', 'XII']
  targetClassIds: string[]; // e.g. ['cls-9a', 'cls-9b']
  startDate: string;
  endDate: string;
  status: TryoutStatus;
  description?: string;
  subjects: ExamPackageSubject[];
  createdAt?: string;
  updatedAt?: string;
}

export interface DuplicateSubmissionInfo {
  nisn: string;
  studentName: string;
  className?: string;
  submissionCount: number;
  selectedRowNumber: number;
  skippedRowNumbers: number[];
}

export interface Tryout {
  id: string;
  code: string; // e.g. "TO-2026-01"
  title: string;
  assessmentType?: AssessmentType;
  academicYearId: string;
  startDate: string;
  endDate: string;
  scoringConfig: ScoringConfig;
  status: TryoutStatus;
  description?: string;
  googleFormUrl?: string;
  googleSheetUrl?: string;
  /** Kunci jawaban per nomor soal. Index 0 = Soal no.1. Nilai: 'A'|'B'|'C'|'D'|'E'|'' */
  answerKey?: string[];
  packageId?: string;
  /** Kelompok siklus Try Out yang dikontrol guru mapel (contoh: 'TO 1', 'TO 2', 'TO 3', atau 'NONE') */
  tryoutGroup?: string;
  targetClassIds?: string[];
  /** Mata pelajaran acuan untuk Try Out internal (Google Form) */
  subjectId?: string;
  /** Daftar judul kolom Google Sheet yang dipilih guru untuk dianalisis sebagai butir soal */
  selectedQuestionColumns?: string[];
  /** Menandakan Try Out diselenggarakan oleh pihak eksternal (rekap nilai, bukan butir soal) */
  isExternal?: boolean;
  source?: 'INTERNAL' | 'EXTERNAL';
  /** Daftar nama atau kode mata pelajaran/subtes untuk Try Out eksternal */
  externalSubjects?: string[];
  /** Daftar ID mata pelajaran resmi untuk Try Out eksternal */
  externalSubjectIds?: string[];
  /** Skala penilaian: SCALE_100 (0-100) atau SCALE_UTBK (200-1000) */
  externalScoreScale?: 'SCALE_100' | 'SCALE_UTBK' | 'CUSTOM';
  /** Informasi siswa dengan submisi ganda di sheet (otomatis diambil submisi terakhir) */
  duplicateSubmissions?: DuplicateSubmissionInfo[];
}

export interface TryoutSubject {
  id: string;
  tryoutId: string;
  subjectId: string;
  totalQuestions: number;
  durationMinutes: number;
  passingGrade: number;
  googleFormUrl?: string;
}

export interface QuestionOption {
  key: string; // 'A', 'B', 'C', 'D', 'E'
  text: string;
}

export interface Question {
  id: string;
  uniqueCode: string; // e.g. "MAT-TO03-Q015"
  questionNumber?: number;
  subjectId: string;
  materialId: string;
  competencyId: string;
  questionText: string;
  options: QuestionOption[];
  correctAnswer: string; // 'A', 'B', 'C', 'D', 'E'
  weight: number; // default 1
  cognitiveLevel?: CognitiveLevel;
  status?: QuestionStatus;
}

export interface TryoutQuestion {
  id: string;
  tryoutId: string;
  questionId: string;
  questionOrder: number;
}

export interface GoogleForm {
  id: string;
  tryoutId: string;
  subjectId: string;
  formId: string;
  formUrl: string;
  sheetUrl: string;
  syncStatus: 'SYNCED' | 'PENDING' | 'ERROR';
  lastSyncedAt?: string;
}

export interface Response {
  id: string;
  tryoutId: string;
  studentId: string;
  nisnInput: string;
  rawScoreGForm: number;
  submittedAt: string;
  syncBatchId?: string;
}

export interface Answer {
  id: string;
  responseId: string;
  studentId: string;
  tryoutId: string;
  questionId: string;
  studentAnswer: string; // 'A', 'B', 'C', 'D', 'E' or ''
  correctAnswer: string;
  isCorrect: boolean;
  score: number;
  submittedAt: string;
}

export interface Score {
  id: string;
  responseId?: string;
  studentId: string;
  tryoutId: string;
  subjectScores: Record<string, number>; // subjectId -> score
  googleFormScore?: number;
  calculatedScore: number;
  scoreDifference?: number;
  scoringStatus?: ScoringStatus;
  totalCorrect?: number;
  totalIncorrect?: number;
  totalUnanswered?: number;
  createdAt: string;
}

export interface QuestionAnalysis {
  id: string;
  tryoutId: string;
  questionId: string;
  totalRespondents: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  correctPercentage: number;
  incorrectPercentage: number;
  unansweredPercentage: number;
  /** p-value: jumlah benar / total responden */
  difficultyIndex: number;
  difficultyCategory: DifficultyCategory;
  /** D-value: proporsi kelompok atas - kelompok bawah (27%) */
  discriminationIndex: number;
  discriminationCategory: DiscriminationCategory;
  distractorCounts: Record<string, number>; // 'A': 10, 'B': 25, ...
  distractorPercentages?: Record<string, number>;
  informativeStatus: QuestionInformativeStatus;
  discriminationStatus: QuestionDiscriminationStatus;
  reviewRecommendation: QuestionReviewRecommendation;
  reviewReasons: string[];
}

export interface Explanation {
  id: string;
  tryoutId: string;
  subjectId?: string;
  questionId?: string; // Nullable: pembahasan umum atau spesifik soal (legacy)
  /** Daftar nomor butir soal yang dibahas dalam video/dokumen ini (contoh: [1, 2, 3, 4, 5]) */
  questionNumbers?: number[];
  /** Daftar ID butir soal yang dibahas jika terikat langsung ke UUID Question */
  questionIds?: string[];
  title: string;
  contentText: string;
  pdfUrl?: string;
  pdfStoragePath?: string;
  pdfFileName?: string;
  pdfFileSize?: number;
  youtubeUrl?: string;
  externalUrl?: string;
  status: ExplanationStatus;
  createdBy?: string;
  authorName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Report {
  id: string;
  title: string;
  reportType: ReportType;
  tryoutId: string;
  generatedBy: string;
  filePath: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  role: Role;
  action: string;
  targetEntity: string;
  details: string;
  ipAddress: string;
  timestamp: string;
}

export interface ColumnMappingConfig {
  nisnColumn: string;
  nameColumn?: string;
  classColumn?: string;
  scoreColumn?: string;
  timestampColumn?: string;
  questionMappings: Record<string, string>; // questionUniqueCode -> sheetColumnHeader
}

export type SheetRowStatus =
  | 'VALID'
  | 'WARNING_MISMATCH'
  | 'ERROR_STUDENT_NOT_FOUND'
  | 'ERROR_DUPLICATE_ROW'
  | 'ERROR_MALFORMED_DATA'
  | 'ERROR_INVALID_ANSWER';

export interface SheetImportPreviewItem {
  rowNumber: number;
  nisn: string;
  studentName?: string;
  studentId?: string;
  classId?: string;
  className?: string;
  rawGFormScore: number;
  answers: Record<string, string>; // questionUniqueCode -> option 'A'..'E' or ''
  malformedAnswers?: Record<string, string>;
  calculatedScore: number;
  scoreDifference: number;
  scoringStatus: ScoringStatus;
  isValidStudent: boolean;
  isDuplicateRowInSheet?: boolean;
  isExistingSubmissionInDb?: boolean;
  status: SheetRowStatus;
  validationError?: string;
}

export interface SheetImportSummary {
  totalRows: number;
  successCount: number;
  failedCount: number;
  mismatchCount: number;
  duplicateCount: number;
  errorDetails: string[];
  answerKeyDetected?: boolean;
  answerKeyStudentName?: string;
  answerKeyExtractedCount?: number;
  duplicateSubmissions?: DuplicateSubmissionInfo[];
}

export interface SchoolProfile {
  name: string;
  subHeader: string;
  address: string;
  principalName: string;
  principalNip: string;
  academicYear: string;
  logoUrl?: string;
}

export interface LiveMonitoringConfig {
  isEnabled: boolean;
  targetType: 'EXAM_PACKAGE' | 'TRYOUT_STAGE';
  targetId: string; // packageId or groupKey ('TO 1', 'TO 2', etc.)
  hideScores: boolean;
  lastUpdated?: string;
}

export interface MonitoringSubjectItem {
  id: string;
  name: string;
  code: string;
  tryoutId?: string;
  passingGrade?: number;
  totalStudents: number;
  submittedCount: number;
}

export interface StudentMonitoringItem {
  studentId: string;
  nisn: string;
  name: string;
  gender: 'L' | 'P';
  classId: string;
  className: string;
  gradeLevel: string;
  isSubmitted: boolean;
  submittedAt?: string;
  score?: number;
  passingGrade?: number;
}

export interface LiveMonitoringPayload {
  config: LiveMonitoringConfig;
  title: string;
  subTitle: string;
  targetType: 'EXAM_PACKAGE' | 'TRYOUT_STAGE';
  assessmentType: string;
  subjects: MonitoringSubjectItem[];
  activeSubject?: MonitoringSubjectItem;
  students: StudentMonitoringItem[];
  classes: ClassRoom[];
  gradeLevels: string[];
  summary: {
    totalStudents: number;
    submittedCount: number;
    unsubmittedCount: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
  };
  lastSyncedAt: string;
}



