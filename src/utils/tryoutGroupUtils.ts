import { Tryout, Subject, Score, Answer, Question, ExamPackage } from '../types/database';

export const DEFAULT_MAX_TRYOUT_STAGE = 3;
export const CUSTOM_MAX_STAGE_STORAGE_KEY = 'sman2_custom_max_to_stage';
export const ADD_NEW_TO_STAGE_VALUE = '__ADD_NEW_TO_STAGE__';

export const TRYOUT_STAGE_OPTIONS: string[] = [
  'TO 1',
  'TO 2',
  'TO 3',
];

export const TRYOUT_GROUP_NONE = 'NONE';

/**
 * Menghitung batas nomor urut Siklus TO tertinggi yang aktif (minimal DEFAULT_MAX_TRYOUT_STAGE = 3).
 * Memeriksa localStorage serta seluruh data Tryout dan ExamPackage yang sudah ada.
 */
export function getMaxTryoutStage(
  allTryouts?: Tryout[],
  examPackages?: ExamPackage[],
  extraStage?: string | number | null
): number {
  let maxStage = DEFAULT_MAX_TRYOUT_STAGE;

  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(CUSTOM_MAX_STAGE_STORAGE_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed > maxStage && parsed <= 30) {
          maxStage = parsed;
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  if (typeof extraStage === 'number' && extraStage > maxStage && extraStage <= 30) {
    maxStage = extraStage;
  } else if (typeof extraStage === 'string') {
    const order = getStageOrderNumber(extraStage);
    if (order < 999 && order > maxStage && order <= 30) {
      maxStage = order;
    }
  }

  if (allTryouts && allTryouts.length > 0) {
    allTryouts.forEach(t => {
      // Abaikan asesmen non-Tryout (seperti SAT atau SAS) agar tidak memengaruhi siklus TO
      if (t.assessmentType && t.assessmentType !== 'TRYOUT') return;
      const grp = t.tryoutGroup || extractTryoutStageFromText(t.title) || extractTryoutStageFromText(t.code);
      if (grp && grp !== TRYOUT_GROUP_NONE) {
        const order = getStageOrderNumber(grp);
        if (order < 999 && order > maxStage && order <= 30) {
          maxStage = order;
        }
      }
    });
  }

  if (examPackages && examPackages.length > 0) {
    examPackages.forEach(pkg => {
      // Abaikan paket non-Tryout (seperti SAT atau SAS)
      if (pkg.assessmentType && pkg.assessmentType !== 'TRYOUT') return;
      const grp = extractTryoutStageFromText(pkg.title) || extractTryoutStageFromText(pkg.code);
      if (grp) {
        const order = getStageOrderNumber(grp);
        if (order < 999 && order > maxStage && order <= 30) {
          maxStage = order;
        }
      }
    });
  }

  return maxStage;
}

/**
 * Menghasilkan daftar opsi siklus Try Out dinamis: ['TO 1', 'TO 2', ..., 'TO N']
 */
export function getDynamicTryoutStageOptions(
  allTryouts?: Tryout[],
  examPackages?: ExamPackage[],
  extraStage?: string | number | null
): string[] {
  const maxStage = getMaxTryoutStage(allTryouts, examPackages, extraStage);
  const options: string[] = [];
  for (let i = 1; i <= maxStage; i++) {
    options.push(`TO ${i}`);
  }
  return options;
}

/**
 * Menambahkan 1 siklus TO baru di atas batas saat ini dan menyimpannya ke localStorage.
 */
export function addNextTryoutStageOption(
  allTryouts?: Tryout[],
  examPackages?: ExamPackage[],
  currentCustomMax?: number
): { newMaxStage: number; newStageLabel: string } {
  const currentMax = getMaxTryoutStage(allTryouts, examPackages, currentCustomMax);
  const newMaxStage = Math.min(30, currentMax + 1);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CUSTOM_MAX_STAGE_STORAGE_KEY, String(newMaxStage));
    } catch {
      // Ignore storage errors
    }
  }
  return {
    newMaxStage,
    newStageLabel: `TO ${newMaxStage}`,
  };
}

