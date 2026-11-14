import React, { useState, useEffect, useMemo } from 'react';
import {
  Award, Search, FileText, Download, CheckCircle, XCircle, HelpCircle,
  AlertTriangle, BookOpen, ExternalLink, Youtube, Sparkles, Lock, ShieldCheck,
  TrendingUp, ArrowRight, ShieldAlert, CheckCircle2, RotateCcw, Eye, ChevronDown, ChevronUp,
  Filter, Layers, ArrowUpRight, ArrowDownRight, BarChart3, Play, Video, Copy, Check, Share2,
  LayoutGrid, LogOut, UserCheck, Trophy, Medal, Package, ClipboardList, ArrowLeftRight
} from 'lucide-react';
import { ResourceCard } from '../components/ResourceCard';
import { dbService } from '../services/database';
import { ExportService } from '../services/export';
import { Score, Student, Tryout, Explanation, Question, Subject, ClassRoom } from '../types/database';
import { StudentVerificationGate } from '../components/student/StudentVerificationGate';
import { StudentQuestionSheet } from '../components/student/StudentQuestionSheet';
import { SubjectRecapSection, SubjectRecapRow } from '../components/student/SubjectRecapSection';
import { StudentSumatifView } from '../components/student/StudentSumatifView';
import { SumatifAnalyticsService } from '../services/sumatifAnalytics';
import {
  buildTryoutStageGroups,
  getStudentStageCompositeScore,
  getStudentStageSubjectScore,
  TryoutStageGroup,
  getFriendlyTryoutStageLabel,
  resolveTryoutGroup,
  TRYOUT_GROUP_NONE,
} from '../utils/tryoutGroupUtils';

