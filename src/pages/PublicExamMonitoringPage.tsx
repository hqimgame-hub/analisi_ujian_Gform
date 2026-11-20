import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap, RefreshCw, Search, Filter, CheckCircle2,
  Clock, AlertCircle, ArrowUpDown, ChevronDown, Lock,
  Sparkles, Users, Award, BookOpen, ArrowLeft, EyeOff,
  Check, School, ShieldAlert, BarChart3, Calendar, X,
  LayoutGrid, Table
} from 'lucide-react';
import { dbService } from '../services/database';
import { LiveMonitoringPayload, StudentMonitoringItem } from '../types/database';

interface PublicExamMonitoringPageProps {
  onNavigate?: (path: string) => void;
}

type StatusFilterType = 'ALL' | 'SUBMITTED' | 'UNSUBMITTED';
type SortByType = 'NAME_ASC' | 'CLASS_ASC' | 'SCORE_DESC' | 'SCORE_ASC' | 'TIME_DESC';

export const PublicExamMonitoringPage: React.FC<PublicExamMonitoringPageProps> = ({ onNavigate }) => {
  const [schoolProfile, setSchoolProfile] = useState(() => dbService.getSchoolProfile());
  const [payload, setPayload] = useState<LiveMonitoringPayload>(() => {
    const cachedSubId = typeof window !== 'undefined'
      ? (sessionStorage.getItem('live_monitoring_selected_subject_id') || undefined)
      : undefined;
    return dbService.getLiveMonitoringData(cachedSubId);
  });
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('live_monitoring_selected_subject_id');
      if (saved && payload.subjects.some(s => s.id === saved)) return saved;
    }
    const fallbackId = payload.activeSubject?.id || payload.subjects[0]?.id || '';
    if (typeof window !== 'undefined' && fallbackId) {
      sessionStorage.setItem('live_monitoring_selected_subject_id', fallbackId);
    }
    return fallbackId;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // View Mode: TABLE (Desktop/Standard) or CARDS (Responsive Mobile)
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARDS'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('live_monitoring_view_mode');
      if (saved === 'TABLE' || saved === 'CARDS') return saved;
      return window.innerWidth < 640 ? 'CARDS' : 'TABLE';
    }
    return 'TABLE';
  });

  const handleSetViewMode = (mode: 'TABLE' | 'CARDS') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('live_monitoring_view_mode', mode);
    }
  };

  // Filters & Sorting state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('ALL');
  const [sortBy, setSortBy] = useState<SortByType>('CLASS_ASC');

  // Auto-refresh timer (interval 30 detik agar hemat kuota tapi tetap real-time)
  useEffect(() => {
    const handleSync = () => {
      setSchoolProfile(dbService.getSchoolProfile());
      setPayload(dbService.getLiveMonitoringData(selectedSubjectId));
    };

    const unsubscribe = dbService.subscribe(handleSync);
    const intervalId = setInterval(handleSync, 30000);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  }, [selectedSubjectId]);

  // Handle Manual Refresh
  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setPayload(dbService.getLiveMonitoringData(selectedSubjectId));
    setTimeout(() => {
      setIsRefreshing(false);
    }, 400);
  };

  // Change Subject Tab & persist to sessionStorage so refresh won't jump
  const handleSelectSubject = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('live_monitoring_selected_subject_id', subjectId);
    }
    setPayload(dbService.getLiveMonitoringData(subjectId));
  };

  // Reconcile selectedSubjectId when payload or activeSubject loads/changes
  useEffect(() => {
    if (payload.subjects && payload.subjects.length > 0) {
      const subjectExists = payload.subjects.some(sub => sub.id === selectedSubjectId);
      if (!subjectExists) {
        const nextId = payload.activeSubject?.id || payload.subjects[0].id;
        setSelectedSubjectId(nextId);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('live_monitoring_selected_subject_id', nextId);
        }
      }
    }
  }, [payload.subjects, payload.activeSubject, selectedSubjectId]);

  // Scope Filtering by Grade & Class (Determines KPI Summary context)
  const selectedClassObj = useMemo(() => {
    if (selectedClassId === 'ALL') return null;
    return payload.classes.find(c => c.id === selectedClassId) || null;
  }, [payload.classes, selectedClassId]);

  const isScoped = selectedClassId !== 'ALL' || selectedGrade !== 'ALL';

  const scopeLabel = useMemo(() => {
    if (selectedClassObj) return `Kelas ${selectedClassObj.name}`;
    if (selectedGrade !== 'ALL') return `Jenjang Kelas ${selectedGrade}`;
    return 'Semua Rombel';
  }, [selectedClassObj, selectedGrade]);

  // Students in selected Class & Grade scope (before search & status filters)
  const scopedStudents = useMemo(() => {
    let list = payload.students || [];
    if (selectedGrade !== 'ALL') {
      list = list.filter(s => s.gradeLevel === selectedGrade);
    }
    if (selectedClassId !== 'ALL') {
      list = list.filter(s => s.classId === selectedClassId);
    }
    return list;
  }, [payload.students, selectedGrade, selectedClassId]);

  // Scoped metrics summary (Dynamically changes with Grade/Class filter)
  const scopedSummary = useMemo(() => {
    const totalStudents = scopedStudents.length;
    const submittedRows = scopedStudents.filter(s => s.isSubmitted);
    const submittedCount = submittedRows.length;
    const unsubmittedCount = totalStudents - submittedCount;
    const completionPercentage = totalStudents > 0
      ? Math.round((submittedCount / totalStudents) * 100)
      : 0;

    const scoresArray = submittedRows
      .map(s => s.score)
      .filter((sc): sc is number => typeof sc === 'number' && !isNaN(sc));

    const totalScoresSum = scoresArray.reduce((acc, curr) => acc + curr, 0);
    const averageScore = scoresArray.length > 0
      ? Math.round((totalScoresSum / scoresArray.length) * 10) / 10
      : 0;

    return {
      totalStudents,
      submittedCount,
      unsubmittedCount,
      completionPercentage,
      averageScore
    };
  }, [scopedStudents]);

  // Filtered & Sorted Student Rows for Table & Cards
  const filteredStudents = useMemo(() => {
    let list = scopedStudents;

    // Filter Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.nisn.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q)
      );
    }

    // Filter Status
    if (statusFilter === 'SUBMITTED') {
      list = list.filter(s => s.isSubmitted);
    } else if (statusFilter === 'UNSUBMITTED') {
      list = list.filter(s => !s.isSubmitted);
    }

    // Sorting
    return [...list].sort((a, b) => {
      if (sortBy === 'NAME_ASC') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'CLASS_ASC') {
        const classComp = a.className.localeCompare(b.className);
        return classComp !== 0 ? classComp : a.name.localeCompare(b.name);
      }
      if (sortBy === 'SCORE_DESC') {
        const scA = typeof a.score === 'number' ? a.score : -1;
        const scB = typeof b.score === 'number' ? b.score : -1;
        return scB - scA;
      }
      if (sortBy === 'SCORE_ASC') {
        const scA = typeof a.score === 'number' ? a.score : 9999;
        const scB = typeof b.score === 'number' ? b.score : 9999;
        return scA - scB;
      }
      if (sortBy === 'TIME_DESC') {
        const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return timeB - timeA;
      }
      return 0;
    });
  }, [scopedStudents, searchQuery, statusFilter, sortBy]);

  // If portal is disabled by admin
  if (!payload.config.isEnabled) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-4">
          <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-2xl mx-auto flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Portal Pemantauan Belum Dibuka
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Halaman live rekap nilai dan pemantauan ujian saat ini sedang dinonaktifkan oleh Administrator sekolah. Silakan hubungi panitia ujian atau kembali ke halaman login.
          </p>
          <button
            onClick={() => {
              if (onNavigate) onNavigate('/login');
              else window.location.href = '/login';
            }}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Halaman Login</span>
          </button>
        </div>
      </div>
    );
  }

  // Effective summary for KPI cards (dynamically scoped to selected class/grade if filtered)
  const currentSummary = scopedSummary;
  const currentCompletionPercentage = scopedSummary.completionPercentage;
  const isInitialLoading = (payload.isLoading || payload.subjects.length === 0) && payload.students.length === 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-6 px-3 sm:px-6 transition-colors">
      <div className="max-w-7xl mx-auto space-y-5">
        
        {/* ========================================================= */}
        {/* TOP BAR / BREADCRUMB & LOGO */}
        {/* ========================================================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-3">
            {schoolProfile.logoUrl ? (
              <div className="w-12 h-12 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1 flex items-center justify-center shrink-0 shadow-2xs">
                <img
                  src={schoolProfile.logoUrl}
                  alt={schoolProfile.name}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/20">
                <GraduationCap className="w-6 h-6" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  {payload.assessmentType === 'SAT' ? 'Live SAT Monitoring' : (payload.assessmentType === 'SAS' ? 'Live SAS Monitoring' : 'Live Monitoring')}
                </span>
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 hidden sm:inline">
                  • Real-Time Assessment
                </span>
                {payload.gradeLevels && payload.gradeLevels.length > 1 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    Serentak Kelas {payload.gradeLevels.join(', ')} ({payload.classes.length} Rombel)
                  </span>
                )}
              </div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white mt-0.5">
                {payload.title}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {schoolProfile.name} · {payload.subTitle}
              </p>
            </div>
          </div>

          {/* Action Header: Back to login & Refresh button */}
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || isInitialLoading}
              className="flex-1 sm:flex-none justify-center px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Perbarui data terbaru"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${isRefreshing || isInitialLoading ? 'animate-spin' : ''}`} />
              <span>{isInitialLoading ? 'Menghubungkan...' : 'Segarkan'}</span>
              <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 hidden sm:inline">
                ({isInitialLoading ? 'Sinkron Cloud' : payload.lastSyncedAt})
              </span>
            </button>

            <button
              onClick={() => {
                if (onNavigate) onNavigate('/login');
                else window.location.href = '/login';
              }}
              className="flex-1 sm:flex-none justify-center px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Login Portal</span>
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* ACTIVE SCOPE BANNER (IF FILTERED BY CLASS OR GRADE) */}
        {/* ========================================================= */}
        {isScoped && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-r from-indigo-500/10 via-blue-500/10 to-indigo-500/10 border border-indigo-200 dark:border-indigo-800 rounded-2xl text-xs shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse shrink-0" />
              <p className="text-slate-800 dark:text-slate-200 truncate text-xs">
                Menampilkan metrik &amp; data khusus: <strong className="text-indigo-600 dark:text-indigo-400 font-extrabold">{scopeLabel}</strong> ({currentSummary.submittedCount}/{currentSummary.totalStudents} selesai • {currentCompletionPercentage}%)
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedGrade('ALL');
                setSelectedClassId('ALL');
              }}
              className="shrink-0 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-300 hover:text-white hover:bg-indigo-600 dark:hover:bg-indigo-500 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="Tampilkan kembali seluruh peserta dari semua rombel"
            >
              <X className="w-3.5 h-3.5" />
              <span>Semua Rombel</span>
            </button>
          </div>
        )}

        {/* ========================================================= */}
        {/* KPI SUMMARY CARDS */}
        {/* ========================================================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Total Siswa */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Peserta Terdaftar
                </p>
                {isScoped && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 truncate max-w-[120px]" title={scopeLabel}>
                    {scopeLabel}
                  </span>
                )}
              </div>
              {isInitialLoading ? (
                <div className="space-y-1.5 mt-2">
                  <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
                  <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800/60 rounded animate-pulse" />
                </div>
              ) : (
                <>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                    {currentSummary.totalStudents} <span className="text-xs font-medium text-slate-400">siswa</span>
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {isScoped ? `dari ${payload.summary.totalStudents} total sekolah` : `${payload.classes.length} Rombel aktif`}
                  </p>
                </>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
          </div>

          {/* Card 2: Sudah Selesai */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'SUBMITTED' ? 'ALL' : 'SUBMITTED')}
            className={`p-4 rounded-2xl border shadow-xs flex items-center justify-between cursor-pointer transition-all ${statusFilter === 'SUBMITTED' ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/20' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'}`}
          >
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Sudah Selesai
                </p>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                  {currentCompletionPercentage}%
                </span>
              </div>
              {isInitialLoading ? (
                <div className="space-y-1.5 mt-2">
                  <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
                  <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800/60 rounded animate-pulse" />
                </div>
              ) : (
                <>
                  <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">
                    {currentSummary.submittedCount} <span className="text-xs font-medium text-slate-400">siswa</span>
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {isScoped ? `di ${scopeLabel}` : `dari ${payload.summary.totalStudents} siswa`}
                  </p>
                </>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          {/* Card 3: Belum Selesai / Belum Masuk */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'UNSUBMITTED' ? 'ALL' : 'UNSUBMITTED')}
            className={`p-4 rounded-2xl border shadow-xs flex items-center justify-between cursor-pointer transition-all ${statusFilter === 'UNSUBMITTED' ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/20' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'}`}
          >
            <div className="min-w-0 pr-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                Belum Selesai
              </p>
              {isInitialLoading ? (
                <div className="space-y-1.5 mt-2">
                  <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
                  <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800/60 rounded animate-pulse" />
                </div>
              ) : (
                <>
                  <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                    {currentSummary.unsubmittedCount} <span className="text-xs font-medium text-slate-400">siswa</span>
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {isScoped ? `perlu dipantau di ${scopeLabel}` : `dari ${payload.summary.totalStudents} siswa`}
                  </p>
                </>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* Card 4: Mode Nilai (Rata-rata atau Sensor) */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            {isInitialLoading ? (
              <div className="min-w-0 pr-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  Rata-rata Skor
                </p>
                <div className="space-y-1.5 mt-2">
                  <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
                  <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800/60 rounded animate-pulse" />
                </div>
              </div>
            ) : payload.config.hideScores ? (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Mode Privasi Nilai
                </p>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  Angka Dirahasiakan
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Status pengerjaan saja
                </p>
              </div>
            ) : (
              <div className="min-w-0 pr-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  Rata-rata Skor
                </p>
                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                  {currentSummary.averageScore} <span className="text-xs font-medium text-slate-400">/ 100</span>
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {isScoped ? `Rerata ${scopeLabel} (Sekolah: ${payload.summary.averageScore})` : 'Rerata seluruh peserta'}
                </p>
              </div>
            )}
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              {payload.config.hideScores ? (
                <EyeOff className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <Award className="w-5 h-5" />
              )}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* SUBJECT TABS BAR */}
        {/* ========================================================= */}
        <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Mata Pelajaran Ujian ({payload.subjects.length} Mapel)</span>
            </div>

            {/* Mobile Subject Dropdown Shortcut */}
            <div className="sm:hidden w-full">
              {isInitialLoading ? (
                <div className="h-9 w-full bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
              ) : (
                <select
                  value={selectedSubjectId}
                  onChange={e => handleSelectSubject(e.target.value)}
                  className="w-full text-xs font-semibold py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {payload.subjects.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name} ({sub.submittedCount}/{sub.totalStudents} Selesai)
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Desktop & Scrollable Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {isInitialLoading ? (
              <div className="flex items-center gap-2 py-1">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-8 w-28 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : payload.subjects.length === 0 ? (
              <div className="flex items-center gap-2 p-2 text-xs text-slate-500 dark:text-slate-400">
                {payload.isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                    <span>Menyinkronkan mata pelajaran {payload.assessmentType}...</span>
                  </>
                ) : (
                  <span>Belum ada mata pelajaran terdaftar pada asesmen ini.</span>
                )}
              </div>
            ) : (
              payload.subjects.map(sub => {
                const isActive = sub.id === (payload.activeSubject?.id || selectedSubjectId);
                return (
                  <button
                    key={sub.id}
                    onClick={() => handleSelectSubject(sub.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer shrink-0 border ${
                      isActive
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{sub.name}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {sub.submittedCount}/{sub.totalStudents}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* FILTER & SORTING CONTROLS */}
        {/* ========================================================= */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
            
            {/* Search Input */}
            <div className="lg:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari Nama Siswa atau NISN..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                  title="Hapus pencarian"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Tingkat/Angkatan */}
            <div>
              <select
                value={selectedGrade}
                onChange={e => {
                  setSelectedGrade(e.target.value);
                  setSelectedClassId('ALL');
                }}
                className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100"
              >
                <option value="ALL">
                  {payload.gradeLevels.length > 1 ? `Semua Jenjang (Kelas ${payload.gradeLevels.join(', ')})` : 'Semua Angkatan / Jenjang'}
                </option>
                {payload.gradeLevels.map(gr => (
                  <option key={gr} value={gr}>
                    Tingkat {gr}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Kelas */}
            <div>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100"
              >
                <option value="ALL">Semua Rombel / Kelas</option>
                {payload.classes
                  .filter(c => selectedGrade === 'ALL' || c.gradeLevel === selectedGrade)
                  .map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Urutkan Berdasarkan */}
            <div>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortByType)}
                className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
              >
                <option value="CLASS_ASC">Urut: Kelas &amp; Nama</option>
                <option value="NAME_ASC">Urut: Nama Siswa (A - Z)</option>
                <option value="TIME_DESC">Urut: Waktu Submit Terbaru</option>
                {!payload.config.hideScores && (
                  <>
                    <option value="SCORE_DESC">Urut: Nilai Tertinggi ke Terendah</option>
                    <option value="SCORE_ASC">Urut: Nilai Terendah ke Tertinggi</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Quick Filter Buttons & View Mode Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-400 dark:text-slate-500 text-[11px] font-semibold mr-1">
                Filter Status:
              </span>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Semua ({scopedSummary.totalStudents})
              </button>
              <button
                onClick={() => setStatusFilter('SUBMITTED')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'SUBMITTED'
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Sudah ({scopedSummary.submittedCount})</span>
              </button>
              <button
                onClick={() => setStatusFilter('UNSUBMITTED')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'UNSUBMITTED'
                    ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-rose-500" />
                <span>Belum ({scopedSummary.unsubmittedCount})</span>
              </button>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <strong>{filteredStudents.length}</strong> / {scopedSummary.totalStudents} siswa
              </div>

              {/* View Switcher: Tabel vs Kartu HP */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => handleSetViewMode('TABLE')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'TABLE'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Tampilan Tabel Standar"
                >
                  <Table className="w-3.5 h-3.5" />
                  <span>Tabel</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetViewMode('CARDS')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'CARDS'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Tampilan Kartu Ringkas (Optimal untuk Layar HP)"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Kartu HP</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* DATA MONITORING: TABEL & KARTU RESPONSIVE */}
        {/* ========================================================= */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          
          {viewMode === 'TABLE' ? (
            /* ======================================================= */
            /* MODE 1: TABEL LENGKAP (No, NISN, Nama, JK, Kelas, Status, Nilai) */
            /* ======================================================= */
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                {/* Sticky Table Header */}
                <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800/95 backdrop-blur-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider font-bold text-[11px] border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-3 px-3 w-12 text-center">No</th>
                    <th className="py-3 px-3 w-28 font-mono">NISN</th>
                    <th className="py-3 px-4 min-w-[200px]">Nama Siswa</th>
                    <th className="py-3 px-3 w-24 text-center">Jenis Kelamin</th>
                    <th className="py-3 px-3 w-24 text-center">Kelas</th>
                    <th className="py-3 px-4 min-w-[170px]">Status Pengerjaan</th>
                    <th className="py-3 px-4 w-32 text-right">
                      {payload.config.hideScores ? 'Nilai Siswa' : 'Skor Akhir'}
                    </th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {isInitialLoading ? (
                    [...Array(6)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-3.5 px-3 text-center"><div className="h-3.5 w-5 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                        <td className="py-3.5 px-3"><div className="h-3.5 w-20 bg-slate-200 dark:bg-slate-800 rounded" /></td>
                        <td className="py-3.5 px-4"><div className="h-3.5 w-40 bg-slate-200 dark:bg-slate-800 rounded" /></td>
                        <td className="py-3.5 px-3 text-center"><div className="h-3.5 w-8 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                        <td className="py-3.5 px-3 text-center"><div className="h-3.5 w-12 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                        <td className="py-3.5 px-4"><div className="h-5 w-24 bg-slate-200 dark:bg-slate-800 rounded-full" /></td>
                        <td className="py-3.5 px-4 text-right"><div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded ml-auto" /></td>
                      </tr>
                    ))
                  ) : filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 space-y-2">
                        <AlertCircle className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                          Tidak ada data siswa yang cocok dengan filter yang dipilih
                        </p>
                        <button
                          onClick={() => {
                            setSearchQuery('');
                            setSelectedGrade('ALL');
                            setSelectedClassId('ALL');
                            setStatusFilter('ALL');
                          }}
                          className="text-xs text-indigo-600 dark:text-indigo-400 underline font-medium cursor-pointer"
                        >
                          Reset Seluruh Filter
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((st, idx) => {
                      const isPassed = typeof st.score === 'number' && typeof st.passingGrade === 'number'
                        ? st.score >= st.passingGrade
                        : true;

                      return (
                        <tr
                          key={st.studentId}
                          className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                            !st.isSubmitted ? 'bg-rose-50/20 dark:bg-rose-950/10' : ''
                          }`}
                        >
                          {/* 1. No */}
                          <td className="py-3 px-3 text-center text-slate-400 text-[11px] font-mono">
                            {idx + 1}
                          </td>

                          {/* 2. NISN */}
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                            {st.nisn || '—'}
                          </td>

                          {/* 3. Nama Siswa */}
                          <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                            <span className="truncate block max-w-[220px] sm:max-w-none" title={st.name}>
                              {st.name}
                            </span>
                          </td>

                          {/* 4. Jenis Kelamin */}
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                st.gender === 'L'
                                  ? 'bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-900/60'
                                  : st.gender === 'P'
                                  ? 'bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-900/60'
                                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                              title={st.gender === 'L' ? 'Laki-laki' : st.gender === 'P' ? 'Perempuan' : 'Belum Ditentukan'}
                            >
                              {st.gender === 'L' ? 'L' : st.gender === 'P' ? 'P' : '-'}
                            </span>
                          </td>

                          {/* 5. Kelas */}
                          <td className="py-3 px-3 text-center text-slate-700 dark:text-slate-300 font-semibold">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px]">
                              {st.className}
                            </span>
                          </td>

                          {/* 6. Status Pengerjaan */}
                          <td className="py-3 px-4">
                            {st.isSubmitted ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  Sudah Selesai
                                </span>
                                {st.submittedAt && (
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                    {new Date(st.submittedAt).toLocaleTimeString('id-ID', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}{' '}
                                    WIB
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
                                <Clock className="w-3.5 h-3.5 text-rose-500" />
                                Belum Mengerjakan
                              </span>
                            )}
                          </td>

                          {/* 7. Nilai Siswa / Sensor Nilai */}
                          <td className="py-3 px-4 text-right">
                            {payload.config.hideScores ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                                <Lock className="w-3 h-3 text-slate-400" />
                                Dirahasiakan
                              </span>
                            ) : st.isSubmitted && typeof st.score === 'number' ? (
                              <div className="space-y-0.5">
                                <span
                                  className={`text-sm font-black font-mono ${
                                    isPassed
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                  }`}
                                >
                                  {st.score}
                                </span>
                                <p className="text-[10px] text-slate-400">
                                  KKM: {st.passingGrade || 75}
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 font-mono font-bold">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* ======================================================= */
            /* MODE 2: KARTU HP (Responsive Touch Card Grid)           */
            /* ======================================================= */
            <div className="p-3 sm:p-4 max-h-[650px] overflow-y-auto scrollbar-thin">
              {isInitialLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 animate-pulse">
                      <div className="flex items-center justify-between">
                        <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
                        <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded-full" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-4 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
                        <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800/60 rounded" />
                      </div>
                      <div className="h-6 w-full bg-slate-100 dark:bg-slate-800/40 rounded-xl" />
                    </div>
                  ))}
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <AlertCircle className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                    Tidak ada data siswa yang cocok dengan filter yang dipilih
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedGrade('ALL');
                      setSelectedClassId('ALL');
                      setStatusFilter('ALL');
                    }}
                    className="text-xs text-indigo-600 dark:text-indigo-400 underline font-medium cursor-pointer"
                  >
                    Reset Seluruh Filter
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                  {filteredStudents.map((st, idx) => {
                    const isPassed = typeof st.score === 'number' && typeof st.passingGrade === 'number'
                      ? st.score >= st.passingGrade
                      : true;

                    return (
                      <div
                        key={st.studentId}
                        className={`p-3.5 rounded-2xl border transition-all text-xs space-y-2.5 ${
                          st.isSubmitted
                            ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700'
                            : 'bg-rose-50/30 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                        }`}
                      >
                        {/* Header Kartu: No, Kelas, JK, & Status */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              #{idx + 1}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              {st.className}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                st.gender === 'L'
                                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60'
                                  : st.gender === 'P'
                                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                              title={st.gender === 'L' ? 'Laki-laki' : st.gender === 'P' ? 'Perempuan' : 'Belum Ditentukan'}
                            >
                              {st.gender === 'L' ? 'Laki-laki' : st.gender === 'P' ? 'Perempuan' : '-'}
                            </span>
                          </div>

                          {/* Status Badge */}
                          {st.isSubmitted ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              Selesai
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
                              <Clock className="w-3 h-3 text-rose-500" />
                              Belum
                            </span>
                          )}
                        </div>

                        {/* Nama Siswa & NISN */}
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-snug">
                            {st.name}
                          </h4>
                          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                            NISN: {st.nisn || '—'}
                          </p>
                        </div>

                        {/* Footer Kartu: Waktu & Nilai */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                          <div>
                            {st.isSubmitted && st.submittedAt ? (
                              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 text-[10px] font-mono">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {new Date(st.submittedAt).toLocaleTimeString('id-ID', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })} WIB
                              </span>
                            ) : (
                              <span className="text-rose-500 text-[10px] font-medium">
                                Menunggu pengerjaan...
                              </span>
                            )}
                          </div>

                          <div>
                            {payload.config.hideScores ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                                <Lock className="w-2.5 h-2.5 text-slate-400" />
                                Dirahasiakan
                              </span>
                            ) : st.isSubmitted && typeof st.score === 'number' ? (
                              <div className="text-right">
                                <span
                                  className={`font-black font-mono text-sm ${
                                    isPassed
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                  }`}
                                >
                                  {st.score}
                                </span>
                                <span className="text-[9px] text-slate-400 ml-1">
                                  (KKM {st.passingGrade || 75})
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 font-mono font-bold">
                                —
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Table Footer */}
          <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
            <div>
              Status Keterangan:{' '}
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold mr-3">
                <CheckCircle2 className="w-3 h-3" /> Sudah Selesai
              </span>
              <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                <Clock className="w-3 h-3" /> Belum Masuk / Ujian
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              {schoolProfile.name} · WIKAN Assessment Analytics
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