/**
 * Mengembalikan label siklus yang ramah pengguna ("TO 1", "TO 2", "TO 3", atau "Non-TO") untuk sebuah Tryout.
 */
export function getFriendlyTryoutStageLabel(
  tryout: Tryout,
  allTryouts?: Tryout[],
  examPackages?: ExamPackage[]
): string {
  const grp = resolveTryoutGroup(tryout, allTryouts, examPackages);
  return grp === TRYOUT_GROUP_NONE ? 'Non-TO' : grp;
}

export interface TryoutStageGroup {
  /** Kunci kelompok standar, misal: "TO 1", "TO 2", "TO 3" */
  groupKey: string;
  /** Nomor urut numerik untuk pengurutan (1 untuk TO 1, 2 untuk TO 2, dst.) */
  order: number;
  /** Judul tampilan siklus Try Out */
  title: string;
  /** Tanggal mulai paling awal dari anggota TO */
  startDate: string;
  /** Tanggal selesai paling akhir dari anggota TO */
  endDate: string;
  /** Daftar objek Tryout yang tergabung dalam siklus TO ini */
  tryouts: Tryout[];
  /** Pemetaan subjectId -> Tryout untuk pencarian cepat */
  subjectTryoutMap: Record<string, Tryout>;
}

export interface StageSubjectCoverage {
  groupKey: string;
  order: number;
  /** Daftar mapel yang sudah punya Try Out di kelompok ini */
  filledSubjects: { subject: Subject; tryouts: Tryout[] }[];
  /** Daftar mapel yang belum punya Try Out di kelompok ini */
  missingSubjects: Subject[];
  /** Daftar mapel yang memiliki lebih dari 1 Try Out di kelompok yang sama (duplikat/konflik) */
  duplicateSubjects: { subject: Subject; tryouts: Tryout[] }[];
  /** Apakah seluruh mapel aktif sudah terisi lengkap tanpa duplikat */
  isComplete: boolean;
}

/**
 * Mengekstrak label "TO <angka>" dari teks judul atau kode manual.
 * Mengabaikan angka tahun 4 digit seperti "TO-2026-01".
 */
export function extractTryoutStageFromText(text?: string | null): string | null {
  if (!text) return null;
  const clean = text.trim();
  if (!clean) return null;

  // Abaikan pola kode otomatis berbasis tahun: TO-2026-01
  if (/^TO-\d{4}-\d+$/i.test(clean)) {
    return null;
  }

  // Cocokkan "TO 1", "TO-1", "TO_01", "Try Out 1", "Tryout Ke-1", "Try Out Ke 2"
  const match = clean.match(/\b(?:TO|TRY\s*OUT)(?:\s*KE)?[\s\-_#]*0*(\d{1,2})\b/i);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num >= 1 && num <= 30) {
      return `TO ${num}`;
    }
  }

  return null;
}

/**
 * Mengambil nomor urut dari groupKey (contoh: "TO 1" -> 1, "TO 10" -> 10).
 */
export function getStageOrderNumber(groupKey: string): number {
  const m = (groupKey || '').match(/(\d+)/);
  if (m && m[1]) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return 999;
}

/**
 * Menentukan kelompok siklus Try Out ("TO 1", "TO 2", dst., atau "NONE") untuk sebuah Tryout.
 * Prioritas:
 * 1. Pilihan eksplisit Guru Mapel (`tryout.tryoutGroup` atau `scoringConfig._meta.tryoutGroup`)
 * 2. Wadah Paket Ujian (`packageId`) jika ada
 * 3. Ekstraksi dari judul Try Out (misal "TO 1 Matematika" -> "TO 1")
 * 4. Urutan kronologis per mata pelajaran (ujian ke-1 mapel MAT -> "TO 1", ujian ke-2 mapel MAT -> "TO 2")
 */