export const StudentPortalPage: React.FC = () => {
  // Birthdate + NISN Verification State (Starts empty for privacy & real gatekeeping)
  const [birthDateInput, setBirthDateInput] = useState('');
  const [nisnInput, setNisnInput] = useState('');
  const [selectedTryoutId, setSelectedTryoutId] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('ALL');

  // Verified Session & Data State
  const [verifiedStudent, setVerifiedStudent] = useState<Student | null>(null);
  const [activeScore, setActiveScore] = useState<Score | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Realtime Database Reactive State
  const [allTryouts, setAllTryouts] = useState<Tryout[]>(() => dbService.getTryouts());
  const [allSubjects, setAllSubjects] = useState<Subject[]>(() => dbService.getSubjects());
  const [allQuestions, setAllQuestions] = useState<Question[]>(() => dbService.getQuestions());
  const [allStudents, setAllStudents] = useState<Student[]>(() => dbService.getStudents());
  const [allScores, setAllScores] = useState<Score[]>(() => dbService.getScores());
  const [allClasses, setAllClasses] = useState<ClassRoom[]>(() => dbService.getClasses());
  const [allExplanations, setAllExplanations] = useState<Explanation[]>(() => dbService.getExplanations());
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [dbVersion, setDbVersion] = useState<number>(0);

  // Video Player Modal State
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [selectedVideoTitle, setSelectedVideoTitle] = useState<string>('');

  // 4 Main Tabs Navigation: REPORT | TREND_RECAP | QUESTION_SHEET | EXPLANATIONS
  const [portalTab, setPortalTab] = useState<'REPORT' | 'TREND_RECAP' | 'QUESTION_SHEET' | 'EXPLANATIONS'>('REPORT');

  // Explanations Tab Filters
  const [explanationFilterMode, setExplanationFilterMode] = useState<'ALL' | 'INCORRECT_ONLY'>('ALL');
  const [explanationSubjectFilter, setExplanationSubjectFilter] = useState<string>('ALL');
  const [explanationQuestionNumberFilter, setExplanationQuestionNumberFilter] = useState<number | 'ALL'>('ALL');
  const [resourceViewMode, setResourceViewMode] = useState<'CARDS' | 'MODULES'>('CARDS');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'ALL' | 'YOUTUBE' | 'PDF'>('ALL');

  // Security & Rate Limiting State
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);

  // Auto pull data dari cloud saat pertama kali halaman siswa dibuka
  useEffect(() => {
    dbService.pullFromCloud().catch(() => {});
  }, []);

  // Realtime Database Subscription & Auto Sync with Cloud / Admin / Guru / Walas
  useEffect(() => {
    const refreshData = () => {
      const freshTryouts = dbService.getTryouts();
      const freshSubjects = dbService.getSubjects();
      const freshQuestions = dbService.getQuestions();
      const freshStudents = dbService.getStudents();
      const freshScores = dbService.getScores();
      const freshClasses = dbService.getClasses();
      const freshExplanations = dbService.getExplanations();

      setAllTryouts(freshTryouts);
      setAllSubjects(freshSubjects);
      setAllQuestions(freshQuestions);
      setAllStudents(freshStudents);
      setAllScores(freshScores);
      setAllClasses(freshClasses);
      setAllExplanations(freshExplanations);
      setDbVersion(v => v + 1);
      setLastSyncTime(new Date());

      // Jika siswa sedang terverifikasi, sinkronkan data siswa dan nilai terkininya secara realtime
      const currentId = verifiedStudent?.id || sessionStorage.getItem('verified_student_id');
      if (currentId) {
        const freshStudent = freshStudents.find(s => s.id === currentId);
        if (freshStudent) {
          setVerifiedStudent(freshStudent);
          const studentScores = freshScores.filter(s => s.studentId === freshStudent.id);
          setActiveScore(prev => {
            if (!prev) {
              return studentScores.find(s => s.tryoutId === selectedTryoutId) || studentScores[0] || null;
            }
            return studentScores.find(s => s.tryoutId === prev.tryoutId) ||
                   studentScores.find(s => s.tryoutId === selectedTryoutId) ||
                   studentScores[0] || null;
          });
        }
      }
    };

    refreshData();
    const unsubscribe = dbService.subscribe(refreshData);
    const stopRealtimeSync = dbService.startRealtimeSync();

    return () => {
      unsubscribe();
      stopRealtimeSync();
    };
  }, [verifiedStudent?.id, selectedTryoutId]);

  // Tombol Manual Trigger Sync Realtime
  const handleManualSync = async () => {
    setIsCloudSyncing(true);
    try {
      await dbService.pullFromCloud();
      setLastSyncTime(new Date());
    } catch {
      // ignore
    } finally {
      setTimeout(() => setIsCloudSyncing(false), 600);
    }
  };

  // Filter Tryouts strictly scoped to verified student's class or existing scores
  const tryouts = useMemo(() => {
    if (!verifiedStudent) return allTryouts;

    const studentClass = allClasses.find(c => c.id === verifiedStudent.classId);

    return allTryouts.filter(t => {
      // 1. Jika siswa memiliki nilai di tryout ini (termasuk hasil upload guru mapel / eksternal), SELALU TAMPILKAN!
      const hasScore = allScores.some(s => s.studentId === verifiedStudent.id && s.tryoutId === t.id);
      if (hasScore) return true;

      // 2. If linked to an ExamPackage (wadah), verify target classes
      const pkg = t.packageId
        ? dbService.getExamPackageById(t.packageId)
        : (t.code ? dbService.getExamPackages().find(p => p.code && t.code.toLowerCase().startsWith(p.code.toLowerCase())) : null);
      if (pkg) {
        if (pkg.targetClassIds && pkg.targetClassIds.length > 0) {
          return pkg.targetClassIds.includes(verifiedStudent.classId);
        }
        if (studentClass && pkg.targetGrades && pkg.targetGrades.length > 0) {
          return pkg.targetGrades.includes(studentClass.gradeLevel);
        }
        return false;
      }

      // 3. Direct targetClassIds on tryout
      if (t.targetClassIds && t.targetClassIds.length > 0) {
        return t.targetClassIds.includes(verifiedStudent.classId);
      }

      // 4. Fallback for legacy data without packageId
      return true;
    });
  }, [allTryouts, verifiedStudent, allClasses, allScores]);

  // Ensure selectedTryoutId is valid within filtered tryouts, prioritizing tryouts with scores/explanations
  useEffect(() => {
    if (tryouts.length > 0) {
      const isCurrentValid = tryouts.some(t => t.id === selectedTryoutId);
      if (!isCurrentValid) {
        const toWithScore = tryouts.find(t => allScores.some(s => s.studentId === verifiedStudent?.id && s.tryoutId === t.id));
        const toWithExp = tryouts.find(t => allExplanations.some(e => e.status === 'PUBLISHED' && (e.tryoutId === t.id || e.tryoutId === t.code)));
        setSelectedTryoutId(toWithScore?.id || toWithExp?.id || tryouts[0].id);
      }
    }
  }, [tryouts, selectedTryoutId, allScores, verifiedStudent?.id, allExplanations]);

  const activeTryout = useMemo(() => {
    return tryouts.find(t => t.id === selectedTryoutId) || tryouts[0];
  }, [tryouts, selectedTryoutId]);

  // Rate Limiting Countdown
  useEffect(() => {
    let interval: any;
    if (isLockedOut && lockoutTimer > 0) {
      interval = setInterval(() => {
        setLockoutTimer(prev => {
          if (prev <= 1) {
            setIsLockedOut(false);
            setFailedAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isLockedOut, lockoutTimer]);

  // Session Storage Check (Restore if previously verified during this session)
  useEffect(() => {
    const sessionStudentId = sessionStorage.getItem('verified_student_id');
    if (sessionStudentId && !verifiedStudent) {
      const student = allStudents.find(s => s.id === sessionStudentId);
      if (student) {
        setVerifiedStudent(student);
        setBirthDateInput(student.birthDate || '');
        setNisnInput(student.nisn);
        const scores = allScores.filter(s => s.studentId === student.id);
        const scoreObj = scores.find(s => s.tryoutId === selectedTryoutId) || scores[0];
        setActiveScore(scoreObj || null);
      }
    }
  }, [selectedTryoutId, allStudents, allScores, verifiedStudent]);

  // Verification Handler (Tanggal Lahir + NISN Siswa)
  const handleVerify = (e?: React.FormEvent, overrideBirthDate?: string, overrideNisn?: string) => {
    if (e) e.preventDefault();
    if (isLockedOut) return;

    setErrorMessage('');
    setLoading(true);

    const targetDate = (overrideBirthDate !== undefined ? overrideBirthDate : birthDateInput).trim();
    const targetNisn = (overrideNisn !== undefined ? overrideNisn : nisnInput).trim();

    if (!targetDate || !targetNisn) {
      setErrorMessage('Harap masukkan Tanggal Lahir dan NISN Anda.');
      setLoading(false);
      return;
    }

    setTimeout(() => {
      // 1. Cek langsung dengan getStudentByBirthDateAndNisn
      let student = dbService.getStudentByBirthDateAndNisn(targetDate, targetNisn);

      // 2. Normalisasi fallback jika format tanggal lahir tersimpan sedikit berbeda
      if (!student) {
        const cleanTargetNisn = targetNisn.replace(/\D/g, '');
        const matchedByNisn = allStudents.find(s => s.nisn.replace(/\D/g, '') === cleanTargetNisn);
        if (matchedByNisn) {
          const sDate = (matchedByNisn.birthDate || '').trim();
          const targetParts = targetDate.split(/[-/]/).map(p => parseInt(p, 10));
          const sDateParts = sDate.split(/[-/]/).map(p => parseInt(p, 10));

          const isDateMatch = !sDate || (
            targetParts.length === 3 && sDateParts.length === 3 &&
            targetParts.slice().sort().join('-') === sDateParts.slice().sort().join('-')
          );

          if (isDateMatch) {
            student = matchedByNisn;
          }
        }
      }

      if (!student) {
        handleVerificationFailure(`Data siswa dengan Tanggal Lahir '${targetDate}' dan NISN '${targetNisn}' tidak ditemukan. Harap pastikan data sesuai Dapodik sekolah.`);
        return;
      }

      // Success: Verification Passed
      setVerifiedStudent(student);
      setFailedAttempts(0);
      sessionStorage.setItem('verified_student_id', student.id);

      // Isolation: Find score matching verified student.id
      const studentScores = allScores.filter(s => s.studentId === student.id);
      const scoreObj = studentScores.find(s => s.tryoutId === selectedTryoutId) || studentScores[0];

      if (!scoreObj) {
        setActiveScore(null);
        setErrorMessage(`Siswa ${student.name} terverifikasi, namun belum memiliki entri nilai pada paket ujian ${activeTryout?.title || 'terpilih'}.`);
      } else {
        setActiveScore(scoreObj);
      }

      dbService.logAudit(
        { id: student.id, name: student.name, role: 'SISWA' },
        'STUDENT_VERIFICATION_SUCCESS',
        'STUDENT_PORTAL',
        `Siswa ${student.name} berhasil terverifikasi (Tgl Lahir: ${targetDate}, NISN: ${targetNisn}).`
      );

      setLoading(false);
    }, 250);
  };

  const handleVerificationFailure = (message: string) => {
    setVerifiedStudent(null);
    setActiveScore(null);
    sessionStorage.removeItem('verified_student_id');
    setErrorMessage(message);
    setLoading(false);

    const newAttempts = failedAttempts + 1;
    setFailedAttempts(newAttempts);

    dbService.logAudit(
      { id: 'anonymous', name: 'Anonim', role: 'SISWA' },
      'STUDENT_VERIFICATION_FAILED',
      'SECURITY',
      `Percobaan verifikasi siswa gagal (${newAttempts}x): ${message}`
    );

    // Rate Limiting Trigger: Max 5 failed attempts -> 30s lockout
    if (newAttempts >= 5) {
      setIsLockedOut(true);
      setLockoutTimer(30);
      dbService.logAudit(
        { id: 'anonymous', name: 'Anonim', role: 'SECURITY' },
        'RATE_LIMIT_TRIGGERED',
        'SECURITY',
        `Rate limiting aktif: 5 kali percobaan verifikasi gagal berturut-turut. Akses dikunci 30 detik.`
      );
    }
  };

  const handleLogoutStudent = () => {
    sessionStorage.removeItem('verified_student_id');
    setVerifiedStudent(null);
    setActiveScore(null);
    setBirthDateInput('');
    setNisnInput('');
    setPortalTab('REPORT');
  };

  // Sync active score when switching tryouts
  useEffect(() => {
    if (verifiedStudent) {
      const studentScores = allScores.filter(s => s.studentId === verifiedStudent.id);
      const scoreObj = studentScores.find(s => s.tryoutId === selectedTryoutId) || studentScores[0];
      setActiveScore(scoreObj || null);
    }
  }, [selectedTryoutId, verifiedStudent, allScores]);

  // Real Database Student Analytics (menggunakan selectedTryoutId dan reaktif)
  const studentAnalytics = useMemo(() => {
    if (!verifiedStudent || !selectedTryoutId) return null;
    return dbService.getStudentAnalytics(verifiedStudent.id, selectedTryoutId);
  }, [verifiedStudent, selectedTryoutId, dbVersion]);

  // Kumpulkan semua ID tryout yang berada dalam satu stage/siklus yang sama (misal semua tryout "TO 2")
  const stageSiblingTryoutIds = useMemo(() => {
    if (!selectedTryoutId) return new Set<string>();
    const currentTo = tryouts.find(t => t.id === selectedTryoutId || t.code === selectedTryoutId) || allTryouts.find(t => t.id === selectedTryoutId || t.code === selectedTryoutId);
    if (!currentTo) return new Set<string>([selectedTryoutId]);

    const examPkgs = dbService.getExamPackages();
    const groupKey = resolveTryoutGroup(currentTo, allTryouts, examPkgs);
    const ids = new Set<string>([currentTo.id]);
    if (currentTo.code) ids.add(currentTo.code);

    if (groupKey && groupKey !== TRYOUT_GROUP_NONE) {
      allTryouts.forEach(t => {
        if (resolveTryoutGroup(t, allTryouts, examPkgs) === groupKey) {
          ids.add(t.id);
          if (t.code) ids.add(t.code);
        }
      });
    }

    return ids;
  }, [selectedTryoutId, tryouts, allTryouts]);

  // Published Explanations for selected Tryout stage / group
  const publishedExplanations = useMemo(() => {
    return allExplanations.filter(e => {
      if (e.status !== 'PUBLISHED') return false;
      if (stageSiblingTryoutIds.has(e.tryoutId)) return true;
      if (e.tryoutId === selectedTryoutId) return true;
      const targetTo = allTryouts.find(t => t.id === selectedTryoutId);
      return Boolean(targetTo && (e.tryoutId === targetTo.code || e.tryoutId === targetTo.id));
    });
  }, [allExplanations, selectedTryoutId, stageSiblingTryoutIds, allTryouts]);

  // Ranking & Tie-Breaker Calculation (Multi-tier: Total Score -> Total Correct -> Math Correct)
  const mathSubject = allSubjects.find(s => s.code === 'MAT' || s.name.toLowerCase().includes('matematika')) || allSubjects[0];
  const mathSubjectId = mathSubject?.id || 'subj-mat';
  const mathQuestionIds = useMemo(() => new Set(allQuestions.filter(q => q.subjectId === mathSubjectId).map(q => q.id)), [allQuestions, mathSubjectId]);

  const getMathCorrectCount = (studentId: string, tryoutId: string): number => {
    const studentAnswers = dbService.getAnswers().filter(a => a.studentId === studentId && a.tryoutId === tryoutId);
    return studentAnswers.filter(a => mathQuestionIds.has(a.questionId) && a.isCorrect).length;
  };

  const sortScoresWithTieBreaker = (scoreList: Score[], tryoutId: string) => {
    return [...scoreList].sort((a, b) => {
      // 1. Primary: calculatedScore desc
      if (b.calculatedScore !== a.calculatedScore) {
        return b.calculatedScore - a.calculatedScore;
      }
      // 2. Tie-breaker 1: totalCorrect desc
      if (b.totalCorrect !== a.totalCorrect) {
        return (b.totalCorrect ?? 0) - (a.totalCorrect ?? 0);
      }
      // 3. Tie-breaker 2: Math correct count desc
      const bMath = getMathCorrectCount(b.studentId, tryoutId);
      const aMath = getMathCorrectCount(a.studentId, tryoutId);
      return bMath - aMath;
    });
  };

  // Rank Overall (Angkatan/Paralel)
  const allScoresForActiveTryout = useMemo(() => {
    return allScores.filter(s => s.tryoutId === selectedTryoutId);
  }, [allScores, selectedTryoutId]);

  const rankedOverall = useMemo(() => {
    return sortScoresWithTieBreaker(allScoresForActiveTryout, selectedTryoutId);
  }, [allScoresForActiveTryout, selectedTryoutId]);

  const overallRankIndex = verifiedStudent ? rankedOverall.findIndex(s => s.studentId === verifiedStudent.id) : -1;
  const overallRank = overallRankIndex !== -1 ? overallRankIndex + 1 : 1;
  const overallTotalStudents = Math.max(1, rankedOverall.length);

  // Rank Class
  const classStudents = useMemo(() => {
    return verifiedStudent ? allStudents.filter(st => st.classId === verifiedStudent.classId) : [];
  }, [verifiedStudent, allStudents]);

  const classStudentIds = useMemo(() => new Set(classStudents.map(st => st.id)), [classStudents]);

  const classScoresForActiveTryout = useMemo(() => {
    return allScoresForActiveTryout.filter(s => classStudentIds.has(s.studentId));
  }, [allScoresForActiveTryout, classStudentIds]);

  const rankedClass = useMemo(() => {
    return sortScoresWithTieBreaker(classScoresForActiveTryout, selectedTryoutId);
  }, [classScoresForActiveTryout, selectedTryoutId]);

  const classRankIndex = verifiedStudent ? rankedClass.findIndex(s => s.studentId === verifiedStudent.id) : -1;
  const classRank = classRankIndex !== -1 ? classRankIndex + 1 : 1;
  const classTotalStudents = Math.max(1, rankedClass.length);

  // Student class metadata
  const studentClassObj = verifiedStudent ? allClasses.find(c => c.id === verifiedStudent.classId) : null;
  const studentClassName = studentClassObj?.name || 'Kelas Siswa';

  // Daftar seluruh Wadah Ujian yang menargetkan kelas/jenjang siswa ini
  const studentPackages = useMemo(() => {
    if (!verifiedStudent) return [];
    const cls = allClasses.find(c => c.id === verifiedStudent.classId);
    const pkgs = dbService.getExamPackagesForStudent(verifiedStudent.classId, cls?.gradeLevel);
    // Tambahkan wadah dari tryout yang memiliki nilai siswa meskipun tidak terdaftar otomatis
    const packageIdsWithScore = new Set(
      allScores
        .filter(s => s.studentId === verifiedStudent.id)
        .map(s => {
          const t = allTryouts.find(tr => tr.id === s.tryoutId);
          if (t?.packageId) return t.packageId;
          if (t?.code) {
            const matchPkg = dbService.getExamPackages().find(p => p.code && t.code.toLowerCase().startsWith(p.code.toLowerCase()));
            return matchPkg?.id;
          }
          return undefined;
        })
        .filter(Boolean) as string[]
    );
    packageIdsWithScore.forEach(pkgId => {
      if (!pkgs.some(p => p.id === pkgId)) {
        const found = dbService.getExamPackageById(pkgId);
        if (found) pkgs.push(found);
      }
    });
    return pkgs;
  }, [verifiedStudent, allClasses, allScores, allTryouts]);

  // Tryouts yang disaring berdasarkan wadah yang sedang dipilih
  const displayTryouts = useMemo(() => {
    if (selectedPackageId === 'ALL') {
      return tryouts;
    }
    const currentPkg = studentPackages.find(p => p.id === selectedPackageId);
    const pkgCode = (currentPkg?.code || '').toLowerCase().trim();
    const filtered = tryouts.filter(t => t.packageId === selectedPackageId || (pkgCode && t.code.toLowerCase().startsWith(pkgCode)));
    return filtered.length > 0 ? filtered : tryouts;
  }, [tryouts, selectedPackageId, studentPackages]);

  // Auto-pilih wadah yang paling relevan untuk kelas siswa ini
  useEffect(() => {
    if (studentPackages.length > 0) {
      const isValid = studentPackages.some(p => p.id === selectedPackageId);
      if (!isValid || selectedPackageId === 'ALL') {
        const pkgWithScore = studentPackages.find(p =>
          allScores.some(s => s.studentId === verifiedStudent?.id && tryouts.some(t => (t.packageId === p.id || (p.code && t.code.toLowerCase().startsWith(p.code.toLowerCase()))) && t.id === s.tryoutId))
        );
        const activeSumatif = studentPackages.find(p => p.status === 'ACTIVE' && (p.assessmentType === 'SAT' || p.assessmentType === 'SAS'));
        const firstActive = studentPackages.find(p => p.status === 'ACTIVE');
        setSelectedPackageId(pkgWithScore?.id || activeSumatif?.id || firstActive?.id || studentPackages[0].id);
      }
    }
  }, [studentPackages, verifiedStudent?.id, allScores, tryouts]);

  // Sinkronisasi otomatis selectedTryoutId saat memilih wadah
  useEffect(() => {
    if (selectedPackageId !== 'ALL') {
      const currentPkg = studentPackages.find(p => p.id === selectedPackageId);
      const pkgCode = (currentPkg?.code || '').toLowerCase().trim();
      const inPkg = tryouts.filter(t => t.packageId === selectedPackageId || (pkgCode && t.code.toLowerCase().startsWith(pkgCode)));
      if (inPkg.length > 0 && !inPkg.some(t => t.id === selectedTryoutId)) {
        setSelectedTryoutId(inPkg[0].id);
      }
    }
  }, [selectedPackageId, tryouts, studentPackages]);

  // Deteksi Mode Wadah: Try Out vs SAS vs SAT (Container-Driven Modality)
  const activePackage = useMemo(() => {
    if (selectedPackageId !== 'ALL') {
      return studentPackages.find(p => p.id === selectedPackageId);
    }
    if (activeTryout?.packageId) {
      return dbService.getExamPackageById(activeTryout.packageId);
    }
    return studentPackages[0];
  }, [selectedPackageId, studentPackages, activeTryout]);

  const isSumatifPackage = activePackage?.assessmentType === 'SAS' || activePackage?.assessmentType === 'SAT';

  const sumatifProfile = useMemo(() => {
    if (!verifiedStudent || !activePackage || !isSumatifPackage) return null;
    return SumatifAnalyticsService.calculateStudentProfile(
      verifiedStudent,
      studentClassObj || undefined,
      activePackage,
      allScores,
      allSubjects,
      allTryouts
    );
  }, [verifiedStudent, studentClassObj, activePackage, isSumatifPackage, allScores, allSubjects, allTryouts]);

  // Helper untuk mengekstrak skor mapel dari Score object dengan matching multi-key (id, nama, kode)
  const resolveSubjectScoreFromScoreObj = (
    scoreObj: Score | null | undefined,
    subj: Subject,
    studentAnswers: any[] = [],
    subjQuestions: Question[] = []
  ): number | null => {
    if (!scoreObj) return null;

    if (scoreObj.subjectScores) {
      if (typeof scoreObj.subjectScores[subj.id] === 'number') {
        return scoreObj.subjectScores[subj.id];
      }
      const lowerName = subj.name.toLowerCase().trim();
      for (const [k, v] of Object.entries(scoreObj.subjectScores)) {
        if (typeof v === 'number' && k.toLowerCase().trim() === lowerName) {
          return v;
        }
      }
      const lowerCode = subj.code.toLowerCase().trim();
      for (const [k, v] of Object.entries(scoreObj.subjectScores)) {
        if (typeof v === 'number' && k.toLowerCase().trim() === lowerCode) {
          return v;
        }
      }
    }

    if (subjQuestions.length > 0 && studentAnswers.length > 0) {
      const qIds = new Set(subjQuestions.map(q => q.id));
      const matched = studentAnswers.filter(a => qIds.has(a.questionId));
      if (matched.length > 0) {
        const correct = matched.filter(a => a.isCorrect).length;
        return Math.round((correct / matched.length) * 100 * 10) / 10;
      }
    }

    return null;
  };

  // Per-Subject Mini Scorecard for Active Tryout - MENAMPILKAN HANYA MAPEL YANG RELEVAN TANPA NILAI DUMMY 75.0!
  const activeTryoutSubjectCards = useMemo(() => {
    if (!activeTryout) return [];

    const studentAnswers = verifiedStudent
      ? dbService.getAnswers().filter(a => a.studentId === verifiedStudent.id && a.tryoutId === activeTryout.id)
      : [];

    let relevantSubjects: Subject[] = [];

    // 1. Tryout Eksternal
    if (activeTryout.isExternal) {
      const targetSubjNames = new Set((activeTryout.externalSubjects || []).map(s => s.toLowerCase().trim()));
      const targetSubjIds = new Set(activeTryout.externalSubjectIds || []);
      const scoreSubjKeys = new Set(Object.keys(activeScore?.subjectScores || {}).map(k => k.toLowerCase().trim()));

      relevantSubjects = allSubjects.filter(s =>
        targetSubjIds.has(s.id) ||
        targetSubjNames.has(s.name.toLowerCase().trim()) ||
        scoreSubjKeys.has(s.id.toLowerCase().trim()) ||
        scoreSubjKeys.has(s.name.toLowerCase().trim()) ||
        scoreSubjKeys.has(s.code.toLowerCase().trim())
      );
    }
    // 2. Tryout Single Subject
    else if (activeTryout.subjectId) {
      const matched = allSubjects.find(s => s.id === activeTryout.subjectId);
      if (matched) relevantSubjects = [matched];
    }
    // 3. Tryout dengan butir soal
    else {
      const tryoutQuestions = dbService.getQuestionsForTryout(activeTryout.id);
      if (tryoutQuestions.length > 0) {
        const subjIdSet = new Set(tryoutQuestions.map(q => q.subjectId));
        relevantSubjects = allSubjects.filter(s => subjIdSet.has(s.id));
      }
    }

    // 4. Jika masih kosong tapi ada subjectScores pada activeScore
    if (relevantSubjects.length === 0 && activeScore?.subjectScores && Object.keys(activeScore.subjectScores).length > 0) {
      const scoreKeys = Object.keys(activeScore.subjectScores).map(k => k.toLowerCase().trim());
      relevantSubjects = allSubjects.filter(s =>
        scoreKeys.includes(s.id.toLowerCase().trim()) ||
        scoreKeys.includes(s.name.toLowerCase().trim()) ||
        scoreKeys.includes(s.code.toLowerCase().trim())
      );
    }

    // 5. Fallback jika tryout umum
    if (relevantSubjects.length === 0) {
      relevantSubjects = allSubjects.slice(0, 4);
    }

    return relevantSubjects.map(subj => {
      const subjQuestions = allQuestions.filter(q => q.subjectId === subj.id);
      let scoreVal = resolveSubjectScoreFromScoreObj(activeScore, subj, studentAnswers, subjQuestions);

      if (scoreVal === null && activeTryout.subjectId === subj.id && activeScore) {
        scoreVal = activeScore.calculatedScore;
      }

      const finalScore = scoreVal !== null ? scoreVal : (activeScore?.calculatedScore ?? 0);
      const passingGrade = subj.passingGrade ?? 75.0;
      const isPassing = finalScore >= passingGrade;

      return {
        subject: subj,
        score: finalScore,
        passingGrade,
        isPassing,
        hasRealScore: scoreVal !== null,
      };
    });
  }, [activeTryout, activeScore, verifiedStudent, allSubjects, allQuestions]);

  // Class Benchmark metrics
  const classScoresNumbers = classScoresForActiveTryout.map(s => s.calculatedScore);
  const classAvgScore = classScoresNumbers.length > 0
    ? Math.round((classScoresNumbers.reduce((a, b) => a + b, 0) / classScoresNumbers.length) * 10) / 10
    : 75.0;
  const classMaxScore = classScoresNumbers.length > 0 ? Math.max(...classScoresNumbers) : 95.0;
  const scoreDiffClass = activeScore ? Math.round((activeScore.calculatedScore - classAvgScore) * 10) / 10 : 0;

  // Predikat Akademik
  const academicPredicate = useMemo(() => {
    const sc = activeScore?.calculatedScore || 0;
    if (sc >= 88) return { label: 'Sangat Memuaskan', grade: 'A', badge: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' };
    if (sc >= 78) return { label: 'Memuaskan', grade: 'B', badge: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800' };
    if (sc >= 65) return { label: 'Cukup', grade: 'C', badge: 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800' };
    return { label: 'Perlu Peningkatan', grade: 'D', badge: 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800' };
  }, [activeScore]);

  // Mapel aktif (tanpa mapel yang sudah dihapus seperti BIND)
  const activeSubjects = useMemo(() => {
    return allSubjects.filter(s => (s.code || '').toUpperCase().trim() !== 'BIND');
  }, [allSubjects]);

  // Pengelompokan Siklus Try Out (TO 1, TO 2, TO 3, ...) — dihitung dari SELURUH tryout agar
  // konsisten dengan pengelompokan yang dikontrol Guru Mapel dan mencakup semua siklus aktif.
  const tryoutStageGroups = useMemo<TryoutStageGroup[]>(() => {
    const allGroups = buildTryoutStageGroups(allTryouts, dbService.getExamPackages());
    if (!verifiedStudent) return allGroups;
    const studentGroups = allGroups.filter(stage =>
      stage.tryouts.some(t => allScores.some(s => s.studentId === verifiedStudent.id && s.tryoutId === t.id))
    );
    return allGroups.length > 0 ? allGroups : studentGroups;
  }, [allTryouts, allScores, verifiedStudent, dbVersion]);

  const allAnswersCache = useMemo(() => dbService.getAnswers(), [dbVersion, allScores]);

  const formatStageDate = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Multi-Tryout Progress History per Siklus TO:
  // - score        = rata-rata gabungan mapel siswa (mis. (MAT + BIN) / 2) pada siklus TO tersebut
  // - classAverage = rata-rata gabungan kelas pada siklus TO tersebut
  const progressHistory = useMemo(() => {
    if (!verifiedStudent) return [];
    const classmates = allStudents.filter(s => s.classId === verifiedStudent.classId);

    return tryoutStageGroups.map(stage => {
      const studentComposite = getStudentStageCompositeScore(
        verifiedStudent.id, stage, activeSubjects, allScores, allAnswersCache, allQuestions
      );

      // Rata-rata gabungan kelas
      const classCompositeValues: number[] = [];
      const subjectClassBuckets: Record<string, number[]> = {};
      classmates.forEach(cm => {
        const res = getStudentStageCompositeScore(
          cm.id, stage, activeSubjects, allScores, allAnswersCache, allQuestions
        );
        if (res.compositeScore !== null) classCompositeValues.push(res.compositeScore);
        Object.entries(res.subjectScores).forEach(([sid, val]) => {
          if (!subjectClassBuckets[sid]) subjectClassBuckets[sid] = [];
          subjectClassBuckets[sid].push(val);
        });
      });

      const avg = (arr: number[]) =>
        arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

      const subjectClassAverages: Record<string, number> = {};
      Object.entries(subjectClassBuckets).forEach(([sid, vals]) => {
        subjectClassAverages[sid] = avg(vals);
      });

      const subjectBreakdownLabel = activeSubjects
        .filter(s => studentComposite.subjectScores[s.id] !== undefined)
        .map(s => `${s.code}: ${studentComposite.subjectScores[s.id].toFixed(1)}`)
        .join(' · ');

      return {
        code: stage.groupKey,
        title: stage.title,
        date: formatStageDate(stage.startDate),
        score: studentComposite.compositeScore ?? 0,
        classAverage: classCompositeValues.length > 0 ? avg(classCompositeValues) : 75.0,
        subjectClassAverages,
        subjectBreakdownLabel,
      };
    });
  }, [tryoutStageGroups, verifiedStudent, allStudents, activeSubjects, allScores, allAnswersCache, allQuestions]);

  // Build real subject recap matrix rows per Siklus TO (menghitung rata-rata hanya dari siklus dengan data valid)
  const subjectRecapRows: SubjectRecapRow[] = useMemo(() => {
    if (!verifiedStudent) return [];
    return activeSubjects.map(subj => {
      const toScores: Record<string, number> = {};
      const validScores: number[] = [];

      tryoutStageGroups.forEach(stage => {
        const score = getStudentStageSubjectScore(
          verifiedStudent.id, subj, stage, allScores, allAnswersCache, allQuestions
        );
        if (score !== null) {
          toScores[stage.groupKey] = score;
          validScores.push(score);
        } else {
          toScores[stage.groupKey] = 0;
        }
      });

      const avgScore = validScores.length > 0
        ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10
        : 0;

      const passingGrade = subj.passingGrade ?? 75.0;
      const isPassing = avgScore >= passingGrade && validScores.length > 0;
      const firstVal = validScores[0] || 0;
      const lastVal = validScores[validScores.length - 1] || 0;
      const trend = validScores.length > 1 ? Math.round((lastVal - firstVal) * 10) / 10 : 0;

      return {
        subject: subj,
        passingGrade,
        toScores,
        avgScore,
        isPassing,
        trend,
      };
    }).filter(r => {
      return Object.values(r.toScores).some(v => v > 0) || activeSubjects.length <= 12;
    });
  }, [activeSubjects, tryoutStageGroups, verifiedStudent, allScores, allAnswersCache, allQuestions]);

  // PDF Export
  const handleDownloadPDF = () => {
    if (!verifiedStudent) return;
    const effectiveScore: Score | null = activeScore || (isSumatifPackage && sumatifProfile ? {
      id: `sc-sum-${verifiedStudent.id}`,
      studentId: verifiedStudent.id,
      tryoutId: activeTryout?.id || (activePackage?.id || ''),
      calculatedScore: sumatifProfile.averageScore,
      googleFormScore: sumatifProfile.averageScore,
      totalCorrect: sumatifProfile.passedCount,
      totalIncorrect: sumatifProfile.remedialCount,
      totalUnanswered: 0,
      subjectScores: Object.fromEntries(sumatifProfile.subjectScores.map(s => [s.subjectId, s.score])),
      scoringStatus: 'MATCH',
      createdAt: new Date().toISOString(),
    } : null);

    const effectiveTryout: Tryout | null = activeTryout || (isSumatifPackage && activePackage ? {
      id: activePackage.id,
      code: activePackage.code,
      title: activePackage.title,
      assessmentType: activePackage.assessmentType,
      academicYearId: activePackage.academicYearId,
      startDate: activePackage.startDate || new Date().toISOString(),
      endDate: activePackage.endDate || new Date().toISOString(),
      status: 'ACTIVE',
      scoringConfig: { scoringType: 'EQUAL_WEIGHT', maxScore: 100, correctScore: 1, wrongScore: 0, unansweredScore: 0, allowNegativeMarking: false, passingGrade: 75 },
    } : null);

    if (!effectiveScore || !effectiveTryout) return;

    const studentClass = allClasses.find(c => c.id === verifiedStudent.classId) || allClasses.find(c => c.name.toLowerCase() === verifiedStudent.classId?.toLowerCase());
    const walas = studentClass ? dbService.getHomeroomTeacherForClass(studentClass.id) : dbService.getHomeroomTeacherForClass(verifiedStudent.classId);

    const sumatifCards = (isSumatifPackage && sumatifProfile)
      ? sumatifProfile.subjectScores.map(s => ({
          subject: { code: s.subjectCode, name: s.subjectName, passingGrade: s.passingGrade },
          score: s.score,
          passingGrade: s.passingGrade,
          isPassing: s.isPassed,
        }))
      : activeTryoutSubjectCards;

    ExportService.exportStudentPDF(
      verifiedStudent,
      effectiveScore,
      effectiveTryout,
      studentClass,
      studentAnalytics,
      publishedExplanations,
      subjectRecapRows,
      {
        classRank,
        classTotalStudents,
        overallRank,
        overallTotalStudents,
        classAvgScore: isSumatifPackage && sumatifProfile ? sumatifProfile.averageScore : classAvgScore,
        classMaxScore: isSumatifPackage && sumatifProfile ? sumatifProfile.highestScore : classMaxScore,
        academicPredicate,
        activeSubjectCards: sumatifCards,
        progressHistory,
        schoolProfile: dbService.getSchoolProfile(),
        waliKelasName: walas?.name,
        waliKelasNip: walas?.nip,
        teachers: dbService.getTeachers(),
        classes: dbService.getClasses(),
      }
    );
  };

  // Helper YouTube Embed
  const getYouTubeEmbedUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try {
      if (url.includes('youtube.com/embed/')) {
        return url.includes('?') ? `${url}&autoplay=1` : `${url}?autoplay=1`;
      }
      const matchWatch = url.match(/[?&]v=([^&#]+)/);
      if (matchWatch && matchWatch[1]) {
        return `https://www.youtube-nocookie.com/embed/${matchWatch[1]}?autoplay=1`;
      }
      const matchShort = url.match(/youtu\.be\/([^?&#]+)/);
      if (matchShort && matchShort[1]) {
        return `https://www.youtube-nocookie.com/embed/${matchShort[1]}?autoplay=1`;
      }
      const matchShorts = url.match(/youtube\.com\/shorts\/([^?&#]+)/);
      if (matchShorts && matchShorts[1]) {
        return `https://www.youtube-nocookie.com/embed/${matchShorts[1]}?autoplay=1`;
      }
    } catch {
      // fallback
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b16] dark-canvas-student text-slate-900 dark:text-slate-100 pb-20 font-sans transition-colors">
      {/* HEADER BANNER */}
      <div className="bg-white dark:bg-gradient-to-r dark:from-[#090e1f] dark:via-[#070b17] dark:to-[#04060d] text-slate-900 dark:text-white py-10 px-4 sm:px-6 lg:px-8 border-b border-slate-200 dark:border-slate-800/80 relative overflow-hidden transition-colors shadow-xs dark:shadow-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative">
          <div>
            <div className="flex items-center gap-2 text-indigo-700 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-2 font-mono">
              <Award className="w-4 h-4 text-indigo-600 dark:text-amber-400" />
              <span>
                {isSumatifPackage
                  ? `Portal Hasil ${activePackage?.assessmentType === 'SAT' ? 'Sumatif Akhir Tahun (SAT)' : 'Sumatif Akhir Semester (SAS)'}`
                  : 'Portal Pengumuman Hasil Try Out & Analisis Siswa'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {isSumatifPackage
                ? (activePackage?.title || (activePackage?.assessmentType === 'SAT' ? 'Hasil Asesmen Sumatif Akhir Tahun (SAT)' : 'Hasil Asesmen Sumatif Akhir Semester (SAS)'))
                : 'Pengumuman Hasil Try Out Mandiri'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-2xl leading-relaxed">
              {isSumatifPackage
                ? 'Akses nilai resmi seluruh mata pelajaran, ketuntasan KKM (KKTP), profil kompetensi semesteran, serta unduh rapor individual.'
                : 'Verifikasi identitas (Tanggal Lahir + NISN Siswa) untuk mengakses nilai semua mata pelajaran, grafik progres belajar, rekap butir soal, serta pembahasan resmi guru.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-medium shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Sinkron Realtime</span>
              <span className="text-[10px] text-slate-400 font-mono">({lastSyncTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})</span>
            </div>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isCloudSyncing}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/90 dark:hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-indigo-600 dark:text-indigo-400 font-semibold cursor-pointer transition-colors disabled:opacity-50"
              title="Segarkan data terbaru dari server sekolah"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isCloudSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isCloudSyncing ? 'Menyinkronkan...' : 'Segarkan'}</span>
            </button>
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-medium shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Isolasi Data Siswa Aktif</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* CASE 1: UNVERIFIED STATE -> SHOW CLEAN VERIFICATION GATE */}
        {!verifiedStudent && (
          <StudentVerificationGate
            birthDateInput={birthDateInput}
            setBirthDateInput={setBirthDateInput}
            nisnInput={nisnInput}
            setNisnInput={setNisnInput}
            isLockedOut={isLockedOut}
            lockoutTimer={lockoutTimer}
            failedAttempts={failedAttempts}
            errorMessage={errorMessage}
            loading={loading}
            onVerify={handleVerify}
          />
        )}

        {/* CASE 2: VERIFIED STATE -> FULL DASHBOARD VIEW */}
        {verifiedStudent && (
          <div className="space-y-8 animate-fade-in">
            {/* 1. STUDENT IDENTITY BANNER & ACTIONS */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Siswa Terverifikasi (Kerahasiaan Terjaga)</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
                  {verifiedStudent.name}
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                  <span>NISN: <strong className="text-slate-800 dark:text-slate-200 font-mono">{verifiedStudent.nisn}</strong></span>
                  <span>·</span>
                  <span>NIS: <strong className="text-slate-800 dark:text-slate-200 font-mono">{verifiedStudent.nis}</strong></span>
                  <span>·</span>
                  <span>Kelas: <strong className="text-slate-800 dark:text-slate-200">{studentClassName}</strong></span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isCloudSyncing}
                  className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer border border-slate-200 dark:border-slate-700 disabled:opacity-50"
                  title="Segarkan data terbaru secara realtime dari server"
                >
                  <RotateCcw className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${isCloudSyncing ? 'animate-spin' : ''}`} />
                  <span>{isCloudSyncing ? 'Menyinkronkan...' : 'Segarkan Data'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
                  title="Unduh Laporan Individual Siswa Format PDF Resmi"
                >
                  <Download className="w-4 h-4 text-white" />
                  <span>Unduh PDF Resmi</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogoutStudent}
                  className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer border border-slate-200 dark:border-slate-700"
                  title="Keluar dari sesi siswa"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Ganti Siswa</span>
                </button>
              </div>
            </div>

            {/* 1.5 PERSISTENT GLOBAL FILTER BAR (WADAH & PELAKSANAAN / MAPEL) */}
            {tryouts.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <Filter className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Filter Konteks Ujian &amp; Wadah
                      </h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        activePackage?.assessmentType === 'SAS'
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                          : activePackage?.assessmentType === 'SAT'
                          ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                          : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                      }`}>
                        {activePackage?.assessmentType === 'SAS' ? 'Mode SAS' : activePackage?.assessmentType === 'SAT' ? 'Mode SAT' : 'Mode Try Out'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {isSumatifPackage
                        ? `Menampilkan data ${activePackage?.title} — Evaluasi semesteran seluruh mata pelajaran`
                        : `Wadah aktif: ${activePackage?.title || 'Try Out Mandiri'} — Pilih tahapan pelaksanaan di samping`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Dropdown 1: Wadah Ujian */}
                  <div className="flex items-center gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                      <span>Wadah:</span>
                    </label>
                    <select
                      value={selectedPackageId}
                      onChange={e => setSelectedPackageId(e.target.value)}
                      className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[210px] truncate"
                    >
                      <option value="ALL">Semua Wadah / Mandiri</option>
                      {studentPackages.map(pkg => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.assessmentType === 'SAS' ? '[SAS] ' : pkg.assessmentType === 'SAT' ? '[SAT] ' : '[TO] '}
                          {pkg.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Dropdown 2: Pelaksanaan Try Out / Cakupan Mapel */}
                  <div className="flex items-center gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      <span>{isSumatifPackage ? 'Lingkup:' : 'Ujian:'}</span>
                    </label>
                    {isSumatifPackage ? (
                      <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Kompilasi Seluruh Mapel ({activePackage?.subjects?.length || 0} Mapel)</span>
                      </div>
                    ) : (
                      <select
                        value={selectedTryoutId}
                        onChange={e => setSelectedTryoutId(e.target.value)}
                        className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[240px] truncate"
                      >
                        {displayTryouts.map(t => {
                          const isExt = Boolean(t.isExternal || t.source === 'EXTERNAL');
                          return (
                            <option key={t.id} value={t.id}>
                              [{getFriendlyTryoutStageLabel(t, displayTryouts)}] {t.title} {isExt ? '(Eksternal)' : '(Internal)'}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 2. 4-SEGMENT NAVIGATION BAR */}
            <div className="bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs grid grid-cols-2 lg:grid-cols-4 gap-1.5 transition-colors">
              <button
                type="button"
                onClick={() => setPortalTab('REPORT')}
                className={`py-3 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  portalTab === 'REPORT'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Award className="w-4 h-4" />
                <span>{isSumatifPackage ? (activePackage?.assessmentType === 'SAT' ? 'Rapor Nilai SAT' : 'Rapor Nilai SAS') : 'Rapor & Skor TO'}</span>
              </button>

              <button
                type="button"
                onClick={() => setPortalTab('TREND_RECAP')}
                className={`py-3 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  portalTab === 'TREND_RECAP'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>{isSumatifPackage ? 'Profil Radar & KKTP' : 'Grafik & Rekap Mapel'}</span>
              </button>

              <button
                type="button"
                onClick={() => setPortalTab('QUESTION_SHEET')}
                className={`py-3 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  portalTab === 'QUESTION_SHEET'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Rekap Butir Soal</span>
                {studentAnalytics && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    portalTab === 'QUESTION_SHEET' ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}>
                    {studentAnalytics.questionPerformance.length} Soal
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setPortalTab('EXPLANATIONS')}
                className={`py-3 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  portalTab === 'EXPLANATIONS'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Video className="w-4 h-4" />
                <span>Media Pembahasan</span>
                {publishedExplanations.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    portalTab === 'EXPLANATIONS' ? 'bg-indigo-700 text-white' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                  }`}>
                    {publishedExplanations.length} Modul
                  </span>
                )}
              </button>
            </div>

            {/* INFO JIKA KELAS SISWA TIDAK TERMASUK DALAM PAKET UJIAN APAPUN */}
            {tryouts.length === 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Belum Ada Paket Ujian untuk Kelas {studentClassName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Akun Anda terdaftar di kelas <strong>{studentClassName}</strong>. Saat ini belum ada paket ujian atau try out yang ditargetkan untuk kelas Anda. Hasil ujian jenjang/kelas lain tidak ditampilkan demi privasi dan keteraturan data.
                </p>
              </div>
            )}

            {/* TAB 1: RAPOR & SKOR TRY OUT TERPILIH */}
            {portalTab === 'REPORT' && (activeScore || (isSumatifPackage && sumatifProfile)) && (tryouts.length > 0 || isSumatifPackage) && (
              <div className="space-y-6 animate-fade-in">
                {/* Active Exam Context Banner */}
                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Ujian yang Ditampilkan:</span>
                    <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">
                      {isSumatifPackage
                        ? `${activePackage?.title} (${activePackage?.code})`
                        : `${getFriendlyTryoutStageLabel(activeTryout, displayTryouts)} — ${activeTryout?.title} (${activeTryout?.code})`}
                    </span>
                    {activeTryout?.isExternal && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        Try Out Eksternal
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    *Gunakan menu filter di atas untuk beralih wadah atau tahapan ujian
                  </div>
                </div>

                {/* Score & Performance Stat Cards */}
                {isSumatifPackage && sumatifProfile ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-slate-900 dark:bg-slate-950 text-white p-6 rounded-3xl shadow-sm flex flex-col justify-between border border-slate-800">
                      <div>
                        <span className="text-xs text-slate-400 font-medium block mb-1">Rata-rata Nilai Semester</span>
                        <div className="text-4xl font-extrabold text-white font-mono tracking-tight">
                          {sumatifProfile.averageScore}
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-1">Skala 0 - 100 Poin</span>
                      </div>
                      <div className="pt-4 border-t border-slate-800 mt-4 text-xs flex justify-between items-center text-slate-300">
                        <span>Predikat Capaian:</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${academicPredicate.badge}`}>
                          {academicPredicate.grade} — {academicPredicate.label}
                        </span>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4 transition-colors">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <CheckCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Mapel Tuntas (≥ KKTP)</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                          {sumatifProfile.passedCount} Mapel
                        </div>
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                          Memenuhi Ambang Batas
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4 transition-colors">
                      <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                        <XCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Perlu Remedial (&lt; KKTP)</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                          {sumatifProfile.remedialCount} Mapel
                        </div>
                        <div className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                          {sumatifProfile.remedialCount > 0 ? 'Perlu Pendampingan' : 'Semua Mapel Tuntas'}
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4 transition-colors">
                      <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                        <Award className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Nilai Mapel Tertinggi</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                          {sumatifProfile.highestScore}
                        </div>
                        <div className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">
                          Skor Maksimal Terdata
                        </div>
                      </div>
                    </div>
                  </div>
                ) : activeScore ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Score Card */}
                    <div className="bg-slate-900 dark:bg-slate-950 text-white p-6 rounded-3xl shadow-sm flex flex-col justify-between border border-slate-800">
                      <div>
                        <span className="text-xs text-slate-400 font-medium block mb-1">Skor Akhir Terhitung</span>
                        <div className="text-4xl font-extrabold text-white font-mono tracking-tight">
                          {activeScore.calculatedScore}
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-1">Skala 0 - 100 Poin</span>
                      </div>

                      <div className="pt-4 border-t border-slate-800 mt-4 text-xs">
                        <div className="flex justify-between items-center text-slate-300">
                          <span>Predikat Capaian:</span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${academicPredicate.badge}`}>
                            {academicPredicate.grade} — {academicPredicate.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Answers Stats */}
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4 transition-colors">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <CheckCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Jawaban Benar</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                          {activeTryout?.isExternal && !activeScore.totalCorrect
                            ? `${activeTryoutSubjectCards.filter(c => c.isPassing).length} Mapel`
                            : `${activeScore.totalCorrect ?? 0} Soal`}
                        </div>
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                          {activeTryout?.isExternal && !activeScore.totalCorrect ? 'Tuntas KKM' : 'Capaian Berhasil'}
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4 transition-colors">
                      <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                        <XCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Jawaban Salah</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                          {activeTryout?.isExternal && !activeScore.totalIncorrect
                            ? `${activeTryoutSubjectCards.filter(c => !c.isPassing).length} Mapel`
                            : `${activeScore.totalIncorrect ?? 0} Soal`}
                        </div>
                        <div className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                          {activeTryout?.isExternal && !activeScore.totalIncorrect ? 'Belum KKM' : 'Perlu Evaluasi'}
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4 transition-colors">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <HelpCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {activeTryout?.isExternal && !activeScore.totalUnanswered ? 'Total Bidang Studi' : 'Tidak Dijawab'}
                        </div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                          {activeTryout?.isExternal && !activeScore.totalUnanswered
                            ? `${activeTryoutSubjectCards.length} Mapel`
                            : `${activeScore.totalUnanswered ?? 0} Soal`}
                        </div>
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          {activeTryout?.isExternal && !activeScore.totalUnanswered ? 'Diujikan Sekolah' : 'Opsi Kosong'}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Scoring Verification Transparency Banner */}
                {activeScore && (
                  <div
                    className={`p-4 rounded-2xl border text-xs flex items-center justify-between ${
                      activeScore.scoringStatus === 'MATCH'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-200'
                        : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                      <span>
                        <strong>Verifikasi Keselarasan Scoring:</strong>{' '}
                        {activeScore.scoringStatus === 'MATCH'
                          ? 'MATCH — Skor kalkulasi database terverifikasi selaras 100% dengan respons formulir ujian.'
                          : `SCORING_MISMATCH — Skor formulir (${activeScore.googleFormScore}) memiliki selisih ${activeScore.scoreDifference} poin dari kalkulasi ulang sistem.`}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white/70 dark:bg-slate-950/80 text-slate-900 dark:text-slate-100">
                      {activeScore.scoringStatus}
                    </span>
                  </div>
                )}

                {/* Section 1: Ranking Siswa (Kelas & Angkatan) + Tie-Breaker Rule */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-amber-500" />
                        <span>Peringkat Hasil Ujian Siswa</span>
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Kedudukan nilai pada paket {activeTryout?.title} berdasarkan kalkulasi sistem terintegrasi.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Ranking Kelas */}
                    <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-500/20 dark:via-slate-900 dark:to-slate-900 border border-amber-200 dark:border-amber-800/60 rounded-3xl p-6 relative overflow-hidden">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-xs uppercase tracking-wider">
                          <Trophy className="w-4 h-4" />
                          <span>Peringkat Kelas</span>
                        </div>
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          {studentClassName}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight">
                          #{classRank}
                        </span>
                        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                          dari {classTotalStudents} siswa
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {classRank === 1 ? 'Posisi Puncak! Pertahankan konsistensi capaian ini.' :
                         classRank <= 3 ? 'Masuk dalam 3 besar terbaik di rombel kelas.' :
                         classRank <= 10 ? 'Masuk dalam 10 besar kelas. Terus tingkatkan capaianmu!' :
                         'Terus berlatih untuk menembus peringkat 10 besar kelas.'}
                      </p>
                    </div>

                    {/* Ranking Angkatan / Keseluruhan */}
                    <div className="bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent dark:from-indigo-500/20 dark:via-slate-900 dark:to-slate-900 border border-indigo-200 dark:border-indigo-800/60 rounded-3xl p-6 relative overflow-hidden">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider">
                          <Medal className="w-4 h-4" />
                          <span>Peringkat Angkatan (Paralel)</span>
                        </div>
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                          Seluruh Siswa
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight">
                          #{overallRank}
                        </span>
                        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                          dari {overallTotalStudents} peserta
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {overallRank === 1 ? 'Peringkat 1 Umum se-angkatan! Prestasi luar biasa!' :
                         overallRank <= 5 ? 'Top 5 Angkatan. Berpotensi kuat menembus prodi impian.' :
                         overallRank <= 20 ? 'Top 20 Angkatan. Daya saing sudah sangat kompetitif.' :
                         'Kompetisi angkatan terbuka luas, optimalkan mata pelajaran utama.'}
                      </p>
                    </div>
                  </div>

                  {/* Keterangan Aturan Tie-Breaker */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span>
                        <strong>Aturan Penentuan Peringkat:</strong> 1. Total Skor Ujian → 2. Jumlah Benar Seluruh Mapel → 3. Jumlah Benar Mapel Matematika.
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider shrink-0">
                      Standar Regulasi SNBT/Sekolah
                    </span>
                  </div>
                </div>

                {/* Section 2: Rekap Nilai Seluruh Mata Pelajaran pada Try Out / Wadah Aktif */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                        {isSumatifPackage
                          ? `Rapor Nilai Seluruh Mata Pelajaran (${activePackage?.title || 'SAT'})`
                          : `Capaian Nilai Per Mata Pelajaran (${activeTryout ? getFriendlyTryoutStageLabel(activeTryout, displayTryouts) : 'Try Out'})`}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {isSumatifPackage
                          ? 'Daftar nilai murni dan batas KKM (KKTP) resmi sekolah untuk masing-masing mata pelajaran semester ini.'
                          : 'Rincian skor perolehan dan ketuntasan KKM siswa untuk masing-masing bidang studi pada try out ini.'}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                      {isSumatifPackage && sumatifProfile
                        ? `${sumatifProfile.subjectScores.length} Mata Pelajaran`
                        : `${activeTryoutSubjectCards.length} Mata Pelajaran`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {isSumatifPackage && sumatifProfile ? (
                      sumatifProfile.subjectScores.map(item => (
                        <div
                          key={item.subjectId}
                          className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 block">
                                {item.subjectCode}
                              </span>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                                {item.subjectName}
                              </h4>
                            </div>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                item.isPassed
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                              }`}
                            >
                              {item.isPassed ? 'Tuntas' : 'Remedial'}
                            </span>
                          </div>

                          <div>
                            <div className="flex items-baseline justify-between mb-1">
                              <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
                                {item.score}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                KKM: {item.passingGrade}
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${item.isPassed ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                style={{ width: `${Math.min(100, Math.max(0, item.score))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      activeTryoutSubjectCards.map(item => (
                        <div
                          key={item.subject.id}
                          className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 block">
                                {item.subject.code}
                              </span>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                                {item.subject.name}
                              </h4>
                            </div>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                item.isPassing
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                              }`}
                            >
                              {item.isPassing ? 'Tuntas' : 'Belum KKM'}
                            </span>
                          </div>

                          <div>
                            <div className="flex items-baseline justify-between mb-1">
                              <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
                                {item.score}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                KKM: {item.passingGrade}
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${item.isPassing ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                style={{ width: `${Math.min(100, Math.max(0, item.score))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Section 3: Benchmark Perbandingan Kelas & Predikat Akademik */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Predikat Kelulusan / Akademik */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">
                        Predikat Akademik
                      </span>
                      <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                        {academicPredicate.label}
                      </div>
                      <span className="text-[11px] text-slate-500 mt-1 block">
                        Evaluasi paket {activeTryout ? getFriendlyTryoutStageLabel(activeTryout, displayTryouts) : 'Try Out'}
                      </span>
                    </div>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl font-mono border ${academicPredicate.badge}`}>
                      {academicPredicate.grade}
                    </div>
                  </div>

                  {/* Benchmark Rerata Kelas */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">
                        Rerata Kelas ({studentClassName})
                      </span>
                      <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                        {classAvgScore}
                      </div>
                      <span className={`text-[11px] font-bold mt-1 block ${
                        scoreDiffClass >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {scoreDiffClass >= 0 ? `+${scoreDiffClass} poin di atas rerata` : `${scoreDiffClass} poin dari rerata`}
                      </span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                      <BarChart3 className="w-6 h-6" />
                    </div>
                  </div>

                  {/* Nilai Tertinggi Kelas */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">
                        Skor Tertinggi Kelas
                      </span>
                      <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                        {classMaxScore}
                      </div>
                      <span className="text-[11px] text-slate-500 mt-1 block">
                        Patokan capaian puncak kelas
                      </span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                      <Award className="w-6 h-6" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: GRAFIK PROGRES LINTAS TO & REKAP SELURUH MAPEL (TRY OUT) / PROFIL RADAR & KKTP (SAS / SAT) */}
            {portalTab === 'TREND_RECAP' && (
              isSumatifPackage && sumatifProfile ? (
                <StudentSumatifView profile={sumatifProfile} />
              ) : (
              <div className="space-y-6 sm:space-y-8 animate-fade-in">
                {/* 1. Overall Progress across TO1 -> TO4 SVG Chart */}
                <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 sm:space-y-6 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider font-mono">
                        <TrendingUp className="w-4 h-4" />
                        <span>Grafik Perkembangan Try Out Keseluruhan</span>
                      </div>
                      <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
                        Progres Nilai Siswa Lintas Try Out
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Evaluasi pertumbuhan belajar per siklus Try Out (TO 1, TO 2, TO 3, …) — nilai merupakan rata-rata gabungan seluruh mapel pada siklus tersebut, dibandingkan dengan rata-rata kelas.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono font-semibold">
                      <span className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-center gap-1.5 border border-emerald-200 dark:border-emerald-800 font-bold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Peningkatan Skor: +{Math.max(0, (progressHistory[progressHistory.length - 1]?.score || 0) - (progressHistory[0]?.score || 0)).toFixed(1)} Poin</span>
                      </span>
                    </div>
                  </div>

                  {/* SVG Chart Viewport */}
                  {(() => {
                    const coords = progressHistory.map((item, i) => {
                      const x = progressHistory.length === 1 ? 500 : 80 + (i / Math.max(1, progressHistory.length - 1)) * 840;
                      const y = 260 - (Math.min(100, Math.max(0, item.score)) / 100) * 220;
                      const classAvgY = 260 - (Math.min(100, Math.max(0, item.classAverage ?? 75)) / 100) * 220;
                      return { ...item, x, y, classAvgY };
                    });

                    const svgPolyPoints = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
                    const classAvgPolyPoints = coords.map(c => `${c.x.toFixed(1)},${c.classAvgY.toFixed(1)}`).join(' ');
                    const firstX = coords[0]?.x || 80;
                    const lastX = coords[coords.length - 1]?.x || 920;
                    const polygonPoints = `${firstX},260 ${svgPolyPoints} ${lastX},260`;

                    return (
                      <div className="p-3.5 sm:p-6 bg-slate-50/70 dark:bg-slate-950/80 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 pb-3">
                          <span className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                            <span>Bagan Grafik Pertumbuhan Belajar Siswa</span>
                          </span>
                          <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 self-start sm:self-auto">
                            Komparasi vs Rata-Rata Kelas
                          </span>
                        </div>

                        {/* Petunjuk Geser di Layar HP */}
                        <div className="flex sm:hidden items-center justify-between text-[11px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200/70 dark:border-indigo-800/70 px-3 py-1.5 rounded-xl">
                          <span>Geser grafik ke samping untuk melihat detail tiap TO</span>
                          <span className="font-mono font-bold flex items-center gap-1">
                            <ArrowLeftRight className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                            <span>Geser</span>
                          </span>
                        </div>

                        <div className="relative w-full mobile-chart-scroll bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs">
                          <svg className="min-w-[600px] sm:min-w-0 w-full h-auto min-h-[215px] sm:min-h-[250px] overflow-visible" viewBox="0 0 1000 315" preserveAspectRatio="xMidYMid meet">
                            <defs>
                              <linearGradient id="studentChartGradMain" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.30" />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {/* Y Guidelines */}
                            <line x1="60" y1="40" x2="940" y2="40" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                            <text x="46" y="45" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-bold">100</text>
                            <line x1="60" y1="95" x2="940" y2="95" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" strokeDasharray="4 4" />
                            <text x="46" y="100" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-bold">75</text>
                            <line x1="60" y1="150" x2="940" y2="150" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" strokeDasharray="4 4" />
                            <text x="46" y="155" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-bold">50</text>
                            <line x1="60" y1="205" x2="940" y2="205" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" strokeDasharray="4 4" />
                            <text x="46" y="210" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-bold">25</text>
                            <line x1="60" y1="260" x2="940" y2="260" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="1.5" />
                            <text x="46" y="265" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-bold">0</text>

                            {/* Polygon Area Fill */}
                            {coords.length > 1 && <polygon points={polygonPoints} fill="url(#studentChartGradMain)" />}

                            {/* Class Average Polyline */}
                            {coords.length > 1 ? (
                              <polyline fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray="6 5" opacity="0.9" points={classAvgPolyPoints} />
                            ) : coords.length === 1 ? (
                              <line x1="60" y1={coords[0].classAvgY} x2="940" y2={coords[0].classAvgY} stroke="#10b981" strokeWidth="3" strokeDasharray="6 5" opacity="0.9" />
                            ) : null}

                            {/* Student Score Polyline */}
                            {coords.length > 1 ? (
                              <polyline fill="none" stroke="#6366f1" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" points={svgPolyPoints} />
                            ) : coords.length === 1 ? (
                              <line x1="60" y1={coords[0].y} x2="940" y2={coords[0].y} stroke="#6366f1" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
                            ) : null}

                            {coords.length === 0 && (
                              <text x="500" y="150" textAnchor="middle" className="text-[14px] font-sans fill-slate-400">
                                Belum ada data nilai Try Out yang dapat ditampilkan.
                              </text>
                            )}

                            {/* Nodes */}
                            {coords.map((node, i) => (
                              <g key={i}>
                                <line x1={node.x} y1="40" x2={node.x} y2="260" stroke="currentColor" className="text-slate-100 dark:text-slate-800/60" strokeDasharray="3 3" />
                                <circle cx={node.x} cy={node.classAvgY} r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                                <circle cx={node.x} cy={node.y} r="11" fill="#6366f1" opacity="0.22" />
                                <circle cx={node.x} cy={node.y} r="6.5" fill="#6366f1" stroke="#ffffff" strokeWidth="2.5" />

                                <g transform={`translate(${node.x - 44}, ${node.y - 36})`}>
                                  <rect width="88" height="26" rx="8" className="fill-slate-900 dark:fill-slate-100 shadow-sm" />
                                  <text x="44" y="17" textAnchor="middle" className="text-[12.5px] font-mono font-extrabold fill-indigo-300 dark:fill-indigo-700">
                                    {node.score.toFixed(1)} Poin
                                  </text>
                                </g>

                                <text x={node.x} y="284" textAnchor="middle" className="text-[14px] font-mono font-extrabold fill-slate-800 dark:fill-slate-200">
                                  {node.code}
                                </text>
                                <text x={node.x} y="302" textAnchor="middle" className="text-[11.5px] font-sans fill-slate-400">
                                  {node.date}
                                </text>
                                {node.subjectBreakdownLabel && (
                                  <text x={node.x} y={Math.min(node.y, node.classAvgY) - 44 < 20 ? Math.max(node.y, node.classAvgY) + 24 : Math.min(node.y, node.classAvgY) - 44} textAnchor="middle" className="text-[11.5px] font-mono font-bold fill-slate-500 dark:fill-slate-400">
                                    {node.subjectBreakdownLabel}
                                  </text>
                                )}
                              </g>
                            ))}
                          </svg>
                        </div>

                        {/* Ringkasan Cepat Angka Per Siklus TO (Sangat Mudah Dibaca di HP & Desktop) */}
                        {coords.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                            {coords.map((node, i) => (
                              <div
                                key={node.code || i}
                                className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shadow-2xs"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono font-extrabold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                      {node.code}
                                    </span>
                                    <span className="text-[11px] text-slate-400 font-mono truncate">{node.date}</span>
                                  </div>
                                  {node.subjectBreakdownLabel && (
                                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1 truncate">
                                      {node.subjectBreakdownLabel}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-base font-black font-mono text-indigo-600 dark:text-indigo-400">
                                    {node.score.toFixed(1)}
                                  </div>
                                  <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                                    Kelas: {(node.classAverage ?? 75).toFixed(1)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Chart Legend */}
                        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-1 bg-indigo-600 rounded-full inline-block" />
                            <span>Rata-Rata Gabungan Siswa (seluruh mapel per TO)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-0.5 border-t-2 border-dashed border-emerald-500 inline-block" />
                            <span>Rata-Rata Gabungan Kelas</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 2. SUBJECT RECAP SECTION (Grafik Per-Mapel + Tabel Rekapitulasi Lengkap) */}
                <SubjectRecapSection
                  student={verifiedStudent}
                  subjects={activeSubjects}
                  progressHistory={progressHistory}
                  subjectRecapRows={subjectRecapRows}
                  onOpenSubjectExplanations={subjId => {
                    setPortalTab('EXPLANATIONS');
                    setExplanationSubjectFilter(subjId);
                  }}
                  onExportCSV={() => {
                    ExportService.exportSubjectRecapCSV(
                      verifiedStudent.name,
                      verifiedStudent.nisn,
                      subjectRecapRows,
                      progressHistory.map(p => p.code)
                    );
                  }}
                />
              </div>
              )
            )}

            {/* TAB 3: REKAP BUTIR SOAL YANG DIKERJAKAN */}
            {portalTab === 'QUESTION_SHEET' && (
              studentAnalytics && studentAnalytics.questionPerformance.length > 0 ? (
                <StudentQuestionSheet
                  questions={allQuestions}
                  questionPerformance={studentAnalytics.questionPerformance}
                  subjects={allSubjects}
                  explanations={publishedExplanations}
                  onWatchVideo={(url, title) => {
                    setSelectedVideoUrl(url);
                    setSelectedVideoTitle(title);
                  }}
                  activeTryoutCode={activeTryout ? `${getFriendlyTryoutStageLabel(activeTryout, displayTryouts)} (${activeTryout.title})` : 'Try Out'}
                  tryouts={displayTryouts}
                  selectedTryoutId={selectedTryoutId}
                  onSelectTryout={id => setSelectedTryoutId(id)}
                />
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 sm:p-12 text-center space-y-4 animate-fade-in shadow-xs">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <div className="max-w-md mx-auto space-y-2">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {activeTryout?.isExternal ? 'Rekapitulasi Nilai Kolektif / Try Out Eksternal' : 'Lembar Soal Belum Tersedia'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {activeTryout?.isExternal
                        ? `Paket '${activeTryout.title}' diolah langsung dari rekapitulasi nilai kolektif multi-mapel sekolah tanpa formulir lembar soal per butir. Silakan cek rincian nilai tiap mapel pada tab Rapor & Skor TO atau Grafik & Rekap Mapel.`
                        : `Belum ada butir soal yang dipublikasikan untuk paket ujian ${activeTryout?.title || ''}. Silakan hubungi guru mata pelajaran terkait.`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setPortalTab('REPORT')}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Lihat Nilai di Tab Rapor
                    </button>
                    {displayTryouts.find(t => !t.isExternal && t.id !== selectedTryoutId) && (
                      <button
                        type="button"
                        onClick={() => {
                          const internalTo = displayTryouts.find(t => !t.isExternal);
                          if (internalTo) setSelectedTryoutId(internalTo.id);
                        }}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        Beralih ke TO Internal Berbutir Soal
                      </button>
                    )}
                  </div>
                </div>
              )
            )}

            {/* TAB 4: PUSAT MEDIA PEMBAHASAN RESMI (PDF & VIDEO YOUTUBE) */}
            {portalTab === 'EXPLANATIONS' && (() => {
              const isMatchExpSub = (expSubId?: string, targetSubId?: string) => {
                if (!expSubId || !targetSubId) return false;
                if (expSubId === targetSubId) return true;
                const sTarget = allSubjects.find(s => s.id === targetSubId || s.code === targetSubId);
                const sExp = allSubjects.find(s => s.id === expSubId || s.code === expSubId);
                if (sTarget && sExp) {
                  return sTarget.id === sExp.id || sTarget.code.toLowerCase() === sExp.code.toLowerCase();
                }
                if (sTarget) {
                  return expSubId.toLowerCase() === sTarget.code?.toLowerCase();
                }
                return false;
              };

              const availableQuestionNumbers: number[] = Array.from(
                new Set(
                  publishedExplanations
                    .filter(e => explanationSubjectFilter === 'ALL' || isMatchExpSub(e.subjectId, explanationSubjectFilter))
                    .flatMap(e => {
                      if (e.questionNumbers && e.questionNumbers.length > 0) return e.questionNumbers;
                      if (e.questionId) {
                        const q = allQuestions.find(item => item.id === e.questionId);
                        return q && typeof q.questionNumber === 'number' ? [q.questionNumber] : [];
                      }
                      return [];
                    })
                )
              )
                .filter((num): num is number => typeof num === 'number')
                .sort((a, b) => a - b);

              const filteredExplanations = publishedExplanations.filter(e => {
                if (explanationSubjectFilter !== 'ALL' && !isMatchExpSub(e.subjectId, explanationSubjectFilter)) {
                  return false;
                }
                if (explanationQuestionNumberFilter !== 'ALL') {
                  if (e.questionNumbers && e.questionNumbers.length > 0) {
                    if (!e.questionNumbers.includes(explanationQuestionNumberFilter)) return false;
                  } else if (e.questionId) {
                    const q = allQuestions.find(item => item.id === e.questionId);
                    if (!q || q.questionNumber !== explanationQuestionNumberFilter) return false;
                  } else {
                    return false;
                  }
                }
                return true;
              });

              const studentResourceCardsList = filteredExplanations.flatMap(exp => {
                const list: Array<{
                  id: string;
                  exp: Explanation;
                  type: 'YOUTUBE' | 'PDF';
                  title: string;
                  url: string;
                  fileName?: string;
                  fileSize?: number;
                }> = [];

                if (exp.youtubeUrl) {
                  list.push({
                    id: `${exp.id}-yt`,
                    exp,
                    type: 'YOUTUBE',
                    title: exp.title.includes('Video') ? exp.title : `Video: ${exp.title}`,
                    url: exp.youtubeUrl,
                  });
                }

                if (exp.pdfUrl) {
                  list.push({
                    id: `${exp.id}-pdf`,
                    exp,
                    type: 'PDF',
                    title: exp.title.includes('PDF') || exp.title.includes('Modul') ? exp.title : `Modul PDF: ${exp.title}`,
                    url: exp.pdfUrl,
                    fileName: exp.pdfFileName || 'Modul_Solusi_Resmi.pdf',
                    fileSize: exp.pdfFileSize,
                  });
                }

                return list;
              }).filter(item => {
                if (mediaTypeFilter === 'YOUTUBE') return item.type === 'YOUTUBE';
                if (mediaTypeFilter === 'PDF') return item.type === 'PDF';
                return true;
              });

              const totalYt = filteredExplanations.filter(e => !!e.youtubeUrl).length;
              const totalPdf = filteredExplanations.filter(e => !!e.pdfUrl).length;

              return (
                <div className="space-y-6 animate-fade-in">
                  {/* Filters Header */}
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                            Pusat Media Pembahasan Resmi Guru
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Tautan dokumen PDF dan video pembahasan YouTube resmi untuk evaluasi mandiri paket{' '}
                            <strong className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">{activeTryout ? getFriendlyTryoutStageLabel(activeTryout, displayTryouts) : 'Try Out'}</strong>.
                          </p>
                        </div>
                      </div>

                      {/* Tryout Selector & View Switcher */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                          <span className="font-semibold text-slate-500 dark:text-slate-400">Paket:</span>
                          <select
                            value={selectedTryoutId}
                            onChange={e => setSelectedTryoutId(e.target.value)}
                            className="bg-transparent text-xs font-bold font-mono text-indigo-600 dark:text-indigo-400 focus:outline-none cursor-pointer"
                          >
                            {displayTryouts.map(t => (
                              <option key={t.id} value={t.id} className="text-slate-900 dark:text-slate-100">
                                [{getFriendlyTryoutStageLabel(t, displayTryouts)}] {t.title}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setResourceViewMode('CARDS')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              resourceViewMode === 'CARDS'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            <span>Katalog Kartu ({studentResourceCardsList.length})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setResourceViewMode('MODULES')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              resourceViewMode === 'MODULES'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Modul Lengkap ({filteredExplanations.length})</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Subject & Media Filters Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      {/* Subject Pills */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
                          <Filter className="w-3.5 h-3.5" />
                          <span>Filter Mapel:</span>
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            setExplanationSubjectFilter('ALL');
                            setExplanationQuestionNumberFilter('ALL');
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            explanationSubjectFilter === 'ALL'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          Semua Mapel ({publishedExplanations.length})
                        </button>

                        {allSubjects.map(s => {
                          const count = publishedExplanations.filter(e => isMatchExpSub(e.subjectId, s.id)).length;
                          const isSel = explanationSubjectFilter === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setExplanationSubjectFilter(s.id);
                                setExplanationQuestionNumberFilter('ALL');
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                isSel
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                              }`}
                            >
                              <span>{s.name}</span>
                              <span className={`text-[10px] px-1 rounded font-mono ${
                                isSel ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-700'
                              }`}>
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Media Type Filter */}
                      {resourceViewMode === 'CARDS' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setMediaTypeFilter('ALL')}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                              mediaTypeFilter === 'ALL'
                                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            Semua Tipe
                          </button>
                          <button
                            type="button"
                            onClick={() => setMediaTypeFilter('YOUTUBE')}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                              mediaTypeFilter === 'YOUTUBE'
                                ? 'bg-rose-600 text-white'
                                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40 hover:bg-rose-100'
                            }`}
                          >
                            <Youtube className="w-3.5 h-3.5" />
                            <span>YouTube ({totalYt})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMediaTypeFilter('PDF')}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                              mediaTypeFilter === 'PDF'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/40 hover:bg-indigo-100'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>PDF ({totalPdf})</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Question Number Filter Chips (when available) */}
                    {availableQuestionNumbers.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Filter Nomor Soal:</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setExplanationQuestionNumberFilter('ALL')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            explanationQuestionNumberFilter === 'ALL'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          Semua ({availableQuestionNumbers.length} Soal)
                        </button>
                        <div className="flex flex-wrap items-center gap-1 max-h-24 overflow-y-auto">
                          {availableQuestionNumbers.map(num => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setExplanationQuestionNumberFilter(num)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                                explanationQuestionNumberFilter === num
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                              }`}
                            >
                              No. {num}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* MODE 1: RESOURCE CARDS GRID */}
                  {resourceViewMode === 'CARDS' && (
                    <div>
                      {studentResourceCardsList.length === 0 ? (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
                          <BookOpen className="w-12 h-12 text-slate-400 mx-auto" />
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                            Belum Ada Tautan Sumber Belajar
                          </h4>
                          <p className="text-xs text-slate-500 max-w-md mx-auto">
                            Belum ada tautan YouTube atau PDF yang dipublikasikan untuk filter yang dipilih.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {studentResourceCardsList.map(item => {
                            const exp = item.exp;
                            const targetQuestion = allQuestions.find(q => q.id === exp.questionId);
                            const expSubj = allSubjects.find(s => isMatchExpSub(exp.subjectId, s.id));

                            return (
                              <ResourceCard
                                key={item.id}
                                id={item.id}
                                type={item.type}
                                title={item.title}
                                url={item.url}
                                fileName={item.fileName}
                                fileSize={item.fileSize}
                                subjectName={expSubj?.name}
                                subjectCode={expSubj?.code}
                                tryoutCode={exp.tryoutId}
                                authorName={exp.authorName}
                                status={exp.status}
                                description={exp.contentText}
                                questionCode={targetQuestion?.uniqueCode}
                                questionNumbers={exp.questionNumbers}
                                onPreview={(url, title) => {
                                  setSelectedVideoUrl(url);
                                  setSelectedVideoTitle(title);
                                }}
                                isTeacherView={false}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* MODE 2: GROUPED EXPLANATION MODULES */}
                  {resourceViewMode === 'MODULES' && (
                    <div>
                      {filteredExplanations.length === 0 ? (
                        <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
                          <BookOpen className="w-12 h-12 text-slate-400 mx-auto" />
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                            Belum Ada Modul Terpublikasi
                          </h4>
                          <p className="text-xs text-slate-500 max-w-md mx-auto">
                            Bapak/Ibu guru belum mempublikasikan modul pembahasan untuk mata pelajaran ini pada paket {activeTryout?.code || 'Try Out'}.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {filteredExplanations.map(exp => {
                            const question = allQuestions.find(q => q.id === exp.questionId);
                            const expSubj = allSubjects.find(s => isMatchExpSub(exp.subjectId, s.id));

                            return (
                              <div
                                key={exp.id}
                                className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4 transition-colors hover:border-indigo-300 dark:hover:border-indigo-800"
                              >
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg border font-mono bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">
                                        {expSubj ? `${expSubj.name} (${expSubj.code})` : 'Umum'}
                                      </span>
                                      {exp.questionNumbers && exp.questionNumbers.length > 0 && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1 font-mono">
                                          Soal No: {exp.questionNumbers.slice().sort((a, b) => a - b).join(', ')}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      <span>RESMI GURU</span>
                                    </span>
                                  </div>

                                  <div>
                                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                                      {exp.title}
                                    </h4>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                      Disusun oleh: <strong className="text-slate-700 dark:text-slate-300">{exp.authorName || 'Guru Mata Pelajaran'}</strong>
                                    </p>
                                  </div>

                                  {exp.contentText && (
                                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-normal whitespace-pre-line line-clamp-3">
                                      {exp.contentText}
                                    </div>
                                  )}

                                  <div className="space-y-2 pt-1">
                                    {exp.youtubeUrl && (
                                      <ResourceCard
                                        type="YOUTUBE"
                                        title={`Video Solusi: ${exp.title}`}
                                        url={exp.youtubeUrl}
                                        subjectName={expSubj?.name}
                                        subjectCode={expSubj?.code}
                                        tryoutCode={exp.tryoutId}
                                        questionCode={question?.uniqueCode}
                                        questionNumbers={exp.questionNumbers}
                                        onPreview={(url, title) => {
                                          setSelectedVideoUrl(url);
                                          setSelectedVideoTitle(title);
                                        }}
                                        isTeacherView={false}
                                      />
                                    )}

                                    {exp.pdfUrl && (
                                      <ResourceCard
                                        type="PDF"
                                        title={`Modul PDF: ${exp.title}`}
                                        url={exp.pdfUrl}
                                        fileName={exp.pdfFileName || 'Modul_Solusi_Resmi.pdf'}
                                        fileSize={exp.pdfFileSize}
                                        subjectName={expSubj?.name}
                                        subjectCode={expSubj?.code}
                                        tryoutCode={exp.tryoutId}
                                        questionCode={question?.uniqueCode}
                                        questionNumbers={exp.questionNumbers}
                                        isTeacherView={false}
                                      />
                                    )}
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                                  <span>Diperbarui: {new Date(exp.updatedAt).toLocaleDateString('id-ID')}</span>
                                  <span>Paket: {exp.tryoutId.toUpperCase()}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* VIDEO PLAYER MODAL WITH YOUTUBE NO-COOKIE EMBED */}
      {selectedVideoUrl && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 transition-colors animate-fade-in space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600">
                  <Youtube className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-md">
                    {selectedVideoTitle || 'Video Pembahasan Soal Resmi Guru'}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Official Video Player
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedVideoUrl(null)}
                className="px-2.5 py-1 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer transition-colors"
              >
                Tutup
              </button>
            </div>

            <div className="aspect-video bg-black rounded-2xl overflow-hidden shadow-inner relative">
              {getYouTubeEmbedUrl(selectedVideoUrl) ? (
                <iframe
                  src={getYouTubeEmbedUrl(selectedVideoUrl)!}
                  title={selectedVideoTitle || 'Video Pembahasan'}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-white text-xs p-6 space-y-3">
                  <Youtube className="w-12 h-12 text-rose-500" />
                  <p className="text-slate-300">Format video khusus, silakan buka langsung di YouTube:</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Disusun oleh Guru Mata Pelajaran
              </span>
              <a
                href={selectedVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold transition-colors text-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka di Aplikasi YouTube</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
