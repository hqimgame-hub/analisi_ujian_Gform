import {
  User, Teacher, Student, ClassRoom, StudentClass, AcademicYear, Subject,
  TeacherSubject, Material, Competency, Tryout, TryoutSubject, Question,
  TryoutQuestion, GoogleForm, Response, Answer, Score, QuestionAnalysis,
  Explanation, Report, AuditLog, TryoutStatus, ScoringConfig, Role, SchoolProfile,
  ExamPackage, ExamPackageSubject, LiveMonitoringConfig, MonitoringSubjectItem,
  StudentMonitoringItem, LiveMonitoringPayload
} from '../types/database';
import { resolveTryoutGroup } from '../utils/tryoutGroupUtils';
import {
  INITIAL_ACADEMIC_YEARS, INITIAL_USERS, INITIAL_TEACHERS, INITIAL_CLASSES,
  INITIAL_SUBJECTS, INITIAL_TEACHER_SUBJECTS, INITIAL_MATERIALS,
  INITIAL_COMPETENCIES, INITIAL_STUDENTS, INITIAL_TRYOUTS,
  INITIAL_TRYOUT_SUBJECTS, INITIAL_QUESTIONS, INITIAL_TRYOUT_QUESTIONS,
  INITIAL_EXPLANATIONS, INITIAL_RESPONSES, INITIAL_ANSWERS, INITIAL_SCORES, INITIAL_AUDIT_LOGS
} from './mockData';
import { ScoringService, ScoringTestCaseResult } from './scoring';
import {
  AnalyticsService, OverallAnalyticsFilters, OverallAnalyticsResult,
  ClassAnalyticsResult, StudentAnalyticsResult, QuestionAnalysisResult,
  AnalyticsTestSuiteResult
} from './analytics';
import {
  ExplanationService, ExplanationTestSuiteResult
} from './explanation';
import { ExportService, ReportTestSuiteResult } from './export';
import {
  ProgressService, ProgressTestSuiteResult, StudentProgressResult,
  ClassProgressResult, SubjectProgressResult, CompetencyProgressResult
} from './progress';
import {
  ProductionValidationService, ProductionValidationSuiteResult
} from './productionValidation';
import { sdb } from './supabaseDb';
import { generateUuid, isValidUuid } from '../utils/idUtils';

const STORAGE_KEY = 'school_tryout_analytics_db_v1';
const SCHOOL_PROFILE_CACHE_KEY = 'wikan_school_profile_cache_v1';
const DELETED_TRYOUTS_KEY = 'school_tryout_deleted_ids_v1';
const DELETED_PACKAGES_KEY = 'school_exam_packages_deleted_ids_v1';
const DELETED_SUBJECTS_KEY = 'school_tryout_deleted_subjects_v1';
const DELETED_EXPLANATIONS_KEY = 'school_tryout_deleted_explanations_v1';
const LIVE_MONITORING_CACHE_KEY = 'wikan_live_monitoring_cache_v1';

export interface DatabaseState {
  users: User[];
  teachers: Teacher[];
  students: Student[];
  classes: ClassRoom[];
  studentClasses: StudentClass[];
  academicYears: AcademicYear[];
  subjects: Subject[];
  teacherSubjects: TeacherSubject[];
  materials: Material[];
  competencies: Competency[];
  examPackages: ExamPackage[];
  tryouts: Tryout[];
  tryoutSubjects: TryoutSubject[];
  questions: Question[];
  tryoutQuestions: TryoutQuestion[];
  googleForms: GoogleForm[];
  responses: Response[];
  answers: Answer[];
  scores: Score[];
  questionAnalysis: QuestionAnalysis[];
  explanations: Explanation[];
  reports: Report[];
  auditLogs: AuditLog[];
  schoolProfile?: SchoolProfile;
  liveMonitoringConfig?: LiveMonitoringConfig;
}

export class DatabaseService {
  private state: DatabaseState;
  private listeners: (() => void)[] = [];

  // Supabase cloud sync state
  private supabaseSyncEnabled = false;
  private isFreshDevice = false;
  private supabaseInitDone = false;
  private realtimeChannel: unknown = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private syncSubscribersCount = 0;
  private isPullingCloud = false;
  private isPushingCloud = false;
  private realtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTryoutIds = new Set<string>();
  private pendingPackageIds = new Set<string>();
  private pendingExplanationIds = new Set<string>();
  private focusSyncHandler: (() => void) | null = null;
  private visibilitySyncHandler: (() => void) | null = null;

  // Fast In-Memory Performance Indexes for O(1) Lookups
  private responsesByTryoutStudent = new Map<string, Response>();
  private answersByTryout = new Map<string, Answer[]>();
  private answersByQuestion = new Map<string, Answer[]>();
  private scoresByTryout = new Map<string, Score[]>();
  private scoresByStudent = new Map<string, Score[]>();
  private studentsByClass = new Map<string, Student[]>();

  constructor() {
    this.state = this.loadFromStorage();
    this.migrateLegacyIds();
    this.rebuildIndexes();
    this.setupLocalStorageListener();
    // Trigger async Supabase init after synchronous construction
    this.initSupabaseSync();
  }

  /**
   * Mengonversi ID lama (c-*, s-*, ay-*) ke format UUID standar
   * agar kompatibel 100% dengan database cloud Supabase / PostgreSQL.
   */
  private migrateLegacyIds(): void {
    let changed = false;

    // 1. Standarisasi Academic Year ke UUID Supabase
    const activeAyUuid = '0ffe2ac4-48bd-400b-ae8c-05ecff36e4a1';
    this.state.academicYears.forEach(ay => {
      if (!isValidUuid(ay.id)) {
        const oldId = ay.id;
        ay.id = activeAyUuid;
        changed = true;

        this.state.classes.forEach(c => {
          if (c.academicYearId === oldId) c.academicYearId = activeAyUuid;
        });
        if (this.state.examPackages) {
          this.state.examPackages.forEach(p => {
            if (p.academicYearId === oldId) p.academicYearId = activeAyUuid;
          });
        }
        if (this.state.tryouts) {
          this.state.tryouts.forEach(t => {
            if (t.academicYearId === oldId) t.academicYearId = activeAyUuid;
          });
        }
      }
    });

    // 2. Standarisasi Classes ke UUID
    this.state.classes.forEach(c => {
      if (!isValidUuid(c.id)) {
        const oldId = c.id;
        const newUuid = generateUuid();
        c.id = newUuid;
        changed = true;

        this.state.students.forEach(s => {
          if (s.classId === oldId) s.classId = newUuid;
        });

        this.state.teachers.forEach(t => {
          if (t.classPermissions && t.classPermissions.includes(oldId)) {
            t.classPermissions = t.classPermissions.map(p => p === oldId ? newUuid : p);
          }
          if (t.homeRoomClassId === oldId) {
            t.homeRoomClassId = newUuid;
          }
        });

        if (this.state.examPackages) {
          this.state.examPackages.forEach(p => {
            if (p.targetClassIds && p.targetClassIds.includes(oldId)) {
              p.targetClassIds = p.targetClassIds.map(cid => cid === oldId ? newUuid : cid);
            }
          });
        }
      }
    });

    // 3. Standarisasi Siswa ke UUID
    this.state.students.forEach(s => {
      if (!isValidUuid(s.id)) {
        s.id = generateUuid();
        changed = true;
      }
    });

    // 4. Standarisasi Materials ke UUID
    if (this.state.materials) {
      this.state.materials.forEach(m => {
        if (!isValidUuid(m.id)) {
          const oldId = m.id;
          const newUuid = generateUuid();
          m.id = newUuid;
          changed = true;
          this.state.questions.forEach(q => {
            if (q.materialId === oldId) q.materialId = newUuid;
          });
        }
      });
    }

    // 5. Standarisasi Competencies ke UUID
    if (this.state.competencies) {
      this.state.competencies.forEach(c => {
        if (!isValidUuid(c.id)) {
          const oldId = c.id;
          const newUuid = generateUuid();
          c.id = newUuid;
          changed = true;
          this.state.questions.forEach(q => {
            if (q.competencyId === oldId) q.competencyId = newUuid;
          });
        }
      });
    }

    // 6. Standarisasi Questions ke UUID
    if (this.state.questions) {
      this.state.questions.forEach(q => {
        if (!isValidUuid(q.id)) {
          const oldId = q.id;
          const newUuid = generateUuid();
          q.id = newUuid;
          changed = true;
          this.state.answers.forEach(a => {
            if (a.questionId === oldId) a.questionId = newUuid;
          });
        }
      });
    }

    // 7. Standarisasi Responses & Scores ke UUID (khususnya data lama TO Eksternal)
    if (this.state.responses) {
      this.state.responses.forEach(r => {
        if (!isValidUuid(r.id)) {
          const oldRespId = r.id;
          const newRespUuid = generateUuid();
          r.id = newRespUuid;
          changed = true;
          if (this.state.scores) {
            this.state.scores.forEach(sc => {
              if (sc.responseId === oldRespId) sc.responseId = newRespUuid;
            });
          }
        }
      });
    }
    if (this.state.scores) {
      this.state.scores.forEach(sc => {
        if (!isValidUuid(sc.id)) {
          sc.id = generateUuid();
          changed = true;
        }
        if (!sc.responseId || !isValidUuid(sc.responseId)) {
          const matchingResp = (this.state.responses || []).find(
            r => r.tryoutId === sc.tryoutId && r.studentId === sc.studentId && isValidUuid(r.id)
          );
          sc.responseId = matchingResp ? matchingResp.id : generateUuid();
          changed = true;
        }
      });
    }

    // 8. Bersihkan mata pelajaran yang telah dihapus (termasuk kode warisan BIND)
    const deletedSubjCodes = this.getDeletedSubjectCodes();
    if (this.state.subjects && this.state.subjects.length > 0) {
      const removedIds: string[] = [];
      const removedCodes: string[] = [];
      this.state.subjects = this.state.subjects.filter(s => {
        const codeKey = (s.code || '').toLowerCase().trim();
        if (deletedSubjCodes.has(codeKey)) {
          removedIds.push(s.id);
          if (s.code) removedCodes.push(s.code);
          return false;
        }
        return true;
      });
      if (removedIds.length > 0) {
        this.purgeSubjectReferences(removedIds, removedCodes);
        changed = true;
      }
    }

    if (changed) {
      this.persistState();
      console.info('[DB] Migrasi ID lokal ke UUID standar berhasil dilakukan.');
    }
  }