/**
 * Helper internal: mengambil kandidat siklus TO dari properti langsung Tryout (tanpa resolusi lintas-tryout).
 */
function getDirectTryoutStageCandidate(
  tryout: Tryout,
  examPackages: ExamPackage[] = []
): { stage: string | null; isExplicitNonDefault: boolean } {
  // Jika ini adalah asesmen sumatif resmi (SAT / SAS), jangan pernah masukkan ke siklus grafik TO
  if (tryout.assessmentType && tryout.assessmentType !== 'TRYOUT') {
    return { stage: TRYOUT_GROUP_NONE, isExplicitNonDefault: true };
  }

  const explicitGroup =
    tryout.tryoutGroup ||
    ((tryout.scoringConfig as any)?._meta?.tryoutGroup as string | undefined);

  let normalizedExplicit: string | null = null;
  if (explicitGroup && explicitGroup.trim() !== '') {
    const trimmed = explicitGroup.trim().toUpperCase();
    if (trimmed === TRYOUT_GROUP_NONE) {
      return { stage: TRYOUT_GROUP_NONE, isExplicitNonDefault: true };
    }
    normalizedExplicit = extractTryoutStageFromText(trimmed) || trimmed;
  }

  let fromPkg: string | null = null;
  if (tryout.packageId && examPackages.length > 0) {
    const pkg = examPackages.find(p => p.id === tryout.packageId);
    if (pkg) {
      fromPkg = extractTryoutStageFromText(pkg.title) || extractTryoutStageFromText(pkg.code);
    }
  }

  const fromTitle = extractTryoutStageFromText(tryout.title);
  const fromCode = extractTryoutStageFromText(tryout.code);

  // Jika explicitGroup bernilai selain 'TO 1' (misal 'TO 2', 'TO 3'), gunakan langsung pilihan guru
  if (normalizedExplicit && normalizedExplicit !== 'TO 1') {
    return { stage: normalizedExplicit, isExplicitNonDefault: true };
  }

  // Jika explicitGroup masih 'TO 1' (nilai bawaan/default modal) namun judul/paket/kode menyebutkan 'TO 2', 'TO 3', dst.
  if (fromPkg && fromPkg !== 'TO 1') {
    return { stage: fromPkg, isExplicitNonDefault: true };
  }
  if (fromTitle && fromTitle !== 'TO 1') {
    return { stage: fromTitle, isExplicitNonDefault: true };
  }
  if (fromCode && fromCode !== 'TO 1') {
    return { stage: fromCode, isExplicitNonDefault: true };
  }

  if (fromPkg || fromTitle || fromCode) {
    return { stage: fromPkg || fromTitle || fromCode, isExplicitNonDefault: true };
  }

  if (normalizedExplicit) {
    return { stage: normalizedExplicit, isExplicitNonDefault: false };
  }

  return { stage: null, isExplicitNonDefault: false };
}

/**
 * Mengecek apakah dua Tryout berada pada cakupan mata pelajaran yang sama
 * (sehingga seharusnya berada di tahapan TO yang berbeda: TO 1, TO 2, TO 3, dst.).
 */
function doTryoutsShareSubjectScope(a: Tryout, b: Tryout): boolean {
  if (a.id === b.id) return true;
  const getTryoutSubjectIds = (t: Tryout): string[] => {
    const ids: string[] = [];
    if (t.subjectId) ids.push(t.subjectId);
    if (Array.isArray(t.externalSubjectIds)) {
      t.externalSubjectIds.forEach(id => {
        if (id && !ids.includes(id)) ids.push(id);
      });
    }
    return ids;
  };
  const aIds = getTryoutSubjectIds(a);
  const bIds = getTryoutSubjectIds(b);
  if (aIds.length > 0 && bIds.length > 0) {
    return aIds.some(id => bIds.includes(id));
  }
  if (!a.isExternal && !b.isExternal) {
    if (!a.subjectId && !b.subjectId) {
      return true;
    }
    return false;
  }
  if (a.isExternal && b.isExternal) {
    const aNames = (a.externalSubjects || []).map(s => s.toLowerCase().trim());
    const bNames = (b.externalSubjects || []).map(s => s.toLowerCase().trim());
    if (aNames.length > 0 && bNames.length > 0) {
      return aNames.some(n => bNames.includes(n));
    }
    return true;
  }
  return false;
}

