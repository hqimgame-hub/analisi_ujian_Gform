import React, { useState, useEffect, useMemo } from 'react';
import {
  School, Users, TrendingUp, Download, CheckCircle2, AlertTriangle,
  BookOpen, Search, ArrowRight, Award, FileSpreadsheet, Key, ChevronRight,
  ShieldCheck, RefreshCw, Phone, Mail, UserCheck, Calendar, Filter, HelpCircle,
  ArrowUp, ArrowDown, Activity, Save, BarChart3, Info, GraduationCap, SlidersHorizontal, Eye, X,
  ShieldAlert
} from 'lucide-react';
import { dbService } from '../services/database';
import { ExportService } from '../services/export';
import { User, Student, ClassRoom, Subject, Score, Tryout, ExamPackage } from '../types/database';
import { WaliKelasLegerSection } from '../components/walikelas/WaliKelasLegerSection';
import { SumatifAnalyticsService } from '../services/sumatifAnalytics';
import {
  buildTryoutStageGroups,
  getStudentStageSubjectScore,
  getStudentStageCompositeScore,
  extractSubjectScoreFromScoreRecord,
  TryoutStageGroup,
} from '../utils/tryoutGroupUtils';

interface WaliKelasAppPageProps {
  currentUser: User;
  onNavigate: (path: string) => void;
}

type WaliKelasTab =
  | 'OVERVIEW'
  | 'TRYOUT_EVALUATION'
  | 'SUMATIF_LEGER';

type WalasToSubTab = 'PROGRESS' | 'GRADEBOOK' | 'LEGER_TO';
type WalasSumatifSubTab = 'OVERVIEW_RISK' | 'LEGER_TABLE' | 'NOTES_EXPORT';

