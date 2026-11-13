import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap, RefreshCw, Search, Filter, CheckCircle2,
  Clock, AlertCircle, ArrowUpDown, ChevronDown, Lock,
  Sparkles, Users, Award, BookOpen, ArrowLeft, EyeOff,
  Check, School, ShieldAlert, BarChart3, Calendar
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
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [payload, setPayload] = useState<LiveMonitoringPayload>(() => dbService.getLiveMonitoringData());
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Change Subject Tab
  const handleSelectSubject = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setPayload(dbService.getLiveMonitoringData(subjectId));
  };

  // If initial activeSubject exists and selectedSubjectId is empty, set it
  useEffect(() => {
    if (payload.activeSubject && !selectedSubjectId) {
      setSelectedSubjectId(payload.activeSubject.id);
    }
  }, [payload.activeSubject, selectedSubjectId]);

  // Filtered & Sorted Student Rows
  const filteredStudents = useMemo(() => {
    let list = payload.students || [];

    // Filter Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.nisn.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q)
      );
    }

    // Filter Grade
    if (selectedGrade !== 'ALL') {
      list = list.filter(s => s.gradeLevel === selectedGrade);
    }

    // Filter Class
    if (selectedClassId !== 'ALL') {
      list = list.filter(s => s.classId === selectedClassId);
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
  }, [payload.students, searchQuery, selectedGrade, selectedClassId, statusFilter, sortBy]);

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

  const { summary } = payload;
  const completionPercentage = summary.totalStudents > 0
    ? Math.round((summary.submittedCount / summary.totalStudents) * 100)
    : 0;

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
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  Live Monitoring
                </span>
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 hidden sm:inline">
                  • Real-Time Assessment
                </span>
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
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Perbarui data terbaru"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Segarkan</span>
              <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">
                ({payload.lastSyncedAt})
              </span>
            </button>

            <button
              onClick={() => {
                if (onNavigate) onNavigate('/login');
                else window.location.href = '/login';
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Login Portal</span>
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* KPI SUMMARY CARDS */}
        {/* ========================================================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Total Siswa */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Peserta Terdaftar
              </p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {summary.totalStudents} <span className="text-xs font-medium text-slate-400">siswa</span>
              </p>
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
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Sudah Selesai
                </p>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                  {completionPercentage}%
                </span>
              </div>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">
                {summary.submittedCount} <span className="text-xs font-medium text-slate-400">siswa</span>
              </p>
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
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                Belum Selesai
              </p>
              <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {summary.unsubmittedCount} <span className="text-xs font-medium text-slate-400">siswa</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* Card 4: Mode Nilai (Rata-rata atau Sensor) */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            {payload.config.hideScores ? (
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
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  Rata-rata Skor
                </p>
                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                  {summary.averageScore} <span className="text-xs font-medium text-slate-400">/ 100</span>
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
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Mata Pelajaran Ujian ({payload.subjects.length} Mapel)</span>
            </div>

            {/* Mobile Subject Dropdown Shortcut */}
            <div className="sm:hidden w-40">
              <select
                value={selectedSubjectId}
                onChange={e => handleSelectSubject(e.target.value)}
                className="w-full text-xs font-semibold py-1.5 px-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              >
                {payload.subjects.map(sub => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Desktop & Scrollable Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {payload.subjects.length === 0 ? (
              <span className="text-xs text-slate-400 p-2">
                Belum ada mata pelajaran terdaftar pada asesmen ini.
              </span>
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
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  ✕
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
                <option value="ALL">Semua Angkatan / Jenjang</option>
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
                    <option value="SCORE_DESC">Urut: Nilai Tertinggi ➔ Terendah</option>
                    <option value="SCORE_ASC">Urut: Nilai Terendah ➔ Tertinggi</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Quick Filter Buttons (Semua / Sudah Selesai / Belum Selesai) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-1.5">
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
                Semua ({payload.students.length})
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
                <span>Sudah Selesai ({summary.submittedCount})</span>
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
                <span>Belum Mengerjakan ({summary.unsubmittedCount})</span>
              </button>
            </div>

            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Menampilkan <strong>{filteredStudents.length}</strong> dari {payload.students.length} siswa
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* TABEL HASIL & REKAP REALTIME */}
        {/* ========================================================= */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              {/* Sticky Table Header */}
              <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800/90 backdrop-blur-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider font-bold text-[11px] border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-3 px-3 w-12 text-center">No</th>
                  <th className="py-3 px-4 min-w-[220px] sticky left-0 z-30 bg-slate-100 dark:bg-slate-800 shadow-xs">
                    Nama Siswa
                  </th>
                  <th className="py-3 px-3 w-28">NISN</th>
                  <th className="py-3 px-3 w-28">Kelas</th>
                  <th className="py-3 px-4 min-w-[170px]">Status Pengerjaan</th>
                  <th className="py-3 px-4 w-32 text-right">
                    {payload.config.hideScores ? 'Nilai Siswa' : 'Skor Akhir'}
                  </th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 space-y-2">
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
                        {/* No */}
                        <td className="py-3 px-3 text-center text-slate-400 text-[11px] font-mono">
                          {idx + 1}
                        </td>

                        {/* Nama Siswa (Sticky Left on Horizontal Scroll) */}
                        <td className="py-3 px-4 sticky left-0 z-10 bg-white dark:bg-slate-900 font-semibold text-slate-900 dark:text-slate-100 shadow-xs">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                st.gender === 'L'
                                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/80 dark:text-blue-300'
                                  : 'bg-rose-50 text-rose-600 dark:bg-rose-950/80 dark:text-rose-300'
                              }`}
                            >
                              {st.gender}
                            </span>
                            <span className="truncate max-w-[200px] sm:max-w-[280px]" title={st.name}>
                              {st.name}
                            </span>
                          </div>
                        </td>

                        {/* NISN */}
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                          {st.nisn}
                        </td>

                        {/* Kelas */}
                        <td className="py-3 px-3 text-slate-700 dark:text-slate-300 font-semibold">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px]">
                            {st.className}
                          </span>
                        </td>

                        {/* Status Pengerjaan */}
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

                        {/* Nilai Akhir / Sensor Nilai */}
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

          {/* Table Footer */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
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