/**
 * Menentukan kelompok siklus Try Out ("TO 1", "TO 2", dst., atau "NONE") untuk sebuah Tryout.
 * Prioritas:
 * 1. Pilihan eksplisit Guru Mapel (`tryout.tryoutGroup` atau `scoringConfig._meta.tryoutGroup`)
 * 2. Wadah Paket Ujian (`packageId`) jika ada
 * 3. Ekstraksi dari judul Try Out (misal "TO 1 Matematika" -> "TO 1")
 * 4. Urutan kronologis per mata pelajaran (ujian ke-1 mapel MAT -> "TO 1", ujian ke-2 mapel MAT -> "TO 2")
 *    termasuk resolusi otomatis jika beberapa TO pada mapel yang sama masih bertumpuk di default 'TO 1'.
 */
export function resolveTryoutGroup(
  tryout: Tryout,
  allTryouts: Tryout[] = [],
  examPackages: ExamPackage[] = []
): string {
  const direct = getDirectTryoutStageCandidate(tryout, examPackages);
  if (direct.stage === TRYOUT_GROUP_NONE) return TRYOUT_GROUP_NONE;

  // Kumpulkan semua tryout yang berada pada cakupan mata pelajaran yang sama (bukan Non-TO)
  if (allTryouts.length > 1) {
    const sameScopeTryouts = allTryouts
      .filter(t => {
        const cand = getDirectTryoutStageCandidate(t, examPackages);
        if (cand.stage === TRYOUT_GROUP_NONE) return false;
        return doTryoutsShareSubjectScope(tryout, t);
      })
      .sort((a, b) => {
        const candA = getDirectTryoutStageCandidate(a, examPackages);
        const candB = getDirectTryoutStageCandidate(b, examPackages);
        const ordA = candA.stage ? getStageOrderNumber(candA.stage) : 999;
        const ordB = candB.stage ? getStageOrderNumber(candB.stage) : 999;
        if (ordA !== ordB) return ordA - ordB;
        const da = new Date(a.startDate || 0).getTime();
        const db = new Date(b.startDate || 0).getTime();
        if (da !== db) return da - db;
        return (a.code || '').localeCompare(b.code || '');
      });

    if (sameScopeTryouts.length > 1) {
      const usedStages = new Set<string>();
      for (const item of sameScopeTryouts) {
        const cand = getDirectTryoutStageCandidate(item, examPackages);
        let assigned = cand.stage || 'TO 1';
        if (usedStages.has(assigned)) {
          let nextNum = getStageOrderNumber(assigned);
          if (nextNum >= 999) nextNum = 1;
          while (usedStages.has(`TO ${nextNum}`)) {
            nextNum++;
          }
          assigned = `TO ${nextNum}`;
        }
        usedStages.add(assigned);
        if (item.id === tryout.id) {
          return assigned;
        }
      }
    }
  }

  if (direct.stage) {
    return direct.stage;
  }

  // Fallback umum berdasarkan urutan di daftar semua tryout
  if (allTryouts.length > 0) {
    const sortedAll = [...allTryouts].sort((a, b) => {
      const da = new Date(a.startDate || 0).getTime();
      const db = new Date(b.startDate || 0).getTime();
      if (da !== db) return da - db;
      return (a.code || '').localeCompare(b.code || '');
    });
    const idx = sortedAll.findIndex(t => t.id === tryout.id);
    if (idx !== -1) {
      return `TO ${idx + 1}`;
    }
  }

  return 'TO 1';
}