export const WaliKelasAppPage: React.FC<WaliKelasAppPageProps> = ({
  currentUser: initialUser,
  onNavigate,
}) => {
  const [currentUser, setCurrentUser] = useState<User>(initialUser);
  const [activeTab, setActiveTab] = useState<WaliKelasTab>('OVERVIEW');
  const [walasToSubTab, setWalasToSubTab] = useState<WalasToSubTab>('PROGRESS');
  const [walasSumatifSubTab, setWalasSumatifSubTab] = useState<WalasSumatifSubTab>('LEGER_TABLE');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('s-1');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('ALL');
  const [selectedPassFailTO, setSelectedPassFailTO] = useState<string>('TO 4');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filter States for Buku Nilai Siswa (GRADEBOOK)
  const [gradebookTO, setGradebookTO] = useState<string>('ALL');
  const [gradebookSubject, setGradebookSubject] = useState<string>('ALL');
  const [gradebookStatusFilter, setGradebookStatusFilter] = useState<'ALL' | 'PASS' | 'REMEDIAL'>('ALL');
  const [gradebookSortBy, setGradebookSortBy] = useState<'NAME' | 'SCORE_DESC' | 'SCORE_ASC'>('NAME');
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<Student | null>(null);

  // Wali Kelas Notes State per student ID
  const [waliNotes, setWaliNotes] = useState<Record<string, string>>({});
  const [selectedTryoutId, setSelectedTryoutId] = useState<string>('');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');

  // Local Reactive Database States
  const [teachers, setTeachers] = useState(dbService.getTeachers());
  const [classes, setClasses] = useState(dbService.getClasses());
  const [allStudents, setAllStudents] = useState(dbService.getStudents());
  const [allSubjects, setAllSubjects] = useState(dbService.getSubjects());
  const [allScores, setAllScores] = useState(dbService.getScores());
  const [rawTryouts, setRawTryouts] = useState(dbService.getTryouts());

  // Subscribe to real-time database changes from Supabase / localStorage
  useEffect(() => {
    const refreshData = () => {
      setTeachers(dbService.getTeachers());
      setClasses(dbService.getClasses());
      setAllStudents(dbService.getStudents());
      setAllSubjects(dbService.getSubjects());
      setAllScores(dbService.getScores());
      setRawTryouts(dbService.getTryouts());
    };
    refreshData();
    return dbService.subscribe(refreshData);
  }, []);

  const teacherObj = teachers.find(t =>
    (t.userId && t.userId === currentUser.id) ||
    (t.email && currentUser.email && t.email.toLowerCase() === currentUser.email.toLowerCase()) ||
    (t.nip && (currentUser as any).nip && t.nip === (currentUser as any).nip)
  );

  // Resolve assigned class properly without hardcoding
  const assignedClass = classes.find(c =>
    (teacherObj?.homeRoomClassId && c.id === teacherObj.homeRoomClassId) ||
    (teacherObj?.id && c.homeRoomTeacherId === teacherObj.id)
  ) || classes[0] || {
    id: '',
    name: 'Belum Ditetapkan',
    gradeLevel: '-',
    academicYearId: '',
    homeRoomTeacherId: '',
  };

  const assignedClassId = assignedClass.id;

  // Dapatkan KKM acuan dari mata pelajaran di Admin
  const rombelKKM = useMemo(() => {
    if (allSubjects.length === 0) return 75.0;
    // Rata-rata KKM dari seluruh mata pelajaran aktif yang diatur Admin
    const validKKMs = allSubjects.map(s => Number(s.passingGrade) || 75.0);
    return Math.round((validKKMs.reduce((a, b) => a + b, 0) / validKKMs.length) * 10) / 10;
  }, [allSubjects]);

  // Scoped Tryouts: Hanya tryout (per-mapel) yang menargetkan kelas binaan wali kelas
  const classScopedTryouts = useMemo(() => {
    return rawTryouts.filter(t => {
      if (!assignedClassId) return true;
      if (t.packageId) {
        const pkg = dbService.getExamPackageById(t.packageId);
        if (pkg) {
          if (pkg.targetClassIds && pkg.targetClassIds.length > 0) {
            return pkg.targetClassIds.includes(assignedClassId);
          }
          if (pkg.targetGrades && pkg.targetGrades.length > 0) {
            return pkg.targetGrades.includes(assignedClass.gradeLevel);
          }
          return false;
        }
      }
      if (t.targetClassIds && t.targetClassIds.length > 0) {
        return t.targetClassIds.includes(assignedClassId);
      }
      return true;
    });
  }, [rawTryouts, assignedClassId, assignedClass.gradeLevel]);

  // Siklus Try Out (TO 1, TO 2, TO 3, ...) sesuai pengelompokan yang dikontrol Guru Mapel.
  // Pengelompokan dihitung dari SELURUH tryout agar konsisten dengan tampilan Guru Mapel & Siswa,
  // kemudian anggota tiap siklus disaring ke tryout yang menargetkan rombel ini.
  const tryoutStageGroups = useMemo<TryoutStageGroup[]>(() => {
    const scopedIds = new Set(classScopedTryouts.map(t => t.id));
    return buildTryoutStageGroups(rawTryouts, dbService.getExamPackages())
      .map(stage => {
        const members = stage.tryouts.filter(t => scopedIds.has(t.id));
        const subjectTryoutMap: Record<string, Tryout> = {};
        Object.entries(stage.subjectTryoutMap).forEach(([sid, t]) => {
          if (scopedIds.has(t.id)) subjectTryoutMap[sid] = t;
        });
        return { ...stage, tryouts: members, subjectTryoutMap };
      })
      .filter(stage => stage.tryouts.length > 0);
  }, [rawTryouts, classScopedTryouts]);

  // Wadah Ujian terdaftar untuk rombel binaan ini (SAS / SAT / TO)
  const packagesForWalas = useMemo(() => {
    const list = dbService.getExamPackagesForWaliKelas(assignedClassId);
    if (list.length > 0) return list;
    return dbService.getExamPackages().filter(pkg => {
      if (pkg.targetClassIds && pkg.targetClassIds.length > 0) {
        return pkg.targetClassIds.includes(assignedClassId);
      }
      if (pkg.targetGrades && pkg.targetGrades.length > 0 && assignedClass.gradeLevel) {
        return pkg.targetGrades.includes(assignedClass.gradeLevel);
      }
      return false;
    });
  }, [assignedClassId, assignedClass.gradeLevel, rawTryouts]);

  const sumatifPackagesForWalas = useMemo(() => {
    return packagesForWalas.filter(pkg => pkg.assessmentType === 'SAS' || pkg.assessmentType === 'SAT');
  }, [packagesForWalas]);

  useEffect(() => {
    if (sumatifPackagesForWalas.length > 0) {
      if (!selectedPackageId || !sumatifPackagesForWalas.some(p => p.id === selectedPackageId)) {
        setSelectedPackageId(sumatifPackagesForWalas[0].id);
      }
    }
  }, [sumatifPackagesForWalas, selectedPackageId]);

  const activePackage = useMemo(() => {
    if (selectedPackageId) {
      return sumatifPackagesForWalas.find(p => p.id === selectedPackageId) || packagesForWalas.find(p => p.id === selectedPackageId);
    }
    return sumatifPackagesForWalas[0] || undefined;
  }, [selectedPackageId, sumatifPackagesForWalas, packagesForWalas]);

  const isSumatifActive = activePackage?.assessmentType === 'SAS' || activePackage?.assessmentType === 'SAT';

  const sumatifLeger = useMemo(() => {
    if (!activePackage || !isSumatifActive) return null;
    return SumatifAnalyticsService.calculateWaliKelasLeger(
      assignedClassId,
      activePackage,
      allStudents,
      classes,
      allScores,
      allSubjects
    );
  }, [activePackage, isSumatifActive, assignedClassId, allStudents, classes, allScores, allSubjects]);

  const stageGroupMap = useMemo(() => {
    const map: Record<string, TryoutStageGroup> = {};
    tryoutStageGroups.forEach(stage => { map[stage.groupKey] = stage; });
    return map;
  }, [tryoutStageGroups]);

  // Representasi siklus TO sebagai objek "Tryout" agar seluruh tab (grafik, buku nilai, modal, leger)
  // menampilkan kolom TO 1, TO 2, TO 3 dengan mapel MAT & BIN berdampingan.
  const allTryouts = useMemo<Tryout[]>(() => {
    return tryoutStageGroups.map(stage => {
      const subjectCodes = Array.from(new Set(
        Object.keys(stage.subjectTryoutMap)
          .map(sid => allSubjects.find(s => s.id === sid)?.code)
          .filter((c): c is string => !!c)
      ));
      return {
        ...stage.tryouts[0],
        id: stage.groupKey,
        code: stage.groupKey,
        title: subjectCodes.length > 0 ? `${stage.title} (${subjectCodes.join(', ')})` : stage.title,
        startDate: stage.startDate,
        endDate: stage.endDate,
      };
    });
  }, [tryoutStageGroups, allSubjects]);

  // Filter students strictly in homeroom class (excluding answer key accounts)
  const activeStudentList = useMemo(() => {
    if (!assignedClassId) return [];
    return allStudents.filter(s => s.classId === assignedClassId && !s.isAnswerKeyAccount);
  }, [allStudents, assignedClassId]);

  // Helper function to lookup student score safely across all tabs.
  // `toId` dapat berupa kunci siklus ("TO 1", "TO 2", ...) atau ID tryout spesifik.
  // Tidak lagi menggunakan fallback calculatedScore lintas mapel (mencegah nilai MAT terbaca sebagai BIN).
  const getStudentSubjectScore = (studentId: string, toId: string, subjId: string): number | null => {
    const subj = allSubjects.find(s => s.id === subjId);
    if (!subj) return null;

    const stage = stageGroupMap[toId];
    if (stage) {
      return getStudentStageSubjectScore(studentId, subj, stage, allScores);
    }

    const rawTryout = rawTryouts.find(t => t.id === toId);
    if (!rawTryout) return null;
    const foundScore = allScores.find(sc => sc.studentId === studentId && sc.tryoutId === toId);
    return extractSubjectScoreFromScoreRecord(foundScore, rawTryout, subj);
  };

  const filteredStudents = activeStudentList.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.nisn.includes(searchQuery)
  );

  const triggerToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };


  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors min-h-full">
      
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-emerald-700 flex items-center gap-2 text-xs font-semibold animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Wali Kelas Main Container */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-grow">
        
        {/* Top Header Lockup & Switcher Bar */}
        <header className="bg-gradient-to-r from-emerald-900 via-slate-900 to-teal-950 text-white p-6 rounded-3xl shadow-xl border border-emerald-800/80 relative overflow-hidden space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider font-mono">
                <School className="w-4 h-4 text-emerald-400" />
                <span>Dashboard</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white mt-1 tracking-tight">
                Monitoring Nilai &amp; Performa Kelas {assignedClass.name}
              </h1>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed mt-1">
                Wali Kelas: <strong>{currentUser.name}</strong> · Total <strong>{activeStudentList.length} Siswa</strong> · KKM Acuan: <strong>{rombelKKM.toFixed(1)} Poin</strong>
              </p>
            </div>

            {/* Quick Action */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Excel Export Leger */}
              <button
                type="button"
                onClick={() => {
                  try {
                    ExportService.exportWaliKelasLegerExcel({
                      className: assignedClass.name,
                      waliKelasName: currentUser.name,
                      kkm: rombelKKM,
                      subjects: allSubjects,
                      students: activeStudentList,
                      getStudentScore: (studentId, subjectId) => {
                        const targetTOId = selectedTryoutId || (allTryouts[0]?.id ?? '');
                        return getStudentSubjectScore(studentId, targetTOId, subjectId);
                      },
                      waliNotes,
                    });
                    triggerToast(`Leger Nilai Multimapel ${assignedClass.name} berhasil diekspor ke Excel (.xlsx).`);
                  } catch (err) {
                    console.error('Failed to export Leger Excel:', err);
                    triggerToast('Gagal mengekspor Leger Excel.');
                  }
                }}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs rounded-xl border border-emerald-500/40 shadow-xs flex items-center gap-2 cursor-pointer transition-colors"
                title="Unduh Leger Nilai Multimapel Kelas dalam Format Excel (.xlsx) yang rapi"
              >
                <Download className="w-4 h-4" />
                <span>Ekspor Leger Nilai (Excel)</span>
              </button>
            </div>
          </div>
        </header>

        {/* Tab Navigation Menu */}
        <div className="bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveTab('OVERVIEW')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'OVERVIEW'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <School className="w-4 h-4" />
              <span>1. Rombel &amp; Siswa</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === 'OVERVIEW' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}>
                {activeStudentList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('TRYOUT_EVALUATION')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'TRYOUT_EVALUATION'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>2. Evaluasi Try Out</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === 'TRYOUT_EVALUATION' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}>
                {allTryouts.length} Siklus
              </span>
            </button>

            <button
              onClick={() => setActiveTab('SUMATIF_LEGER')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'SUMATIF_LEGER'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>3. Leger Asesmen Sumatif (SAS/SAT)</span>
              {sumatifPackagesForWalas.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  activeTab === 'SUMATIF_LEGER' ? 'bg-white/20 text-white' : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                }`}>
                  {sumatifPackagesForWalas.length} Wadah
                </span>
              )}
            </button>
          </div>

          <div className="relative shrink-0 w-full md:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari siswa / NISN..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

        {/* TAB 1: OVERVIEW RINGKASAN ROMBEL */}
        {activeTab === 'OVERVIEW' && (() => {
          // Calculate real metrics from scores
          const classScores = allScores.filter(sc => activeStudentList.some(st => st.id === sc.studentId));
          const hasScores = classScores.length > 0;
          const avgScore = hasScores
            ? Math.round((classScores.reduce((acc, sc) => acc + (sc.calculatedScore || 0), 0) / classScores.length) * 10) / 10
            : null;
          const passingStudentsCount = activeStudentList.filter(st => {
            const stScores = classScores.filter(sc => sc.studentId === st.id);
            if (stScores.length === 0) return false;
            const stAvg = stScores.reduce((acc, sc) => acc + (sc.calculatedScore || 0), 0) / stScores.length;
            return stAvg >= rombelKKM;
          }).length;
          const passPercentage = activeStudentList.length > 0 && hasScores
            ? Math.round((passingStudentsCount / activeStudentList.length) * 100)
            : null;
          const needSupportCount = activeStudentList.filter(st => {
            const stScores = classScores.filter(sc => sc.studentId === st.id);
            if (stScores.length === 0) return false;
            const stAvg = stScores.reduce((acc, sc) => acc + (sc.calculatedScore || 0), 0) / stScores.length;
            return stAvg < rombelKKM;
          }).length;

          return (
            <div className="space-y-6">
              {/* Metric Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Siswa</span>
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-black text-slate-900 dark:text-white font-mono">
                    {activeStudentList.length} <span className="text-xs font-normal text-slate-500">Siswa</span>
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Aktif di Rombel {assignedClass.name}</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Rata-Rata Rombel</span>
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                    {avgScore !== null ? avgScore : '—'} <span className="text-xs font-normal text-slate-500">{avgScore !== null ? 'Poin' : 'Belum ada data'}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    {hasScores ? 'Berdasarkan hasil tryout aktif' : 'Menunggu sinkronisasi nilai'}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tuntas KKM (&ge; {rombelKKM.toFixed(1)})</span>
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                      <Award className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-black text-slate-900 dark:text-white font-mono">
                    {passPercentage !== null ? `${passPercentage}%` : '—'} <span className="text-xs font-normal text-slate-500">{passPercentage !== null ? 'Persentase' : ''}</span>
                  </div>
                  <div className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{hasScores ? `${passingStudentsCount} dari ${activeStudentList.length} siswa tuntas` : 'Belum ada data nilai'}</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-rose-200 dark:border-rose-900/60 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">Perlu Pendampingan</span>
                    <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-black text-rose-600 dark:text-rose-400 font-mono">
                    {hasScores ? needSupportCount : '—'} <span className="text-xs font-normal text-slate-500">{hasScores ? 'Siswa' : ''}</span>
                  </div>
                  <div className="text-[11px] text-rose-600 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{hasScores ? `${needSupportCount} siswa di bawah KKM` : 'Belum ada data nilai'}</span>
                  </div>
                </div>
              </div>

              {/* Quick Overview Sections */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column: Trajectory Chart Preview */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        <span>Grafik Perkembangan Nilai Rombel {assignedClass.name}</span>
                      </h3>
                      <p className="text-xs text-slate-500">Perkembangan rata-rata kelas di setiap tahapan TryOut</p>
                    </div>
                    <button
                      onClick={() => {
                        setActiveTab('TRYOUT_EVALUATION');
                        setWalasToSubTab('PROGRESS');
                      }}
                      className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Detail Grafik</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>

                  {allTryouts.length === 0 || !hasScores ? (
                    <div className="p-12 text-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                      <TrendingUp className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 stroke-[1.5]" />
                      <div className="font-semibold text-slate-700 dark:text-slate-300 text-sm">Grafik Belum Tersedia</div>
                      <p className="text-xs max-w-sm mx-auto">
                        Grafik perkembangan rombel akan terbentuk otomatis setelah guru mapel membuat paket tryout dan mengimpor nilai dari Google Sheet.
                      </p>
                    </div>
                  ) : (
                    <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                      <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                        <span className="text-amber-600 dark:text-amber-400 font-bold">Garis KKM: {rombelKKM.toFixed(1)} Poin</span>
                        <span className="text-emerald-600 font-bold">Data Riil Supabase</span>
                      </div>
                      <div className="h-44 flex items-center justify-center text-xs text-slate-500">
                        {allTryouts.length} Siklus Try Out (TO 1, TO 2, …) terdaftar
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Early Warning System */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>Perhatian Wali Kelas</span>
                    </h3>
                    <p className="text-xs text-slate-500">Daftar siswa dalam rombel binaan</p>
                  </div>

                  {activeStudentList.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      Belum ada siswa yang dialokasikan ke kelas ini oleh Admin.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-64 overflow-y-auto">
                      {activeStudentList.slice(0, 5).map((s) => (
                        <div key={s.id} className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-900 dark:text-slate-100">{s.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">NISN: {s.nisn} · NIS: {s.nis || '-'}</div>
                          </div>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {assignedClass.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setActiveTab('TRYOUT_EVALUATION');
                      setWalasToSubTab('LEGER_TO');
                    }}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer text-center"
                  >
                    Buka Leger Multimapel Lengkap &rarr;
                  </button>
                </div>

              </div>

              {/* Direktori Siswa Rombel Terintegrasi */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Users className="w-5 h-5 text-emerald-600" />
                      <span>Direktori Siswa Rombel {assignedClass.name}</span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      Daftar data pokok dan akun siswa binaan wali kelas sesuai master data dari Admin.
                    </p>
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl self-start sm:self-auto">
                    Total: {filteredStudents.length} Siswa
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredStudents.map(s => (
                    <div key={s.id} className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-bold text-sm">
                          {s.name.charAt(0)}
                        </div>
                        <span className="text-[11px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-lg">
                          NISN: {s.nisn}
                        </span>
                      </div>

                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{s.name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-1 font-mono">
                          <School className="w-3.5 h-3.5 text-slate-400" />
                          <span>Rombel: {assignedClass.name}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Tgl Lahir (Password):</span>
                          </span>
                          <strong className="font-mono text-slate-900 dark:text-slate-100">{s.birthDate || '14/05/2008'}</strong>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => setSelectedStudentDetail(s)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Lihat Rekam Jejak</span>
                        </button>

                        <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Aktif</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* TAB 2: EVALUASI TRY OUT (HUB TERPADU) */}
        {activeTab === 'TRYOUT_EVALUATION' && (
          <div className="space-y-6">
            {/* Sub-Navigasi Horizontal untuk Try Out */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setWalasToSubTab('PROGRESS')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    walasToSubTab === 'PROGRESS'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>1. Grafik Siklus TO</span>
                </button>

                <button
                  type="button"
                  onClick={() => setWalasToSubTab('GRADEBOOK')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    walasToSubTab === 'GRADEBOOK'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>2. Buku Nilai Siswa TO</span>
                </button>

                <button
                  type="button"
                  onClick={() => setWalasToSubTab('LEGER_TO')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    walasToSubTab === 'LEGER_TO'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>3. Leger Nilai &amp; Catatan TO</span>
                </button>
              </div>

              <div className="text-[11px] font-mono text-slate-500 px-2">
                Rombel: <strong>{assignedClass.name}</strong> · KKM Acuan: <strong>{rombelKKM.toFixed(1)} Poin</strong>
              </div>
            </div>

            {/* Sub-Tab 1: Grafik Perkembangan Try Out */}
            {walasToSubTab === 'PROGRESS' && (() => {
          // Hitung rata-rata rombel per Siklus TO (TO 1, TO 2, ...):
          // - "Semua Mapel": rata-rata gabungan (komposit) mapel tiap siswa pada siklus tsb.
          // - Mapel tertentu: rata-rata nilai mapel tsb pada siklus tsb.
          const tryoutProgressData = allTryouts.map((to) => {
            const stage = stageGroupMap[to.id];
            const values: number[] = [];
            activeStudentList.forEach(st => {
              if (selectedSubjectFilter === 'ALL') {
                if (!stage) return;
                const res = getStudentStageCompositeScore(st.id, stage, allSubjects, allScores);
                if (res.compositeScore !== null) values.push(res.compositeScore);
              } else {
                const v = getStudentSubjectScore(st.id, to.id, selectedSubjectFilter);
                if (v !== null) values.push(v);
              }
            });
            const avgScore = values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length) : null;
            return {
              tryout: to,
              avgScore,
              totalRecords: values.length,
            };
          });

          const hasProgressData = tryoutProgressData.some(d => d.avgScore !== null);

          // Subject-by-subject data (nilai mapel dibaca per siklus TO, tanpa mencampur mapel lain)
          const subjectBreakdown = allSubjects.map(sub => {
            const subKKM = Number(sub.passingGrade) || 75.0;
            const allSubjValues: number[] = [];
            const toAvgs = allTryouts.map(to => {
              const vals = activeStudentList
                .map(st => getStudentSubjectScore(st.id, to.id, sub.id))
                .filter((v): v is number => v !== null);
              allSubjValues.push(...vals);
              const avg = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
              const passCount = vals.filter(v => v >= subKKM).length;
              const failCount = vals.filter(v => v < subKKM).length;
              return { tryoutId: to.id, avg, passCount, failCount, total: vals.length };
            });

            const overallPass = allSubjValues.filter(v => v >= subKKM).length;
            const overallFail = allSubjValues.filter(v => v < subKKM).length;

            return {
              subject: sub,
              subKKM,
              toAvgs,
              overallPass,
              overallFail,
              totalScores: allSubjValues.length
            };
          });

          return (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 sm:space-y-6">
                
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                  <div>
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider font-mono">
                      <TrendingUp className="w-4 h-4" />
                      <span>Grafik Perkembangan TryOut</span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
                      Progres Nilai TryOut Rombel {assignedClass.name}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Evaluasi perkembangan rata-rata nilai rombel per siklus Try Out (TO 1, TO 2, TO 3, …). "Semua Mapel" menampilkan rata-rata gabungan seluruh mapel pada tiap siklus.
                    </p>
                  </div>

                  {allSubjects.length > 0 && (
                    <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-semibold overflow-x-auto flex-nowrap sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => setSelectedSubjectFilter('ALL')}
                        className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer shrink-0 ${
                          selectedSubjectFilter === 'ALL'
                            ? 'bg-emerald-600 text-white shadow-xs font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Semua Mapel
                      </button>
                      {allSubjects.map(sub => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setSelectedSubjectFilter(sub.id)}
                          className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                            selectedSubjectFilter === sub.id
                              ? 'bg-emerald-600 text-white shadow-xs font-bold'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {sub.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {!hasProgressData ? (
                  <div className="py-16 text-center bg-slate-50 dark:bg-slate-950 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
                    <TrendingUp className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
                    <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">Belum Ada Riwayat TryOut</h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Grafik tren dan ketuntasan siswa akan muncul otomatis saat guru mata pelajaran melakukan sinkronisasi lembar nilai dari spreadsheet ke paket ujian.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* SVG Trend Area */}
                    <div className="p-3.5 sm:p-6 bg-slate-50/70 dark:bg-slate-950/80 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {selectedSubjectFilter === 'ALL' 
                              ? 'Rata-Rata Multimapel Rombel' 
                              : (allSubjects.find(s => s.id === selectedSubjectFilter)?.name || 'Mata Pelajaran')}
                          </span>
                          <span className="text-[11px] text-slate-400">· Standar KKM {
                            selectedSubjectFilter === 'ALL'
                              ? `${rombelKKM.toFixed(1)} Poin`
                              : `${(allSubjects.find(s => s.id === selectedSubjectFilter)?.passingGrade ?? 75).toFixed(1)} Poin`
                          }</span>
                        </div>
                      </div>

                      {/* Petunjuk Geser di Layar HP */}
                      <div className="flex sm:hidden items-center justify-between text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-200/70 dark:border-emerald-800/70 px-3 py-1.5 rounded-xl">
                        <span>Geser grafik ke samping untuk melihat detail tiap TO</span>
                        <span className="font-mono font-bold">↔ Geser</span>
                      </div>

                      {/* SVG Canvas */}
                      <div className="relative w-full mobile-chart-scroll bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs">
                        {(() => {
                          const validPoints = tryoutProgressData
                            .map((d, idx) => ({
                              label: d.tryout.code || d.tryout.title,
                              score: d.avgScore ?? 0,
                              hasScore: d.avgScore !== null,
                              idx
                            }))
                            .filter(d => d.hasScore);

                          if (validPoints.length === 0) return null;

                          const width = 1000;
                          const paddingX = 80;
                          const stepX = validPoints.length > 1 ? (width - paddingX * 2) / (validPoints.length - 1) : 0;

                          const coords = validPoints.map((p, i) => {
                            const x = validPoints.length === 1 ? width / 2 : paddingX + i * stepX;
                            const y = 260 - ((p.score / 100) * 220);
                            return { ...p, x, y };
                          });

                          const polylinePoints = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

                          return (
                            <svg className="min-w-[600px] sm:min-w-0 w-full h-auto min-h-[215px] sm:min-h-[250px] text-emerald-500 overflow-visible" viewBox="0 0 1000 310" preserveAspectRatio="xMidYMid meet">
                              {/* Horizontal Grid */}
                              <line x1="50" y1="40" x2="950" y2="40" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                              <text x="38" y="45" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-bold">100</text>

                              {/* KKM Line dynamic */}
                              {(() => {
                                const targetKKM = selectedSubjectFilter === 'ALL'
                                  ? rombelKKM
                                  : (allSubjects.find(s => s.id === selectedSubjectFilter)?.passingGrade ?? 75);
                                const yPos = 260 - ((targetKKM / 100) * 220);
                                return (
                                  <>
                                    <line x1="50" y1={yPos} x2="950" y2={yPos} stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="6 4" />
                                    <text x="38" y={yPos + 4} textAnchor="end" className="text-[13px] fill-amber-500 font-mono font-extrabold">
                                      {targetKKM.toFixed(0)}
                                    </text>
                                  </>
                                );
                              })()}

                              <line x1="50" y1="150" x2="950" y2="150" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                              <text x="38" y="155" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-bold">50</text>

                              <line x1="50" y1="260" x2="950" y2="260" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1.5" />
                              <text x="38" y="265" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-bold">0</text>

                              {/* Connecting Line */}
                              {coords.length > 1 ? (
                                <polyline
                                  fill="none"
                                  stroke="#10b981"
                                  strokeWidth="4.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  points={polylinePoints}
                                />
                              ) : coords.length === 1 ? (
                                <line
                                  x1="50"
                                  y1={coords[0].y}
                                  x2="950"
                                  y2={coords[0].y}
                                  stroke="#10b981"
                                  strokeWidth="4"
                                  strokeLinecap="round"
                                  opacity="0.85"
                                />
                              ) : null}

                              {/* Nodes */}
                              {coords.map((pt, i) => (
                                <g key={i}>
                                  <rect x={pt.x - 36} y={pt.y - 36} width="72" height="25" rx="8" className="fill-slate-900 dark:fill-slate-100 shadow-md" />
                                  <text x={pt.x} y={pt.y - 19} textAnchor="middle" className="text-[12.5px] font-mono font-extrabold fill-emerald-400 dark:fill-emerald-700">
                                    {pt.score.toFixed(1)}
                                  </text>
                                  <circle cx={pt.x} cy={pt.y} r="11" fill="#10b981" opacity="0.25" />
                                  <circle cx={pt.x} cy={pt.y} r="6.5" fill="#10b981" stroke="#ffffff" strokeWidth="2.5" />
                                  <text x={pt.x} y="295" textAnchor="middle" className="text-[14px] font-mono font-extrabold fill-slate-600 dark:fill-slate-300">
                                    {pt.label}
                                  </text>
                                </g>
                              ))}
                            </svg>
                          );
                        })()}
                      </div>
                    </div>

                                        {/* Grafik Batang Perbandingan Ketuntasan KKM per Masing-Masing TO */}
                    {(() => {
                      // Hitung data perbandingan kelulusan KKM pada masing-masing tahapan TO
                      const tryoutStagePassFail = allTryouts.map((to) => {
                        const stage = stageGroupMap[to.id];
                        let passCount = 0;
                        let failCount = 0;
                        let evaluatedCount = 0;
                        const targetKKM = selectedSubjectFilter === 'ALL'
                          ? rombelKKM
                          : (allSubjects.find(s => s.id === selectedSubjectFilter)?.passingGrade ?? 75);

                        activeStudentList.forEach(st => {
                          let score: number | null = null;
                          if (selectedSubjectFilter === 'ALL') {
                            if (stage) {
                              const res = getStudentStageCompositeScore(st.id, stage, allSubjects, allScores);
                              score = res.compositeScore;
                            }
                          } else {
                            score = getStudentSubjectScore(st.id, to.id, selectedSubjectFilter);
                          }

                          if (score !== null) {
                            evaluatedCount++;
                            if (score >= targetKKM) {
                              passCount++;
                            } else {
                              failCount++;
                            }
                          }
                        });

                        const passPct = evaluatedCount > 0 ? Math.round((passCount / evaluatedCount) * 100) : 0;
                        const failPct = evaluatedCount > 0 ? (100 - passPct) : 0;

                        return {
                          toId: to.id,
                          label: stage?.title || stage?.groupKey || to.code || to.title,
                          evaluatedCount,
                          passCount,
                          failCount,
                          passPct,
                          failPct,
                        };
                      }).filter(item => item.evaluatedCount > 0);

                      if (tryoutStagePassFail.length === 0) return null;

                      const activeTargetKKM = selectedSubjectFilter === 'ALL'
                        ? rombelKKM
                        : (allSubjects.find(s => s.id === selectedSubjectFilter)?.passingGrade ?? 75);

                      return (
                        <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-5 shadow-xs">
                          {/* Header & Legenda */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                            <div>
                              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider font-mono">
                                <BarChart3 className="w-4 h-4" />
                                <span>Perbandingan Ketuntasan KKM per Tahap Ujian</span>
                              </div>
                              <h3 className="text-base font-black text-slate-900 dark:text-slate-100 mt-1">
                                Rasio Siswa Lulus KKM vs Remedial Lintas Try Out
                              </h3>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Menampilkan perbandingan jumlah dan persentase siswa tuntas (&ge; KKM {activeTargetKKM.toFixed(1)}) vs belum tuntas (&lt; KKM {activeTargetKKM.toFixed(1)}) pada rombel {assignedClass.name}.
                              </p>
                            </div>

                            {/* Legend */}
                            <div className="flex items-center gap-3 text-xs font-mono shrink-0">
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-md bg-emerald-500 inline-block shadow-2xs"></span>
                                <span className="text-slate-700 dark:text-slate-300 font-bold">Tuntas KKM</span>
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-md bg-rose-500 inline-block shadow-2xs"></span>
                                <span className="text-slate-700 dark:text-slate-300 font-bold">Remedial</span>
                              </span>
                            </div>
                          </div>

                          {/* Petunjuk Geser Layar HP */}
                          <div className="flex sm:hidden items-center justify-between text-[11px] font-medium text-slate-500 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                            <span>💡 Geser grafik ke samping jika ada banyak tahapan TO</span>
                            <span className="font-mono font-bold text-emerald-600">↔ Geser</span>
                          </div>

                          {/* Visual Stacked Bar Chart per TO */}
                          <div className="overflow-x-auto pb-2 scrollbar-thin">
                            <div className="min-w-[480px] sm:min-w-0 grid gap-4 items-end" style={{ gridTemplateColumns: `repeat(${tryoutStagePassFail.length}, minmax(110px, 1fr))` }}>
                              {tryoutStagePassFail.map((stageItem, sIdx) => {
                                const prevItem = sIdx > 0 ? tryoutStagePassFail[sIdx - 1] : null;
                                const diffPassPct = prevItem ? stageItem.passPct - prevItem.passPct : null;

                                return (
                                  <div key={stageItem.toId} className="flex flex-col items-center gap-2 group">
                                    {/* Delta vs Previous TO */}
                                    <div className="text-[10px] font-mono font-bold h-5 flex items-center justify-center">
                                      {diffPassPct !== null && (
                                        <span className={`px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                                          diffPassPct > 0 
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                                            : diffPassPct < 0
                                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                        }`}>
                                          {diffPassPct > 0 ? `▲ +${diffPassPct}%` : diffPassPct < 0 ? `▼ ${diffPassPct}%` : '● 0%'}
                                        </span>
                                      )}
                                    </div>

                                    {/* Vertical Stacked Bar */}
                                    <div className="w-full max-w-[85px] sm:max-w-[100px] h-52 sm:h-60 bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-1.5 flex flex-col justify-end border border-slate-200/80 dark:border-slate-800/80 shadow-2xs relative">
                                      {/* Segmen Remedial (Atas) */}
                                      {stageItem.failCount > 0 && (
                                        <div
                                          className="w-full bg-rose-500 hover:bg-rose-600 transition-all rounded-t-xl flex flex-col items-center justify-center text-white overflow-hidden relative cursor-default"
                                          style={{ height: `${stageItem.failPct}%` }}
                                          title={`Remedial: ${stageItem.failCount} Siswa (${stageItem.failPct}%)`}
                                        >
                                          {stageItem.failPct >= 16 && (
                                            <span className="text-[10px] sm:text-[11px] font-mono font-black drop-shadow-xs">
                                              {stageItem.failPct}%
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      {/* Segmen Tuntas (Bawah) */}
                                      {stageItem.passCount > 0 && (
                                        <div
                                          className={`w-full bg-emerald-500 hover:bg-emerald-600 transition-all flex flex-col items-center justify-center text-white overflow-hidden relative cursor-default ${
                                            stageItem.failCount === 0 ? 'rounded-xl' : 'rounded-b-xl border-t border-white/20'
                                          }`}
                                          style={{ height: `${stageItem.passPct}%` }}
                                          title={`Tuntas KKM: ${stageItem.passCount} Siswa (${stageItem.passPct}%)`}
                                        >
                                          {stageItem.passPct >= 16 && (
                                            <span className="text-[10px] sm:text-[11px] font-mono font-black drop-shadow-xs">
                                              {stageItem.passPct}%
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {/* Label TO & Detail Nilai */}
                                    <div className="text-center space-y-0.5 mt-1">
                                      <span className="text-xs font-mono font-extrabold text-slate-800 dark:text-slate-200 block truncate max-w-[100px]">
                                        {stageItem.label}
                                      </span>
                                      <div className="text-[10px] font-mono text-slate-500 flex flex-col">
                                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">{stageItem.passCount} Tuntas</span>
                                        <span className="text-rose-600 dark:text-rose-400 font-bold">{stageItem.failCount} Remedial</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Quick Summary Grid Cards */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs font-mono">
                            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                              <span className="text-[10px] text-slate-400 block">Total Siswa Rombel</span>
                              <strong className="text-sm font-black text-slate-900 dark:text-slate-100">{activeStudentList.length} Siswa</strong>
                            </div>
                            <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/50 dark:border-emerald-900/40">
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block">Ketuntasan Tertinggi</span>
                              <strong className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                                {Math.max(...tryoutStagePassFail.map(t => t.passPct))}%
                              </strong>
                            </div>
                            <div className="p-3 bg-rose-50/70 dark:bg-rose-950/30 rounded-xl border border-rose-200/50 dark:border-rose-900/40">
                              <span className="text-[10px] text-rose-600 dark:text-rose-400 block">Remedial Tertinggi</span>
                              <strong className="text-sm font-black text-rose-700 dark:text-rose-300">
                                {Math.max(...tryoutStagePassFail.map(t => t.failPct))}%
                              </strong>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                              <span className="text-[10px] text-slate-400 block">Tahapan Terdata</span>
                              <strong className="text-sm font-black text-slate-800 dark:text-slate-200">{tryoutStagePassFail.length} Siklus TO</strong>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

{/* Rekapitulasi Per Mapel */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
                      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-emerald-600" />
                          <span>Ringkasan Nilai dan Ketuntasan per Mata Pelajaran</span>
                        </h3>
                      </div>
                      <div className="overflow-auto max-h-[360px] scrollbar-thin">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-mono border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="py-3 px-4 font-bold sticky top-0 left-0 bg-slate-100 dark:bg-slate-950">Mata Pelajaran</th>
                              <th className="py-3 px-4 text-center font-bold">Total Nilai Masuk</th>
                              <th className="py-3 px-4 text-center font-bold">Tuntas (≥ KKM)</th>
                              <th className="py-3 px-4 text-center font-bold">Belum Tuntas (&lt; KKM)</th>
                              <th className="py-3 px-4 text-right font-bold">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                            {subjectBreakdown.map((sb) => {
                              const pctPass = sb.totalScores > 0 ? ((sb.overallPass / sb.totalScores) * 100).toFixed(0) : '0';
                              return (
                                <tr key={sb.subject.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                  <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-slate-100 sticky left-0 bg-white dark:bg-slate-900">
                                    {sb.subject.name}
                                  </td>
                                  <td className="py-3 px-4 text-center text-slate-600 dark:text-slate-400">
                                    {sb.totalScores} nilai
                                  </td>
                                  <td className="py-3 px-4 text-center font-bold text-emerald-600">
                                    {sb.overallPass} ({pctPass}%)
                                  </td>
                                  <td className="py-3 px-4 text-center font-bold text-rose-600">
                                    {sb.overallFail}
                                  </td>
                                  <td className="py-3 px-4 text-right font-sans">
                                    {sb.totalScores === 0 ? (
                                      <span className="text-[11px] text-slate-400">Belum ada data</span>
                                    ) : sb.overallFail === 0 ? (
                                      <span className="text-[11px] text-emerald-700 font-bold">100% Tuntas</span>
                                    ) : (
                                      <span className="text-[11px] text-amber-600 font-bold">Sebagian Remedial</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

            {/* Sub-Tab 2: Buku Nilai Siswa (Gradebook Matrix) */}
            {walasToSubTab === 'GRADEBOOK' && (() => {
          // List of Tryouts — hanya pakai data nyata dari Supabase, tidak ada dummy
          const tryoutOptions = allTryouts;

          // List of Subjects — hanya pakai data nyata
          const subjectOptions = allSubjects;

          // Jika belum ada tryout atau mapel, tampilkan empty state
          if (tryoutOptions.length === 0 || subjectOptions.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-20 text-center text-slate-500 dark:text-slate-400">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 text-slate-400 dark:text-slate-500">
                  <FileSpreadsheet className="w-8 h-8 stroke-[1.5]" />
                </div>
                <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Belum Ada Data Buku Nilai</p>
                <p className="text-xs max-w-sm">
                  Buku nilai akan tersedia setelah Guru Mapel membuat paket tryout dan mengimpor hasil dari Google Sheet.
                  Saat ini belum ada tryout atau mata pelajaran yang terdaftar.
                </p>
              </div>
            );
          }

          // Get overall score for student — returns null jika tidak ada data sama sekali
          const getStudentOverallScore = (studentId: string): number | null => {
            if (gradebookTO !== 'ALL' && gradebookSubject !== 'ALL') {
              return getStudentSubjectScore(studentId, gradebookTO, gradebookSubject);
            }
            if (gradebookTO !== 'ALL') {
              const scores = subjectOptions.map(sub => getStudentSubjectScore(studentId, gradebookTO, sub.id)).filter((v): v is number => v !== null);
              if (scores.length === 0) return null;
              return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
            }
            if (gradebookSubject !== 'ALL') {
              const scores = tryoutOptions.map(t => getStudentSubjectScore(studentId, t.id, gradebookSubject)).filter((v): v is number => v !== null);
              if (scores.length === 0) return null;
              return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
            }
            // All TO & All Subjects grand average
            const allVals: number[] = [];
            tryoutOptions.forEach(t => {
              subjectOptions.forEach(sub => {
                const v = getStudentSubjectScore(studentId, t.id, sub.id);
                if (v !== null) allVals.push(v);
              });
            });
            if (allVals.length === 0) return null;
            return Math.round((allVals.reduce((a, b) => a + b, 0) / allVals.length) * 10) / 10;
          };

          const activeKKM = gradebookSubject !== 'ALL'
            ? (subjectOptions.find(s => s.id === gradebookSubject)?.passingGrade || rombelKKM)
            : rombelKKM;

          // Filter and Sort Students — overall bisa null jika belum ada data
          const processedStudents = filteredStudents
            .map(student => {
              const overall = getStudentOverallScore(student.id);
              const isPassing = overall !== null && overall >= activeKKM;
              return { student, overall, isPassing, hasData: overall !== null };
            })
            .filter(item => {
              if (gradebookStatusFilter === 'PASS') return item.hasData && item.isPassing;
              if (gradebookStatusFilter === 'REMEDIAL') return item.hasData && !item.isPassing;
              return true;
            })
            .sort((a, b) => {
              if (gradebookSortBy === 'SCORE_DESC') return (b.overall ?? -1) - (a.overall ?? -1);
              if (gradebookSortBy === 'SCORE_ASC') return (a.overall ?? 999) - (b.overall ?? 999);
              return a.student.name.localeCompare(b.student.name);
            });

          // Class Statistics — hanya hitung dari siswa yang benar-benar punya data nyata
          const currentScores = processedStudents.filter(p => p.hasData).map(p => p.overall as number);
          const highestScore = currentScores.length > 0 ? Math.max(...currentScores) : 0;
          const lowestScore = currentScores.length > 0 ? Math.min(...currentScores) : 0;
          const avgScore = currentScores.length > 0
            ? Math.round((currentScores.reduce((a, b) => a + b, 0) / currentScores.length) * 10) / 10
            : 0;
          const totalPassing = processedStudents.filter(p => p.isPassing).length;
          const passPercentage = currentScores.length > 0
            ? Math.round((totalPassing / currentScores.length) * 100)
            : 0;

          // Excel Export Handler — ekspor file .xlsx resmi dan rapi
          const handleExportExcel = () => {
            try {
              if (gradebookTO !== 'ALL') {
                const toTitle = tryoutOptions.find(t => t.id === gradebookTO)?.title || gradebookTO;
                ExportService.exportWaliKelasGradebookExcel({
                  className: assignedClass.name,
                  waliKelasName: currentUser.name,
                  title: toTitle,
                  kkm: activeKKM,
                  columns: subjectOptions.map(s => ({
                    id: s.id,
                    label: `${s.name} (KKM ${s.passingGrade || rombelKKM})`,
                  })),
                  students: processedStudents.map(({ student }) => {
                    const scores = subjectOptions.map(s => getStudentSubjectScore(student.id, gradebookTO, s.id));
                    const realScores = scores.filter((v): v is number => v !== null);
                    const avg = realScores.length > 0 ? Number((realScores.reduce((a, b) => a + b, 0) / realScores.length).toFixed(1)) : null;
                    const status = realScores.length > 0 ? (avg! >= activeKKM ? 'TUNTAS' : 'REMEDIAL') : 'BELUM ADA DATA';
                    return { student, scores, avg, status };
                  }),
                });
              } else {
                ExportService.exportWaliKelasGradebookExcel({
                  className: assignedClass.name,
                  waliKelasName: currentUser.name,
                  title: 'Semua Try Out',
                  kkm: activeKKM,
                  columns: tryoutOptions.map(t => ({
                    id: t.id,
                    label: t.code || t.title,
                  })),
                  students: processedStudents.map(({ student }) => {
                    const scores = tryoutOptions.map(t => {
                      const subScores = subjectOptions.map(s => getStudentSubjectScore(student.id, t.id, s.id)).filter((v): v is number => v !== null);
                      return subScores.length > 0 ? Number((subScores.reduce((a, b) => a + b, 0) / subScores.length).toFixed(1)) : null;
                    });
                    const realScores = scores.filter((v): v is number => v !== null);
                    const avg = realScores.length > 0 ? Number((realScores.reduce((a, b) => a + b, 0) / realScores.length).toFixed(1)) : null;
                    const status = realScores.length > 0 ? (avg! >= activeKKM ? 'TUNTAS' : 'REMEDIAL') : 'BELUM ADA DATA';
                    return { student, scores, avg, status };
                  }),
                });
              }
              triggerToast('Buku Nilai berhasil diekspor ke format Excel (.xlsx).');
            } catch (err) {
              console.error('Failed to export Gradebook Excel:', err);
              triggerToast('Gagal mengekspor Buku Nilai Excel.');
            }
          };

          return (
            <div className="space-y-6">
              {/* Header Box & Filter Toolbar */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider">
                      <GraduationCap className="w-4 h-4" />
                      <span>Matriks Buku Nilai Siswa</span>
                    </div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
                      Data Nilai Siswa Kelas {assignedClass.name}
                    </h2>
                    <p className="text-xs text-slate-500 max-w-2xl mt-0.5">
                      Pantau perolehan nilai setiap siswa untuk seluruh tahapan Try Out dan semua mata pelajaran secara transparan. Klik baris siswa untuk rincian lengkap.
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleExportExcel}
                      className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-colors"
                      title="Unduh Buku Nilai Kelas dalam Format Excel (.xlsx) yang rapi"
                    >
                      <Download className="w-4 h-4" />
                      <span>Ekspor Excel (.xlsx)</span>
                    </button>
                  </div>
                </div>

                {/* Dropdown Filters Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
                  {/* Filter Dropdown 1: Try Out */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Pilih Try Out:</span>
                    </label>
                    <select
                      value={gradebookTO}
                      onChange={e => setGradebookTO(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                    >
                      <option value="ALL">Semua Try Out (Rekap Rata-Rata)</option>
                      {tryoutOptions.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.code ? `[${t.code}] ` : ''}{t.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filter Dropdown 2: Mata Pelajaran */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Pilih Mata Pelajaran:</span>
                    </label>
                    <select
                      value={gradebookSubject}
                      onChange={e => setGradebookSubject(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                    >
                      <option value="ALL">Semua Mata Pelajaran (Matriks Lengkap)</option>
                      {subjectOptions.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} (KKM: {s.passingGrade || rombelKKM})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filter Dropdown 3: Status Ketuntasan KKM */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Status Kelulusan:</span>
                    </label>
                    <select
                      value={gradebookStatusFilter}
                      onChange={e => setGradebookStatusFilter(e.target.value as any)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                    >
                      <option value="ALL">Semua Status Siswa</option>
                      <option value="PASS">Hanya Tuntas KKM (≥ {activeKKM})</option>
                      <option value="REMEDIAL">Perlu Bimbingan / Remedial (&lt; {activeKKM})</option>
                    </select>
                  </div>

                  {/* Filter Dropdown 4: Urutkan Berdasarkan */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Urutkan Tampilan:</span>
                    </label>
                    <select
                      value={gradebookSortBy}
                      onChange={e => setGradebookSortBy(e.target.value as any)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                    >
                      <option value="NAME">Nama Siswa (A - Z)</option>
                      <option value="SCORE_DESC">Nilai Tertinggi ke Terendah (Peringkat)</option>
                      <option value="SCORE_ASC">Nilai Terendah ke Tertinggi</option>
                    </select>
                  </div>
                </div>

                {/* KPI Statistik Rombel Sesuai Filter */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-1">
                    <span className="text-[10px] text-slate-500 font-mono uppercase">Rata-Rata Kelas</span>
                    <div className="text-xl font-black text-slate-900 dark:text-white font-mono">{avgScore.toFixed(1)}</div>
                    <p className="text-[11px] text-slate-500">Standar KKM: {activeKKM.toFixed(1)}</p>
                  </div>

                  <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl space-y-1">
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-mono font-bold uppercase">Nilai Tertinggi</span>
                    <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 font-mono">{highestScore.toFixed(1)}</div>
                    <p className="text-[11px] text-emerald-600">Pencapaian terbaik siswa</p>
                  </div>

                  <div className="p-3.5 bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-2xl space-y-1">
                    <span className="text-[10px] text-rose-700 dark:text-rose-300 font-mono font-bold uppercase">Nilai Terendah</span>
                    <div className="text-xl font-black text-rose-700 dark:text-rose-300 font-mono">{lowestScore.toFixed(1)}</div>
                    <p className="text-[11px] text-rose-600">Butuh perhatian wali kelas</p>
                  </div>

                  <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 rounded-2xl space-y-1">
                    <span className="text-[10px] text-indigo-700 dark:text-indigo-300 font-mono font-bold uppercase">Ketuntasan Kelas</span>
                    <div className="text-xl font-black text-indigo-700 dark:text-indigo-300 font-mono">
                      {totalPassing}/{processedStudents.length} ({passPercentage}%)
                    </div>
                    <p className="text-[11px] text-indigo-600">Tuntas di atas KKM</p>
                  </div>
                </div>

                {/* Tabel Interaktif Buku Nilai Siswa (Fixed-Height Scrollable Table Container) */}
                <div className="overflow-auto max-h-[420px] sm:max-h-[520px] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs scrollbar-thin">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider sticky top-0 z-30">
                      <tr>
                        <th className="px-2 py-2 sm:px-3.5 sm:py-3 sticky left-0 z-40 bg-slate-100 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 w-[130px] min-w-[130px] max-w-[140px] sm:w-auto sm:min-w-[200px] sm:max-w-[260px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Nama Siswa
                        </th>

                        {/* Kasus 1: Pilih 1 TO tertentu, tampilkan kolom semua Mapel */}
                        {gradebookTO !== 'ALL' && gradebookSubject === 'ALL' && (
                          <>
                            {subjectOptions.map(sub => (
                              <th key={sub.id} className="px-2 py-2 sm:px-3 sm:py-3 text-center whitespace-nowrap min-w-[70px] sm:min-w-[90px]">
                                {sub.name}
                                <span className="block text-[9px] sm:text-[10px] text-slate-400 font-normal font-mono">KKM {sub.passingGrade || rombelKKM}</span>
                              </th>
                            ))}
                          </>
                        )}

                        {/* Kasus 2: Pilih 1 Mapel tertentu, tampilkan kolom semua TO */}
                        {gradebookSubject !== 'ALL' && gradebookTO === 'ALL' && (
                          <>
                            {tryoutOptions.map(toItem => (
                              <th key={toItem.id} className="px-2 py-2 sm:px-3 sm:py-3 text-center whitespace-nowrap min-w-[70px] sm:min-w-[85px]">
                                {toItem.code || toItem.title}
                              </th>
                            ))}
                          </>
                        )}

                        {/* Kasus 3: Semua TO & Semua Mapel, tampilkan ringkasan per mapel & per TO */}
                        {gradebookTO === 'ALL' && gradebookSubject === 'ALL' && (
                          <>
                            {subjectOptions.map(sub => (
                              <th key={sub.id} className="px-2 py-2 sm:px-3 sm:py-3 text-center whitespace-nowrap min-w-[70px] sm:min-w-[90px]">
                                {sub.name}
                              </th>
                            ))}
                          </>
                        )}

                        {/* Kasus 4: Spesifik 1 TO dan 1 Mapel */}
                        {gradebookTO !== 'ALL' && gradebookSubject !== 'ALL' && (
                          <th className="px-2 py-2 sm:px-3 sm:py-3 text-center whitespace-nowrap min-w-[80px]">
                            Nilai Ujian
                          </th>
                        )}

                        <th className="px-2 py-2 sm:px-3 sm:py-3 text-center whitespace-nowrap min-w-[75px] sm:min-w-[85px]">
                          {gradebookSubject !== 'ALL' && gradebookTO !== 'ALL' ? 'Skor Akhir' : 'Rata-Rata'}
                        </th>
                        <th className="px-2 py-2 sm:px-3 sm:py-3 text-center whitespace-nowrap min-w-[80px] sm:min-w-[95px]">Status KKM</th>
                        <th className="px-2 py-2 sm:px-3 sm:py-3 text-center whitespace-nowrap w-[50px]">Aksi</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {processedStudents.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-12 text-center text-slate-400 italic">
                            Tidak ada siswa yang sesuai dengan kriteria pencarian dan filter status.
                          </td>
                        </tr>
                      ) : (
                        processedStudents.map(({ student, overall, isPassing, hasData }, rankIdx) => {
                          return (
                            <tr
                              key={student.id}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer"
                              onClick={() => setSelectedStudentDetail(student)}
                            >
                              <td className="px-2 py-2 sm:px-3.5 sm:py-3 sticky left-0 z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 w-[130px] min-w-[130px] max-w-[140px] sm:w-auto sm:min-w-[200px] sm:max-w-[260px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] group-hover:bg-slate-50 dark:group-hover:bg-slate-850">
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                  <span className="w-4 sm:w-5 text-center text-[10px] sm:text-[11px] font-mono font-bold text-slate-400 shrink-0">
                                    {rankIdx + 1}.
                                  </span>
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                                      <span className="truncate max-w-[85px] sm:max-w-[170px]" title={student.name}>{student.name}</span>
                                      {overall !== null && overall >= 85 && (
                                        <Award className="w-3 h-3 text-amber-500 inline shrink-0" />
                                      )}
                                    </div>
                                    <div className="text-[9px] sm:text-[10px] font-mono text-slate-500 truncate max-w-[90px] sm:max-w-none">
                                      NISN: {student.nisn}<span className="hidden sm:inline"> · NIS: {student.nis}</span>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Tampilan Nilai Kasus 1: Spesifik 1 TO, Semua Mapel */}
                              {gradebookTO !== 'ALL' && gradebookSubject === 'ALL' && (
                                <>
                                  {subjectOptions.map(sub => {
                                    const val = getStudentSubjectScore(student.id, gradebookTO, sub.id);
                                    const pass = val !== null && val >= (sub.passingGrade || rombelKKM);
                                    return (
                                      <td key={sub.id} className="px-1.5 py-2 sm:px-3 sm:py-3 text-center font-mono font-bold whitespace-nowrap text-[11px] sm:text-xs">
                                        <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg ${val === null ? 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800' : pass ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30'}`}>
                                          {val !== null ? val.toFixed(1) : '—'}
                                        </span>
                                      </td>
                                    );
                                  })}
                                </>
                              )}

                              {/* Tampilan Nilai Kasus 2: Spesifik 1 Mapel, Semua TO */}
                              {gradebookSubject !== 'ALL' && gradebookTO === 'ALL' && (
                                <>
                                  {tryoutOptions.map(toItem => {
                                    const val = getStudentSubjectScore(student.id, toItem.id, gradebookSubject);
                                    const pass = val !== null && val >= activeKKM;
                                    return (
                                      <td key={toItem.id} className="px-1.5 py-2 sm:px-3 sm:py-3 text-center font-mono font-bold whitespace-nowrap text-[11px] sm:text-xs">
                                        <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg ${val === null ? 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800' : pass ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30'}`}>
                                          {val !== null ? val.toFixed(1) : '—'}
                                        </span>
                                      </td>
                                    );
                                  })}
                                </>
                              )}

                              {/* Tampilan Nilai Kasus 3: Semua TO & Semua Mapel (Rata-rata per Mapel) */}
                              {gradebookTO === 'ALL' && gradebookSubject === 'ALL' && (
                                <>
                                  {subjectOptions.map(sub => {
                                    const scores = tryoutOptions.map(t => getStudentSubjectScore(student.id, t.id, sub.id)).filter((v): v is number => v !== null);
                                    const avg = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
                                    const pass = avg !== null && avg >= (sub.passingGrade || 75);
                                    return (
                                      <td key={sub.id} className="px-1.5 py-2 sm:px-3 sm:py-3 text-center font-mono font-bold whitespace-nowrap text-[11px] sm:text-xs">
                                        <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg ${avg === null ? 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800' : pass ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30'}`}>
                                          {avg !== null ? avg.toFixed(1) : '—'}
                                        </span>
                                      </td>
                                    );
                                  })}
                                </>
                              )}

                              {/* Tampilan Nilai Kasus 4: 1 TO & 1 Mapel */}
                              {gradebookTO !== 'ALL' && gradebookSubject !== 'ALL' && (
                                <td className="px-1.5 py-2 sm:px-3 sm:py-3 text-center font-mono font-bold whitespace-nowrap text-[11px] sm:text-xs">
                                  <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg ${overall === null ? 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800' : isPassing ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30'}`}>
                                    {overall !== null ? overall.toFixed(1) : '—'}
                                  </span>
                                </td>
                              )}

                              {/* Kolom Rata-Rata / Skor Akhir */}
                              <td className="px-1.5 py-2 sm:px-3 sm:py-3 text-center font-mono font-black text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/60 rounded text-[11px] sm:text-xs">
                                {overall !== null ? overall.toFixed(1) : <span className="text-slate-400 font-normal text-[10px] sm:text-xs">Belum ada data</span>}
                              </td>

                              {/* Status Badge */}
                              <td className="px-1.5 py-2 sm:px-3 sm:py-3 text-center whitespace-nowrap">
                                <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-full inline-flex items-center gap-1 ${
                                  !hasData
                                    ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                    : isPassing
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                }`}>
                                  {!hasData ? (
                                    <span>BELUM ADA DATA</span>
                                  ) : isPassing ? (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      <span>TUNTAS</span>
                                    </>
                                  ) : (
                                    <>
                                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                                      <span>REMEDIAL</span>
                                    </>
                                  )}
                                </span>
                              </td>

                              {/* Tombol Aksi */}
                              <td className="px-3 py-3 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedStudentDetail(student)}
                                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                                  title="Lihat Rincian Rekam Jejak Nilai"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer Keterangan & Panduan */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-3 gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                      <span>Hijau: Nilai di atas atau sama dengan KKM ({activeKKM})</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                      <span>Merah: Nilai di bawah KKM (Remedial)</span>
                    </span>
                  </div>
                  <div>Menampilkan {processedStudents.length} dari {activeStudentList.length} siswa rombel</div>
                </div>
              </div>

            </div>
          );
        })()}

        {/* Sub-Tab 3: Leger Nilai & Catatan Pembimbing Try Out */}
        {walasToSubTab === 'LEGER_TO' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                    <span>Leger Nilai Multimapel &amp; Catatan Pembimbing Try Out</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Rekapitulasi seluruh nilai mata pelajaran siswa Rombel {assignedClass.name} pada latihan Try Out beserta catatan pembimbing.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {allTryouts.length > 0 && (
                    <select
                      value={selectedTryoutId || (allTryouts[0]?.id ?? '')}
                      onChange={e => setSelectedTryoutId(e.target.value)}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                    >
                      {allTryouts.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.code})
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      try {
                        ExportService.exportWaliKelasLegerExcel({
                          className: assignedClass.name,
                          waliKelasName: currentUser.name,
                          kkm: rombelKKM,
                          subjects: allSubjects,
                          students: activeStudentList,
                          getStudentScore: (studentId, subjectId) => {
                            const targetTOId = selectedTryoutId || (allTryouts[0]?.id ?? '');
                            return getStudentSubjectScore(studentId, targetTOId, subjectId);
                          },
                          waliNotes,
                        });
                        triggerToast(`Leger Nilai Multimapel ${assignedClass.name} berhasil diekspor ke Excel (.xlsx).`);
                      } catch (err) {
                        console.error('Failed to export Leger Excel:', err);
                        triggerToast('Gagal mengekspor Leger Excel.');
                      }
                    }}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs rounded-xl border border-emerald-500/40 shadow-xs flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Ekspor Excel (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerToast('Seluruh catatan Wali Kelas berhasil disimpan.');
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer shrink-0"
                  >
                    <Save className="w-4 h-4" />
                    <span>Simpan Catatan Rapor</span>
                  </button>
                </div>
              </div>

              <div className="overflow-auto max-h-[420px] sm:max-h-[520px] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs scrollbar-thin">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider sticky top-0 z-30">
                    <tr>
                      <th className="px-2 py-2 sm:px-3.5 sm:py-3 sticky top-0 left-0 z-40 bg-slate-100 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 w-[130px] min-w-[130px] max-w-[140px] sm:w-auto sm:min-w-[180px] sm:max-w-[240px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                        Nama Siswa
                      </th>
                      {allSubjects.map(sub => (
                        <th key={sub.id} className="px-1.5 py-2 sm:px-3 sm:py-3 text-center sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 whitespace-nowrap min-w-[65px] sm:min-w-[85px] text-[11px] sm:text-xs">
                          {sub.name}
                        </th>
                      ))}
                      <th className="px-1.5 py-2 sm:px-3 sm:py-3 text-center sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 whitespace-nowrap min-w-[70px] sm:min-w-[80px] text-[11px] sm:text-xs">Rata-Rata</th>
                      <th className="px-1.5 py-2 sm:px-3 sm:py-3 text-center sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 whitespace-nowrap min-w-[80px] sm:min-w-[95px] text-[11px] sm:text-xs">Status Rapor</th>
                      <th className="px-3 py-3 sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 whitespace-nowrap min-w-[200px] text-[11px] sm:text-xs">Catatan Pembimbing Wali Kelas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={allSubjects.length + 4} className="py-8 text-center text-slate-400">
                          Tidak ada siswa dalam rombel ini
                        </td>
                      </tr>
                    ) : filteredStudents.map(s => {
                      const isSelected = selectedStudentId === s.id;
                      const activeTOId = selectedTryoutId || (allTryouts[0]?.id ?? '');
                      const scores = allSubjects.map(subj => getStudentSubjectScore(s.id, activeTOId, subj.id));
                      const validScores = scores.filter((v): v is number => v !== null);
                      const avg = validScores.length > 0 ? (validScores.reduce((a, b) => a + b, 0) / validScores.length) : null;
                      const status = avg !== null ? (avg >= rombelKKM ? 'TUNTAS' : 'REMEDIAL') : 'BELUM ADA DATA';

                      return (
                        <tr key={s.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${isSelected ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''}`}>
                          <td className="px-2 py-2 sm:px-3.5 sm:py-3 sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 w-[130px] min-w-[130px] max-w-[140px] sm:w-auto sm:min-w-[180px] sm:max-w-[240px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                            <div className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[85px] sm:max-w-[170px]" title={s.name}>{s.name}</div>
                            <div className="text-[9px] sm:text-[10px] font-mono text-slate-500 truncate max-w-[90px] sm:max-w-none">NISN: {s.nisn}</div>
                          </td>
                          {scores.map((score, idx) => (
                            <td key={idx} className="px-1.5 py-2 sm:px-3 sm:py-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300 text-[11px] sm:text-xs">
                              {score !== null ? score.toFixed(1) : <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}
                            </td>
                          ))}
                          <td className="px-1.5 py-2 sm:px-3 sm:py-3 text-center font-mono font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 rounded text-[11px] sm:text-xs">
                            {avg !== null ? avg.toFixed(1) : '—'}
                          </td>
                          <td className="px-1.5 py-2 sm:px-3 sm:py-3 text-center whitespace-nowrap">
                            {avg !== null ? (
                              <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded ${
                                status === 'TUNTAS' 
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' 
                                  : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                              }`}>
                                {status}
                              </span>
                            ) : (
                              <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                                BELUM ADA DATA
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={waliNotes[s.id] || ''}
                              onChange={e => setWaliNotes({ ...waliNotes, [s.id]: e.target.value })}
                              placeholder="Ketik catatan pembimbing untuk rapor..."
                              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    )}

    {/* Modal Detail Rekam Jejak Nilai Siswa — di luar semua IIFE agar selalu ter-render */}
    {selectedStudentDetail && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        onClick={() => setSelectedStudentDetail(null)}
      >
        <div
          className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full p-6 space-y-5 animate-in zoom-in-95 duration-200"
          onClick={e => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-xs">
                {selectedStudentDetail.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {selectedStudentDetail.name}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  NISN: {selectedStudentDetail.nisn} · Kelas: {assignedClass.name}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedStudentDetail(null)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Matrix Rincian Semua TO vs Semua Mapel untuk Siswa Ini */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 font-mono">
              Rekam Jejak Seluruh Try Out &amp; Mata Pelajaran
            </h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-950 font-bold text-slate-700 dark:text-slate-300 font-mono">
                  <tr>
                    <th className="p-2.5">Mata Pelajaran</th>
                    {allTryouts.map(t => (
                      <th key={t.id} className="p-2.5 text-center whitespace-nowrap">
                        {t.code || t.title.split('—')[0]}
                      </th>
                    ))}
                    <th className="p-2.5 text-center">Rata-Rata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {allSubjects.map(sub => {
                    const scores = allTryouts.map(t => getStudentSubjectScore(selectedStudentDetail.id, t.id, sub.id));
                    const realScores = scores.filter((v): v is number => v !== null);
                    const avg = realScores.length > 0 ? Math.round((realScores.reduce((a, b) => a + b, 0) / realScores.length) * 10) / 10 : null;
                    return (
                      <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="p-2.5 font-sans font-bold text-slate-900 dark:text-slate-100">
                          {sub.name}
                        </td>
                        {scores.map((val, idx) => {
                          const pass = val !== null && val >= (sub.passingGrade || rombelKKM);
                          return (
                            <td key={idx} className="p-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded font-bold ${val === null ? 'text-slate-400 bg-slate-100 dark:bg-slate-800' : pass ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' : 'text-rose-600 bg-rose-50 dark:bg-rose-950/40'}`}>
                                {val !== null ? val.toFixed(1) : '—'}
                              </span>
                            </td>
                          );
                        })}
                        <td className="p-2.5 text-center font-black text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800">
                          {avg !== null ? avg.toFixed(1) : <span className="text-slate-400 font-normal text-xs">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Catatan Khusus Wali Kelas */}
          <div className="space-y-1.5 p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 font-mono uppercase">
              Catatan Wali Kelas untuk Siswa Ini:
            </span>
            <p className="text-xs text-slate-600 dark:text-slate-400 italic">
              "{waliNotes[selectedStudentDetail.id] || 'Siswa menunjukkan motivasi dan potensi belajar yang konsisten baik.'}"
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setSelectedStudentDetail(null)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl cursor-pointer"
            >
              Tutup Jendela
            </button>
          </div>
        </div>
      </div>
    )}

    {/* TAB 3: LEGER ASESMEN SUMATIF (SAS / SAT) */}
    {activeTab === 'SUMATIF_LEGER' && (
      <div className="space-y-6">
        {sumatifPackagesForWalas.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3 shadow-xs">
            <Award className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto stroke-[1.5]" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              Belum Ada Wadah Asesmen Sumatif (SAS/SAT) untuk Kelas {assignedClass.name}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Halaman ini dikhususkan untuk kompilasi nilai murni skala 0–100 dan buku leger e-Rapor resmi semesteran. Wadah akan aktif secara otomatis begitu Admin membuat wadah SAS atau SAT yang menargetkan rombel {assignedClass.name}.
            </p>
          </div>
        ) : (
          <>
            {/* Top Context Switcher Card */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {activePackage?.assessmentType === 'SAT' ? 'Sumatif Akhir Tahun (SAT)' : 'Sumatif Akhir Semester (SAS)'}
                    </span>
                    <span className="text-xs font-mono text-slate-400">·</span>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      Kelas {assignedClass.name}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
                    {activePackage?.title}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Buku Leger Nilai Sumatif Kelas {assignedClass.name} untuk pengisian nilai e-Rapor, evaluasi ketuntasan KKTP, dan deteksi siswa berisiko.
                  </p>
                </div>

                {/* Switcher Button Group */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Pilih Wadah:</span>
                  <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                    {sumatifPackagesForWalas.map(pkg => {
                      const isSelected = (activePackage?.id === pkg.id);
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          onClick={() => setSelectedPackageId(pkg.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <span>{pkg.assessmentType === 'SAT' ? '📦 SAT' : '📦 SAS'}</span>
                          <span>{pkg.code || pkg.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Sub-Tabs for Sumatif */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setWalasSumatifSubTab('OVERVIEW_RISK')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      walasSumatifSubTab === 'OVERVIEW_RISK'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>1. Ringkasan &amp; Siswa Berisiko</span>
                    {sumatifLeger && sumatifLeger.atRiskStudentsCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
                        {sumatifLeger.atRiskStudentsCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setWalasSumatifSubTab('LEGER_TABLE')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      walasSumatifSubTab === 'LEGER_TABLE'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>2. Leger Nilai Multimapel (0–100) &amp; Ranking</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWalasSumatifSubTab('NOTES_EXPORT')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      walasSumatifSubTab === 'NOTES_EXPORT'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>3. Catatan Rapor &amp; Ekspor Excel</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!sumatifLeger) return;
                      ExportService.exportWaliKelasLegerExcel({
                        className: assignedClass.name,
                        waliKelasName: currentUser.name,
                        kkm: 75,
                        subjects: sumatifLeger.subjects.map(s => ({ id: s.id, name: s.name })),
                        students: allStudents.filter(s => s.classId === assignedClassId && !s.isAnswerKeyAccount),
                        getStudentScore: (sId, subId) => {
                          const row = sumatifLeger.rows.find(r => r.studentId === sId);
                          return row?.scoresBySubjectId[subId] ?? null;
                        },
                        schoolProfile: dbService.getSchoolProfile(),
                        waliNotes,
                      });
                      triggerToast(`Buku Leger ${activePackage?.title} berhasil diekspor ke Excel (.xlsx).`);
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Ekspor Leger Excel</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Sub-Tab Content */}
            {sumatifLeger && (
              <>
                {walasSumatifSubTab === 'OVERVIEW_RISK' && (
                  <div className="space-y-6">
                    {/* Summary Stats Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          Rata-rata Kelas
                        </span>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                            {sumatifLeger.overallClassAverage}
                          </span>
                          <span className="text-xs text-slate-400">/ 100</span>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Rata-rata seluruh mapel
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          Total Siswa
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-2xl font-black text-slate-800 dark:text-slate-100 font-mono">
                            {sumatifLeger.totalStudents}
                          </span>
                          <Users className="w-4 h-4 text-slate-400" />
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Rombel {sumatifLeger.className}
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          Siswa Berisiko (≥ 3 Mapel)
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-2xl font-black font-mono ${sumatifLeger.atRiskStudentsCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'}`}>
                            {sumatifLeger.atRiskStudentsCount}
                          </span>
                          {sumatifLeger.atRiskStudentsCount > 0 ? (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {sumatifLeger.atRiskStudentsCount > 0 ? 'Perlu intervensi wali kelas' : 'Seluruh siswa aman'}
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          Mata Pelajaran Diuji
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-2xl font-black text-purple-600 dark:text-purple-400 font-mono">
                            {sumatifLeger.subjects.length}
                          </span>
                          <BookOpen className="w-4 h-4 text-purple-500" />
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Dalam wadah {sumatifLeger.packageType}
                        </span>
                      </div>
                    </div>

                    {/* Banner & Detailed At-Risk Student List */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
                      <div className="flex items-start gap-3">
                        <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                            Deteksi &amp; Intervensi Siswa Berisiko (At-Risk Students)
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {sumatifLeger.packageType === 'SAT'
                              ? 'Pada Asesmen Sumatif Akhir Tahun (SAT), siswa dengan 3 atau lebih mata pelajaran di bawah kriteria ketercapaian tujuan pembelajaran (KKTP) menjadi pertimbangan kritis dalam rapat pleno kenaikan kelas.'
                              : 'Siswa dengan 3 atau lebih mata pelajaran di bawah KKTP memerlukan pendampingan dan bimbingan remedial terarah sebelum cetak e-Rapor akhir semester.'}
                          </p>
                        </div>
                      </div>

                      {sumatifLeger.atRiskStudentsCount === 0 ? (
                        <div className="p-8 text-center bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200/60 dark:border-emerald-800/60 space-y-2">
                          <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto" />
                          <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                            Luar Biasa! Tidak Ada Siswa Berisiko
                          </h4>
                          <p className="text-xs text-emerald-700 dark:text-emerald-300 max-w-md mx-auto">
                            Seluruh siswa di kelas {sumatifLeger.className} memiliki catatan remedial kurang dari 3 mata pelajaran. Kriteria ketuntasan kelas terpenuhi dengan baik.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {sumatifLeger.atRiskStudents.map(student => (
                            <div key={student.studentId} className="p-4 bg-amber-50/50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800/80 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold px-2 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 rounded-md">
                                    Rank #{student.rank}
                                  </span>
                                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                                    {student.studentName}
                                  </h4>
                                </div>
                                <span className="text-[11px] font-mono text-slate-500">
                                  NISN: {student.nisn}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-xs pt-1 border-t border-amber-200/60 dark:border-amber-800/60">
                                <span className="text-slate-600 dark:text-slate-400">Rata-rata: <strong>{student.averageScore}</strong></span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                  {student.remedialCount} Mapel Belum Tuntas
                                </span>
                              </div>

                              <div className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 font-mono">
                                  Mata Pelajaran di Bawah KKTP:
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {student.remedialSubjectCodes.map(code => (
                                    <span key={code} className="px-2 py-0.5 bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 rounded font-mono text-[10px] font-bold">
                                      {code}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {walasSumatifSubTab === 'LEGER_TABLE' && (
                  <WaliKelasLegerSection
                    leger={sumatifLeger}
                    onExportExcel={() => {
                      ExportService.exportWaliKelasLegerExcel({
                        className: assignedClass.name,
                        waliKelasName: currentUser.name,
                        kkm: 75,
                        subjects: sumatifLeger.subjects.map(s => ({ id: s.id, name: s.name })),
                        students: allStudents.filter(s => s.classId === assignedClassId && !s.isAnswerKeyAccount),
                        getStudentScore: (sId, subId) => {
                          const row = sumatifLeger.rows.find(r => r.studentId === sId);
                          return row?.scoresBySubjectId[subId] ?? null;
                        },
                        schoolProfile: dbService.getSchoolProfile(),
                        waliNotes,
                      });
                      triggerToast(`Buku Leger ${activePackage?.title} berhasil diekspor ke Excel (.xlsx).`);
                    }}
                  />
                )}

                {walasSumatifSubTab === 'NOTES_EXPORT' && (
                  <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <Save className="w-5 h-5 text-indigo-600" />
                          <span>Catatan Pembimbing Wali Kelas &amp; Ekspor Rapor</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Tuliskan catatan evaluasi perkembangan siswa untuk dicetak ke e-Rapor resmi semester ini.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            triggerToast('Seluruh catatan Wali Kelas untuk rapor berhasil disimpan.');
                          }}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-colors"
                        >
                          <Save className="w-4 h-4" />
                          <span>Simpan Catatan Rapor</span>
                        </button>
                      </div>
                    </div>

                    <div className="overflow-auto max-h-[500px] rounded-2xl border border-slate-200 dark:border-slate-800 scrollbar-thin">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider sticky top-0 z-20">
                          <tr>
                            <th className="py-3 px-3 text-center w-12">Rank</th>
                            <th className="py-3 px-4 min-w-[180px]">Nama Siswa</th>
                            <th className="py-3 px-3 text-center w-24">NISN</th>
                            <th className="py-3 px-3 text-center w-24">Rata-Rata</th>
                            <th className="py-3 px-3 text-center w-28">Status</th>
                            <th className="py-3 px-4 min-w-[260px]">Catatan Pembimbing Wali Kelas</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                          {sumatifLeger.rows.map(row => (
                            <tr key={row.studentId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                              <td className="py-3 px-3 text-center font-mono font-bold text-slate-500">
                                #{row.rank}
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">
                                {row.studentName}
                              </td>
                              <td className="py-3 px-3 text-center font-mono text-slate-500">
                                {row.nisn}
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-black text-indigo-600 dark:text-indigo-400">
                                {row.averageScore}
                              </td>
                              <td className="py-3 px-3 text-center">
                                {row.remedialCount === 0 ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                    Tuntas Semua
                                  </span>
                                ) : (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    row.isAtRisk
                                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                  }`}>
                                    {row.remedialCount} Remedial
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-4">
                                <input
                                  type="text"
                                  value={waliNotes[row.studentId] || ''}
                                  onChange={e => setWaliNotes({ ...waliNotes, [row.studentId]: e.target.value })}
                                  placeholder="Ketik catatan bimbingan wali kelas..."
                                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    )}

      </div>
    </div>
  );
};