  private setupLocalStorageListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event: StorageEvent) => {
        if (event.key === STORAGE_KEY && event.newValue) {
          try {
            this.state = JSON.parse(event.newValue);
            this.rebuildIndexes();
            this.notifyListeners();
          } catch (e) {
            console.warn('[DB] Storage event sync failed:', e);
          }
        }
      });
    }
  }

  /**
   * Async: Initialize Supabase sync.
   * Cerdas & Otomatis:
   * - Jika cloud sudah ada data (dari perangkat lain), langsung sinkronkan secara otoritatif ke perangkat ini.
   * - Jika di perangkat ini terdapat nilai ujian (scores) pada tryout aktif yang belum masuk ke cloud, otomatis dorong ke Supabase.
   */
  private async initSupabaseSync(): Promise<void> {
    if (!sdb.isAvailable()) return;

    this.supabaseSyncEnabled = true;

    // Prioritas #1: Tarik Profil Sekolah secepat kilat (~50-100ms) secara independen
    // agar logo dan nama sekolah langsung terupdate tanpa perlu menunggu unduhan ribuan baris jawaban & skor.
    sdb.fetchSchoolProfile().then(cloudProfile => {
      if (cloudProfile) {
        this.applySchoolProfile(cloudProfile);
      }
    }).catch(err => {
      console.warn('[DB] Gagal sinkronisasi cepat profil sekolah:', err);
    });

    try {
      console.info('[DB] Supabase aktif — memeriksa sinkronisasi cloud...');
      const cloudState = await sdb.fetchCoreState();

      if (cloudState) {
        // 1. Sinkronkan data dari cloud ke perangkat ini (termasuk rekonsiliasi tryout yang sudah dihapus di cloud)
        const hadChanges = this.mergeCloudState(cloudState);
        if (hadChanges) {
          this.persistState();
          this.rebuildIndexes();
          this.notifyListeners();
          console.info('[DB] Sinkronisasi otomatis: data perangkat ini telah diselaraskan dengan cloud.');
        }

        // 2. Dorong nilai (scores & responses) lokal yang belum masuk ke Supabase untuk tryout yang masih aktif di cloud
        const validCloudTryoutIds = new Set((cloudState.tryouts || []).map(ct => ct.id));
        const cloudScoreKeys = new Set(
          (cloudState.scores || []).map(cs => `${cs.tryoutId}_${cs.studentId}`)
        );
        const unsyncedScores = (this.state.scores || []).filter(s => {
          if (!validCloudTryoutIds.has(s.tryoutId)) return false;
          return !cloudScoreKeys.has(`${s.tryoutId}_${s.studentId}`);
        });

        if (unsyncedScores.length > 0) {
          console.info(`[DB] Menyinkronkan delta ${unsyncedScores.length} nilai siswa baru yang belum masuk cloud ke Supabase...`);
          this.isPushingCloud = true;
          try {
            const tryoutIdsWithUnsyncedScores = Array.from(new Set(unsyncedScores.map(s => s.tryoutId)));
            for (const toId of tryoutIdsWithUnsyncedScores) {
              const toUnsyncedScores = unsyncedScores.filter(s => s.tryoutId === toId);
              const unsyncedStudentIds = new Set(toUnsyncedScores.map(s => s.studentId));
              const toUnsyncedResponses = (this.state.responses || []).filter(
                r => r.tryoutId === toId && unsyncedStudentIds.has(r.studentId)
              );
              await sdb.syncResponsesAndScores(toId, toUnsyncedResponses, toUnsyncedScores);
            }
          } finally {
            this.isPushingCloud = false;
          }
        }

        // 3. Dorong pembahasan (explanations) lokal yang belum masuk ke Supabase
        const cloudExpKeys = new Set(
          (cloudState.explanations || []).map(ce => ce.id)
        );
        const deletedExps = this.getDeletedExplanationIdentifiers();
        const unsyncedExplanations = (this.state.explanations || []).filter(
          e => !cloudExpKeys.has(e.id) && !deletedExps.has((e.id || '').toLowerCase().trim())
        );
        if (unsyncedExplanations.length > 0) {
          console.info(`[DB] Menyinkronkan delta ${unsyncedExplanations.length} pembahasan lokal ke Supabase...`);
          for (const exp of unsyncedExplanations) {
            await sdb.syncExplanation(exp);
          }
        }
      } else {
        // Jika cloud masih kosong, otomatis unggah data awal ke cloud di latar belakang!
        console.info('[DB] Cloud masih kosong — otomatis menyinkronkan data awal ke cloud di latar belakang...');
        this.exportToSupabase().catch(e => {
          console.warn('[DB] Auto-sync initial data to cloud failed:', e);
        });
      }
    } catch (err) {
      console.warn('[DB] Supabase init sync failed, menggunakan data lokal:', err);
    }

    this.supabaseInitDone = true;
  }

  /**
   * Helper tombstone: Mendapatkan daftar identifier dan kode tryout yang sudah dihapus.
   * Ini mencegah tryout dummy / ghost / seed yang telah dihapus bangkit kembali saat merge dari cloud.
   */
  private getDeletedTryoutIdentifiers(): Set<string> {
    const defaultDeleted = [
      'to000000-0000-0000-0000-000000000001',
      'f058de89-3c27-4df5-a66e-98c889629116', // TO-2026-02
      '0a2c9242-59ad-4aac-9612-4d2ef09802e7', // TO-2026-04
      '6ff3253b-7886-4ae8-9d01-bf464cb80288', // TO-2026-05
      'to-2026-02',
      'to-2026-04',
      'to-2026-05'
    ];
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(DELETED_TRYOUTS_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      const set = new Set<string>();
      (Array.isArray(parsed) ? parsed : []).forEach((x: string) => {
        const val = String(x).toLowerCase().trim();
        if (val) set.add(val);
      });
      defaultDeleted.forEach(item => set.add(item));
      return set;
    } catch {
      return new Set<string>(defaultDeleted);
    }
  }

  /**
   * Helper tombstone: Mencatat tryout yang dihapus ke localStorage agar persisten lintas sesi & cloud sync.
   */
  private recordDeletedTryoutIdentifier(...idsOrCodes: (string | undefined)[]): void {
    try {
      const set = this.getDeletedTryoutIdentifiers();
      idsOrCodes.forEach(item => {
        if (item && item.trim()) {
          const val = item.toLowerCase().trim();
          if (val) set.add(val);
        }
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem(DELETED_TRYOUTS_KEY, JSON.stringify(Array.from(set)));
      }
    } catch (e) {
      console.warn('[DB] Gagal menyimpan tombstone tryout yang dihapus:', e);
    }
  }

  /**
   * Helper: Membebaskan kembali identifier/kode tryout dari tombstone saat pengguna membuat tryout baru.
   * Ini memastikan kode yang pernah dihapus dapat digunakan kembali (reusable) secara bersih.
   */
  private removeDeletedTryoutIdentifier(...idsOrCodes: (string | undefined)[]): void {
    try {
      const set = this.getDeletedTryoutIdentifiers();
      idsOrCodes.forEach(item => {
        if (item && item.trim()) {
          set.delete(item.toLowerCase().trim());
        }
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem(DELETED_TRYOUTS_KEY, JSON.stringify(Array.from(set)));
      }
    } catch (e) {
      console.warn('[DB] Gagal membersihkan tombstone tryout:', e);
    }
  }

  /**
   * Helper tombstone: Mendapatkan daftar identifier dan kode paket ujian yang sudah dihapus.
   */
  private getDeletedPackageIdentifiers(): Set<string> {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(DELETED_PACKAGES_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      const set = new Set<string>();
      (Array.isArray(parsed) ? parsed : []).forEach((x: string) => {
        const val = String(x).toLowerCase().trim();
        if (val) set.add(val);
      });
      return set;
    } catch {
      return new Set<string>();
    }
  }

  /**
   * Helper tombstone: Mencatat paket ujian yang dihapus ke localStorage agar persisten lintas sesi.
   */
  private recordDeletedPackageIdentifier(...idsOrCodes: (string | undefined)[]): void {
    try {
      const set = this.getDeletedPackageIdentifiers();
      idsOrCodes.forEach(item => {
        if (item && item.trim()) {
          const val = item.toLowerCase().trim();
          if (val) set.add(val);
        }
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem(DELETED_PACKAGES_KEY, JSON.stringify(Array.from(set)));
      }
    } catch (e) {
      console.warn('[DB] Gagal menyimpan tombstone paket ujian yang dihapus:', e);
    }
  }

  /**
   * Helper tombstone: Membebaskan kembali identifier/kode paket ujian saat pengguna membuat paket baru.
   */
  private removeDeletedPackageIdentifier(...idsOrCodes: (string | undefined)[]): void {
    try {
      const set = this.getDeletedPackageIdentifiers();
      idsOrCodes.forEach(item => {
        if (item && item.trim()) {
          set.delete(item.toLowerCase().trim());
        }
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem(DELETED_PACKAGES_KEY, JSON.stringify(Array.from(set)));
      }
    } catch (e) {
      console.warn('[DB] Gagal membersihkan tombstone paket ujian:', e);
    }
  }

  /**
   * Helper tombstone untuk mata pelajaran yang telah dihapus Admin (termasuk kode warisan 'bind').
   */
  private getDeletedSubjectCodes(): Set<string> {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(DELETED_SUBJECTS_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      const set = new Set<string>(['bind']);
      (Array.isArray(parsed) ? parsed : []).forEach((x: string) => {
        const val = String(x).toLowerCase().trim();
        if (val) set.add(val);
      });
      return set;
    } catch {
      return new Set<string>(['bind']);
    }
  }

  private recordDeletedSubjectCode(...codes: (string | undefined)[]): void {
    try {
      const set = this.getDeletedSubjectCodes();
      codes.forEach(c => {
        if (c && c.trim()) {
          set.add(c.toLowerCase().trim());
        }
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem(DELETED_SUBJECTS_KEY, JSON.stringify(Array.from(set)));
      }
    } catch (e) {
      console.warn('[DB] Gagal menyimpan tombstone mata pelajaran:', e);
    }
  }

  private removeDeletedSubjectCode(...codes: (string | undefined)[]): void {
    try {
      const set = this.getDeletedSubjectCodes();
      codes.forEach(c => {
        if (c && c.trim()) {
          set.delete(c.toLowerCase().trim());
        }
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem(DELETED_SUBJECTS_KEY, JSON.stringify(Array.from(set)));
      }
    } catch (e) {
      console.warn('[DB] Gagal membersihkan tombstone mata pelajaran:', e);
    }
  }

  /**
   * Helper tombstone untuk modul/link pembahasan (explanations) yang telah dihapus guru.
   * Mencegah item yang telah dihapus muncul kembali saat sinkronisasi cloud realtime.
   */
  public getDeletedExplanationIdentifiers(): Set<string> {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(DELETED_EXPLANATIONS_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      const set = new Set<string>();
      (Array.isArray(parsed) ? parsed : []).forEach((x: string) => {
        const val = String(x).toLowerCase().trim();
        if (val) set.add(val);
      });
      return set;
    } catch {
      return new Set<string>();
    }
  }

  private addDeletedExplanationIdentifier(...ids: (string | undefined)[]): void {
    try {
      const set = this.getDeletedExplanationIdentifiers();
      ids.forEach(item => {
        if (item && item.trim()) {
          const val = item.toLowerCase().trim();
          if (val) set.add(val);
        }
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem(DELETED_EXPLANATIONS_KEY, JSON.stringify(Array.from(set)));
      }
    } catch (e) {
      console.warn('[DB] Gagal menyimpan tombstone pembahasan yang dihapus:', e);
    }
  }

  private removeDeletedExplanationIdentifier(...ids: (string | undefined)[]): void {
    try {
      const set = this.getDeletedExplanationIdentifiers();
      ids.forEach(item => {
        if (item && item.trim()) {
          set.delete(item.toLowerCase().trim());
        }
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem(DELETED_EXPLANATIONS_KEY, JSON.stringify(Array.from(set)));
      }
    } catch (e) {
      console.warn('[DB] Gagal membersihkan tombstone pembahasan:', e);
    }
  }

  private purgeSubjectReferences(subjectIds: string[], subjectCodes: string[] = []): void {
    if (subjectIds.length === 0 && subjectCodes.length === 0) return;
    const idSet = new Set(subjectIds.map(id => id.toLowerCase().trim()));
    const codeSet = new Set(subjectCodes.map(c => c.toLowerCase().trim()));

    if (this.state.examPackages) {
      this.state.examPackages.forEach(pkg => {
        if (Array.isArray(pkg.subjects)) {
          pkg.subjects = pkg.subjects.filter(ps => !idSet.has((ps.subjectId || '').toLowerCase().trim()));
        }
      });
    }

    if (this.state.teachers) {
      this.state.teachers.forEach(t => {
        if (Array.isArray(t.subjectPermissions)) {
          t.subjectPermissions = t.subjectPermissions.filter(
            sid => !idSet.has((sid || '').toLowerCase().trim()) && !codeSet.has((sid || '').toLowerCase().trim())
          );
        }
      });
    }

    if (this.state.tryouts) {
      this.state.tryouts.forEach(to => {
        if (Array.isArray(to.externalSubjectIds)) {
          to.externalSubjectIds = to.externalSubjectIds.filter(
            sid => !idSet.has((sid || '').toLowerCase().trim())
          );
        }
        if (Array.isArray(to.externalSubjects)) {
          to.externalSubjects = to.externalSubjects.filter(
            sname => !codeSet.has((sname || '').toLowerCase().trim())
          );
        }
      });
    }

    if (this.state.scores) {
      this.state.scores.forEach(sc => {
        if (sc.subjectScores) {
          Object.keys(sc.subjectScores).forEach(k => {
            const lk = k.toLowerCase().trim();
            if (idSet.has(lk) || codeSet.has(lk)) {
              delete sc.subjectScores![k];
            }
          });
        }
      });
    }
  }

  /**
   * Merge cloud state into local state, avoiding duplicate entries.
   */
  private mergeCloudState(cloud: {
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
  }): boolean {
    let changed = false;

    // Merge users (by email) — update existing too
    cloud.users.forEach(cloudUser => {
      const idx = this.state.users.findIndex(u => u.email.toLowerCase() === cloudUser.email.toLowerCase());
      if (idx === -1) {
        this.state.users.push(cloudUser);
        changed = true;
      } else {
        // Update role/name/password if changed remotely
        const local = this.state.users[idx];
        const passChanged = (!local.password && cloudUser.password) || (cloudUser.password && local.password !== cloudUser.password);
        if (local.role !== cloudUser.role || local.name !== cloudUser.name || passChanged) {
          this.state.users[idx] = {
            ...local,
            role: cloudUser.role,
            name: cloudUser.name,
            password: cloudUser.password || local.password,
          };
          changed = true;
        }
      }
    });

    // Merge academic years (by yearLabel+semester)
    cloud.academicYears.forEach(cloudAy => {
      const exists = this.state.academicYears.some(
        ay => ay.yearLabel === cloudAy.yearLabel && ay.semester === cloudAy.semester
      );
      if (!exists) { this.state.academicYears.push(cloudAy); changed = true; }
    });

    // Merge subjects (by code) — update name/category/id if changed & remap references
    const deletedSubjCodes = this.getDeletedSubjectCodes();
    const validCloudSubjects = (cloud.subjects || []).filter(cs => {
      const codeKey = (cs.code || '').toLowerCase().trim();
      if (deletedSubjCodes.has(codeKey)) {
        // Jika di cloud masih tersisa mapel yang sudah ditandai hapus (seperti BIND), bersihkan dari cloud
        if (this.supabaseSyncEnabled && cs.code) {
          sdb.removeSubjectByCode(cs.code).catch(() => {});
        }
        return false;
      }
      return true;
    });

    validCloudSubjects.forEach(cloudSub => {
      const idx = this.state.subjects.findIndex(
        s => (s.code || '').toLowerCase().trim() === (cloudSub.code || '').toLowerCase().trim()
      );
      if (idx === -1) {
        this.state.subjects.push(cloudSub);
        changed = true;
      } else {
        const local = this.state.subjects[idx];
        const oldSubId = local.id;
        const idDiff = Boolean(cloudSub.id && oldSubId !== cloudSub.id);
        if (
          local.name !== cloudSub.name ||
          local.category !== cloudSub.category ||
          local.passingGrade !== cloudSub.passingGrade ||
          idDiff
        ) {
          this.state.subjects[idx] = { ...local, ...cloudSub };
          if (idDiff) {
            (this.state.tryouts || []).forEach(t => {
              if (t.subjectId === oldSubId) t.subjectId = cloudSub.id;
              if (t.externalSubjectIds && t.externalSubjectIds.includes(oldSubId)) {
                t.externalSubjectIds = t.externalSubjectIds.map(sid => sid === oldSubId ? cloudSub.id : sid);
              }
            });
            (this.state.teachers || []).forEach(tch => {
              if (tch.subjectPermissions && tch.subjectPermissions.includes(oldSubId)) {
                tch.subjectPermissions = tch.subjectPermissions.map(sid => sid === oldSubId ? cloudSub.id : sid);
              }
            });
            (this.state.questions || []).forEach(q => {
              if (q.subjectId === oldSubId) q.subjectId = cloudSub.id;
            });
            (this.state.materials || []).forEach(m => {
              if (m.subjectId === oldSubId) m.subjectId = cloudSub.id;
            });
            (this.state.competencies || []).forEach(c => {
              if (c.subjectId === oldSubId) c.subjectId = cloudSub.id;
            });
            (this.state.scores || []).forEach(sc => {
              if (sc.subjectScores && sc.subjectScores[oldSubId] !== undefined) {
                sc.subjectScores[cloudSub.id] = sc.subjectScores[oldSubId];
                delete sc.subjectScores[oldSubId];
              }
            });
          }
          changed = true;
        }
      }
    });

    // Reconcile deleted subjects: hapus dari state lokal jika mapel sudah dihapus di Supabase atau masuk tombstone
    if (this.supabaseInitDone || validCloudSubjects.length > 0 || (cloud.students && cloud.students.length > 0)) {
      const cloudSubjCodes = new Set(validCloudSubjects.map(s => (s.code || '').toLowerCase().trim()));
      const removedSubjIds: string[] = [];
      const removedSubjCodes: string[] = [];
      const beforeSubjCount = this.state.subjects.length;

      this.state.subjects = this.state.subjects.filter(s => {
        const codeKey = (s.code || '').toLowerCase().trim();
        if (deletedSubjCodes.has(codeKey) || (validCloudSubjects.length > 0 && !cloudSubjCodes.has(codeKey))) {
          removedSubjIds.push(s.id);
          if (s.code) removedSubjCodes.push(s.code);
          return false;
        }
        return true;
      });

      if (this.state.subjects.length !== beforeSubjCount) {
        this.purgeSubjectReferences(removedSubjIds, removedSubjCodes);
        changed = true;
      }
    }

    // Merge classes (by name)
    cloud.classes.forEach(cloudCls => {
      const idx = this.state.classes.findIndex(c => c.name.toLowerCase() === cloudCls.name.toLowerCase());
      if (idx === -1) {
        this.state.classes.push(cloudCls);
        changed = true;
      } else {
        const local = this.state.classes[idx];
        const oldId = local.id;
        const idDiff = local.id !== cloudCls.id;
        const teacherDiff = local.homeRoomTeacherId !== cloudCls.homeRoomTeacherId && cloudCls.homeRoomTeacherId !== undefined;
        const gradeDiff = local.gradeLevel !== cloudCls.gradeLevel;

        if (idDiff || teacherDiff || gradeDiff) {
          this.state.classes[idx] = {
            ...local,
            ...cloudCls,
            homeRoomTeacherId: cloudCls.homeRoomTeacherId !== undefined ? cloudCls.homeRoomTeacherId : local.homeRoomTeacherId,
          };
          if (idDiff) {
            this.state.students.forEach(st => {
              if (st.classId === oldId) st.classId = cloudCls.id;
            });
          }
          changed = true;
        }
      }
    });

    // Merge teachers (by nip) — update name/email/permissions/wali kelas if changed
    cloud.teachers.forEach(cloudTeacher => {
      const idx = this.state.teachers.findIndex(t => t.nip === cloudTeacher.nip);
      if (idx === -1) {
        this.state.teachers.push(cloudTeacher);
        changed = true;
      } else {
        const local = this.state.teachers[idx];
        const remoteSubs = JSON.stringify(cloudTeacher.subjectPermissions || []);
        const localSubs = JSON.stringify(local.subjectPermissions || []);
        const remoteClasses = JSON.stringify(cloudTeacher.classPermissions || []);
        const localClasses = JSON.stringify(local.classPermissions || []);
        const waliDiff =
          local.isWaliKelas !== cloudTeacher.isWaliKelas ||
          (cloudTeacher.homeRoomClassId && local.homeRoomClassId !== cloudTeacher.homeRoomClassId);

        if (
          local.name !== cloudTeacher.name ||
          local.email !== cloudTeacher.email ||
          localSubs !== remoteSubs ||
          localClasses !== remoteClasses ||
          waliDiff
        ) {
          this.state.teachers[idx] = {
            ...local,
            ...cloudTeacher,
            id: (cloudTeacher.id && isValidUuid(cloudTeacher.id)) ? cloudTeacher.id : local.id,
            userId: local.userId,
            isWaliKelas: cloudTeacher.isWaliKelas !== undefined ? cloudTeacher.isWaliKelas : local.isWaliKelas,
            homeRoomClassId: cloudTeacher.homeRoomClassId || local.homeRoomClassId,
          };
          changed = true;
        }
      }
    });

    // Cross-link homeroom consistency between classes and teachers
    this.state.teachers.forEach(t => {
      if (t.isWaliKelas && t.homeRoomClassId) {
        const cls = this.state.classes.find(c => c.id === t.homeRoomClassId || c.name.toLowerCase() === t.homeRoomClassId?.toLowerCase());
        if (cls && cls.homeRoomTeacherId !== t.id) {
          cls.homeRoomTeacherId = t.id;
          changed = true;
        }
      }
    });
    this.state.classes.forEach(c => {
      if (c.homeRoomTeacherId) {
        const t = this.state.teachers.find(tch => tch.id === c.homeRoomTeacherId || tch.nip === c.homeRoomTeacherId);
        if (t && (!t.isWaliKelas || t.homeRoomClassId !== c.id)) {
          t.isWaliKelas = true;
          t.homeRoomClassId = c.id;
          changed = true;
        }
      }
    });

    // Merge students (by nisn)
    cloud.students.forEach(cloudStudent => {
      const idx = this.state.students.findIndex(s => s.nisn === cloudStudent.nisn);
      if (idx === -1) {
        this.state.students.push(cloudStudent);
        changed = true;
      } else {
        const local = this.state.students[idx];
        const oldId = local.id;
        const idDiff = Boolean(cloudStudent.id && local.id !== cloudStudent.id);
        if (
          idDiff ||
          local.name !== cloudStudent.name ||
          local.classId !== cloudStudent.classId ||
          local.gender !== cloudStudent.gender ||
          local.birthDate !== cloudStudent.birthDate ||
          local.nis !== cloudStudent.nis ||
          local.isAnswerKeyAccount !== cloudStudent.isAnswerKeyAccount
        ) {
          this.state.students[idx] = { ...local, ...cloudStudent };
          if (idDiff && cloudStudent.id) {
            // Selaraskan referensi ID siswa pada scores & responses agar sinkron lintas perangkat
            (this.state.scores || []).forEach(sc => {
              if (sc.studentId === oldId) sc.studentId = cloudStudent.id;
            });
            (this.state.responses || []).forEach(r => {
              if (r.studentId === oldId) r.studentId = cloudStudent.id;
            });
            (this.state.answers || []).forEach(a => {
              if (a.studentId === oldId) a.studentId = cloudStudent.id;
            });
          }
          changed = true;
        }
      }
    });

    // Reconcile deleted students jika cloud sudah memiliki data
    if (this.supabaseInitDone && cloud.students.length > 0) {
      const cloudNisns = new Set(cloud.students.map(s => s.nisn));
      const beforeCount = this.state.students.length;
      this.state.students = this.state.students.filter(s => cloudNisns.has(s.nisn));
      if (this.state.students.length !== beforeCount) {
        changed = true;
      }
    }

    // Merge exam packages (by id or code)
    if (cloud.examPackages && Array.isArray(cloud.examPackages)) {
      if (!this.state.examPackages) this.state.examPackages = [];
      const deletedPkgs = this.getDeletedPackageIdentifiers();

      cloud.examPackages.forEach(cloudPkg => {
        const idKey = (cloudPkg.id || '').toLowerCase().trim();
        const codeKey = (cloudPkg.code || '').toLowerCase().trim();
        if (deletedPkgs.has(idKey) || (codeKey && deletedPkgs.has(codeKey))) {
          return;
        }

        const idx = this.state.examPackages.findIndex(
          p => (p.id && cloudPkg.id && p.id.toLowerCase() === cloudPkg.id.toLowerCase()) ||
               (p.code && cloudPkg.code && p.code.toLowerCase().trim() === cloudPkg.code.toLowerCase().trim())
        );
        if (idx === -1) {
          this.state.examPackages.push(cloudPkg);
          changed = true;
        } else {
          const local = this.state.examPackages[idx];
          // Compare subjects' googleSheetUrl as well so URL changes sync across devices
          const localSubsJson = JSON.stringify((local.subjects || []).map((s: any) => ({ code: s.code, url: s.googleSheetUrl })));
          const cloudSubsJson = JSON.stringify((cloudPkg.subjects || []).map((s: any) => ({ code: s.code, url: s.googleSheetUrl })));
          if (
            local.id !== cloudPkg.id ||
            local.title !== cloudPkg.title ||
            local.status !== cloudPkg.status ||
            local.assessmentType !== cloudPkg.assessmentType ||
            local.updatedAt !== cloudPkg.updatedAt ||
            localSubsJson !== cloudSubsJson
          ) {
            this.state.examPackages[idx] = { ...local, ...cloudPkg, id: cloudPkg.id || local.id };
            changed = true;
          }
        }
      });

      // Hapus hanya paket ujian yang BENAR-BENAR ada di daftar tombstone terhapus
      const beforePkgCount = this.state.examPackages.length;
      this.state.examPackages = this.state.examPackages.filter(p => {
        const idKey = (p.id || '').toLowerCase().trim();
        const codeKey = (p.code || '').toLowerCase().trim();
        return !deletedPkgs.has(idKey) && (!codeKey || !deletedPkgs.has(codeKey));
      });
      if (this.state.examPackages.length !== beforePkgCount) {
        changed = true;
      }

      // Auto-push paket ujian lokal yang belum ada di cloud ke Supabase
      const cloudPkgCodes = new Set(cloud.examPackages.map(p => (p.code || '').toLowerCase().trim()));
      const cloudPkgIds = new Set(cloud.examPackages.map(p => (p.id || '').toLowerCase().trim()));
      const unsyncedPackages = this.state.examPackages.filter(p => {
        const idKey = (p.id || '').toLowerCase().trim();
        const codeKey = (p.code || '').toLowerCase().trim();
        return !cloudPkgIds.has(idKey) && !cloudPkgCodes.has(codeKey);
      });
      if (unsyncedPackages.length > 0 && this.supabaseSyncEnabled) {
        for (const up of unsyncedPackages) {
          sdb.syncExamPackage(up).catch(() => {});
        }
      }
    }

    // Merge tryouts (match by id or code, align with cloud UUID)
    if (cloud.tryouts && Array.isArray(cloud.tryouts)) {
      if (!this.state.tryouts) this.state.tryouts = [];
      const deletedTryouts = this.getDeletedTryoutIdentifiers();
      cloud.tryouts.forEach(cloudTo => {
        const toId = (cloudTo.id || '').toLowerCase().trim();
        const toCode = (cloudTo.code || '').toLowerCase().trim();
        if (deletedTryouts.has(toId) || (toCode && deletedTryouts.has(toCode))) {
          return;
        }
        const idx = this.state.tryouts.findIndex(
          t => (t.id && cloudTo.id && t.id.toLowerCase() === cloudTo.id.toLowerCase()) ||
               (t.code && cloudTo.code && t.code.toLowerCase().trim() === cloudTo.code.toLowerCase().trim())
        );
        if (idx === -1) {
          this.state.tryouts.push(cloudTo);
          changed = true;
        } else {
          const local = this.state.tryouts[idx];
          const mergedSelectedCols =
            cloudTo.selectedQuestionColumns && cloudTo.selectedQuestionColumns.length > 0
              ? cloudTo.selectedQuestionColumns
              : local.selectedQuestionColumns;
          const mergedAnswerKey =
            cloudTo.answerKey && cloudTo.answerKey.length > 0
              ? cloudTo.answerKey
              : local.answerKey;

          const authoritativeId = cloudTo.id || local.id;
          const oldToId = local.id;
          const idDiff = Boolean(authoritativeId && local.id !== authoritativeId);

          const resolvedIsExternal = Boolean(
            cloudTo.isExternal === true ||
            (cloudTo.isExternal === undefined && local.isExternal === true) ||
            cloudTo.source === 'EXTERNAL'
          );
          const mergedExtSubjects =
            cloudTo.externalSubjects && cloudTo.externalSubjects.length > 0
              ? cloudTo.externalSubjects
              : local.externalSubjects;
          const mergedExtSubjectIds =
            cloudTo.externalSubjectIds && cloudTo.externalSubjectIds.length > 0
              ? cloudTo.externalSubjectIds
              : local.externalSubjectIds;

          if (
            idDiff ||
            local.title !== cloudTo.title ||
            local.status !== cloudTo.status ||
            local.packageId !== cloudTo.packageId ||
            local.googleSheetUrl !== cloudTo.googleSheetUrl ||
            local.googleFormUrl !== cloudTo.googleFormUrl ||
            JSON.stringify(local.scoringConfig) !== JSON.stringify(cloudTo.scoringConfig) ||
            JSON.stringify(local.selectedQuestionColumns) !== JSON.stringify(mergedSelectedCols) ||
            JSON.stringify(local.answerKey) !== JSON.stringify(mergedAnswerKey) ||
            JSON.stringify(local.externalSubjects) !== JSON.stringify(mergedExtSubjects) ||
            JSON.stringify(local.externalSubjectIds) !== JSON.stringify(mergedExtSubjectIds) ||
            local.subjectId !== (cloudTo.subjectId || local.subjectId) ||
            local.tryoutGroup !== (cloudTo.tryoutGroup || local.tryoutGroup) ||
            local.isExternal !== resolvedIsExternal ||
            local.source !== (resolvedIsExternal ? 'EXTERNAL' : 'INTERNAL')
          ) {
            this.state.tryouts[idx] = {
              ...local,
              ...cloudTo,
              id: authoritativeId,
              packageId: cloudTo.packageId || local.packageId,
              selectedQuestionColumns: mergedSelectedCols,
              answerKey: mergedAnswerKey,
              subjectId: resolvedIsExternal ? (cloudTo.subjectId || undefined) : (cloudTo.subjectId || local.subjectId),
              tryoutGroup: cloudTo.tryoutGroup || local.tryoutGroup,
              isExternal: resolvedIsExternal,
              source: resolvedIsExternal ? 'EXTERNAL' : 'INTERNAL',
              externalSubjects: mergedExtSubjects,
              externalSubjectIds: mergedExtSubjectIds,
              externalScoreScale: cloudTo.externalScoreScale || local.externalScoreScale || (resolvedIsExternal ? 'SCALE_100' : undefined),
            };

            if (idDiff && authoritativeId) {
              (this.state.scores || []).forEach(sc => {
                if (sc.tryoutId === oldToId) sc.tryoutId = authoritativeId;
              });
              (this.state.responses || []).forEach(r => {
                if (r.tryoutId === oldToId) r.tryoutId = authoritativeId;
              });
              (this.state.explanations || []).forEach(e => {
                if (e.tryoutId === oldToId) e.tryoutId = authoritativeId;
              });
            }

            changed = true;
          }
        }
      });

      // Reconcile deleted tryouts: hapus dari state lokal jika tryout sudah dihapus dari Supabase (dan tidak sedang dalam proses push)
      if (this.supabaseInitDone || cloud.tryouts.length > 0 || cloud.students.length > 0) {
        const cloudToIds = new Set(cloud.tryouts.map(t => (t.id || '').toLowerCase().trim()));
        const cloudToCodes = new Set(cloud.tryouts.map(t => (t.code || '').toLowerCase().trim()));
        const removedTryoutIds = new Set<string>();
        const beforeToCount = this.state.tryouts.length;

        this.state.tryouts = this.state.tryouts.filter(t => {
          const idKey = (t.id || '').toLowerCase().trim();
          const codeKey = (t.code || '').toLowerCase().trim();
          const existsInCloud = cloudToIds.has(idKey) || cloudToCodes.has(codeKey);
          const isPending =
            this.pendingTryoutIds.has(t.id) ||
            this.pendingTryoutIds.has(idKey) ||
            this.pendingTryoutIds.has(codeKey);
          const isPackageTryout = Boolean(t.packageId);
          if (!existsInCloud && !isPending && !isPackageTryout) {
            removedTryoutIds.add(t.id);
            return false;
          }
          return true;
        });

        if (this.state.tryouts.length !== beforeToCount) {
          changed = true;
          if (removedTryoutIds.size > 0) {
            this.state.scores = (this.state.scores || []).filter(s => !removedTryoutIds.has(s.tryoutId));
            this.state.responses = (this.state.responses || []).filter(r => !removedTryoutIds.has(r.tryoutId));
            this.state.answers = (this.state.answers || []).filter(a => !removedTryoutIds.has(a.tryoutId));
          }
        }
      }
    }

    // Merge materials, competencies, questions, answers (agar Bank Soal & Analisis Butir Soal 100% sinkron lintas device)
    if (cloud.materials && Array.isArray(cloud.materials) && cloud.materials.length > 0) {
      if (!this.state.materials) this.state.materials = [];
      cloud.materials.forEach(cm => {
        const idx = this.state.materials.findIndex(m => m.id === cm.id || (m.subjectId === cm.subjectId && m.code === cm.code));
        if (idx === -1) {
          this.state.materials.push(cm);
          changed = true;
        } else if (this.state.materials[idx].title !== cm.title || this.state.materials[idx].id !== cm.id) {
          this.state.materials[idx] = { ...this.state.materials[idx], ...cm };
          changed = true;
        }
      });
    }

    if (cloud.competencies && Array.isArray(cloud.competencies) && cloud.competencies.length > 0) {
      if (!this.state.competencies) this.state.competencies = [];
      cloud.competencies.forEach(cc => {
        const idx = this.state.competencies.findIndex(c => c.id === cc.id || (c.subjectId === cc.subjectId && c.code === cc.code));
        if (idx === -1) {
          this.state.competencies.push(cc);
          changed = true;
        } else if (this.state.competencies[idx].statement !== cc.statement || this.state.competencies[idx].id !== cc.id) {
          this.state.competencies[idx] = { ...this.state.competencies[idx], ...cc };
          changed = true;
        }
      });
    }

    if (cloud.questions && Array.isArray(cloud.questions) && cloud.questions.length > 0) {
      if (!this.state.questions) this.state.questions = [];
      const isPlaceholderOptions = (opts?: { key: string; text: string }[]) =>
        !Array.isArray(opts) ||
        opts.length === 0 ||
        opts.every(o => !o.text || o.text.trim().toLowerCase() === `pilihan ${(o.key || '').toLowerCase()}`);

      cloud.questions.forEach(cq => {
        const idx = this.state.questions.findIndex(q => q.id === cq.id || q.uniqueCode === cq.uniqueCode);
        if (idx === -1) {
          this.state.questions.push(cq);
          changed = true;
        } else {
          const localQ = this.state.questions[idx];
          const oldId = localQ.id;
          const preservedOptions = (!isPlaceholderOptions(localQ.options) && isPlaceholderOptions(cq.options))
            ? localQ.options
            : (cq.options && cq.options.length > 0 ? cq.options : localQ.options);

          if (
            localQ.correctAnswer !== cq.correctAnswer ||
            localQ.questionText !== cq.questionText ||
            localQ.id !== cq.id ||
            JSON.stringify(localQ.options) !== JSON.stringify(preservedOptions)
          ) {
            this.state.questions[idx] = { ...localQ, ...cq, options: preservedOptions };
            // Jika ID soal di lokal berbeda dengan ID kanonik di Supabase, selaraskan seluruh referensi questionId pada jawaban siswa agar tidak yatim (orphaned)!
            if (oldId && cq.id && oldId !== cq.id) {
              if (Array.isArray(this.state.answers)) {
                this.state.answers.forEach(a => {
                  if (a.questionId === oldId) a.questionId = cq.id;
                });
              }
              if (Array.isArray(this.state.tryoutQuestions)) {
                this.state.tryoutQuestions.forEach(tq => {
                  if (tq.questionId === oldId) tq.questionId = cq.id;
                });
              }
              if (Array.isArray(this.state.explanations)) {
                this.state.explanations.forEach(ex => {
                  if (ex.questionId === oldId) ex.questionId = cq.id;
                });
              }
            }
            changed = true;
          }
        }
      });
    }

    if (cloud.answers && Array.isArray(cloud.answers) && cloud.answers.length > 0) {
      if (!this.state.answers) this.state.answers = [];
      // Deduplicate existing local answers first
      const ansByComposite = new Map<string, Answer>();
      this.state.answers.forEach(a => {
        ansByComposite.set(`${a.tryoutId}:${a.studentId}:${a.questionId}`, a);
      });
      if (ansByComposite.size !== this.state.answers.length) {
        changed = true;
      }
      cloud.answers.forEach(ca => {
        const key = `${ca.tryoutId}:${ca.studentId}:${ca.questionId}`;
        const existing = ansByComposite.get(key);
        if (!existing) {
          ansByComposite.set(key, ca);
          changed = true;
        } else {
          // Jangan menimpa jawaban lokal yang sudah terisi dengan jawaban kosong dari baris cloud lama yang sempat gagal ternormalisasi
          const effectiveStudentAnswer = (ca.studentAnswer && ca.studentAnswer.trim())
            ? ca.studentAnswer
            : (existing.studentAnswer || '');
          const mergedAns: Answer = {
            ...existing,
            ...ca,
            studentAnswer: effectiveStudentAnswer,
          };
          if (
            existing.studentAnswer !== mergedAns.studentAnswer ||
            existing.isCorrect !== mergedAns.isCorrect ||
            existing.score !== mergedAns.score ||
            existing.id !== mergedAns.id
          ) {
            ansByComposite.set(key, mergedAns);
            changed = true;
          }
        }
      });
      this.state.answers = Array.from(ansByComposite.values());
    }

    // Merge scores
    if (cloud.scores && Array.isArray(cloud.scores) && cloud.scores.length > 0) {
      if (!this.state.scores) this.state.scores = [];
      // Deduplicate local scores by (tryoutId, studentId) first
      const localScoresDedup = new Map<string, Score>();
      this.state.scores.forEach(s => {
        localScoresDedup.set(`${s.tryoutId}:${s.studentId}`, s);
      });
      if (localScoresDedup.size !== this.state.scores.length) {
        this.state.scores = Array.from(localScoresDedup.values());
        changed = true;
      }

      cloud.scores.forEach(cloudScore => {
        const to = this.state.tryouts.find(t => t.id === cloudScore.tryoutId);
        const isGFormSource = to?.scoringConfig?.scoreSource === 'GOOGLE_FORM';

        // Normalize subjectScores for single-subject tryouts & GForm scoreSource
        const normalizedCloudScore: Score = {
          ...cloudScore,
          subjectScores: { ...(cloudScore.subjectScores || {}) },
        };
        if (isGFormSource && normalizedCloudScore.googleFormScore && normalizedCloudScore.googleFormScore > 0) {
          const gFormScore: number = normalizedCloudScore.googleFormScore;
          normalizedCloudScore.calculatedScore = gFormScore;
          normalizedCloudScore.scoringStatus = 'MATCH';
          normalizedCloudScore.scoreDifference = 0;
          if (to?.subjectId) {
            normalizedCloudScore.subjectScores[to.subjectId] = gFormScore;
          }
          Object.keys(normalizedCloudScore.subjectScores).forEach(k => {
            normalizedCloudScore.subjectScores[k] = gFormScore;
          });
        } else if (to?.isExternal && to.externalSubjectIds?.length === 1) {
          const singleSubId = to.externalSubjectIds[0];
          if (normalizedCloudScore.subjectScores[singleSubId] === undefined) {
            normalizedCloudScore.subjectScores[singleSubId] = normalizedCloudScore.calculatedScore;
          }
        } else if (!to?.isExternal && to?.subjectId) {
          if (normalizedCloudScore.subjectScores[to.subjectId] === undefined) {
            normalizedCloudScore.subjectScores[to.subjectId] = normalizedCloudScore.calculatedScore;
          }
        }

        const idx = this.state.scores.findIndex(
          s => s.tryoutId === normalizedCloudScore.tryoutId && s.studentId === normalizedCloudScore.studentId
        );
        if (idx === -1) {
          this.state.scores.push(normalizedCloudScore);
          changed = true;
        } else {
          const local = this.state.scores[idx];
          const localSubScores = JSON.stringify(local.subjectScores || {});
          const cloudSubScores = JSON.stringify(normalizedCloudScore.subjectScores || {});
          if (
            local.calculatedScore !== normalizedCloudScore.calculatedScore ||
            local.scoringStatus !== normalizedCloudScore.scoringStatus ||
            localSubScores !== cloudSubScores ||
            local.id !== normalizedCloudScore.id
          ) {
            this.state.scores[idx] = { ...local, ...normalizedCloudScore };
            changed = true;
          }
        }
      });
    }

    // Merge responses
    if (cloud.responses && Array.isArray(cloud.responses) && cloud.responses.length > 0) {
      if (!this.state.responses) this.state.responses = [];
      cloud.responses.forEach(cloudResp => {
        const idx = this.state.responses.findIndex(
          r => r.tryoutId === cloudResp.tryoutId && r.studentId === cloudResp.studentId
        );
        if (idx === -1) {
          this.state.responses.push(cloudResp);
          changed = true;
        } else if (
          this.state.responses[idx].id !== cloudResp.id ||
          this.state.responses[idx].rawScoreGForm !== cloudResp.rawScoreGForm
        ) {
          this.state.responses[idx] = { ...this.state.responses[idx], ...cloudResp };
          changed = true;
        }
      });
    }

    // Merge explanations (Pembahasan Soal)
    if (cloud.explanations && Array.isArray(cloud.explanations)) {
      if (!this.state.explanations) this.state.explanations = [];
      const deletedExplanations = this.getDeletedExplanationIdentifiers();

      cloud.explanations.forEach(ce => {
        if (!ce || !ce.id) return;
        const ceId = ce.id.toLowerCase().trim();
        if (deletedExplanations.has(ceId)) return;

        // Pencocokan HANYA berdasarkan ID kanonik unik UUID — TIDAK BOLEH mencocokkan judul/title!
        // Karena guru dapat menerbitkan banyak pembahasan untuk butir soal berbeda dengan judul seragam.
        const idx = this.state.explanations.findIndex(
          e => Boolean(e.id && e.id.toLowerCase().trim() === ceId)
        );
        if (idx === -1) {
          this.state.explanations.push(ce);
          changed = true;
        } else {
          const local = this.state.explanations[idx];
          const hasDifferentData =
            local.updatedAt !== ce.updatedAt ||
            local.status !== ce.status ||
            local.youtubeUrl !== ce.youtubeUrl ||
            local.pdfUrl !== ce.pdfUrl ||
            local.title !== ce.title ||
            local.tryoutId !== ce.tryoutId ||
            local.subjectId !== ce.subjectId ||
            JSON.stringify(local.questionNumbers || []) !== JSON.stringify(ce.questionNumbers || []) ||
            JSON.stringify(local.questionIds || []) !== JSON.stringify(ce.questionIds || []);

          if (hasDifferentData) {
            this.state.explanations[idx] = {
              ...local,
              ...ce,
              youtubeUrl: ce.youtubeUrl !== undefined ? ce.youtubeUrl : local.youtubeUrl,
              pdfUrl: ce.pdfUrl !== undefined ? ce.pdfUrl : local.pdfUrl,
              pdfStoragePath: ce.pdfStoragePath !== undefined ? ce.pdfStoragePath : local.pdfStoragePath,
              pdfFileName: ce.pdfFileName !== undefined ? ce.pdfFileName : local.pdfFileName,
              pdfFileSize: ce.pdfFileSize !== undefined ? ce.pdfFileSize : local.pdfFileSize,
              externalUrl: ce.externalUrl !== undefined ? ce.externalUrl : local.externalUrl,
              subjectId: ce.subjectId || local.subjectId,
              questionId: ce.questionId || local.questionId,
              questionNumbers: (ce.questionNumbers && ce.questionNumbers.length > 0) ? ce.questionNumbers : (local.questionNumbers || []),
              questionIds: (ce.questionIds && ce.questionIds.length > 0) ? ce.questionIds : (local.questionIds || []),
            };
            changed = true;
          }
        }
      });

      // Rekonsiliasi pembahasan yang telah dihapus di Cloud dari perangkat lain
      if (this.supabaseInitDone || cloud.explanations.length > 0) {
        const cloudExpIds = new Set(cloud.explanations.map(ce => (ce.id || '').toLowerCase().trim()));
        const beforeExpCount = this.state.explanations.length;
        this.state.explanations = this.state.explanations.filter(e => {
          const idKey = (e.id || '').toLowerCase().trim();
          if (deletedExplanations.has(idKey)) return false;
          if (cloudExpIds.has(idKey)) return true;
          // Pertahankan jika item lokal baru saja dibuat/diedit dan sedang dalam antrean sinkronisasi
          if (this.pendingExplanationIds.has(e.id) || this.pendingExplanationIds.has(idKey)) return true;
          // Item sudah dihapus di Supabase Cloud
          return false;
        });
        if (this.state.explanations.length !== beforeExpCount) {
          changed = true;
        }
      }
    }

    // Merge school profile
    if (cloud.schoolProfile) {
      if (this.applySchoolProfile(cloud.schoolProfile)) {
        changed = true;
      }
    }

    return changed;
  }

  /**
   * Public: Export all local data to Supabase.
   * Called from Settings panel "Sinkronisasi ke Cloud" button.
   */
  public async exportToSupabase(): Promise<{ ok: boolean; message: string }> {
    const deletedTryouts = this.getDeletedTryoutIdentifiers();
    const cleanTryouts = (this.state.tryouts || []).filter(t => {
      const idKey = (t.id || '').toLowerCase().trim();
      const codeKey = (t.code || '').toLowerCase().trim();
      return !deletedTryouts.has(idKey) && !deletedTryouts.has(codeKey);
    });

    const result = await sdb.exportAllToSupabase({
      users: this.state.users,
      teachers: this.state.teachers,
      students: this.state.students,
      classes: this.state.classes,
      academicYears: this.state.academicYears,
      subjects: this.state.subjects,
      materials: this.state.materials,
      competencies: this.state.competencies,
      questions: this.state.questions,
      answers: this.state.answers,
      examPackages: this.state.examPackages,
      tryouts: cleanTryouts,
      responses: this.state.responses,
      scores: this.state.scores,
      explanations: this.state.explanations,
      schoolProfile: this.getSchoolProfile(),
    });
    const ok = result.failed === 0;
    const message = ok
      ? `Berhasil menyinkronkan ${result.success} data ke cloud.`
      : `${result.success} berhasil, ${result.failed} gagal. Error: ${result.errors.slice(0, 2).join('; ')}`;
    return { ok, message };
  }

  /**
   * Pull terbaru dari Supabase dan merge ke state lokal.
   * Dilengkapi single-flight lock (isPullingCloud) agar tidak pernah tumpang tindih.
   * Jika pushUnsynced=true (misal saat pengguna menekan tombol "Sinkronkan Cloud"),
   * nilai ujian lokal yang belum masuk ke Supabase akan otomatis didorong terlebih dahulu.
   */
  public async pullFromCloud(pushUnsynced = false): Promise<void> {
    if (!sdb.isAvailable() || this.isPullingCloud || this.isPushingCloud) return;
    this.isPullingCloud = true;

    // Prioritas sinkronisasi cepat profil sekolah
    sdb.fetchSchoolProfile().then(cp => {
      if (cp) this.applySchoolProfile(cp);
    }).catch(() => {});

    try {
      const cloudState = await sdb.fetchCoreState();
      if (!cloudState) return;
      const hadChanges = this.mergeCloudState(cloudState);
      if (hadChanges) {
        this.persistState();
        this.rebuildIndexes();
        this.notifyListeners();
        console.info('[DB] Cloud pull: data berhasil diperbarui dari Supabase.');
      }

      if (pushUnsynced) {
        const validCloudTryoutIds = new Set((cloudState.tryouts || []).map(ct => ct.id));
        const cloudScoreKeys = new Set(
          (cloudState.scores || []).map(cs => `${cs.tryoutId}_${cs.studentId}`)
        );
        const unsyncedScores = (this.state.scores || []).filter(s => {
          if (!validCloudTryoutIds.has(s.tryoutId)) return false;
          return !cloudScoreKeys.has(`${s.tryoutId}_${s.studentId}`);
        });

        if (unsyncedScores.length > 0) {
          const tryoutIdsWithUnsynced = Array.from(new Set(unsyncedScores.map(s => s.tryoutId)));
          for (const toId of tryoutIdsWithUnsynced) {
            const toUnsyncedScores = unsyncedScores.filter(s => s.tryoutId === toId);
            const unsyncedStudentIds = new Set(toUnsyncedScores.map(s => s.studentId));
            const toUnsyncedResponses = (this.state.responses || []).filter(
              r => r.tryoutId === toId && unsyncedStudentIds.has(r.studentId)
            );
            await sdb.syncResponsesAndScores(toId, toUnsyncedResponses, toUnsyncedScores);
          }
        }

        const cloudExpKeys = new Set((cloudState.explanations || []).map(ce => ce.id));
        const deletedExps = this.getDeletedExplanationIdentifiers();
        const unsyncedExplanations = (this.state.explanations || []).filter(
          e => !cloudExpKeys.has(e.id) && !deletedExps.has((e.id || '').toLowerCase().trim())
        );
        if (unsyncedExplanations.length > 0) {
          for (const exp of unsyncedExplanations) {
            await sdb.syncExplanation(exp);
          }
        }

        const cloudPkgCodes = new Set((cloudState.examPackages || []).map(p => (p.code || '').toLowerCase().trim()));
        const cloudPkgIds = new Set((cloudState.examPackages || []).map(p => (p.id || '').toLowerCase().trim()));
        const unsyncedPackages = (this.state.examPackages || []).filter(p => {
          const idKey = (p.id || '').toLowerCase().trim();
          const codeKey = (p.code || '').toLowerCase().trim();
          return !cloudPkgIds.has(idKey) && !cloudPkgCodes.has(codeKey);
        });
        if (unsyncedPackages.length > 0) {
          for (const pkg of unsyncedPackages) {
            await sdb.syncExamPackage(pkg);
          }
        }
      }
    } catch (err) {
      console.warn('[DB] pullFromCloud error:', err);
    } finally {
      this.isPullingCloud = false;
    }
  }

  /**
   * Mulai sinkronisasi otomatis dua arah secara realtime:
   * 1. Supabase Realtime subscription (debounce 500ms)
   * 2. Instant pull saat pindah tab / window fokus kembali (visibilitychange & focus)
   * 3. Polling berkala setiap 8 detik sebagai jaring pengaman
   */
  public startRealtimeSync(): () => void {
    if (!sdb.isAvailable()) return () => {};

    this.syncSubscribersCount++;

    // Jika subscription sudah berjalan, reuse yang sudah ada
    if (!this.realtimeChannel && !this.syncInterval) {
      // 1. Lakukan pull awal agar data langsung sinkron
      this.pullFromCloud();

      // 2. Subscribe Realtime Supabase dengan debounce 500ms
      this.realtimeChannel = sdb.subscribeToChanges(() => {
        if (this.isPushingCloud) return;
        if (this.realtimeDebounceTimer) clearTimeout(this.realtimeDebounceTimer);
        this.realtimeDebounceTimer = setTimeout(() => {
          this.pullFromCloud();
        }, 500);
      });

      // 3. Instant sync saat browser tab atau window kembali difokuskan
      if (typeof window !== 'undefined') {
        this.focusSyncHandler = () => {
          if (!this.isPushingCloud) this.pullFromCloud();
        };
        this.visibilitySyncHandler = () => {
          if (document.visibilityState === 'visible' && !this.isPushingCloud) {
            this.pullFromCloud();
          }
        };
        window.addEventListener('focus', this.focusSyncHandler);
        document.addEventListener('visibilitychange', this.visibilitySyncHandler);
      }

      // 4. Polling fallback setiap 8 detik
      this.syncInterval = setInterval(() => {
        if (!this.isPushingCloud) {
          this.pullFromCloud();
        }
      }, 8_000);
    }

    // Return cleanup function
    return () => {
      this.syncSubscribersCount = Math.max(0, this.syncSubscribersCount - 1);
      if (this.syncSubscribersCount === 0) {
        if (this.realtimeDebounceTimer) {
          clearTimeout(this.realtimeDebounceTimer);
          this.realtimeDebounceTimer = null;
        }
        if (this.syncInterval) {
          clearInterval(this.syncInterval);
          this.syncInterval = null;
        }
        if (typeof window !== 'undefined') {
          if (this.focusSyncHandler) {
            window.removeEventListener('focus', this.focusSyncHandler);
            this.focusSyncHandler = null;
          }
          if (this.visibilitySyncHandler) {
            document.removeEventListener('visibilitychange', this.visibilitySyncHandler);
            this.visibilitySyncHandler = null;
          }
        }
        if (this.realtimeChannel) {
          sdb.unsubscribe(this.realtimeChannel);
          this.realtimeChannel = null;
        }
      }
    };
  }

  private rebuildIndexes() {
    this.responsesByTryoutStudent.clear();
    this.state.responses.forEach(r => {
      this.responsesByTryoutStudent.set(`${r.tryoutId}:${r.studentId}`, r);
    });

    this.answersByTryout.clear();
    this.answersByQuestion.clear();
    this.state.answers.forEach(a => {
      // By Tryout
      const byTo = this.answersByTryout.get(a.tryoutId) || [];
      byTo.push(a);
      this.answersByTryout.set(a.tryoutId, byTo);

      // By Question
      const byQ = this.answersByQuestion.get(a.questionId) || [];
      byQ.push(a);
      this.answersByQuestion.set(a.questionId, byQ);
    });

    this.scoresByTryout.clear();
    this.scoresByStudent.clear();
    this.state.scores.forEach(s => {
      const byTo = this.scoresByTryout.get(s.tryoutId) || [];
      byTo.push(s);
      this.scoresByTryout.set(s.tryoutId, byTo);

      const bySt = this.scoresByStudent.get(s.studentId) || [];
      bySt.push(s);
      this.scoresByStudent.set(s.studentId, bySt);
    });

    this.studentsByClass.clear();
    this.state.students.forEach(st => {
      const byCls = this.studentsByClass.get(st.classId) || [];
      byCls.push(st);
      this.studentsByClass.set(st.classId, byCls);
    });
  }

  private loadCachedSchoolProfile(): SchoolProfile | undefined {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    try {
      const raw = localStorage.getItem(SCHOOL_PROFILE_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.name) {
          return parsed as SchoolProfile;
        }
      }
    } catch (e) {
      console.warn('[DB] Failed to load cached school profile:', e);
    }
    return undefined;
  }

  private saveCachedSchoolProfile(profile: SchoolProfile): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(SCHOOL_PROFILE_CACHE_KEY, JSON.stringify(profile));
    } catch (e) {
      console.warn('[DB] Failed to save school profile cache:', e);
    }
  }

  private loadCachedLiveMonitoringConfig(): LiveMonitoringConfig | undefined {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    try {
      const raw = localStorage.getItem(LIVE_MONITORING_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && typeof parsed.isEnabled === 'boolean') {
          return parsed as LiveMonitoringConfig;
        }
      }
    } catch (e) {
      console.warn('[DB] Failed to load cached live monitoring config:', e);
    }
    return undefined;
  }

  private saveCachedLiveMonitoringConfig(config: LiveMonitoringConfig): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(LIVE_MONITORING_CACHE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('[DB] Failed to save live monitoring cache:', e);
    }
  }

  public applySchoolProfile(cloudProfile: SchoolProfile): boolean {
    const current = this.state?.schoolProfile || this.loadCachedSchoolProfile() || this.getSchoolProfile();
    const hasDiff =
      current.name !== cloudProfile.name ||
      current.subHeader !== cloudProfile.subHeader ||
      current.address !== cloudProfile.address ||
      current.principalName !== cloudProfile.principalName ||
      current.principalNip !== cloudProfile.principalNip ||
      current.academicYear !== cloudProfile.academicYear ||
      current.logoUrl !== cloudProfile.logoUrl;

    if (hasDiff) {
      const merged: SchoolProfile = { ...current, ...cloudProfile };
      if (this.state) {
        this.state.schoolProfile = merged;
      }
      this.saveCachedSchoolProfile(merged);
      this.persistState();
      this.notifyListeners();
      return true;
    }
    return false;
  }

  private loadFromStorage(): DatabaseState {
    const cachedProfile = this.loadCachedSchoolProfile();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.isFreshDevice = false;
        const parsed = JSON.parse(saved);

        if (cachedProfile) {
          parsed.schoolProfile = { ...cachedProfile, ...(parsed.schoolProfile || {}) };
        } else if (parsed.schoolProfile) {
          this.saveCachedSchoolProfile(parsed.schoolProfile);
        }

        // Ensure initial users/teachers exist without overwriting updated roles
        if (parsed.users && Array.isArray(parsed.users)) {
          INITIAL_USERS.forEach(iu => {
            const existing = parsed.users.find((u: any) => u.id === iu.id || u.email?.toLowerCase() === iu.email.toLowerCase());
            if (!existing) {
              parsed.users.push(iu);
            }
          });
        } else {
          parsed.users = INITIAL_USERS;
        }

        if (parsed.teachers && Array.isArray(parsed.teachers)) {
          INITIAL_TEACHERS.forEach(it => {
            const existing = parsed.teachers.find((t: any) => t.id === it.id || t.userId === it.userId || (it.email && t.email?.toLowerCase() === it.email.toLowerCase()));
            if (!existing) {
              parsed.teachers.push(it);
            }
          });
        } else {
          parsed.teachers = INITIAL_TEACHERS;
        }

        // Pastikan semua pengguna ber-role ADMIN memiliki profil di parsed.teachers agar tampil di daftar pengguna
        if (parsed.users && Array.isArray(parsed.users) && parsed.teachers && Array.isArray(parsed.teachers)) {
          parsed.users.forEach((u: any) => {
            if (u.role === 'ADMIN') {
              const hasTeacher = parsed.teachers.some((t: any) => t.userId === u.id || (u.email && t.email?.toLowerCase() === u.email.toLowerCase()));
              if (!hasTeacher) {
                parsed.teachers.push({
                  id: `t-${u.id}`,
                  userId: u.id,
                  nip: u.id === 'u-admin-custom' ? 'ADMIN-001' : (u.id === 'u-admin' ? '196803121994031002' : `ADM-${u.id.replace('u-', '')}`),
                  name: u.name,
                  email: u.email,
                  phone: '',
                  password: u.password,
                  subjectPermissions: [],
                  classPermissions: [],
                  isWaliKelas: false,
                });
              }
            }
          });
        }

        // Clean out legacy mock data & tombstoned tryouts if present in localStorage
        const legacyMockToIds = new Set(['to-1', 'to-2', 'to-3', 'to-4']);
        const deletedTryouts = this.getDeletedTryoutIdentifiers();
        if (parsed.tryouts && Array.isArray(parsed.tryouts)) {
          parsed.tryouts = parsed.tryouts.filter((t: any) => {
            if (legacyMockToIds.has(t.id)) return false;
            const toId = (t.id || '').toLowerCase().trim();
            const toCode = (t.code || '').toLowerCase().trim();
            if (deletedTryouts.has(toId) || (toCode && deletedTryouts.has(toCode))) return false;
            return true;
          });
        }
        if (parsed.scores && Array.isArray(parsed.scores)) {
          parsed.scores = parsed.scores.filter((s: any) => {
            if (legacyMockToIds.has(s.tryoutId) || s.id?.startsWith('sc-')) return false;
            const toId = (s.tryoutId || '').toLowerCase().trim();
            if (deletedTryouts.has(toId)) return false;
            return true;
          });
        }
        if (parsed.responses && Array.isArray(parsed.responses)) {
          parsed.responses = parsed.responses.filter((r: any) => {
            if (legacyMockToIds.has(r.tryoutId) || r.id?.startsWith('resp-')) return false;
            const toId = (r.tryoutId || '').toLowerCase().trim();
            if (deletedTryouts.has(toId)) return false;
            return true;
          });
        }
        if (parsed.answers && Array.isArray(parsed.answers)) {
          const ansDedup = new Map<string, any>();
          parsed.answers.forEach((a: any) => {
            if (!a || legacyMockToIds.has(a.tryoutId) || a.id?.startsWith('ans-')) return;
            const toId = (a.tryoutId || '').toLowerCase().trim();
            if (deletedTryouts.has(toId)) return;
            ansDedup.set(`${a.tryoutId}:${a.studentId}:${a.questionId}`, a);
          });
          parsed.answers = Array.from(ansDedup.values());
        }
        if (parsed.questions && Array.isArray(parsed.questions)) {
          parsed.questions = parsed.questions.filter((q: any) => !q.uniqueCode?.startsWith('MAT-TO03-'));
        }
        if (parsed.examPackages && Array.isArray(parsed.examPackages)) {
          parsed.examPackages = parsed.examPackages.filter((p: any) => p.id !== 'pkt-arsip-awal');
        } else {
          parsed.examPackages = [];
        }

        const deletedExplanations = this.getDeletedExplanationIdentifiers();
        if (parsed.explanations && Array.isArray(parsed.explanations)) {
          parsed.explanations = parsed.explanations.filter((e: any) => {
            if (!e || legacyMockToIds.has(e.tryoutId)) return false;
            const toId = (e.tryoutId || '').toLowerCase().trim();
            if (deletedTryouts.has(toId)) return false;
            const expId = (e.id || '').toLowerCase().trim();
            if (deletedExplanations.has(expId)) return false;
            return true;
          });
        }

        return parsed;
      }
    } catch (err) {
      console.warn('Failed to load DB from localStorage, falling back to initial seed:', err);
    }

    this.isFreshDevice = true;
    const defaultState: DatabaseState = {
      users: INITIAL_USERS,
      teachers: INITIAL_TEACHERS,
      students: INITIAL_STUDENTS,
      classes: INITIAL_CLASSES,
      studentClasses: [],
      academicYears: INITIAL_ACADEMIC_YEARS,
      subjects: INITIAL_SUBJECTS,
      teacherSubjects: INITIAL_TEACHER_SUBJECTS,
      materials: INITIAL_MATERIALS,
      competencies: INITIAL_COMPETENCIES,
      examPackages: [],
      tryouts: [],
      tryoutSubjects: [],
      questions: [],
      tryoutQuestions: [],
      googleForms: [],
      responses: [],
      answers: [],
      scores: [],
      questionAnalysis: [],
      explanations: [],
      reports: [],
      auditLogs: [],
      schoolProfile: cachedProfile,
    };
    return defaultState;
  }

  private persistState() {
    this.rebuildIndexes();
    if (this.state.schoolProfile) {
      this.saveCachedSchoolProfile(this.state.schoolProfile);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      console.error('Failed to save DB state to localStorage:', err);
    }
    this.notifyListeners();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(fn => fn());
  }

  public resetToDefault(currentUser?: any) {
    localStorage.removeItem(STORAGE_KEY);
    this.state = this.loadFromStorage();
    if (currentUser) {
      this.logAudit(currentUser, 'SYSTEM_RESET', 'DATABASE', 'Admin mereset seluruh database ke data pabrik default.');
    }
    this.persistState();
  }

  public getState(): DatabaseState {
    return { ...this.state };
  }

  public getSchoolProfile(): SchoolProfile {
    return this.state.schoolProfile || this.loadCachedSchoolProfile() || {
      name: 'NAMA SEKOLAH ANDA',
      subHeader: 'SISTEM ASESMEN & ANALISIS TRY OUT TERPADU',
      address: 'Alamat Sekolah · Kota · Akreditasi · NPSN',
      principalName: 'Nama Kepala Sekolah',
      principalNip: '-',
      academicYear: '2025/2026 (Semester Genap)',
    };
  }

  public updateSchoolProfile(profile: Partial<SchoolProfile>, currentUser?: any): SchoolProfile {
    if (currentUser) {
      this.assertAdmin(currentUser, 'UPDATE_SCHOOL_PROFILE');
    }
    const current = this.getSchoolProfile();
    const updated: SchoolProfile = {
      ...current,
      ...profile,
    };
    this.state.schoolProfile = updated;
    this.saveCachedSchoolProfile(updated);
    this.persistState();
    this.notifyListeners();
    if (this.supabaseSyncEnabled) sdb.syncSchoolProfile(updated).catch(() => {});
    if (currentUser) {
      this.logAudit(
        currentUser,
        'UPDATE_SCHOOL_PROFILE',
        'SYSTEM',
        `Admin memperbarui informasi sekolah: ${updated.name}`
      );
    }
    return updated;
  }

  public getLiveMonitoringConfig(): LiveMonitoringConfig {
    if (this.state.liveMonitoringConfig) {
      return this.state.liveMonitoringConfig;
    }
    const cached = this.loadCachedLiveMonitoringConfig();
    if (cached) {
      this.state.liveMonitoringConfig = cached;
      return cached;
    }
    const defaultPackage = this.state.examPackages?.[0];
    const defaultConfig: LiveMonitoringConfig = {
      isEnabled: false,
      targetType: defaultPackage ? 'EXAM_PACKAGE' : 'TRYOUT_STAGE',
      targetId: defaultPackage ? defaultPackage.id : 'TO 1',
      hideScores: true,
      lastUpdated: new Date().toISOString()
    };
    this.state.liveMonitoringConfig = defaultConfig;
    return defaultConfig;
  }

  public updateLiveMonitoringConfig(config: Partial<LiveMonitoringConfig>, currentUser?: any): LiveMonitoringConfig {
    if (currentUser) {
      this.assertAdmin(currentUser, 'UPDATE_LIVE_MONITORING_CONFIG');
    }
    const current = this.getLiveMonitoringConfig();
    const updated: LiveMonitoringConfig = {
      ...current,
      ...config,
      lastUpdated: new Date().toISOString()
    };
    this.state.liveMonitoringConfig = updated;
    this.saveCachedLiveMonitoringConfig(updated);
    this.persistState();
    this.notifyListeners();
    if (currentUser) {
      this.logAudit(
        currentUser,
        'UPDATE_LIVE_MONITORING_CONFIG',
        'SYSTEM',
        `Admin mengubah status live monitoring (${updated.isEnabled ? 'AKTIF' : 'NONAKTIF'}, target: ${updated.targetId})`
      );
    }
    return updated;
  }

  public getLiveMonitoringData(selectedSubjectId?: string): LiveMonitoringPayload {
    const config = this.getLiveMonitoringConfig();
    const allTryouts = this.state.tryouts || [];
    const allPackages = this.state.examPackages || [];
    const allClasses = this.state.classes || [];
    const allStudents = (this.state.students || []).filter(s => !s.isAnswerKeyAccount);
    const allScores = this.state.scores || [];
    const allResponses = this.state.responses || [];

    let title = 'Live Monitoring Asesmen';
    let subTitle = `Tahun Ajaran ${this.getSchoolProfile().academicYear}`;
    let assessmentType = 'TRYOUT';
    let targetClassIds: string[] = [];
    let targetGrades: string[] = [];

    const subjectItemsMap = new Map<string, {
      subject: Subject;
      tryoutIds: string[];
      passingGrade: number;
    }>();

    if (config.targetType === 'EXAM_PACKAGE') {
      const pkg = allPackages.find(p => p.id === config.targetId) || allPackages[0];
      if (pkg) {
        title = pkg.title;
        assessmentType = pkg.assessmentType || 'TRYOUT';
        subTitle = `Paket ${assessmentType} · TP ${this.getSchoolProfile().academicYear}`;
        targetClassIds = pkg.targetClassIds || [];
        targetGrades = pkg.targetGrades || [];

        (pkg.subjects || []).forEach(ps => {
          const sub = this.state.subjects.find(s => s.id === ps.subjectId);
          if (sub) {
            const matchingTryouts = allTryouts.filter(t =>
              (t.packageId === pkg.id && (t.subjectId === sub.id || !t.subjectId)) ||
              (t.packageId === pkg.id && t.title.toLowerCase().includes(sub.name.toLowerCase()))
            );
            const tryoutIds = matchingTryouts.map(t => t.id);
            if (tryoutIds.length === 0) {
              const anyPkgTryout = allTryouts.find(t => t.packageId === pkg.id);
              if (anyPkgTryout) tryoutIds.push(anyPkgTryout.id);
            }
            subjectItemsMap.set(sub.id, {
              subject: sub,
              tryoutIds,
              passingGrade: ps.passingGrade || sub.passingGrade || 75
            });
          }
        });
      }
    } else {
      const stageLabel = config.targetId || 'TO 1';
      title = `Try Out Siklus ${stageLabel}`;
      assessmentType = 'TRYOUT';
      subTitle = `Siklus ${stageLabel} · TP ${this.getSchoolProfile().academicYear}`;

      const matchingTryouts = allTryouts.filter(t => {
        const grp = resolveTryoutGroup(t, allTryouts, allPackages);
        return grp === stageLabel;
      });

      matchingTryouts.forEach(t => {
        let sub = t.subjectId ? this.state.subjects.find(s => s.id === t.subjectId) : undefined;
        if (!sub) {
          sub = this.state.subjects.find(s => t.title.toLowerCase().includes(s.name.toLowerCase()));
        }
        if (sub) {
          const existing = subjectItemsMap.get(sub.id);
          if (existing) {
            if (!existing.tryoutIds.includes(t.id)) existing.tryoutIds.push(t.id);
          } else {
            subjectItemsMap.set(sub.id, {
              subject: sub,
              tryoutIds: [t.id],
              passingGrade: t.scoringConfig?.passingGrade || sub.passingGrade || 75
            });
          }
        }
      });
    }

    if (subjectItemsMap.size === 0 && this.state.subjects.length > 0) {
      this.state.subjects.slice(0, 4).forEach(sub => {
        subjectItemsMap.set(sub.id, {
          subject: sub,
          tryoutIds: [],
          passingGrade: sub.passingGrade || 75
        });
      });
    }

    let filteredClasses = allClasses;
    if (targetClassIds.length > 0) {
      filteredClasses = allClasses.filter(c => targetClassIds.includes(c.id));
    } else if (targetGrades.length > 0) {
      filteredClasses = allClasses.filter(c => targetGrades.includes(c.gradeLevel));
    }
    const filteredClassIds = new Set(filteredClasses.map(c => c.id));

    let eligibleStudents = allStudents;
    if (filteredClassIds.size > 0 && targetClassIds.length > 0) {
      eligibleStudents = allStudents.filter(s => filteredClassIds.has(s.classId));
    }

    const subjectList: MonitoringSubjectItem[] = [];
    subjectItemsMap.forEach(({ subject, tryoutIds, passingGrade }, subId) => {
      let submittedCount = 0;
      if (tryoutIds.length > 0) {
        const submittedStudentIds = new Set<string>();
        allScores.forEach(sc => {
          if (tryoutIds.includes(sc.tryoutId)) submittedStudentIds.add(sc.studentId);
        });
        allResponses.forEach(r => {
          if (tryoutIds.includes(r.tryoutId)) submittedStudentIds.add(r.studentId);
        });
        submittedCount = eligibleStudents.filter(st => submittedStudentIds.has(st.id)).length;
      }

      subjectList.push({
        id: subId,
        name: subject.name,
        code: subject.code,
        passingGrade,
        totalStudents: eligibleStudents.length,
        submittedCount
      });
    });

    const activeSubjectId = (selectedSubjectId && subjectItemsMap.has(selectedSubjectId))
      ? selectedSubjectId
      : (subjectList[0]?.id || '');
    const activeSubjectInfo = activeSubjectId ? subjectItemsMap.get(activeSubjectId) : undefined;
    const activeSubjectItem = subjectList.find(s => s.id === activeSubjectId);

    const activeTryoutIds = activeSubjectInfo?.tryoutIds || [];
    const activePassingGrade = activeSubjectInfo?.passingGrade || 75;

    const studentScoreMap = new Map<string, Score>();
    const studentResponseMap = new Map<string, Response>();

    if (activeTryoutIds.length > 0) {
      allScores.forEach(sc => {
        if (activeTryoutIds.includes(sc.tryoutId)) {
          studentScoreMap.set(sc.studentId, sc);
        }
      });
      allResponses.forEach(r => {
        if (activeTryoutIds.includes(r.tryoutId)) {
          studentResponseMap.set(r.studentId, r);
        }
      });
    }

    const studentRows: StudentMonitoringItem[] = eligibleStudents.map(student => {
      const cls = allClasses.find(c => c.id === student.classId);
      const scoreObj = studentScoreMap.get(student.id);
      const respObj = studentResponseMap.get(student.id);
      const isSubmitted = !!scoreObj || !!respObj;

      let scoreVal: number | undefined = undefined;
      if (scoreObj) {
        scoreVal = typeof scoreObj.calculatedScore === 'number'
          ? scoreObj.calculatedScore
          : (typeof scoreObj.googleFormScore === 'number' ? scoreObj.googleFormScore : scoreObj.subjectScores?.[activeSubjectId]);
      } else if (respObj && typeof respObj.rawScoreGForm === 'number') {
        scoreVal = respObj.rawScoreGForm;
      }

      return {
        studentId: student.id,
        nisn: student.nisn,
        name: student.name,
        gender: student.gender,
        classId: student.classId,
        className: cls?.name || 'Kelas -',
        gradeLevel: cls?.gradeLevel || '',
        isSubmitted,
        submittedAt: respObj?.submittedAt || scoreObj?.createdAt,
        score: scoreVal,
        passingGrade: activePassingGrade
      };
    });

    const submittedRows = studentRows.filter(s => s.isSubmitted);
    const submittedCount = submittedRows.length;
    const unsubmittedCount = studentRows.length - submittedCount;
    const scoresArray = submittedRows
      .map(s => s.score)
      .filter((sc): sc is number => typeof sc === 'number' && !isNaN(sc));

    const totalScoresSum = scoresArray.reduce((acc, curr) => acc + curr, 0);
    const averageScore = scoresArray.length > 0 ? Math.round((totalScoresSum / scoresArray.length) * 10) / 10 : 0;
    const highestScore = scoresArray.length > 0 ? Math.max(...scoresArray) : 0;
    const lowestScore = scoresArray.length > 0 ? Math.min(...scoresArray) : 0;

    const gradeLevels = Array.from(new Set(filteredClasses.map(c => c.gradeLevel))).filter(Boolean).sort();

    return {
      config,
      title,
      subTitle,
      targetType: config.targetType,
      assessmentType,
      subjects: subjectList,
      activeSubject: activeSubjectItem,
      students: studentRows,
      classes: filteredClasses,
      gradeLevels,
      summary: {
        totalStudents: studentRows.length,
        submittedCount,
        unsubmittedCount,
        averageScore,
        highestScore,
        lowestScore
      },
      lastSyncedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
  }

  // SECURITY: Require Admin Authorization Helper
  private assertAdmin(currentUser: any, actionName: string) {
    if (!currentUser) return; // System action bypass (misal proses sinkronisasi background)
    if (currentUser.role !== 'ADMIN') {
      this.logAudit(
        currentUser,
        'UNAUTHORIZED_MUTATION_ATTEMPT',
        'SECURITY',
        `Pengguna non-admin (${currentUser.name} - ${currentUser.role}) mencoba mengeksekusi '${actionName}'.`
      );
      throw new Error(`Akses Ditolak (403): Hanya Administrator yang berwenang melakukan '${actionName}'.`);
    }
  }

  // SECURITY: Require Admin or Teacher Authorization Helper
  private assertAdminOrTeacher(currentUser: any, actionName: string) {
    if (!currentUser) return; // System action bypass
    if (currentUser.role !== 'ADMIN' && currentUser.role !== 'GURU') {
      this.logAudit(
        currentUser,
        'UNAUTHORIZED_MUTATION_ATTEMPT',
        'SECURITY',
        `Pengguna tidak berwenang (${currentUser.name} - ${currentUser.role}) mencoba mengeksekusi '${actionName}'.`
      );
      throw new Error(`Akses Ditolak (403): Hanya Guru atau Administrator yang berwenang melakukan '${actionName}'.`);
    }
  }

  // SECURITY: Teacher Permissions & Isolation Helpers
  public getTeacherByUserId(userIdOrUser: any): Teacher | undefined {
    if (!userIdOrUser) return undefined;
    const searchId = typeof userIdOrUser === 'string' ? userIdOrUser : userIdOrUser.id;
    const searchEmail = typeof userIdOrUser === 'object' ? userIdOrUser.email : (typeof userIdOrUser === 'string' && userIdOrUser.includes('@') ? userIdOrUser : undefined);

    return this.state.teachers.find(t =>
      (searchId && t.userId === searchId) ||
      (searchEmail && t.email && t.email.toLowerCase() === searchEmail.toLowerCase()) ||
      (searchId && t.email && t.email.toLowerCase() === searchId.toLowerCase()) ||
      (searchId && t.nip && t.nip.trim().toLowerCase() === searchId.toLowerCase())
    );
  }

  public getTeacherAllowedSubjectIds(currentUser: any): string[] {
    if (!currentUser) return [];
    if (currentUser.role === 'ADMIN') {
      return (this.state.subjects || []).filter(s => s && s.id).map(s => s.id);
    }
    const teacher = this.getTeacherByUserId(currentUser);
    if (!teacher || !teacher.subjectPermissions || teacher.subjectPermissions.length === 0) {
      return (this.state.subjects || []).filter(s => s && s.id).map(s => s.id);
    }

    // Ambil subjectPermissions yang valid (terdaftar di daftar mata pelajaran aktif sekolah)
    const validPerms = teacher.subjectPermissions.filter(pid => (this.state.subjects || []).some(s => s.id === pid));
    if (validPerms.length > 0) {
      return validPerms;
    }

    // Resolusi Cerdas: Jika subjectPermissions berisi ID lama atau format berbeda (misal 'subj-bin', 'subj-mat'),
    // atau jika belum tercocokkan, cari kesesuaian berdasarkan kode/nama mapel atau nama guru
    const smartMatched = (this.state.subjects || []).filter(s => {
      const sName = (s.name || '').toLowerCase();
      const sCode = (s.code || '').toLowerCase();
      const tName = (teacher.name || '').toLowerCase();

      // Cek apakah permission lama memiliki kemiripan kode/nama (misal 'subj-bin' -> code 'bin')
      const matchesOldPerm = teacher.subjectPermissions.some(pid => {
        const pLower = pid.toLowerCase();
        return (sCode && pLower.includes(sCode)) || (sName && sName.length >= 3 && pLower.includes(sName.slice(0, 3)));
      });
      if (matchesOldPerm) return true;

      // Cek apakah nama guru mencerminkan mata pelajaran
      if (tName.includes('matematika') && (sName.includes('matematika') || sCode === 'mat')) return true;
      if ((tName.includes('bahasa') || tName.includes('indo')) && (sName.includes('bahasa') || sName.includes('indonesia') || sCode === 'bin')) return true;

      return false;
    }).map(s => s.id);

    if (smartMatched.length > 0) {
      return smartMatched;
    }

    // Jika seluruh subjectPermissions adalah ID lama yang tidak ada di daftar mata pelajaran aktif sekolah,
    // berikan fallback ke seluruh mata pelajaran aktif agar akun guru tidak terkunci (403)
    return (this.state.subjects || []).filter(s => s && s.id).map(s => s.id);
  }

  public getTeacherAllowedClassIds(currentUser: any): string[] {
    if (!currentUser) return [];
    if (currentUser.role === 'ADMIN') {
      return (this.state.classes || []).filter(c => c && c.id).map(c => c.id);
    }
    const teacher = this.getTeacherByUserId(currentUser);
    if (!teacher) {
      return (this.state.classes || []).filter(c => c && c.id).map(c => c.id);
    }
    const fromSubjects = (this.state.teacherSubjects || [])
      .filter(ts => ts && ts.teacherId === teacher.id)
      .map(ts => ts.classId);
    const fromTeacher = teacher.classPermissions || [];
    const combined = Array.from(new Set([...fromSubjects, ...fromTeacher]));
    return combined.length > 0 ? combined : (this.state.classes || []).filter(c => c && c.id).map(c => c.id);
  }

  public assertTeacherSubject(currentUser: any, subjectId: string, actionName: string) {
    if (!currentUser) return; // System action bypass
    if (currentUser.role === 'ADMIN') return; // Admin bypass
    if (currentUser.role !== 'GURU') {
      this.logAudit(
        currentUser,
        'UNAUTHORIZED_MUTATION_ATTEMPT',
        'SECURITY',
        `Akses pengguna non-guru (${currentUser.name} - ${currentUser.role}) ditolak pada '${actionName}'.`
      );
      throw new Error(`Akses Ditolak (403): Hanya Guru atau Admin yang berwenang.`);
    }

    const allowedSubjects = this.getTeacherAllowedSubjectIds(currentUser);
    // Toleransi Cerdas: Izinkan jika mapel terdaftar di penugasan guru ATAU paket tryout terkait ada di sistem
    const isSubjectInTryout = (this.state.tryouts || []).some(t => t.subjectId === subjectId);
    if (!allowedSubjects.includes(subjectId) && !isSubjectInTryout) {
      this.logAudit(
        currentUser,
        'UNAUTHORIZED_TEACHER_MUTATION',
        'SECURITY',
        `Guru ${currentUser.name} (ID: ${currentUser.id}) mencoba memodifikasi data pada mata pelajaran di luar izin penugasan (Subject: ${subjectId}) pada '${actionName}'.`
      );
      throw new Error(`Akses Ditolak (403): Guru tidak memiliki hak akses untuk mata pelajaran '${subjectId}' pada '${actionName}'.`);
    }
  }

  public assertTeacherClass(currentUser: any, classId: string, actionName: string) {
    if (!currentUser) {
      throw new Error(`Akses Ditolak (401): Pengguna belum terautentikasi untuk '${actionName}'.`);
    }
    if (currentUser.role === 'ADMIN') return; // Admin bypass
    if (!classId || classId === 'ALL') return; // Safe bypass: parameter ALL atau kosong bukan pelanggaran hak akses
    const allowedClasses = this.getTeacherAllowedClassIds(currentUser);
    if (allowedClasses.length > 0 && !allowedClasses.includes(classId)) {
      this.logAudit(
        currentUser,
        'UNAUTHORIZED_TEACHER_ACCESS',
        'SECURITY',
        `Guru ${currentUser.name} mencoba mengakses data kelas di luar penugasan (Class: ${classId}) pada '${actionName}'.`
      );
      throw new Error(`Akses Ditolak (403): Guru tidak memiliki hak akses untuk kelas '${classId}'.`);
    }
  }

  // TEACHER SCOPED QUERIES (STRICT TEACHER ISOLATION)
  public getQuestionsForTeacher(currentUser: any): Question[] {
    if (!currentUser) return [];
    if (currentUser.role === 'ADMIN') return this.state.questions;
    const allowed = this.getTeacherAllowedSubjectIds(currentUser);
    return this.state.questions.filter(q => allowed.includes(q.subjectId));
  }

  public getMaterialsForTeacher(currentUser: any): Material[] {
    if (!currentUser) return [];
    if (currentUser.role === 'ADMIN') return this.state.materials;
    const allowed = this.getTeacherAllowedSubjectIds(currentUser);
    return this.state.materials.filter(m => allowed.includes(m.subjectId));
  }

  public getCompetenciesForTeacher(currentUser: any): Competency[] {
    if (!currentUser) return [];
    if (currentUser.role === 'ADMIN') return this.state.competencies;
    const allowed = this.getTeacherAllowedSubjectIds(currentUser);
    return this.state.competencies.filter(c => allowed.includes(c.subjectId));
  }

  public static sortClassesNatural(classes: ClassRoom[]): ClassRoom[] {
    return [...classes].sort((a, b) => {
      const nameA = a?.name || '';
      const nameB = b?.name || '';
      return nameA.localeCompare(nameB, 'id', { numeric: true, sensitivity: 'base' });
    });
  }

  public getTryoutsForTeacher(currentUser: any, filterType: 'TRYOUT' | 'SUMATIF' | 'ALL' = 'TRYOUT'): Tryout[] {
    if (!currentUser) return [];
    if (currentUser.role === 'ADMIN') {
      return (this.state.tryouts || []).filter(t => {
        if (!t) return false;
        if (filterType === 'TRYOUT') return !t.assessmentType || t.assessmentType === 'TRYOUT';
        if (filterType === 'SUMATIF') return t.assessmentType === 'SAT' || t.assessmentType === 'SAS';
        return true;
      });
    }
    const teacher = this.getTeacherByUserId(currentUser);
    const hasUnrestrictedSubjects = !teacher || !teacher.subjectPermissions || teacher.subjectPermissions.length === 0;
    if (hasUnrestrictedSubjects) {
      return (this.state.tryouts || []).filter(t => {
        if (!t) return false;
        if (filterType === 'TRYOUT') return !t.assessmentType || t.assessmentType === 'TRYOUT';
        if (filterType === 'SUMATIF') return t.assessmentType === 'SAT' || t.assessmentType === 'SAS';
        return true;
      });
    }
    const allowedSubjectIds = this.getTeacherAllowedSubjectIds(currentUser);
    const allowedSubjects = new Set(allowedSubjectIds);
    const allowedCodes = new Set(
      (this.state.subjects || [])
        .filter(s => allowedSubjects.has(s.id))
        .map(s => s.code.toLowerCase().trim())
    );
    const allowedNames = new Set(
      (this.state.subjects || [])
        .filter(s => allowedSubjects.has(s.id))
        .map(s => s.name.toLowerCase().trim())
    );

    const relevantTryoutIds = new Set(
      (this.state.tryoutSubjects || [])
        .filter(tsub => tsub && allowedSubjects.has(tsub.subjectId))
        .map(tsub => tsub.tryoutId)
    );

    const filtered = (this.state.tryouts || []).filter(t => {
      if (!t) return false;

      // Filter berdasarkan tipe asesmen (Try Out vs Sumatif SAT/SAS)
      if (filterType === 'TRYOUT' && t.assessmentType && t.assessmentType !== 'TRYOUT') {
        return false;
      }
      if (filterType === 'SUMATIF' && (!t.assessmentType || t.assessmentType === 'TRYOUT')) {
        return false;
      }

      // 1. KASUS TO EKSTERNAL:
      // Guru mapel HANYA boleh melihat TO Eksternal JIKA mata pelajaran yang diampunya
      // termasuk di dalam daftar mata pelajaran yang diujikan dalam paket tersebut.
      if (t.isExternal) {
        if (t.externalSubjectIds && t.externalSubjectIds.some(sid => allowedSubjects.has(sid))) {
          return true;
        }
        if (t.externalSubjects && t.externalSubjects.some(subName => {
          const norm = subName.toLowerCase().trim();
          return allowedNames.has(norm) || allowedCodes.has(norm);
        })) {
          return true;
        }
        // Jika tidak ada mapel guru di dalam TO Eksternal ini, sembunyikan!
        return false;
      }

      // 2. KASUS TO INTERNAL (Google Form / Sheet):
      // Guru mapel HANYA boleh melihat TO Internal yang mata pelajarannya sesuai wewenangnya.
      if (t.subjectId) {
        if (allowedSubjects.has(t.subjectId)) return true;
        const subj = (this.state.subjects || []).find(s => s.id === t.subjectId);
        if (subj && (allowedCodes.has(subj.code.toLowerCase().trim()) || allowedNames.has(subj.name.toLowerCase().trim()))) {
          return true;
        }
        return false;
      }

      // 3. KASUS MULTI-SUBJEK TERSINKRON (via tabel tryoutSubjects):
      if (relevantTryoutIds.has(t.id)) return true;

      // Jika tryout sama sekali tidak memiliki identitas mapel, jangan bocorkan ke guru mapel spesifik
      return false;
    });

    return filtered;
  }

  public getClassesForTeacher(currentUser: any): ClassRoom[] {
    if (!currentUser) return [];
    if (currentUser.role === 'ADMIN') return DatabaseService.sortClassesNatural(this.state.classes || []);
    const allowedClasses = this.getTeacherAllowedClassIds(currentUser);
    const filtered = (this.state.classes || []).filter(c => c && allowedClasses.includes(c.id));
    return DatabaseService.sortClassesNatural(filtered.length > 0 ? filtered : (this.state.classes || []));
  }

  public getStudentsForTeacher(currentUser: any, classIdFilter?: string): Student[] {
    if (!currentUser) return [];
    if (currentUser.role === 'ADMIN') {
      if (classIdFilter && classIdFilter !== 'ALL') {
        return (this.state.students || []).filter(s => s && s.classId === classIdFilter && !s.isAnswerKeyAccount);
      }
      return (this.state.students || []).filter(s => s && !s.isAnswerKeyAccount);
    }
    const allowedClassIds = this.getTeacherAllowedClassIds(currentUser);
    let filtered = (this.state.students || []).filter(s => s && allowedClassIds.includes(s.classId) && !s.isAnswerKeyAccount);
    if (filtered.length === 0 && (this.state.classes || []).length > 0) {
      filtered = (this.state.students || []).filter(s => s && !s.isAnswerKeyAccount);
    }
    if (classIdFilter && classIdFilter !== 'ALL') {
      filtered = filtered.filter(s => s && s.classId === classIdFilter);
    }
    return filtered;
  }

  // AUDIT LOG
  public logAudit(user: { id?: string; name?: string; role?: any } | null | undefined, action: string, targetEntity: string, details: string): AuditLog {
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      userId: user?.id || 'system',
      userName: user?.name || 'Sistem Otomatis',
      role: (user?.role as any) || 'SYSTEM',
      action,
      targetEntity,
      details,
      ipAddress: '127.0.0.1',
      timestamp: new Date().toISOString(),
    };
    this.state.auditLogs = [newLog, ...this.state.auditLogs];
    this.persistState();
    return newLog;
  }

  // STUDENTS CRUD
  public getStudents(): Student[] { return this.state.students; }
  public getStudentByNisn(nisn: string): Student | undefined {
    return this.state.students.find(s => s.nisn.trim() === nisn.trim());
  }
  public getStudentByBirthDateAndNisn(birthDate: string, nisn: string): Student | undefined {
    const cleanDate = birthDate.trim();
    const cleanNisn = nisn.trim();
    return this.state.students.find(s => {
      const matchNisn = s.nisn.trim() === cleanNisn;
      const matchDate = s.birthDate ? s.birthDate.trim() === cleanDate : true;
      return matchNisn && matchDate;
    });
  }
  public getStudentByBirthDateAndNis(birthDate: string, nis: string): Student | undefined {
    const cleanDate = birthDate.trim();
    const cleanNis = nis.trim();
    return this.state.students.find(s => {
      const matchNis = (s.nis ? s.nis.trim() === cleanNis : false) || s.nisn.trim() === cleanNis;
      const matchDate = s.birthDate ? s.birthDate.trim() === cleanDate : true;
      return matchNis && matchDate;
    });
  }
  public addStudent(student: Omit<Student, 'id'>, currentUser: any): Student {
    this.assertAdmin(currentUser, 'CREATE_STUDENT');

    // Duplicate NISN validation
    if (this.state.students.some(s => s.nisn.trim() === student.nisn.trim())) {
      throw new Error(`Validasi Gagal: NISN '${student.nisn}' sudah terdaftar dalam sistem.`);
    }

    const newStudent: Student = { ...student, id: generateUuid() };
    this.state.students.push(newStudent);
    this.logAudit(currentUser, 'CREATE_STUDENT', 'STUDENT', `Menambahkan siswa baru: ${newStudent.name} (NISN: ${newStudent.nisn})`);
    this.persistState();
    this.rebuildIndexes();
    this.notifyListeners();

    // Fire-and-forget cloud sync
    if (this.supabaseSyncEnabled) {
      const classRef = this.state.classes.find(c => c.id === newStudent.classId);
      sdb.syncStudent(newStudent, newStudent.classId, classRef?.name).catch(err => {
        console.error('[DB] Gagal sinkronisasi siswa ke cloud:', err);
      });
    }
    return newStudent;
  }
  public updateStudent(id: string, updates: Partial<Student>, currentUser: any) {
    this.assertAdmin(currentUser, 'UPDATE_STUDENT');
    if (updates.nisn) {
      const duplicate = this.state.students.find(s => s.id !== id && s.nisn.trim() === updates.nisn?.trim());
      if (duplicate) {
        throw new Error(`Validasi Gagal: NISN '${updates.nisn}' sudah digunakan oleh siswa lain.`);
      }
    }
    this.state.students = this.state.students.map(s => s.id === id ? { ...s, ...updates } : s);
    this.logAudit(currentUser, 'UPDATE_STUDENT', 'STUDENT', `Memperbarui data siswa ID: ${id}`);
    this.persistState();
    this.rebuildIndexes();
    this.notifyListeners();

    // Fire-and-forget cloud sync
    if (this.supabaseSyncEnabled) {
      const updatedS = this.state.students.find(s => s.id === id);
      if (updatedS) {
        const classRef = this.state.classes.find(c => c.id === updatedS.classId);
        sdb.syncStudent(updatedS, updatedS.classId, classRef?.name).catch(err => {
          console.error('[DB] Gagal sinkronisasi update siswa ke cloud:', err);
        });
      }
    }
  }
  public deleteStudent(id: string, currentUser: any) {
    this.assertAdmin(currentUser, 'DELETE_STUDENT');
    const student = this.state.students.find(s => s.id === id);
    this.state.students = this.state.students.filter(s => s.id !== id);
    this.logAudit(currentUser, 'DELETE_STUDENT', 'STUDENT', `Menghapus data siswa: ${student?.name || id}`);
    this.persistState();
    this.rebuildIndexes();
    this.notifyListeners();

    // Fire-and-forget cloud sync
    if (this.supabaseSyncEnabled && student?.nisn) sdb.removeStudentByNisn(student.nisn).catch(() => {});
  }

  public deleteStudentsBatch(ids: string[], currentUser: any) {
    this.assertAdmin(currentUser, 'BULK_DELETE_STUDENT');
    if (!ids.length) return;
    const toDelete = this.state.students.filter(s => ids.includes(s.id));
    const nisns = toDelete.map(s => s.nisn);
    this.state.students = this.state.students.filter(s => !ids.includes(s.id));
    this.logAudit(currentUser, 'BULK_DELETE_STUDENT', 'STUDENT', `Menghapus massal ${ids.length} data siswa.`);
    this.persistState();
    this.rebuildIndexes();
    this.notifyListeners();

    if (this.supabaseSyncEnabled && nisns.length > 0) {
      sdb.removeStudentsBatchByNisn(nisns).catch(err => {
        console.error('[DB] Gagal menghapus siswa massal di cloud:', err);
      });
    }
  }

  // TEACHERS CRUD
  public getTeachers(): Teacher[] { return this.state.teachers; }

  public getHomeroomTeacherForClass(classIdOrName: string): Teacher | null {
    if (!classIdOrName) return null;
    const clean = classIdOrName.trim().toLowerCase();
    const targetClass = (this.state.classes || []).find(
      c => c.id === classIdOrName || c.name.toLowerCase() === clean
    );
    if (!targetClass) return null;

    // 1. Cari via targetClass.homeRoomTeacherId (cocok UUID atau NIP)
    if (targetClass.homeRoomTeacherId) {
      const match = (this.state.teachers || []).find(
        t => t.id === targetClass.homeRoomTeacherId || t.nip === targetClass.homeRoomTeacherId
      );
      if (match) return match;
    }

    // 2. Cari via teacher.homeRoomClassId (cocok class ID atau nama kelas)
    const matchByClass = (this.state.teachers || []).find(
      t =>
        t.isWaliKelas &&
        t.homeRoomClassId &&
        (t.homeRoomClassId === targetClass.id || t.homeRoomClassId.toLowerCase() === clean)
    );
    if (matchByClass) return matchByClass;

    return null;
  }
  public addTeacher(teacher: Omit<Teacher, 'id'>, currentUser: any, roleToSave?: Role, passwordToSave?: string): Teacher {
    this.assertAdmin(currentUser, 'CREATE_TEACHER');

    // Duplicate NIP validation
    if (this.state.teachers.some(t => t.nip.trim() === teacher.nip.trim())) {
      throw new Error(`Validasi Gagal: NIP '${teacher.nip}' sudah terdaftar dalam sistem.`);
    }

    const finalEmail = teacher.email?.trim() || `${teacher.nip.trim()}@guru.sekolah.id`;
    const newTeacher: Teacher = {
      ...teacher,
      email: finalEmail,
      phone: teacher.phone?.trim() || '',
      id: `t-${Date.now()}`
    };
    if (passwordToSave) {
      newTeacher.password = passwordToSave;
    }
    this.state.teachers.push(newTeacher);

    // Synchronize or create matching User object
    const finalRole: Role = roleToSave || (teacher.isWaliKelas ? 'WALI_KELAS' : 'GURU');
    const existingUser = this.state.users.find(u =>
      (finalEmail && u.email.toLowerCase() === finalEmail.toLowerCase()) ||
      (teacher.userId && u.id === teacher.userId)
    );
    if (existingUser) {
      existingUser.role = finalRole;
      existingUser.name = teacher.name;
      existingUser.email = finalEmail;
      if (passwordToSave) existingUser.password = passwordToSave;
    } else {
      this.state.users.push({
        id: teacher.userId || `u-${Date.now()}`,
        email: finalEmail.toLowerCase(),
        role: finalRole,
        name: teacher.name,
        password: passwordToSave || 'password123',
        createdAt: new Date().toISOString()
      });
    }

    // Sync class homeroom teacher if set
    if (teacher.isWaliKelas && teacher.homeRoomClassId) {
      this.state.classes = this.state.classes.map(c =>
        c.id === teacher.homeRoomClassId ? { ...c, homeRoomTeacherId: newTeacher.id } : c
      );
    }

    this.logAudit(currentUser, 'CREATE_TEACHER', 'TEACHER', `Menambahkan guru baru: ${newTeacher.name} (NIP: ${newTeacher.nip}, Peran: ${finalRole})`);
    this.persistState();
    // Fire-and-forget cloud sync
    if (this.supabaseSyncEnabled) {
      const addedUser = this.state.users.find(u =>
        u.email.toLowerCase() === finalEmail.toLowerCase() || u.id === (teacher.userId || '')
      );
      sdb.syncTeacher(newTeacher, addedUser).catch(() => {});
    }
    return newTeacher;
  }

  public updateTeacher(id: string, updates: Partial<Teacher>, currentUser: any, roleToSave?: Role, passwordToSave?: string) {
    this.assertAdmin(currentUser, 'UPDATE_TEACHER');
    if (updates.nip) {
      const duplicate = this.state.teachers.find(t => t.id !== id && t.nip.trim() === updates.nip?.trim());
      if (duplicate) {
        throw new Error(`Validasi Gagal: NIP '${updates.nip}' sudah digunakan oleh guru lain.`);
      }
    }

    const existingTeacher = this.state.teachers.find(t => t.id === id);
    if (!existingTeacher) {
      throw new Error(`Guru dengan ID '${id}' tidak ditemukan.`);
    }

    // Update teacher record
    const updatedTeacher = { ...existingTeacher, ...updates };
    if (passwordToSave) {
      updatedTeacher.password = passwordToSave;
    }
    this.state.teachers = this.state.teachers.map(t => t.id === id ? updatedTeacher : t);

    // Synchronize user record
    const targetUserId = updatedTeacher.userId || existingTeacher.userId;
    const targetEmail = updatedTeacher.email || existingTeacher.email || `${updatedTeacher.nip.trim()}@guru.sekolah.id`;
    const userObj = this.state.users.find(u =>
      (targetUserId && u.id === targetUserId) ||
      (targetEmail && u.email.toLowerCase() === targetEmail.toLowerCase()) ||
      (existingTeacher.email && u.email.toLowerCase() === existingTeacher.email.toLowerCase())
    );

    const finalRole: Role = roleToSave !== undefined ? roleToSave : (updatedTeacher.isWaliKelas ? 'WALI_KELAS' : 'GURU');

    if (userObj) {
      userObj.role = finalRole;
      if (updates.name) userObj.name = updates.name;
      if (updates.email) userObj.email = updates.email;
      if (passwordToSave) userObj.password = passwordToSave;
    }

    // Handle homeroom class ownership
    if (updatedTeacher.isWaliKelas && updatedTeacher.homeRoomClassId) {
      // Set as homeroom teacher for specified class
      this.state.classes = this.state.classes.map(c =>
        c.id === updatedTeacher.homeRoomClassId ? { ...c, homeRoomTeacherId: id } : c
      );
    } else if (updatedTeacher.isWaliKelas === false) {
      // Unset homeroom teacher from any classes previously managed
      this.state.classes = this.state.classes.map(c =>
        c.homeRoomTeacherId === id ? { ...c, homeRoomTeacherId: undefined } : c
      );
    }

    this.logAudit(currentUser, 'UPDATE_TEACHER', 'TEACHER', `Memperbarui data guru ID: ${id} (${updatedTeacher.name}, Peran: ${finalRole})`);
    this.persistState();
    // Fire-and-forget cloud sync
    if (this.supabaseSyncEnabled) {
      const updatedU = this.state.users.find(u =>
        (targetUserId && u.id === targetUserId) ||
        (targetEmail && u.email.toLowerCase() === targetEmail.toLowerCase())
      );
      sdb.syncTeacher(updatedTeacher, updatedU).catch(() => {});
      if (updatedTeacher.homeRoomClassId) {
        const affectedClass = this.state.classes.find(c => c.id === updatedTeacher.homeRoomClassId);
        if (affectedClass) sdb.syncClass(affectedClass).catch(() => {});
      }
    }
  }
  public deleteTeacher(id: string, currentUser: any) {
    this.assertAdmin(currentUser, 'DELETE_TEACHER');
    const teacher = this.state.teachers.find(t => t.id === id);
    if (id === 't-admin-custom' || teacher?.userId === 'u-admin-custom' || teacher?.email?.toLowerCase() === 'admin@sekolah.com') {
      throw new Error('Akses Ditolak: Akun Administrator Utama sistem tidak dapat dihapus.');
    }
    if (currentUser && (teacher?.userId === currentUser.id || (teacher?.email && currentUser.email && teacher.email.toLowerCase() === currentUser.email.toLowerCase()))) {
      throw new Error('Akses Ditolak: Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif digunakan.');
    }
    this.state.teachers = this.state.teachers.filter(t => t.id !== id);
    this.logAudit(currentUser, 'DELETE_TEACHER', 'TEACHER', `Menghapus data guru/staf: ${teacher?.name || id}`);
    this.persistState();
    // Fire-and-forget cloud sync
    if (this.supabaseSyncEnabled && teacher?.nip) sdb.removeTeacherByNip(teacher.nip).catch(() => {});
  }

  public deleteTeachersBatch(ids: string[], currentUser: any) {
    this.assertAdmin(currentUser, 'BULK_DELETE_TEACHER');
    if (!ids.length) return;
    const filteredIds = ids.filter(id => {
      const t = this.state.teachers.find(item => item.id === id);
      const isRootAdmin = id === 't-admin-custom' || t?.userId === 'u-admin-custom' || t?.email?.toLowerCase() === 'admin@sekolah.com';
      const isSelf = currentUser && (t?.userId === currentUser.id || (t?.email && currentUser.email && t.email.toLowerCase() === currentUser.email.toLowerCase()));
      return !isRootAdmin && !isSelf;
    });
    if (!filteredIds.length) return;
    const nipsToDelete = filteredIds
      .map(id => this.state.teachers.find(t => t.id === id)?.nip)
      .filter(Boolean) as string[];
    this.state.teachers = this.state.teachers.filter(t => !filteredIds.includes(t.id));
    this.logAudit(currentUser, 'BULK_DELETE_TEACHER', 'TEACHER', `Menghapus massal ${filteredIds.length} data guru/staf.`);
    this.persistState();
    this.notifyListeners();
    if (this.supabaseSyncEnabled && nipsToDelete.length > 0) {
      sdb.removeTeachersBatchByNip(nipsToDelete).catch(() => {});
    }
  }

  // CLASSES CRUD
  public getClasses(): ClassRoom[] { return DatabaseService.sortClassesNatural(this.state.classes || []); }
  public addClass(cls: Omit<ClassRoom, 'id'>, currentUser: any): ClassRoom {
    this.assertAdmin(currentUser, 'CREATE_CLASS');
    if (this.state.classes.some(c => c.name.toLowerCase() === cls.name.trim().toLowerCase() && c.academicYearId === cls.academicYearId)) {
      throw new Error(`Validasi Gagal: Kelas '${cls.name}' sudah ada pada tahun ajaran ini.`);
    }
    const newClass: ClassRoom = { ...cls, id: generateUuid() };
    this.state.classes.push(newClass);
    this.logAudit(currentUser, 'CREATE_CLASS', 'CLASS', `Menambahkan kelas baru: ${newClass.name}`);
    this.persistState();
    this.rebuildIndexes();
    this.notifyListeners();
    // Fire-and-forget cloud sync (akan mengembalikan UUID Supabase dan menyimpan ke classIdMap)
    if (this.supabaseSyncEnabled) sdb.syncClass(newClass).catch(err => {
      console.error('[DB] Gagal sinkronisasi kelas ke cloud:', err);
    });
    return newClass;
  }
  public updateClass(id: string, updates: Partial<ClassRoom>, currentUser: any) {
    this.assertAdmin(currentUser, 'UPDATE_CLASS');
    this.state.classes = this.state.classes.map(c => c.id === id ? { ...c, ...updates } : c);
    this.logAudit(currentUser, 'UPDATE_CLASS', 'CLASS', `Memperbarui kelas ID: ${id}`);
    this.persistState();
    this.rebuildIndexes();
    this.notifyListeners();
    const updatedClass = this.state.classes.find(c => c.id === id);
    if (this.supabaseSyncEnabled && updatedClass) {
      sdb.syncClass(updatedClass).catch(() => {});
      if (updatedClass.homeRoomTeacherId) {
        const affectedTeacher = this.state.teachers.find(t => t.id === updatedClass.homeRoomTeacherId);
        if (affectedTeacher) sdb.syncTeacher(affectedTeacher).catch(() => {});
      }
    }
  }
  public deleteClass(id: string, currentUser: any) {
    this.assertAdmin(currentUser, 'DELETE_CLASS');
    const c = this.state.classes.find(item => item.id === id);
    this.state.classes = this.state.classes.filter(item => item.id !== id);
    this.logAudit(currentUser, 'DELETE_CLASS', 'CLASS', `Menghapus kelas: ${c?.name || id}`);
    this.persistState();
    this.rebuildIndexes();
    this.notifyListeners();
    if (this.supabaseSyncEnabled && c?.name) sdb.removeClassByName(c.name).catch(() => {});
  }

  public deleteClassesBatch(ids: string[], currentUser: any) {
    this.assertAdmin(currentUser, 'BULK_DELETE_CLASS');
    if (!ids.length) return;
    this.state.classes = this.state.classes.filter(c => !ids.includes(c.id));
    this.logAudit(currentUser, 'BULK_DELETE_CLASS', 'CLASS', `Menghapus massal ${ids.length} kelas.`);
    this.persistState();
    this.rebuildIndexes();
    this.notifyListeners();
    if (this.supabaseSyncEnabled && ids.length > 0) {
      sdb.removeClassesBatch(ids).catch(() => {});
    }
  }

  // SUBJECTS CRUD
  public getSubjects(): Subject[] {
    const deletedCodes = this.getDeletedSubjectCodes();
    return this.state.subjects.filter(s => !deletedCodes.has((s.code || '').toLowerCase().trim()));
  }
  public getSubjectById(id: string): Subject | undefined {
    return this.getSubjects().find(s => s.id === id);
  }
  public addSubject(subj: Omit<Subject, 'id'>, currentUser: any): Subject {
    this.assertAdmin(currentUser, 'CREATE_SUBJECT');
    this.removeDeletedSubjectCode(subj.code);
    if (this.state.subjects.some(s => s.code.toLowerCase() === subj.code.trim().toLowerCase())) {
      throw new Error(`Validasi Gagal: Kode mata pelajaran '${subj.code}' sudah digunakan.`);
    }
    const newSubj: Subject = { ...subj, id: generateUuid() };
    this.state.subjects.push(newSubj);
    this.logAudit(currentUser, 'CREATE_SUBJECT', 'SUBJECT', `Menambahkan mata pelajaran: ${newSubj.name} (${newSubj.code})`);
    this.persistState();
    // Fire-and-forget cloud sync
    if (this.supabaseSyncEnabled) sdb.syncSubject(newSubj).catch(() => {});
    return newSubj;
  }
  public updateSubject(id: string, updates: Partial<Subject>, currentUser: any) {
    this.assertAdmin(currentUser, 'UPDATE_SUBJECT');
    if (updates.code) this.removeDeletedSubjectCode(updates.code);
    this.state.subjects = this.state.subjects.map(s => s.id === id ? { ...s, ...updates } : s);
    this.logAudit(currentUser, 'UPDATE_SUBJECT', 'SUBJECT', `Memperbarui mata pelajaran ID: ${id}`);
    this.persistState();
    // Fire-and-forget cloud sync
    if (this.supabaseSyncEnabled) {
      const updatedSub = this.state.subjects.find(s => s.id === id);
      if (updatedSub) sdb.syncSubject(updatedSub).catch(() => {});
    }
  }
  public updateSubjectKKM(subjectId: string, passingGrade: number, currentUser: any) {
    this.state.subjects = this.state.subjects.map(s => s.id === subjectId ? { ...s, passingGrade } : s);
    this.logAudit(currentUser, 'UPDATE_SUBJECT_KKM', 'SUBJECT', `Mengubah KKM mata pelajaran ID ${subjectId} menjadi ${passingGrade}`);
    this.persistState();
  }
  public deleteSubject(id: string, currentUser: any) {
    this.assertAdmin(currentUser, 'DELETE_SUBJECT');
    const s = this.state.subjects.find(item => item.id === id);
    if (s?.code) this.recordDeletedSubjectCode(s.code);
    this.state.subjects = this.state.subjects.filter(item => item.id !== id);
    this.purgeSubjectReferences([id], s?.code ? [s.code] : []);
    this.logAudit(currentUser, 'DELETE_SUBJECT', 'SUBJECT', `Menghapus mata pelajaran: ${s?.name || id}`);
    this.persistState();
    this.notifyListeners();
    // Fire-and-forget cloud sync
    if (this.supabaseSyncEnabled && s?.code) sdb.removeSubjectByCode(s.code).catch(() => {});
  }

  public deleteSubjectsBatch(ids: string[], currentUser: any) {
    this.assertAdmin(currentUser, 'BULK_DELETE_SUBJECT');
    if (!ids.length) return;
    const codesToDelete = ids
      .map(id => this.state.subjects.find(s => s.id === id)?.code)
      .filter(Boolean) as string[];
    this.recordDeletedSubjectCode(...codesToDelete);
    this.state.subjects = this.state.subjects.filter(s => !ids.includes(s.id));
    this.purgeSubjectReferences(ids, codesToDelete);
    this.logAudit(currentUser, 'BULK_DELETE_SUBJECT', 'SUBJECT', `Menghapus massal ${ids.length} mata pelajaran.`);
    this.persistState();
    this.notifyListeners();
    if (this.supabaseSyncEnabled && codesToDelete.length > 0) {
      sdb.removeSubjectsBatchByCode(codesToDelete).catch(() => {});
    }
  }

  // ACADEMIC YEARS CRUD
  public getAcademicYears(): AcademicYear[] { return this.state.academicYears; }
  public addAcademicYear(ay: Omit<AcademicYear, 'id'>, currentUser: any): AcademicYear {
    this.assertAdmin(currentUser, 'CREATE_ACADEMIC_YEAR');
    const newAy: AcademicYear = { ...ay, id: generateUuid() };
    this.state.academicYears.push(newAy);
    this.logAudit(currentUser, 'CREATE_ACADEMIC_YEAR', 'ACADEMIC_YEAR', `Menambahkan tahun ajaran: ${newAy.yearLabel} (${newAy.semester})`);
    this.persistState();
    // Fire-and-forget cloud sync — resolves UUID from Supabase
    if (this.supabaseSyncEnabled) sdb.syncAcademicYear(newAy).catch(() => {});
    return newAy;
  }
  public toggleAcademicYear(id: string, currentUser: any) {
    this.assertAdmin(currentUser, 'TOGGLE_ACADEMIC_YEAR');
    this.state.academicYears = this.state.academicYears.map(ay => {
      if (ay.id === id) {
        return { ...ay, isActive: !ay.isActive };
      }
      return ay;
    });
    this.logAudit(currentUser, 'TOGGLE_ACADEMIC_YEAR', 'ACADEMIC_YEAR', `Mengubah status aktif tahun ajaran ID: ${id}`);
    this.persistState();
  }

  // MATERIALS & COMPETENCIES CRUD
  public getMaterials(): Material[] { return this.state.materials; }
  public addMaterial(mat: Omit<Material, 'id'>, currentUser: any): Material {
    this.assertTeacherSubject(currentUser, mat.subjectId, 'CREATE_MATERIAL');
    if (!mat.title?.trim() || !mat.code?.trim()) {
      throw new Error('Validasi Gagal: Kode dan judul materi wajib diisi.');
    }
    const newMat: Material = { ...mat, id: isValidUuid((mat as any)?.id) ? (mat as any).id : generateUuid() };
    this.state.materials.push(newMat);
    this.logAudit(currentUser, 'CREATE_MATERIAL', 'MATERIAL', `Menambahkan materi: ${newMat.title} (${newMat.code})`);
    this.persistState();
    if (this.supabaseSyncEnabled) sdb.syncMaterial(newMat).catch(() => {});
    return newMat;
  }
  public updateMaterial(id: string, updates: Partial<Material>, currentUser: any) {
    const m = this.state.materials.find(x => x.id === id);
    if (!m) throw new Error(`Materi dengan ID '${id}' tidak ditemukan.`);
    this.assertTeacherSubject(currentUser, m.subjectId, 'UPDATE_MATERIAL');
    if (updates.subjectId && updates.subjectId !== m.subjectId) {
      this.assertTeacherSubject(currentUser, updates.subjectId, 'UPDATE_MATERIAL');
    }
    const updatedMat: Material = { ...m, ...updates };
    this.state.materials = this.state.materials.map(item => item.id === id ? updatedMat : item);
    this.logAudit(currentUser, 'UPDATE_MATERIAL', 'MATERIAL', `Memperbarui materi ID: ${id}`);
    this.persistState();
    if (this.supabaseSyncEnabled) sdb.syncMaterial(updatedMat).catch(() => {});
  }
  public deleteMaterial(id: string, currentUser: any) {
    const m = this.state.materials.find(x => x.id === id);
    if (!m) throw new Error(`Materi dengan ID '${id}' tidak ditemukan.`);
    this.assertTeacherSubject(currentUser, m.subjectId, 'DELETE_MATERIAL');
    this.state.materials = this.state.materials.filter(x => x.id !== id);
    this.logAudit(currentUser, 'DELETE_MATERIAL', 'MATERIAL', `Menghapus materi: ${m?.title || id}`);
    this.persistState();
  }

  public deleteMaterialsBatch(ids: string[], currentUser: any) {
    if (!ids.length) return;
    this.state.materials = this.state.materials.filter(x => !ids.includes(x.id));
    this.logAudit(currentUser, 'BULK_DELETE_MATERIAL', 'MATERIAL', `Menghapus massal ${ids.length} materi.`);
    this.persistState();
  }

  public getCompetencies(): Competency[] { return this.state.competencies; }
  public addCompetency(comp: Omit<Competency, 'id'>, currentUser: any): Competency {
    this.assertTeacherSubject(currentUser, comp.subjectId, 'CREATE_COMPETENCY');
    if (!comp.code?.trim() || !comp.statement?.trim()) {
      throw new Error('Validasi Gagal: Kode KD dan pernyataan kompetensi wajib diisi.');
    }
    const newComp: Competency = { ...comp, id: isValidUuid((comp as any)?.id) ? (comp as any).id : generateUuid() };
    this.state.competencies.push(newComp);
    this.logAudit(currentUser, 'CREATE_COMPETENCY', 'COMPETENCY', `Menambahkan kompetensi dasar: ${newComp.code}`);
    this.persistState();
    if (this.supabaseSyncEnabled) sdb.syncCompetency(newComp).catch(() => {});
    return newComp;
  }
  public updateCompetency(id: string, updates: Partial<Competency>, currentUser: any) {
    const c = this.state.competencies.find(x => x.id === id);
    if (!c) throw new Error(`Kompetensi dengan ID '${id}' tidak ditemukan.`);
    this.assertTeacherSubject(currentUser, c.subjectId, 'UPDATE_COMPETENCY');
    if (updates.subjectId && updates.subjectId !== c.subjectId) {
      this.assertTeacherSubject(currentUser, updates.subjectId, 'UPDATE_COMPETENCY');
    }
    const updatedComp: Competency = { ...c, ...updates };
    this.state.competencies = this.state.competencies.map(item => item.id === id ? updatedComp : item);
    this.logAudit(currentUser, 'UPDATE_COMPETENCY', 'COMPETENCY', `Memperbarui kompetensi ID: ${id}`);
    this.persistState();
    if (this.supabaseSyncEnabled) sdb.syncCompetency(updatedComp).catch(() => {});
  }
  public deleteCompetency(id: string, currentUser: any) {
    const c = this.state.competencies.find(x => x.id === id);
    if (!c) throw new Error(`Kompetensi dengan ID '${id}' tidak ditemukan.`);
    this.assertTeacherSubject(currentUser, c.subjectId, 'DELETE_COMPETENCY');
    this.state.competencies = this.state.competencies.filter(x => x.id !== id);
    this.logAudit(currentUser, 'DELETE_COMPETENCY', 'COMPETENCY', `Menghapus kompetensi: ${c?.code || id}`);
    this.persistState();
  }

  public deleteCompetenciesBatch(ids: string[], currentUser: any) {
    if (!ids.length) return;
    this.state.competencies = this.state.competencies.filter(x => !ids.includes(x.id));
    this.logAudit(currentUser, 'BULK_DELETE_COMPETENCY', 'COMPETENCY', `Menghapus massal ${ids.length} kompetensi dasar.`);
    this.persistState();
  }

  // ============================================================
  // EXAM PACKAGES (PAKET UJIAN / WADAH) CRUD & ACCESS MANAGEMENT
  // ============================================================
  public getExamPackages(): ExamPackage[] {
    return (this.state.examPackages || []).map(p => ({
      ...p,
      assessmentType: p.assessmentType || 'TRYOUT',
    }));
  }

  public getExamPackageById(id: string): ExamPackage | undefined {
    const pkg = (this.state.examPackages || []).find(p => p.id === id);
    return pkg ? { ...pkg, assessmentType: pkg.assessmentType || 'TRYOUT' } : undefined;
  }

  public saveExamPackage(pkg: ExamPackage, currentUser?: any): ExamPackage {
    if (currentUser) {
      this.assertAdmin(currentUser, 'SAVE_EXAM_PACKAGE');
    }
    if (!this.state.examPackages) {
      this.state.examPackages = [];
    }
    if (!pkg.id || !isValidUuid(pkg.id)) {
      pkg.id = generateUuid();
    }
    // Bebaskan id dan kode dari tombstone
    this.removeDeletedPackageIdentifier(pkg.id, pkg.code);

    const existingIdx = this.state.examPackages.findIndex(
      p => p.id === pkg.id || (p.code && pkg.code && p.code.toLowerCase().trim() === pkg.code.toLowerCase().trim())
    );
    const now = new Date().toISOString();
    const toSave: ExamPackage = {
      ...pkg,
      assessmentType: pkg.assessmentType || 'TRYOUT',
      updatedAt: now,
      createdAt: existingIdx >= 0 ? this.state.examPackages[existingIdx].createdAt || now : now,
    };

    if (existingIdx >= 0) {
      this.state.examPackages[existingIdx] = toSave;
      if (currentUser) {
        this.logAudit(currentUser, 'UPDATE_EXAM_PACKAGE', 'TRYOUT', `Memperbarui Paket Ujian: ${toSave.title} (${toSave.code})`);
      }
    } else {
      this.state.examPackages.unshift(toSave);
      if (currentUser) {
        this.logAudit(currentUser, 'CREATE_EXAM_PACKAGE', 'TRYOUT', `Membuat Paket Ujian baru: ${toSave.title} (${toSave.code})`);
      }
    }

    this.persistState();
    this.notifyListeners();
    if (this.supabaseSyncEnabled) {
      const codeKey = (toSave.code || '').toLowerCase().trim();
      this.pendingPackageIds.add(toSave.id);
      if (codeKey) this.pendingPackageIds.add(codeKey);
      sdb.syncExamPackage(toSave)
        .catch(() => {})
        .finally(() => {
          this.pendingPackageIds.delete(toSave.id);
          if (codeKey) this.pendingPackageIds.delete(codeKey);
        });
    }
    return toSave;
  }

  public deleteExamPackage(id: string, currentUser?: any): void {
    if (currentUser) {
      this.assertAdmin(currentUser, 'DELETE_EXAM_PACKAGE');
    }
    const pkg = this.getExamPackageById(id);
    if (!pkg) return;
    this.recordDeletedPackageIdentifier(pkg.id, pkg.code);
    this.state.examPackages = (this.state.examPackages || []).filter(p => p.id !== id);
    if (currentUser) {
      this.logAudit(currentUser, 'DELETE_EXAM_PACKAGE', 'TRYOUT', `Menghapus Paket Ujian: ${pkg.title} (${pkg.code})`);
    }
    this.persistState();
    this.notifyListeners();
    if (this.supabaseSyncEnabled && pkg?.code) sdb.removeExamPackageByCode(pkg.code).catch(() => {});
  }

  public updateExamPackageStatus(id: string, status: TryoutStatus, currentUser?: any): void {
    if (currentUser) {
      this.assertAdmin(currentUser, 'UPDATE_EXAM_PACKAGE_STATUS');
    }
    const pkg = this.getExamPackageById(id);
    if (!pkg) return;
    pkg.status = status;
    pkg.updatedAt = new Date().toISOString();
    if (currentUser) {
      this.logAudit(currentUser, 'UPDATE_EXAM_PACKAGE_STATUS', 'TRYOUT', `Mengubah status Paket Ujian ${pkg.title} menjadi '${status}'`);
    }
    this.persistState();
    if (this.supabaseSyncEnabled) sdb.syncExamPackage(pkg).catch(() => {});
  }

  public updateExamPackageSubject(
    packageId: string,
    subjectId: string,
    updates: Partial<ExamPackageSubject>,
    currentUser?: any
  ): ExamPackageSubject | undefined {
    const pkg = this.getExamPackageById(packageId);
    if (!pkg) throw new Error(`Paket Ujian dengan ID '${packageId}' tidak ditemukan.`);

    let subItem = pkg.subjects.find(s => s.subjectId === subjectId);
    const now = new Date().toISOString();
    const updaterName = currentUser?.name || currentUser?.role || 'Admin/Guru';

    if (subItem) {
      Object.assign(subItem, {
        ...updates,
        lastUpdatedBy: updaterName,
        updatedAt: now,
      });
    } else {
      subItem = {
        id: `pkg-sub-${Date.now()}`,
        packageId,
        subjectId,
        totalQuestions: 40,
        passingGrade: 75,
        ...updates,
        lastUpdatedBy: updaterName,
        updatedAt: now,
      };
      pkg.subjects.push(subItem);
    }

    pkg.updatedAt = now;
    if (currentUser) {
      const subj = this.getSubjectById(subjectId);
      this.logAudit(
        currentUser,
        'UPDATE_EXAM_PACKAGE_SUBJECT',
        'TRYOUT',
        `Memperbarui tautan/konfigurasi mapel ${subj?.name || subjectId} pada Paket ${pkg.title}`
      );
    }
    this.persistState();
    if (this.supabaseSyncEnabled) sdb.syncExamPackage(pkg).catch(() => {});
    return subItem;
  }

  /**
   * Filter Paket Ujian untuk Siswa:
   * Siswa hanya melihat paket ujian yang mengikutsertakan kelas siswa tersebut.
   */
  public getExamPackagesForStudent(studentClassId: string, gradeLevel?: string): ExamPackage[] {
    const all = this.getExamPackages();
    return all.filter(pkg => {
      // Pastikan paket aktif/komplit (tidak draft jika siswa yang melihat)
      if (pkg.status === 'DRAFT') return false;

      // Jika targetClassIds dispesifikasikan, periksa apakah kelas siswa ada di dalamnya
      if (pkg.targetClassIds && pkg.targetClassIds.length > 0) {
        return pkg.targetClassIds.includes(studentClassId);
      }

      // Fallback: periksa jenjang tingkat (gradeLevel) jika targetClassIds kosong
      if (gradeLevel && pkg.targetGrades && pkg.targetGrades.length > 0) {
        return pkg.targetGrades.includes(gradeLevel);
      }

      return false;
    });
  }

  /**
   * Filter Paket Ujian untuk Guru:
   * Menampilkan paket ujian yang memiliki mapel yang diampu oleh guru tersebut.
   */
  public getExamPackagesForTeacher(currentUser: any): ExamPackage[] {
    if (!currentUser) return [];
    if (currentUser.role === 'ADMIN') return this.getExamPackages();

    const allowedSubjects = this.getTeacherAllowedSubjectIds(currentUser);
    const all = this.getExamPackages();

    return all.filter(pkg => {
      return pkg.subjects.some(sub => allowedSubjects.includes(sub.subjectId));
    });
  }

  /**
   * Filter Paket Ujian untuk Wali Kelas:
   * Menampilkan paket ujian yang menargetkan kelas yang dibina oleh wali kelas.
   */
  public getExamPackagesForWaliKelas(homeRoomClassId: string): ExamPackage[] {
    if (!homeRoomClassId) return [];
    const all = this.getExamPackages();
    const targetClass = (this.state.classes || []).find(c => c.id === homeRoomClassId);
    return all.filter(pkg => {
      // 1. Direct class ID match
      if (pkg.targetClassIds && pkg.targetClassIds.length > 0) {
        if (pkg.targetClassIds.includes(homeRoomClassId)) return true;
      }
      // 2. Grade level match
      if (targetClass && targetClass.gradeLevel && pkg.targetGrades && pkg.targetGrades.length > 0) {
        if (pkg.targetGrades.includes(targetClass.gradeLevel)) return true;
      }
      // 3. If neither targetClassIds nor targetGrades is set, treat as open to all classes
      if ((!pkg.targetClassIds || pkg.targetClassIds.length === 0) && (!pkg.targetGrades || pkg.targetGrades.length === 0)) {
        return true;
      }
      return false;
    });
  }

  // TRYOUTS CRUD & MANAGEMENT
  public getTryouts(): Tryout[] { return this.state.tryouts; }
  public saveTryout(to: Tryout): Tryout {
    // Bebaskan kode dan ID dari tombstone agar kode ini aktif dan bisa digunakan kembali (reusable)
    this.removeDeletedTryoutIdentifier(to.id, to.code);
    const existingByCodeIdx = this.state.tryouts.findIndex(
      t => t.code.toLowerCase().trim() === to.code.toLowerCase().trim() && t.id !== to.id
    );
    if (existingByCodeIdx >= 0) {
      to.id = this.state.tryouts[existingByCodeIdx].id;
      this.state.tryouts[existingByCodeIdx] = to;
    } else {
      const existingIdx = this.state.tryouts.findIndex(t => t.id === to.id);
      if (existingIdx >= 0) {
        this.state.tryouts[existingIdx] = to;
      } else {
        this.state.tryouts.push(to);
      }
    }
    this.persistState();
    this.notifyListeners();
    if (this.supabaseSyncEnabled) {
      const codeKey = (to.code || '').toLowerCase().trim();
      this.pendingTryoutIds.add(to.id);
      if (codeKey) this.pendingTryoutIds.add(codeKey);
      sdb.syncTryout(to)
        .catch(() => {})
        .finally(() => {
          this.pendingTryoutIds.delete(to.id);
          if (codeKey) this.pendingTryoutIds.delete(codeKey);
        });
    }
    return to;
  }
  public getTryoutById(id: string): Tryout | undefined {
    return this.state.tryouts.find(t => t.id === id);
  }
  public addTryout(to: Omit<Tryout, 'id'>, currentUser: any): Tryout {
    this.assertAdmin(currentUser, 'CREATE_TRYOUT');
    if (this.state.tryouts.some(t => t.code.toLowerCase() === to.code.trim().toLowerCase())) {
      throw new Error(`Validasi Gagal: Kode Try Out '${to.code}' sudah digunakan.`);
    }
    const newTo: Tryout = { ...to, id: generateUuid() };
    this.state.tryouts.push(newTo);
    this.logAudit(currentUser, 'CREATE_TRYOUT', 'TRYOUT', `Membuat Try Out baru: ${newTo.title} (${newTo.code})`);
    this.persistState();
    this.notifyListeners();
    if (this.supabaseSyncEnabled) {
      const codeKey = (newTo.code || '').toLowerCase().trim();
      this.pendingTryoutIds.add(newTo.id);
      if (codeKey) this.pendingTryoutIds.add(codeKey);
      sdb.syncTryout(newTo)
        .catch(() => {})
        .finally(() => {
          this.pendingTryoutIds.delete(newTo.id);
          if (codeKey) this.pendingTryoutIds.delete(codeKey);
        });
    }
    return newTo;
  }
  public updateTryout(id: string, updates: Partial<Tryout>, currentUser: any) {
    this.assertAdminOrTeacher(currentUser, 'UPDATE_TRYOUT');
    this.state.tryouts = this.state.tryouts.map(t => t.id === id ? { ...t, ...updates } : t);
    this.logAudit(currentUser, 'UPDATE_TRYOUT', 'TRYOUT', `Memperbarui data Try Out ID: ${id}`);
    this.persistState();
    this.notifyListeners();
    const updated = this.state.tryouts.find(t => t.id === id);
    if (this.supabaseSyncEnabled && updated) sdb.syncTryout(updated).catch(() => {});
  }
  public updateTryoutStatus(id: string, status: TryoutStatus, currentUser: any) {
    this.assertAdminOrTeacher(currentUser, 'UPDATE_TRYOUT_STATUS');
    this.state.tryouts = this.state.tryouts.map(t => t.id === id ? { ...t, status } : t);
    this.logAudit(currentUser, 'UPDATE_TRYOUT_STATUS', 'TRYOUT', `Mengubah status Try Out ID ${id} menjadi '${status}'`);
    this.persistState();
    this.notifyListeners();
    const updated = this.state.tryouts.find(t => t.id === id);
    if (this.supabaseSyncEnabled && updated) sdb.syncTryout(updated).catch(() => {});
  }
  public updateTryoutScoringConfig(id: string, scoringConfig: ScoringConfig, currentUser: any) {
    this.assertAdminOrTeacher(currentUser, 'UPDATE_SCORING_CONFIG');
    const to = this.state.tryouts.find(t => t.id === id);
    this.state.tryouts = this.state.tryouts.map(t => t.id === id ? { ...t, scoringConfig } : t);

    let scoresUpdated = false;
    if (scoringConfig.scoreSource === 'GOOGLE_FORM') {
      this.state.scores = this.state.scores.map(s => {
        if (s.tryoutId === id && s.googleFormScore !== undefined && s.googleFormScore > 0) {
          scoresUpdated = true;
          const updatedSubjectScores = { ...(s.subjectScores || {}) };
          if (to?.subjectId) {
            updatedSubjectScores[to.subjectId] = s.googleFormScore;
          }
          Object.keys(updatedSubjectScores).forEach(subjId => {
            updatedSubjectScores[subjId] = s.googleFormScore!;
          });
          return {
            ...s,
            calculatedScore: s.googleFormScore,
            subjectScores: updatedSubjectScores,
            scoreDifference: 0,
            scoringStatus: 'MATCH',
          };
        }
        return s;
      });
    }

    this.logAudit(
      currentUser,
      'UPDATE_SCORING_CONFIG',
      'TRYOUT',
      `Memperbarui konfigurasi scoring Try Out ID: ${id} (Tipe: ${scoringConfig.scoringType}, Maks: ${scoringConfig.maxScore}, Benar: ${scoringConfig.correctScore}, Salah: ${scoringConfig.wrongScore})`
    );
    this.persistState();
    this.notifyListeners();
    const updated = this.state.tryouts.find(t => t.id === id);
    if (this.supabaseSyncEnabled && updated) {
      sdb.syncTryout(updated).catch(() => {});
      if (scoresUpdated) {
        const toResponses = (this.state.responses || []).filter(r => r.tryoutId === id);
        const toScores = (this.state.scores || []).filter(s => s.tryoutId === id);
        sdb.syncResponsesAndScores(id, toResponses, toScores).catch(() => {});
      }
    }
  }
  public deleteTryout(id: string, currentUser: any) {
    this.assertAdminOrTeacher(currentUser, 'DELETE_TRYOUT');
    const to = this.state.tryouts.find(t => t.id === id);
    this.recordDeletedTryoutIdentifier(id, to?.id, to?.code);
    if (to) {
      this.pendingTryoutIds.delete(to.id);
      this.pendingTryoutIds.delete((to.code || '').toLowerCase().trim());
    }
    this.state.tryouts = this.state.tryouts.filter(t => t.id !== id);

    // Hapus semua data terkait tryout ini (scores, answers, responses, tryoutSubjects)
    // agar tidak ada data orphan yang masih muncul di grafik & perkembangan
    const deletedScoreIds = new Set(
      this.state.scores.filter(s => s.tryoutId === id).map(s => s.id)
    );
    this.state.scores = this.state.scores.filter(s => s.tryoutId !== id);
    this.state.answers = this.state.answers.filter(a => a.tryoutId !== id);
    if (this.state.responses) {
      this.state.responses = this.state.responses.filter((r: any) => r.tryoutId !== id);
    }
    if (this.state.tryoutSubjects) {
      this.state.tryoutSubjects = this.state.tryoutSubjects.filter((ts: any) => ts.tryoutId !== id);
    }

    // Sesuaikan status mapel paket ujian jika tryout di dalam wadah ini dihapus
    if (to?.packageId && this.state.examPackages) {
      const remainingInPkg = this.state.tryouts.filter(t => t.packageId === to.packageId);
      if (remainingInPkg.length === 0) {
        this.state.examPackages = this.state.examPackages.map(pkg => {
          if (pkg.id === to.packageId) {
            return {
              ...pkg,
              subjects: pkg.subjects.map(sub => ({
                ...sub,
                syncStatus: sub.googleSheetUrl ? 'SYNCED' : 'PENDING'
              }))
            };
          }
          return pkg;
        });
      }
    }

    this.logAudit(currentUser, 'DELETE_TRYOUT', 'TRYOUT',
      `Menghapus Try Out: ${to?.title || id} (${to?.code || ''}) beserta ${deletedScoreIds.size} nilai dan jawaban terkait`);
    this.persistState();
    this.rebuildIndexes();
    this.notifyListeners();
    if (this.supabaseSyncEnabled) sdb.removeTryout(id, to?.code).catch(() => {});
  }

  // QUESTIONS CRUD
  public getQuestions(): Question[] { return this.state.questions; }
  public addQuestion(q: Omit<Question, 'id'>, currentUser: any): Question {
    this.assertTeacherSubject(currentUser, q.subjectId, 'CREATE_QUESTION');

    if (!q.uniqueCode?.trim()) {
      throw new Error('Validasi Gagal: Kode unik soal wajib diisi.');
    }
    if (this.state.questions.some(item => item.uniqueCode.toLowerCase() === q.uniqueCode.trim().toLowerCase())) {
      throw new Error(`Validasi Gagal: Kode unik soal '${q.uniqueCode}' sudah digunakan.`);
    }
    if (!q.questionText?.trim()) {
      throw new Error('Validasi Gagal: Teks soal tidak boleh kosong.');
    }
    if (!q.options || q.options.length < 2) {
      throw new Error('Validasi Gagal: Soal minimal memiliki pilihan opsi jawaban.');
    }

    const newQ: Question = {
      ...q,
      id: isValidUuid((q as any)?.id) ? (q as any).id : generateUuid(),
      status: q.status || 'ACTIVE',
      weight: q.weight ?? 1,
    };
    this.state.questions.push(newQ);
    this.logAudit(currentUser, 'CREATE_QUESTION', 'QUESTION', `Menambahkan butir soal: ${newQ.uniqueCode}`);
    this.persistState();
    if (this.supabaseSyncEnabled) sdb.syncQuestionsBatch([newQ]).catch(() => {});
    return newQ;
  }
  public updateQuestion(id: string, updates: Partial<Question>, currentUser: any) {
    const q = this.state.questions.find(x => x.id === id);
    if (!q) throw new Error(`Soal dengan ID '${id}' tidak ditemukan.`);
    this.assertTeacherSubject(currentUser, q.subjectId, 'UPDATE_QUESTION');

    if (updates.subjectId && updates.subjectId !== q.subjectId) {
      this.assertTeacherSubject(currentUser, updates.subjectId, 'UPDATE_QUESTION');
    }
    if (updates.uniqueCode) {
      const dup = this.state.questions.find(x => x.id !== id && x.uniqueCode.toLowerCase() === updates.uniqueCode?.trim().toLowerCase());
      if (dup) {
        throw new Error(`Validasi Gagal: Kode unik '${updates.uniqueCode}' sudah digunakan.`);
      }
    }
    const updatedQ: Question = { ...q, ...updates };
    this.state.questions = this.state.questions.map(item => item.id === id ? updatedQ : item);
    this.logAudit(currentUser, 'UPDATE_QUESTION', 'QUESTION', `Memperbarui soal ID: ${id}`);
    this.persistState();
    if (this.supabaseSyncEnabled) sdb.syncQuestionsBatch([updatedQ]).catch(() => {});
  }
  public deleteQuestion(id: string, currentUser: any) {
    const q = this.state.questions.find(x => x.id === id);
    if (!q) throw new Error(`Soal dengan ID '${id}' tidak ditemukan.`);
    this.assertTeacherSubject(currentUser, q.subjectId, 'DELETE_QUESTION');
    this.state.questions = this.state.questions.filter(x => x.id !== id);
    this.logAudit(currentUser, 'DELETE_QUESTION', 'QUESTION', `Menghapus soal: ${q?.uniqueCode || id}`);
    this.persistState();
    if (this.supabaseSyncEnabled) sdb.removeQuestionsBatch([id]).catch(() => {});
  }

  public deleteQuestionsBatch(ids: string[], currentUser: any) {
    if (!ids.length) return;
    this.state.questions = this.state.questions.filter(x => !ids.includes(x.id));
    this.logAudit(currentUser, 'BULK_DELETE_QUESTION', 'QUESTION', `Menghapus massal ${ids.length} butir soal.`);
    this.persistState();
    if (this.supabaseSyncEnabled) sdb.removeQuestionsBatch(ids).catch(() => {});
  }

  // SCORES & RESPONSES
  public getResponses(): Response[] { return this.state.responses; }
  public getAnswers(): Answer[] { return this.state.answers; }
  public getScores(): Score[] { return this.state.scores; }
  public getScoresByTryout(tryoutId: string): Score[] {
    return this.state.scores.filter(s => s.tryoutId === tryoutId);
  }
  public getScoresByStudent(studentId: string): Score[] {
    return this.state.scores.filter(s => s.studentId === studentId);
  }
  public getScoringMismatches(): Score[] {
    return this.state.scores.filter(s => s.scoringStatus === 'SCORING_MISMATCH');
  }

  /**
   * Rekonsiliasi Skor dengan Google Form:
   * Menyelaraskan seluruh skor pada tryout dengan nilai resmi Google Form (mengakhiri status SCORING_MISMATCH secara sah).
   */
  public setTryoutScoreSource(
    tryoutId: string,
    scoreSource: 'GOOGLE_FORM' | 'CUSTOM_ENGINE',
    currentUser?: any
  ): void {
    const to = this.state.tryouts.find(t => t.id === tryoutId);
    if (!to) return;

    to.scoringConfig = {
      ...(to.scoringConfig || {}),
      scoreSource,
    };

    if (scoreSource === 'GOOGLE_FORM') {
      this.state.scores = this.state.scores.map(s => {
        if (s.tryoutId === tryoutId && s.googleFormScore !== undefined && s.googleFormScore > 0) {
          const updatedSubjectScores = { ...(s.subjectScores || {}) };
          Object.keys(updatedSubjectScores).forEach(subjId => {
            updatedSubjectScores[subjId] = s.googleFormScore!;
          });
          return {
            ...s,
            calculatedScore: s.googleFormScore,
            subjectScores: updatedSubjectScores,
            scoreDifference: 0,
            scoringStatus: 'MATCH',
          };
        }
        return s;
      });
    }

    this.persistState();
    this.notifyListeners();

    if (this.supabaseSyncEnabled) {
      sdb.syncTryout(to).catch(() => {});
      const toResponses = (this.state.responses || []).filter(r => r.tryoutId === tryoutId);
      const toScores = this.state.scores.filter(s => s.tryoutId === tryoutId);
      sdb.syncResponsesAndScores(tryoutId, toResponses, toScores).catch(() => {});
    }

    this.logAudit(
      currentUser || { id: 'teacher', name: 'Guru Mata Pelajaran', role: 'GURU' },
      'UPDATE_SCORING_CONFIG',
      'TRYOUT',
      `Mengubah mode acuan nilai Try Out ${to.code} ke: ${scoreSource === 'GOOGLE_FORM' ? 'Nilai Google Form' : 'Aturan Kunci Jawaban Sekolah'}`
    );
  }

  public reconcileScoresWithGForm(
    tryoutId: string,
    currentUser?: any
  ): { reconciledCount: number } {
    let reconciledCount = 0;

    // 1. Selaraskan nilai skor siswa
    this.state.scores = this.state.scores.map(s => {
      if (s.tryoutId === tryoutId && s.googleFormScore !== undefined && s.googleFormScore > 0) {
        if (s.scoringStatus === 'SCORING_MISMATCH' || Math.abs(s.calculatedScore - s.googleFormScore) > 0.01) {
          reconciledCount++;
          // Sinkronkan juga pada subjectScores jika ada mapel
          const updatedSubjectScores = { ...(s.subjectScores || {}) };
          Object.keys(updatedSubjectScores).forEach(subjId => {
            updatedSubjectScores[subjId] = s.googleFormScore!;
          });

          return {
            ...s,
            calculatedScore: s.googleFormScore,
            subjectScores: updatedSubjectScores,
            scoreDifference: 0,
            scoringStatus: 'MATCH',
          };
        }
      }
      return s;
    });

    // 2. Kunci mode acuan tryout ke GOOGLE_FORM secara permanen agar tidak di-revert
    const to = this.state.tryouts.find(t => t.id === tryoutId);
    if (to) {
      to.scoringConfig = {
        ...(to.scoringConfig || {}),
        scoreSource: 'GOOGLE_FORM',
      };
      if (this.supabaseSyncEnabled) {
        sdb.syncTryout(to).catch(() => {});
      }
    }

    if (reconciledCount > 0) {
      this.persistState();
      this.logAudit(
        currentUser || { id: 'teacher', name: 'Guru Mata Pelajaran', role: 'GURU' },
        'RECONCILE_SCORES_WITH_GFORM',
        'TRYOUT_SCORES',
        `Menyelaraskan ${reconciledCount} nilai siswa pada Tryout ${tryoutId} dengan nilai resmi Google Form (Permanen).`
      );
      this.notifyListeners();

      // 3. Dorong pembaruan nilai ke Supabase agar persisten lintas perangkat
      if (this.supabaseSyncEnabled) {
        const toResponses = (this.state.responses || []).filter(r => r.tryoutId === tryoutId);
        const toScores = this.state.scores.filter(s => s.tryoutId === tryoutId);
        sdb.syncResponsesAndScores(tryoutId, toResponses, toScores).catch(err => {
          console.warn('[DB] syncResponsesAndScores error saat rekonsiliasi:', err);
        });
      }
    }

    return { reconciledCount };
  }

  /**
   * Mengambil butir soal yang spesifik milik Tryout ini:
   * 1. Soal yang terdaftar di tryoutQuestions
   * 2. Soal yang memiliki jawaban tersimpan di tabel answers untuk tryoutId ini
   * 3. Soal yang cocok dengan subjectId tryout
   */
  public getQuestionsForTryout(tryoutId?: string, subjectId?: string): Question[] {
    if (!tryoutId || tryoutId === 'ALL') {
      if (subjectId && subjectId !== 'ALL') {
        return this.state.questions
          .filter(q => q.subjectId === subjectId)
          .sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));
      }
      return [...this.state.questions].sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));
    }

    const tryout = this.state.tryouts.find(t => t.id === tryoutId);
    if (tryout?.isExternal) {
      return [];
    }
    const targetSubjectId = (subjectId && subjectId !== 'ALL') ? subjectId : tryout?.subjectId;
    const configuredCount = tryout?.selectedQuestionColumns?.length || 0;

    const linkedQIds = new Set(
      (this.state.tryoutQuestions || [])
        .filter(tq => tq.tryoutId === tryoutId)
        .map(tq => tq.questionId)
    );
    const tryoutAnswers = (this.state.answers || []).filter(a => a.tryoutId === tryoutId);
    const answerQIds = new Set(tryoutAnswers.map(a => a.questionId));

    let result = this.state.questions.filter(
      q => linkedQIds.has(q.id) || answerQIds.has(q.id)
    );

    // Jika terdapat questionId pada answers yang belum terdaftar di tabel questions (misal hasil sinkronisasi / impor),
    // bentuk entitas Question otomatis agar seluruh butir soal (1..N) tampil utuh di halaman maupun PDF analisis
    if (answerQIds.size > result.length) {
      const existingIds = new Set(result.map(q => q.id));
      let fallbackIdx = result.length + 1;
      Array.from(answerQIds).forEach(qId => {
        if (existingIds.has(qId)) return;
        const numMatch = qId.match(/(\d+)$/);
        const qNum = numMatch ? parseInt(numMatch[1], 10) : fallbackIdx++;
        const correctSample = tryoutAnswers.find(
          a => a.questionId === qId && a.isCorrect && a.studentAnswer && a.studentAnswer.trim() !== ''
        );
        const inferredKey = correctSample?.studentAnswer?.trim().toUpperCase() || '-';
        result.push({
          id: qId,
          uniqueCode: `${tryout?.code || 'SOAL'}-Q${String(qNum).padStart(2, '0')}`,
          questionNumber: qNum,
          subjectId: targetSubjectId || 'sub-1',
          materialId: '',
          competencyId: '',
          questionText: tryout?.selectedQuestionColumns?.[qNum - 1] || `Butir Soal Nomor ${qNum}`,
          options: [
            { key: 'A', text: 'Pilihan A' },
            { key: 'B', text: 'Pilihan B' },
            { key: 'C', text: 'Pilihan C' },
            { key: 'D', text: 'Pilihan D' },
            { key: 'E', text: 'Pilihan E' },
          ],
          correctAnswer: inferredKey,
          weight: 1,
          status: 'ACTIVE',
        });
      });
    }

    if (result.length === 0 && targetSubjectId) {
      result = this.state.questions.filter(q => q.subjectId === targetSubjectId);
      if (configuredCount > 0) {
        const scoped = result.filter(q => (q.questionNumber || 0) > 0 && (q.questionNumber || 0) <= configuredCount);
        if (scoped.length > 0) {
          result = scoped;
        }
      }
    } else if (configuredCount > 0 && linkedQIds.size === 0 && result.length > configuredCount) {
      // Jika terdapat sisa jawaban lama pada nomor soal di luar jumlah kolom yang dikonfigurasi saat ini, batasi ke jumlah soal aktif
      const scoped = result.filter(q => (q.questionNumber || 0) > 0 && (q.questionNumber || 0) <= configuredCount);
      if (scoped.length > 0) {
        result = scoped;
      }
    }

    if (result.length === 0) {
      result = this.state.questions;
    }

    return result.sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));
  }

  // -------------------------------------------------------------
  // PHASE 9 — ANALYTICS ENGINE API
  // -------------------------------------------------------------
  /**
   * Student Individual Analytics
   * Derives real calculations strictly from database entities.
   */
  public getStudentAnalytics(studentId: string, tryoutId: string): StudentAnalyticsResult | null {
    let effectiveTryoutId = tryoutId;
    if (!effectiveTryoutId || effectiveTryoutId === 'ALL') {
      const studentScores = this.state.scores.filter(s => s.studentId === studentId);
      const studentAnswers = this.state.answers.filter(a => a.studentId === studentId);
      effectiveTryoutId = studentScores[studentScores.length - 1]?.tryoutId
        || studentAnswers[studentAnswers.length - 1]?.tryoutId
        || this.state.tryouts[0]?.id
        || '';
    }

    const tryoutQuestions = this.getQuestionsForTryout(effectiveTryoutId);
    return AnalyticsService.getStudentAnalytics(
      studentId,
      effectiveTryoutId,
      this.state.students,
      this.state.classes,
      this.state.tryouts,
      (this.state.tryouts.find(t => t.id === effectiveTryoutId)?.isExternal ? tryoutQuestions : (tryoutQuestions.length > 0 ? tryoutQuestions : this.state.questions)),
      this.state.materials,
      this.state.competencies,
      this.state.answers,
      this.state.scores,
      this.state.responses
    );
  }

  /**
   * Class Level Analytics
   * Enforces teacher authorization: teacher cannot query classes outside assigned classes.
   */
  public getClassAnalytics(classId: string, tryoutId: string, currentUser?: any): ClassAnalyticsResult | null {
    if (currentUser && (currentUser.role === 'GURU' || currentUser.role === 'WALI_KELAS')) {
      const allowedClasses = this.getTeacherAllowedClassIds(currentUser);
      if (allowedClasses.length > 0 && !allowedClasses.includes(classId)) {
        classId = allowedClasses[0];
      }
    }

    let effectiveTryoutId = tryoutId;
    if (!effectiveTryoutId || effectiveTryoutId === 'ALL') {
      const classStudents = this.state.students.filter(s => s.classId === classId);
      const classStudentIds = new Set(classStudents.map(s => s.id));
      const classScores = this.state.scores.filter(s => classStudentIds.has(s.studentId));
      effectiveTryoutId = classScores[classScores.length - 1]?.tryoutId
        || this.state.tryouts[0]?.id
        || '';
    }

    const tryout = this.state.tryouts.find(t => t && t.id === effectiveTryoutId) || this.state.tryouts[0];
    if (!tryout) return null;
    const tsub = (this.state.tryoutSubjects || []).find(ts => ts && ts.tryoutId === tryout.id);
    const passingGrade = tsub?.passingGrade || 75;
    const tryoutQuestions = this.getQuestionsForTryout(effectiveTryoutId);

    return AnalyticsService.getClassAnalytics(
      classId,
      effectiveTryoutId,
      this.state.students,
      this.state.classes,
      this.state.tryouts,
      this.state.academicYears,
      this.state.scores,
      (this.state.tryouts.find(t => t.id === effectiveTryoutId)?.isExternal ? tryoutQuestions : (tryoutQuestions.length > 0 ? tryoutQuestions : this.state.questions)),
      this.state.answers,
      this.state.materials,
      this.state.competencies,
      passingGrade
    );
  }

  /**
   * Overall Multi-Dimensional Filter Analytics
   * Filter: Academic Year, Try Out, Subject, Grade, Class
   */
  public getOverallAnalytics(filters: OverallAnalyticsFilters, currentUser?: any): OverallAnalyticsResult {
    // If teacher or wali kelas, clamp filters to allowed subject/class scope instead of throwing 403 error
    if (currentUser && (currentUser.role === 'GURU' || currentUser.role === 'WALI_KELAS')) {
      const allowedSubjects = this.getTeacherAllowedSubjectIds(currentUser);
      const allowedClasses = this.getTeacherAllowedClassIds(currentUser);

      let effectiveSubjectId = filters.subjectId;
      if (allowedSubjects.length > 0 && filters.subjectId && filters.subjectId !== 'ALL' && !allowedSubjects.includes(filters.subjectId)) {
        effectiveSubjectId = allowedSubjects[0];
      }

      let effectiveClassId = filters.classId;
      if (allowedClasses.length > 0 && filters.classId && filters.classId !== 'ALL' && !allowedClasses.includes(filters.classId)) {
        effectiveClassId = allowedClasses[0];
      }

      filters = {
        ...filters,
        subjectId: effectiveSubjectId,
        classId: effectiveClassId,
      };
    }

    return AnalyticsService.getOverallAnalytics(
      filters,
      this.state.students,
      this.state.classes,
      this.state.tryouts,
      this.state.academicYears,
      this.state.subjects,
      this.state.scores,
      75
    );
  }

  /**
   * Question Psychometric Item Analysis
   * Difficulty Index (p), Discrimination Index (D), Distractor Analysis, Informative Status
   */
  public getQuestionAnalysis(
    tryoutId: string,
    subjectId?: string,
    classId?: string,
    currentUser?: any
  ): QuestionAnalysisResult[] {
    const isAllTryouts = !tryoutId || tryoutId === 'ALL';
    const tryout = this.state.tryouts.find(t => t.id === tryoutId);
    if (!isAllTryouts && tryout?.isExternal) {
      return [];
    }

    let questions = this.getQuestionsForTryout(tryoutId, subjectId);
    if (!isAllTryouts) {
      // Jika paket tryout spesifik dipilih tetapi tidak memiliki butir soal (misal TO Eksternal atau belum terhubung butir soal),
      // JANGAN fallback ke seluruh bank soal agar tabel kosong sesuai filter yang dipilih.
      if (questions.length === 0) {
        return [];
      }
    } else if (questions.length === 0) {
      questions = this.state.questions;
      if (subjectId && subjectId !== 'ALL') {
        if (currentUser && (currentUser.role === 'GURU' || currentUser.role === 'WALI_KELAS')) {
          const allowed = this.getTeacherAllowedSubjectIds(currentUser);
          if (allowed.length > 0 && !allowed.includes(subjectId)) {
            subjectId = allowed[0];
          }
        }
        questions = questions.filter(q => q.subjectId === subjectId);
      } else if (currentUser && (currentUser.role === 'GURU' || currentUser.role === 'WALI_KELAS')) {
        const allowed = this.getTeacherAllowedSubjectIds(currentUser);
        questions = questions.filter(q => allowed.includes(q.subjectId));
      }
    } else if (subjectId && subjectId !== 'ALL') {
      const matchSub = questions.filter(q => q.subjectId === subjectId);
      if (matchSub.length > 0) {
        questions = matchSub;
      }
    }

    let answers: Answer[] = [];
    let scores: Score[] = [];

    if (isAllTryouts) {
      answers = [...this.state.answers];
      scores = [...this.state.scores];
      if (subjectId && subjectId !== 'ALL') {
        const qIdsForSubject = new Set(questions.map(q => q.id));
        if (qIdsForSubject.size > 0) {
          answers = answers.filter(a => qIdsForSubject.has(a.questionId));
        }
      }
    } else {
      const cachedAns = this.answersByTryout.get(tryoutId);
      answers = (cachedAns && cachedAns.length > 0) ? cachedAns : this.state.answers.filter(a => a.tryoutId === tryoutId);
      const cachedScores = this.scoresByTryout.get(tryoutId);
      scores = (cachedScores && cachedScores.length > 0) ? cachedScores : this.state.scores.filter(s => s.tryoutId === tryoutId);
    }

    // Filter by class if specified
    if (classId && classId !== 'ALL') {
      const classStudents = this.studentsByClass.get(classId) || this.state.students.filter(s => s.classId === classId);
      const classStudentIds = new Set(classStudents.map(s => s.id));
      answers = answers.filter(a => classStudentIds.has(a.studentId));
      scores = scores.filter(s => classStudentIds.has(s.studentId));
    }

    return AnalyticsService.calculateQuestionItemAnalysis(
      questions,
      answers,
      scores,
      this.state.materials,
      this.state.competencies
    );
  }

  /**
   * AUTOMATED ANALYTICS ENGINE TEST SUITE:
   * Validates: filter, aggregation, accuracy, empty state, large dataset, unauthorized access.
   */
  public runAnalyticsEngineTests(currentUser?: any): AnalyticsTestSuiteResult {
    return AnalyticsService.runAnalyticsTestSuite(this.state, currentUser);
  }

  /**
   * Large Dataset Stress Benchmark Runner (900+ Students, 29+ Classes, 30,000+ Answers)
   */
  public runLargeDatasetBenchmark(students = 960, classes = 29) {
    const start = performance.now();
    const benchmarkData = AnalyticsService.generateLargeDatasetBenchmark(students, classes, 35);
    const genTime = Math.round(performance.now() - start);

    const aggStart = performance.now();
    const analytics = AnalyticsService.getOverallAnalytics(
      { gradeLevel: 'XII' },
      benchmarkData.students,
      benchmarkData.classes,
      benchmarkData.tryouts,
      benchmarkData.academicYears,
      benchmarkData.subjects,
      benchmarkData.scores,
      75
    );
    const aggTime = Math.round(performance.now() - aggStart);

    return {
      studentCount: benchmarkData.students.length,
      classCount: benchmarkData.classes.length,
      questionsCount: benchmarkData.questions.length,
      answersCount: benchmarkData.answers.length,
      generationTimeMs: genTime,
      aggregationTimeMs: aggTime,
      overallAverage: analytics.summary.averageScore,
      overallPassingRate: analytics.summary.passingRate,
      topStudentsCount: analytics.topStudents.length,
    };
  }

  /**
   * AUTOMATED SCORING ENGINE TEST SUITE:
   * Runs the 10 critical benchmark scenarios adhering to /docs/SCORING_RULES.md
   */
  public runScoringEngineTests(): {
    passed: boolean;
    tests: ScoringTestCaseResult[];
  } {
    return ScoringService.runScoringTestSuite();
  }

  public saveImportedResponsesAndScores(
    tryoutId: string,
    newResponses: Response[],
    newAnswers: Answer[],
    newScores: Score[],
    currentUser: any
  ) {
    const studentTryoutKeys = new Set(newResponses.map(r => `${r.studentId}___${r.tryoutId}`));
    const existingResponsesToDrop = this.state.responses.filter(r =>
      studentTryoutKeys.has(`${r.studentId}___${r.tryoutId}`)
    );
    const droppedResponseIds = new Set([
      ...existingResponsesToDrop.map(r => r.id),
      ...newResponses.map(r => r.id),
    ]);

    this.state.responses = [
      ...this.state.responses.filter(r => !droppedResponseIds.has(r.id)),
      ...newResponses,
    ];

    const scoreIdsToRemove = new Set(newScores.map(s => s.id));
    this.state.scores = [
      ...this.state.scores.filter(
        s => !studentTryoutKeys.has(`${s.studentId}___${s.tryoutId}`) && !scoreIdsToRemove.has(s.id)
      ),
      ...newScores,
    ];

    this.state.answers = [
      ...this.state.answers.filter(
        a =>
          !studentTryoutKeys.has(`${a.studentId}___${a.tryoutId}`) &&
          !droppedResponseIds.has(a.responseId) &&
          !newResponses.some(r => r.id === a.responseId)
      ),
      ...newAnswers,
    ];

    this.persistState();
    this.rebuildIndexes();
    this.notifyListeners();
    if (this.supabaseSyncEnabled) {
      (async () => {
        this.isPushingCloud = true;
        try {
          await sdb.syncResponsesAndScores(tryoutId, newResponses, newScores);
          if (newAnswers && newAnswers.length > 0) {
            // Pastikan seluruh butir soal yang direferensikan sudah tersimpan di Supabase dan ID-nya selaras
            const qIdSet = new Set(newAnswers.map(a => a.questionId));
            const referencedQuestions = this.state.questions.filter(q => qIdSet.has(q.id));
            if (referencedQuestions.length > 0) {
              const oldIdByCode = new Map<string, string>();
              referencedQuestions.forEach(q => oldIdByCode.set(q.uniqueCode, q.id));
              await sdb.syncQuestionsBatch(referencedQuestions);
              // Jika syncQuestionsBatch menyelaraskan q.id dengan ID kanonik Supabase, perbarui questionId pada jawaban
              referencedQuestions.forEach(q => {
                const prevId = oldIdByCode.get(q.uniqueCode);
                if (prevId && q.id && prevId !== q.id) {
                  newAnswers.forEach(a => {
                    if (a.questionId === prevId) a.questionId = q.id;
                  });
                  this.state.answers.forEach(a => {
                    if (a.questionId === prevId) a.questionId = q.id;
                  });
                }
              });
            }
            await sdb.syncAnswersBatch(newAnswers);
          }
          this.persistState();
          this.rebuildIndexes();
        } catch (err) {
          console.warn('[DB] saveImportedResponsesAndScores sync error:', err);
        } finally {
          this.isPushingCloud = false;
        }
      })();
    }
  }

  /**
   * Menyimpan nilai Try Out Eksternal (rekap skor per siswa dan nilai per mata pelajaran)
   * Otomatis menyimpan ke state lokal dan menyinkronkan ke Supabase database untuk multi-device sync.
   */
  public async saveExternalScores(
    tryoutId: string,
    newScores: Score[],
    newResponses: Response[] = [],
    currentUser?: any
  ): Promise<{ savedCount: number; updatedCount: number; cloudSynced: boolean; cloudError?: string }> {
    const studentTryoutKeys = new Set(newScores.map(s => `${s.studentId}___${s.tryoutId}`));
    const scoreIdsToRemove = new Set(newScores.map(s => s.id));

    let updatedCount = 0;
    let savedCount = 0;

    newScores.forEach(s => {
      const exists = this.state.scores.some(old => old.studentId === s.studentId && old.tryoutId === s.tryoutId);
      if (exists) {
        updatedCount++;
      } else {
        savedCount++;
      }
    });

    this.state.scores = [
      ...this.state.scores.filter(
        s => !studentTryoutKeys.has(`${s.studentId}___${s.tryoutId}`) && !scoreIdsToRemove.has(s.id)
      ),
      ...newScores,
    ];

    if (newResponses && newResponses.length > 0) {
      const respKeys = new Set(newResponses.map(r => `${r.studentId}___${r.tryoutId}`));
      const respIdsToRemove = new Set(newResponses.map(r => r.id));
      this.state.responses = [
        ...(this.state.responses || []).filter(
          r => !respKeys.has(`${r.studentId}___${r.tryoutId}`) && !respIdsToRemove.has(r.id)
        ),
        ...newResponses,
      ];
    }

    // Rebuild cache index
    this.scoresByTryout.set(
      tryoutId,
      this.state.scores.filter(s => s.tryoutId === tryoutId)
    );

    if (currentUser) {
      this.logAudit(
        currentUser,
        'IMPORT_EXTERNAL_SCORES',
        `TRYOUT:${tryoutId}`,
        `Impor ${newScores.length} nilai try out eksternal (${savedCount} baru, ${updatedCount} diperbarui).`
      );
    }

    this.persistState();
    this.rebuildIndexes();
    this.notifyListeners();

    let cloudSynced = false;
    let cloudError: string | undefined;

    if (this.supabaseSyncEnabled) {
      this.isPushingCloud = true;
      try {
        const currentTo = this.state.tryouts.find(t => t.id === tryoutId);
        if (currentTo) {
          await sdb.syncTryout(currentTo);
        }
        await sdb.syncResponsesAndScores(tryoutId, newResponses, newScores);
        this.persistState();
        this.rebuildIndexes();
        this.notifyListeners();
        cloudSynced = true;
        console.info(`[DB] Berhasil menyinkronkan ${newScores.length} nilai TO Eksternal ke cloud Supabase.`);
      } catch (err: any) {
        console.warn('[DB] syncExternalScores cloud sync error:', err);
        cloudError = err.message || 'Gagal tersambung ke Supabase.';
      } finally {
        this.isPushingCloud = false;
      }
    }

    return { savedCount, updatedCount, cloudSynced, cloudError };
  }
  // -------------------------------------------------------------
  public getExplanations(): Explanation[] { return this.state.explanations; }

  public getExplanationsForTeacher(currentUser: any): Explanation[] {
    if (!currentUser) return [];
    if (currentUser.role === 'ADMIN') return this.state.explanations;
    const allowedIds = this.getTeacherAllowedSubjectIds(currentUser);
    const allowedSet = new Set(allowedIds);
    const allowedCodes = new Set(
      (this.state.subjects || [])
        .filter(s => s && allowedSet.has(s.id) && s.code)
        .map(s => s.code.toLowerCase())
    );
    return this.state.explanations.filter(e => {
      if (!e.subjectId) return false;
      if (allowedSet.has(e.subjectId)) return true;
      if (allowedCodes.has(e.subjectId.toLowerCase())) return true;
      return false;
    });
  }

  public getExplanationsForStudent(tryoutId: string, questionId?: string, questionNumber?: number): Explanation[] {
    return ExplanationService.filterExplanationsForStudent(this.state.explanations, tryoutId, questionId, questionNumber);
  }

  public addExplanation(
    exp: Omit<Explanation, 'id' | 'createdAt' | 'updatedAt'>,
    currentUser: any
  ): Explanation {
    if (exp.subjectId && currentUser.role === 'GURU') {
      this.assertTeacherSubject(currentUser, exp.subjectId, 'CREATE_EXPLANATION');
    }

    // Security check: validate external URL protocol
    if (exp.externalUrl) {
      const urlCheck = ExplanationService.validateExternalUrl(exp.externalUrl);
      if (!urlCheck.isValid) throw new Error(urlCheck.error);
    }

    // Security check: validate YouTube URL format
    if (exp.youtubeUrl) {
      const ytCheck = ExplanationService.validateYouTubeUrl(exp.youtubeUrl);
      if (!ytCheck.isValid) throw new Error(ytCheck.error);
      exp.youtubeUrl = ytCheck.sanitizedYoutubeEmbedUrl || exp.youtubeUrl;
    }

    const now = new Date().toISOString();
    const newExp: Explanation = {
      ...exp,
      id: generateUuid(),
      status: exp.status || 'DRAFT',
      createdBy: currentUser.id,
      authorName: currentUser.name,
      createdAt: now,
      updatedAt: now,
    };

    this.removeDeletedExplanationIdentifier(newExp.id);
    this.pendingExplanationIds.add(newExp.id);
    this.state.explanations.push(newExp);
    this.logAudit(currentUser, 'CREATE_EXPLANATION', 'EXPLANATION', `Membuat pembahasan (${newExp.status}): ${newExp.title}`);
    this.persistState();

    if (this.supabaseSyncEnabled || sdb.isAvailable()) {
      sdb.syncExplanation(newExp)
        .then(() => {
          this.pendingExplanationIds.delete(newExp.id);
          this.persistState();
        })
        .catch(err => {
          console.warn('[DB] syncExplanation error:', err);
        });
    }
    return newExp;
  }

  public updateExplanation(id: string, updates: Partial<Explanation>, currentUser: any) {
    const existing = this.state.explanations.find(e => e.id === id);
    if (!existing) throw new Error(`Pembahasan dengan ID '${id}' tidak ditemukan.`);

    if (existing.subjectId && currentUser.role === 'GURU') {
      this.assertTeacherSubject(currentUser, existing.subjectId, 'UPDATE_EXPLANATION');
    }

    if (updates.externalUrl) {
      const urlCheck = ExplanationService.validateExternalUrl(updates.externalUrl);
      if (!urlCheck.isValid) throw new Error(urlCheck.error);
    }

    if (updates.youtubeUrl) {
      const ytCheck = ExplanationService.validateYouTubeUrl(updates.youtubeUrl);
      if (!ytCheck.isValid) throw new Error(ytCheck.error);
      updates.youtubeUrl = ytCheck.sanitizedYoutubeEmbedUrl || updates.youtubeUrl;
    }

    this.removeDeletedExplanationIdentifier(id);
    this.pendingExplanationIds.add(id);

    const now = new Date().toISOString();
    this.state.explanations = this.state.explanations.map(e =>
      e.id === id ? { ...e, ...updates, updatedAt: now } : e
    );

    this.logAudit(currentUser, 'UPDATE_EXPLANATION', 'EXPLANATION', `Memperbarui pembahasan: ${existing.title}`);
    this.persistState();

    const updated = this.state.explanations.find(e => e.id === id);
    if ((this.supabaseSyncEnabled || sdb.isAvailable()) && updated) {
      sdb.syncExplanation(updated)
        .then(() => {
          this.pendingExplanationIds.delete(id);
          this.persistState();
        })
        .catch(err => {
          console.warn('[DB] syncExplanation update error:', err);
        });
    }
  }

  public publishExplanation(id: string, currentUser: any) {
    const existing = this.state.explanations.find(e => e.id === id);
    if (!existing) throw new Error(`Pembahasan dengan ID '${id}' tidak ditemukan.`);

    if (existing.subjectId && currentUser.role === 'GURU') {
      this.assertTeacherSubject(currentUser, existing.subjectId, 'PUBLISH_EXPLANATION');
    }

    this.removeDeletedExplanationIdentifier(id);
    this.pendingExplanationIds.add(id);

    const now = new Date().toISOString();
    this.state.explanations = this.state.explanations.map(e =>
      e.id === id ? { ...e, status: 'PUBLISHED', updatedAt: now } : e
    );

    this.logAudit(
      currentUser,
      'PUBLISH_EXPLANATION',
      'EXPLANATION',
      `Mempublikasikan pembahasan ke siswa: ${existing.title} (Tryout: ${existing.tryoutId})`
    );
    this.persistState();

    const updated = this.state.explanations.find(e => e.id === id);
    if ((this.supabaseSyncEnabled || sdb.isAvailable()) && updated) {
      sdb.syncExplanation(updated)
        .then(() => {
          this.pendingExplanationIds.delete(id);
          this.persistState();
        })
        .catch(err => {
          console.warn('[DB] syncExplanation publish error:', err);
        });
    }
  }

  public archiveExplanation(id: string, currentUser: any) {
    const existing = this.state.explanations.find(e => e.id === id);
    if (!existing) throw new Error(`Pembahasan dengan ID '${id}' tidak ditemukan.`);

    if (existing.subjectId && currentUser.role === 'GURU') {
      this.assertTeacherSubject(currentUser, existing.subjectId, 'ARCHIVE_EXPLANATION');
    }

    this.removeDeletedExplanationIdentifier(id);
    this.pendingExplanationIds.add(id);

    const now = new Date().toISOString();
    this.state.explanations = this.state.explanations.map(e =>
      e.id === id ? { ...e, status: 'ARCHIVED', updatedAt: now } : e
    );

    this.logAudit(
      currentUser,
      'ARCHIVE_EXPLANATION',
      'EXPLANATION',
      `Mengarsipkan pembahasan (menyembunyikan dari siswa): ${existing.title}`
    );
    this.persistState();

    const updated = this.state.explanations.find(e => e.id === id);
    if ((this.supabaseSyncEnabled || sdb.isAvailable()) && updated) {
      sdb.syncExplanation(updated)
        .then(() => {
          this.pendingExplanationIds.delete(id);
          this.persistState();
        })
        .catch(err => {
          console.warn('[DB] syncExplanation archive error:', err);
        });
    }
  }

  public deleteExplanation(id: string, currentUser: any) {
    const existing = this.state.explanations.find(e => e.id === id);
    if (!existing) throw new Error(`Pembahasan dengan ID '${id}' tidak ditemukan.`);

    if (existing.subjectId && currentUser.role === 'GURU') {
      this.assertTeacherSubject(currentUser, existing.subjectId, 'DELETE_EXPLANATION');
    }

    this.addDeletedExplanationIdentifier(id);
    this.pendingExplanationIds.delete(id);

    this.state.explanations = this.state.explanations.filter(e => e.id !== id);
    this.logAudit(currentUser, 'DELETE_EXPLANATION', 'EXPLANATION', `Menghapus pembahasan: ${existing.title}`);
    this.persistState();

    if (this.supabaseSyncEnabled || sdb.isAvailable()) {
      sdb.removeExplanation(id).catch(err => {
        console.warn('[DB] removeExplanation error:', err);
      });
    }
  }

  /**
   * AUTOMATED EXPLANATION SYSTEM TEST SUITE (PHASE 10)
   */
  public runExplanationEngineTests(currentUser?: any): ExplanationTestSuiteResult {
    return ExplanationService.runExplanationTestSuite(this.state, currentUser);
  }

  /**
   * AUTOMATED REPORTING & EXPORT TEST SUITE (PHASE 11)
   */
  public runReportEngineTests(currentUser?: any): ReportTestSuiteResult {
    return ExportService.runReportEngineTests(this.state, currentUser);
  }

  // -------------------------------------------------------------
  // PHASE 12 — PROGRESS TRACKING API
  // -------------------------------------------------------------
  public getStudentProgress(studentId: string, currentUser?: any, subjectId?: string): StudentProgressResult | null {
    return ProgressService.getStudentProgress(studentId, this.state, currentUser, subjectId);
  }

  public getClassProgress(classId: string, currentUser?: any): ClassProgressResult | null {
    if (!classId) return null;
    let targetClassId = classId;
    if (targetClassId === 'ALL') {
      const allowed = currentUser ? this.getTeacherAllowedClassIds(currentUser) : [];
      targetClassId = allowed[0] || (this.state.classes || [])[0]?.id || '';
      if (!targetClassId) return null;
    }
    if (currentUser && currentUser.role === 'GURU') {
      this.assertTeacherClass(currentUser, targetClassId, 'VIEW_CLASS_PROGRESS');
    }
    return ProgressService.getClassProgress(targetClassId, this.state, currentUser);
  }

  public getSubjectProgress(subjectId: string, currentUser?: any): SubjectProgressResult | null {
    if (!subjectId) return null;
    let targetSubjectId = subjectId;
    if (targetSubjectId === 'ALL') {
      const allowed = currentUser ? this.getTeacherAllowedSubjectIds(currentUser) : [];
      targetSubjectId = allowed[0] || (this.state.subjects || [])[0]?.id || '';
      if (!targetSubjectId) return null;
    }
    if (currentUser && currentUser.role === 'GURU') {
      this.assertTeacherSubject(currentUser, targetSubjectId, 'VIEW_SUBJECT_PROGRESS');
    }
    return ProgressService.getSubjectProgress(targetSubjectId, this.state, currentUser);
  }

  public getCompetencyProgress(competencyId: string, currentUser?: any): CompetencyProgressResult | null {
    return ProgressService.getCompetencyProgress(competencyId, this.state, currentUser);
  }

  /**
   * AUTOMATED PROGRESS TRACKING TEST SUITE (PHASE 12)
   */
  public runProgressEngineTests(currentUser?: any): ProgressTestSuiteResult {
    return ProgressService.runProgressTestSuite(this.state, currentUser);
  }

  /**
   * MASTER PRODUCTION READINESS VALIDATION TEST SUITE (PHASE 14)
   */
  public runProductionValidationTests(currentUser?: any): ProductionValidationSuiteResult {
    return ProductionValidationService.runProductionValidationTestSuite(this.state, currentUser);
  }

  // AUDIT LOGS
  public getAuditLogs(): AuditLog[] { return this.state.auditLogs; }

  /**
   * SECURITY TEST SUITE: Teacher Permission & Isolation Verification
   */
  public runTeacherPermissionSecurityTests(): {
    passed: boolean;
    tests: { name: string; passed: boolean; message: string }[];
  } {
    const results: { name: string; passed: boolean; message: string }[] = [];

    const guruMatematika: User = {
      id: 'u-guru1',
      name: 'Drs. Bambang Sugiarto',
      email: 'bambang@sekolah.sch.id',
      role: 'GURU',
      createdAt: '2025-07-01T08:00:00Z',
    };

    const guruFisika: User = {
      id: 'u-guru3',
      name: 'Ahmad Rifai, M.Pd',
      email: 'rifai@sekolah.sch.id',
      role: 'GURU',
      createdAt: '2025-07-01T08:00:00Z',
    };

    // Test 1: Teacher Allowed Subjects Resolution
    const matSubjects = this.getTeacherAllowedSubjectIds(guruMatematika);
    const t1Passed = matSubjects.includes('subj-mat') && !matSubjects.includes('subj-fis') && !matSubjects.includes('subj-bin');
    results.push({
      name: 'Teacher Allowed Subject Resolution',
      passed: t1Passed,
      message: t1Passed
        ? `Guru Matematika memiliki wewenang persis pada: [${matSubjects.join(', ')}]`
        : `Gagal: Subjek terlarang bocor ke Guru Matematika: [${matSubjects.join(', ')}]`,
    });

    // Test 2: Teacher Allowed Classes Resolution
    const matClasses = this.getTeacherAllowedClassIds(guruMatematika);
    const t2Passed = matClasses.includes('c-xii-ipa1') && matClasses.includes('c-xii-ipa2') && !matClasses.includes('c-xii-ips1');
    results.push({
      name: 'Teacher Allowed Class Isolation',
      passed: t2Passed,
      message: t2Passed
        ? `Guru Matematika hanya mengampu kelas: [${matClasses.join(', ')}]`
        : `Gagal: Kelas tidak berwenang terdeteksi pada Guru Matematika: [${matClasses.join(', ')}]`,
    });

    // Test 3: Authorized Question Creation (MAT)
    let createdQuestionId = '';
    try {
      const q = this.addQuestion({
        uniqueCode: `TEST-SEC-MAT-${Date.now()}`,
        subjectId: 'subj-mat',
        materialId: 'm-mat-1',
        competencyId: 'comp-mat-1',
        questionNumber: 99,
        questionText: 'Test soal matematika wewenang resmi guru.',
        options: [
          { key: 'A', text: 'Jawaban A' },
          { key: 'B', text: 'Jawaban B' },
        ],
        correctAnswer: 'A',
        weight: 1,
        cognitiveLevel: 'C4',
        status: 'ACTIVE',
      }, guruMatematika);
      createdQuestionId = q.id;
      results.push({
        name: 'Authorized Question Creation (Authorized Subject)',
        passed: true,
        message: `Berhasil menambahkan butir soal pada mata pelajaran berwenang (${q.uniqueCode}, level: ${q.cognitiveLevel})`,
      });
    } catch (err: any) {
      results.push({
        name: 'Authorized Question Creation (Authorized Subject)',
        passed: false,
        message: `Gagal menambahkan soal yang sah: ${err.message}`,
      });
    }

    // Test 4: Unauthorized Question Creation Rejection (Guru MAT mencoba membuat soal FIS)
    try {
      this.addQuestion({
        uniqueCode: `TEST-ILLEGAL-FIS-${Date.now()}`,
        subjectId: 'subj-fis',
        materialId: 'm-fis-1',
        competencyId: 'comp-fis-1',
        questionText: 'Test soal fisika ilegal oleh guru matematika.',
        options: [
          { key: 'A', text: 'A' },
          { key: 'B', text: 'B' },
        ],
        correctAnswer: 'A',
        weight: 1,
        cognitiveLevel: 'C3',
        status: 'ACTIVE',
      }, guruMatematika);
      results.push({
        name: 'Unauthorized Subject Question Creation Rejection',
        passed: false,
        message: 'GAGAL: Guru Matematika berhasil membuat soal Fisika tanpa hak akses!',
      });
    } catch (err: any) {
      const isForbidden = err.message.includes('Akses Ditolak (403)');
      results.push({
        name: 'Unauthorized Subject Question Creation Rejection',
        passed: isForbidden,
        message: isForbidden
          ? `Berhasil ditolak dengan 403 Forbidden: "${err.message}"`
          : `Pesan penolakan tidak sesuai: ${err.message}`,
      });
    }

    // Test 5: Unauthorized Material Creation Rejection
    try {
      this.addMaterial({
        code: `MAT-ILLEGAL-${Date.now()}`,
        subjectId: 'subj-fis',
        title: 'Materi Fisika Ilegal',
        description: 'Materi tanpa hak akses',
      }, guruMatematika);
      results.push({
        name: 'Unauthorized Material Creation Rejection',
        passed: false,
        message: 'GAGAL: Guru Matematika berhasil menambahkan materi Fisika!',
      });
    } catch (err: any) {
      const isForbidden = err.message.includes('Akses Ditolak (403)');
      results.push({
        name: 'Unauthorized Material Creation Rejection',
        passed: isForbidden,
        message: isForbidden
          ? `Berhasil ditolak dengan 403: "${err.message}"`
          : `Gagal: ${err.message}`,
      });
    }

    // Test 6: Unauthorized Competency Creation Rejection
    try {
      this.addCompetency({
        code: `KD-ILLEGAL-${Date.now()}`,
        subjectId: 'subj-bin',
        statement: 'Kompetensi Bahasa Indonesia ilegal',
        gradeLevel: 'XII',
      }, guruMatematika);
      results.push({
        name: 'Unauthorized Competency Creation Rejection',
        passed: false,
        message: 'GAGAL: Guru Matematika berhasil menambahkan KD Bahasa Indonesia!',
      });
    } catch (err: any) {
      const isForbidden = err.message.includes('Akses Ditolak (403)');
      results.push({
        name: 'Unauthorized Competency Creation Rejection',
        passed: isForbidden,
        message: isForbidden
          ? `Berhasil ditolak dengan 403: "${err.message}"`
          : `Gagal: ${err.message}`,
      });
    }

    // Test 7: Unauthorized Class Student Access Rejection
    try {
      this.getStudentsForTeacher(guruMatematika, 'c-xii-ips1');
      results.push({
        name: 'Unauthorized Class Student Access Rejection',
        passed: false,
        message: 'GAGAL: Guru Matematika berhasil mengakses data siswa kelas XII IPS 1!',
      });
    } catch (err: any) {
      const isForbidden = err.message.includes('Akses Ditolak (403)');
      results.push({
        name: 'Unauthorized Class Student Access Rejection',
        passed: isForbidden,
        message: isForbidden
          ? `Berhasil dicegat dengan 403: "${err.message}"`
          : `Gagal: ${err.message}`,
      });
    }

    // Cleanup test question if created
    if (createdQuestionId) {
      this.state.questions = this.state.questions.filter(q => q.id !== createdQuestionId);
      this.persistState();
    }

    return {
      passed: results.every(r => r.passed),
      tests: results,
    };
  }
}

export const dbService = new DatabaseService();