/**
 * Mengelompokkan daftar Tryout menjadi tahapan siklus terurut: TO 1, TO 2, TO 3, dst.
 * Tryout yang ditandai 'NONE' oleh guru tidak dimasukkan ke dalam grup grafik siklus.
 */
export function buildTryoutStageGroups(
  tryouts: Tryout[],
  examPackages: ExamPackage[] = []
): TryoutStageGroup[] {
  const map = new Map<string, Tryout[]>();

  tryouts.forEach(to => {
    const groupKey = resolveTryoutGroup(to, tryouts, examPackages);
    if (groupKey === TRYOUT_GROUP_NONE) return;
    if (!map.has(groupKey)) {
      map.set(groupKey, []);
    }
    map.get(groupKey)!.push(to);
  });

  const groups: TryoutStageGroup[] = [];

  map.forEach((memberTryouts, groupKey) => {
    const sortedMembers = [...memberTryouts].sort((a, b) => {
      const da = new Date(a.startDate || 0).getTime();
      const db = new Date(b.startDate || 0).getTime();
      if (da !== db) return da - db;
      return (a.code || '').localeCompare(b.code || '');
    });

    const subjectTryoutMap: Record<string, Tryout> = {};
    sortedMembers.forEach(t => {
      if (t.subjectId) {
        subjectTryoutMap[t.subjectId] = t;
      }
      if (t.isExternal && Array.isArray(t.externalSubjectIds)) {
        t.externalSubjectIds.forEach(sid => {
          subjectTryoutMap[sid] = t;
        });
      }
    });

    const startDates = sortedMembers
      .map(t => t.startDate)
      .filter(Boolean)
      .sort();
    const endDates = sortedMembers
      .map(t => t.endDate)
      .filter(Boolean)
      .sort();

    const order = getStageOrderNumber(groupKey);
    const defaultTitle = order < 999 ? `Try Out ${order}` : groupKey;

    groups.push({
      groupKey,
      order,
      title: defaultTitle,
      startDate: startDates[0] || new Date().toISOString(),
      endDate: endDates[endDates.length - 1] || new Date().toISOString(),
      tryouts: sortedMembers,
      subjectTryoutMap,
    });
  });

  return groups.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.groupKey.localeCompare(b.groupKey);
  });
}

/**
 * Mengecek kelengkapan dan potensi duplikasi mata pelajaran pada suatu kelompok TO (misal "TO 1").
 * Digunakan sebagai kontrol validasi visual bagi Guru Mapel.
 */
export function getStageSubjectCoverage(
  groupKey: string,
  allTryouts: Tryout[],
  allSubjects: Subject[],
  examPackages: ExamPackage[] = []
): StageSubjectCoverage {
  const order = getStageOrderNumber(groupKey);
  const activeSubjects = allSubjects.filter(
    s => (s.code || '').toUpperCase().trim() !== 'BIND'
  );

  const tryoutsInGroup = allTryouts.filter(
    t => resolveTryoutGroup(t, allTryouts, examPackages) === groupKey
  );

  const filledSubjects: { subject: Subject; tryouts: Tryout[] }[] = [];
  const missingSubjects: Subject[] = [];
  const duplicateSubjects: { subject: Subject; tryouts: Tryout[] }[] = [];

  activeSubjects.forEach(subj => {
    const matching = tryoutsInGroup.filter(t => {
      if (t.isExternal) {
        if (t.externalSubjectIds && t.externalSubjectIds.includes(subj.id)) return true;
        if (
          t.externalSubjects &&
          t.externalSubjects.some(
            es =>
              es.toLowerCase().trim() === subj.name.toLowerCase().trim() ||
              es.toLowerCase().trim() === subj.code.toLowerCase().trim()
          )
        ) {
          return true;
        }
        return false;
      }
      return t.subjectId === subj.id;
    });

    if (matching.length > 0) {
      filledSubjects.push({ subject: subj, tryouts: matching });
      if (matching.length > 1) {
        duplicateSubjects.push({ subject: subj, tryouts: matching });
      }
    } else {
      missingSubjects.push(subj);
    }
  });

  return {
    groupKey,
    order,
    filledSubjects,
    missingSubjects,
    duplicateSubjects,
    isComplete:
      activeSubjects.length > 0 &&
      missingSubjects.length === 0 &&
      duplicateSubjects.length === 0,
  };
}

/**
 * Membaca nilai seorang siswa untuk mata pelajaran tertentu pada satu objek Score.
 */
export function extractSubjectScoreFromScoreRecord(
  scoreObj: Score | undefined,
  tryout: Tryout,
  subj: Subject,
  studentAnswers?: Answer[],
  subjQuestions?: Question[]
): number | null {
  if (!scoreObj) return null;

  // 1. Cek subjectScores JSON map (untuk TO Eksternal atau multi-mapel)
  if (scoreObj.subjectScores) {
    const byId = scoreObj.subjectScores[subj.id];
    if (typeof byId === 'number' && !isNaN(byId)) return byId;

    const byCode = scoreObj.subjectScores[subj.code];
    if (typeof byCode === 'number' && !isNaN(byCode)) return byCode;

    const byName = scoreObj.subjectScores[subj.name];
    if (typeof byName === 'number' && !isNaN(byName)) return byName;

    const matchKey = Object.keys(scoreObj.subjectScores).find(k => {
      const lk = k.toLowerCase().trim();
      return (
        lk === subj.id.toLowerCase().trim() ||
        lk === subj.code.toLowerCase().trim() ||
        lk === subj.name.toLowerCase().trim() ||
        subj.name.toLowerCase().includes(lk) ||
        lk.includes(subj.name.toLowerCase())
      );
    });
    if (matchKey !== undefined) {
      const val = Number(scoreObj.subjectScores[matchKey]);
      if (!isNaN(val)) return val;
    }
  }

  // 2. Cek apakah Tryout Internal ini memang untuk mata pelajaran tersebut
  if (!tryout.isExternal && tryout.subjectId === subj.id) {
    return typeof scoreObj.calculatedScore === 'number' ? scoreObj.calculatedScore : null;
  }

  // 3. Jika Tryout Eksternal mencakup mapel ini tetapi subjectScores belum merinci per mapel, gunakan calculatedScore
  if (tryout.isExternal) {
    const hasSubjId = Array.isArray(tryout.externalSubjectIds) && tryout.externalSubjectIds.includes(subj.id);
    const hasSubjName =
      Array.isArray(tryout.externalSubjects) &&
      tryout.externalSubjects.some(
        es =>
          es.toLowerCase().trim() === subj.name.toLowerCase().trim() ||
          es.toLowerCase().trim() === subj.code.toLowerCase().trim()
      );
    const noSpecificSubjects =
      (!tryout.externalSubjectIds || tryout.externalSubjectIds.length === 0) &&
      (!tryout.externalSubjects || tryout.externalSubjects.length === 0);
    if ((hasSubjId || hasSubjName || noSpecificSubjects) && typeof scoreObj.calculatedScore === 'number') {
      return scoreObj.calculatedScore;
    }
  }

  // 4. Fallback dari judul/kode tryout atau jawaban butir soal jika tryout belum punya subjectId
  if (!tryout.isExternal && !tryout.subjectId) {
    const titleLower = (tryout.title || '').toLowerCase();
    const codeLower = (tryout.code || '').toLowerCase();
    const subjNameLower = subj.name.toLowerCase().trim();
    const subjCodeLower = subj.code.toLowerCase().trim();
    if (
      (subjNameLower && titleLower.includes(subjNameLower)) ||
      (subjCodeLower && (titleLower.includes(subjCodeLower) || codeLower.includes(subjCodeLower)))
    ) {
      if (typeof scoreObj.calculatedScore === 'number') {
        return scoreObj.calculatedScore;
      }
    }

    if (studentAnswers && subjQuestions && subjQuestions.length > 0) {
      const qIds = new Set(subjQuestions.map(q => q.id));
      const rel = studentAnswers.filter(a => qIds.has(a.questionId));
      if (rel.length > 0) {
        const correctCount = rel.filter(a => a.isCorrect).length;
        return Math.round((correctCount / rel.length) * 1000) / 10;
      }
    }
  }

  return null;
}

/**
 * Mengambil nilai seorang siswa untuk mata pelajaran tertentu pada suatu tahapan Siklus TO (misal "TO 1").
 * Mengembalikan `null` jika siswa belum memiliki nilai pada mapel tersebut di siklus TO ini.
 */
export function getStudentStageSubjectScore(
  studentId: string,
  subj: Subject,
  stage: TryoutStageGroup,
  allScores: Score[],
  allAnswers?: Answer[],
  allQuestions?: Question[]
): number | null {
  const subjQuestions = allQuestions ? allQuestions.filter(q => q.subjectId === subj.id) : undefined;

  // Prioritaskan tryout yang secara spesifik terhubung ke mapel ini
  const directTryout = stage.subjectTryoutMap[subj.id];
  if (directTryout) {
    const scoreObj = allScores.find(
      s => s.studentId === studentId && s.tryoutId === directTryout.id
    );
    const studentAnswers = allAnswers
      ? allAnswers.filter(a => a.studentId === studentId && a.tryoutId === directTryout.id)
      : undefined;
    const val = extractSubjectScoreFromScoreRecord(
      scoreObj,
      directTryout,
      subj,
      studentAnswers,
      subjQuestions
    );
    if (val !== null) return val;
  }

  // Cek seluruh tryout anggota di dalam stage ini
  for (const to of stage.tryouts) {
    const scoreObj = allScores.find(s => s.studentId === studentId && s.tryoutId === to.id);
    if (!scoreObj) continue;
    const studentAnswers = allAnswers
      ? allAnswers.filter(a => a.studentId === studentId && a.tryoutId === to.id)
      : undefined;
    const val = extractSubjectScoreFromScoreRecord(
      scoreObj,
      to,
      subj,
      studentAnswers,
      subjQuestions
    );
    if (val !== null) return val;
  }

  return null;
}

/**
 * Menghitung rata-rata gabungan (komposit) seorang siswa pada satu siklus TO (misal rata-rata MAT & BIN di TO 1).
 * Hanya merata-ratakan mata pelajaran yang sudah memiliki nilai valid pada siklus TO tersebut.
 */
export function getStudentStageCompositeScore(
  studentId: string,
  stage: TryoutStageGroup,
  subjects: Subject[],
  allScores: Score[],
  allAnswers?: Answer[],
  allQuestions?: Question[]
): {
  compositeScore: number | null;
  subjectScores: Record<string, number>;
  availableCount: number;
} {
  const activeSubjects = subjects.filter(
    s => (s.code || '').toUpperCase().trim() !== 'BIND'
  );
  const subjectScores: Record<string, number> = {};
  const validValues: number[] = [];

  activeSubjects.forEach(subj => {
    const val = getStudentStageSubjectScore(
      studentId,
      subj,
      stage,
      allScores,
      allAnswers,
      allQuestions
    );
    if (val !== null) {
      subjectScores[subj.id] = val;
      validValues.push(val);
    }
  });

  // Fallback jika tryout di stage belum terpetakan ke subjectId mana pun namun siswa punya skor
  if (validValues.length === 0) {
    stage.tryouts.forEach(to => {
      const sc = allScores.find(s => s.studentId === studentId && s.tryoutId === to.id);
      if (sc && typeof sc.calculatedScore === 'number') {
        validValues.push(sc.calculatedScore);
      }
    });
  }

  const compositeScore =
    validValues.length > 0
      ? Math.round((validValues.reduce((a, b) => a + b, 0) / validValues.length) * 10) / 10
      : null;

  return {
    compositeScore,
    subjectScores,
    availableCount: validValues.length,
  };
}
