import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderKanban, FileSpreadsheet, ExternalLink, RefreshCw,
  CheckCircle2, AlertCircle, Calendar, School, BookOpen,
  Award, Sparkles, X, ChevronRight, ChevronLeft, Link as LinkIcon, Check, Users,
  Layers, LayoutGrid
} from 'lucide-react';
import { ExamPackage, ClassRoom, Subject, User, Tryout } from '../../types/database';
import { DatabaseService } from '../../services/database';

interface GuruSumatifAssessmentsSectionProps {
  dbService: DatabaseService;
  currentUser: User;
  packages: ExamPackage[];
  classes: ClassRoom[];
  subjects: Subject[];
  onNavigateToAnalytics: (pkgId: string) => void;
  onSyncSubjectSheet?: (pkg: ExamPackage, subjectId: string) => Promise<void>;
  onShowToast: (msg: string) => void;
}

export const GuruSumatifAssessmentsSection: React.FC<GuruSumatifAssessmentsSectionProps> = ({
  dbService,
  currentUser,
  packages,
  classes,
  subjects,
  onNavigateToAnalytics,
  onSyncSubjectSheet,
  onShowToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [syncingKey, setSyncingKey] = useState<string | null>(null);

  // Mode Tampilan: FOCUSED (Satu Wadah Terpilih per Waktu) vs ALL (Tampilkan Semua Vertikal)
  const [viewMode, setViewMode] = useState<'FOCUSED' | 'ALL'>('FOCUSED');

  // Ambil ID mapel yang diizinkan untuk guru yang sedang login
  const allowedSubjectIds = useMemo(() => {
    return dbService.getTeacherAllowedSubjectIds(currentUser);
  }, [dbService, currentUser]);

  // Statistik kelengkapan tautan mapel guru per wadah
  const packagesWithStats = useMemo(() => {
    return packages
      .map(pkg => {
        // Filter mapel hanya yang diampu oleh guru yang sedang login (atau semua jika role ADMIN)
        const relevantPkgSubjects = (pkg.subjects || []).filter(pkgSub => {
          if (currentUser.role === 'ADMIN') return true;
          return allowedSubjectIds.includes(pkgSub.subjectId);
        });

        const allTo = dbService.getTryouts() || [];
        const userSubjects = relevantPkgSubjects.map(pkgSub => {
          const fullSub = subjects.find(s => s.id === pkgSub.subjectId);
          const matchTo = allTo.find(t => t.packageId === pkg.id && t.subjectId === pkgSub.subjectId);
          const responseCount = matchTo ? (dbService.getScoresByTryout(matchTo.id) || []).length : 0;

          return {
            ...pkgSub,
            subjectName: fullSub?.name || 'Mata Pelajaran',
            subjectCode: fullSub?.code || 'MAPEL',
            hasSheet: Boolean(pkgSub.googleSheetUrl?.trim()),
            hasForm: Boolean(pkgSub.googleFormUrl?.trim()),
            responseCount,
            tryoutId: matchTo?.id,
          };
        });

        const totalSubjects = userSubjects.length;
        const filledSubjects = userSubjects.filter(s => s.hasSheet).length;
        const isComplete = totalSubjects > 0 && filledSubjects === totalSubjects;

        return {
          pkg,
          userSubjects,
          totalSubjects,
          filledSubjects,
          isComplete,
        };
      })
      // Untuk guru: hanya tampilkan wadah yang memuat mata pelajaran yang diampunya
      .filter(item => currentUser.role === 'ADMIN' || item.totalSubjects > 0);
  }, [packages, subjects, allowedSubjectIds, currentUser, dbService]);

  // ID Wadah yang Sedang Dipilih
  const [selectedPkgId, setSelectedPkgId] = useState<string>('');

  useEffect(() => {
    if (packagesWithStats.length > 0) {
      if (!selectedPkgId || !packagesWithStats.some(p => p.pkg.id === selectedPkgId)) {
        setSelectedPkgId(packagesWithStats[0].pkg.id);
      }
    }
  }, [packagesWithStats, selectedPkgId]);

  // Modal State for Editing Google Form & Google Sheet Links
  const [editingItem, setEditingItem] = useState<{
    pkgId: string;
    pkgTitle: string;
    subjectId: string;
    subjectName: string;
    sheetUrl: string;
    formUrl: string;
  } | null>(null);

  const totalAllPackages = packages.length;
  const completedPackagesCount = packagesWithStats.filter(p => p.isComplete).length;
  const overallProgressPct = totalAllPackages > 0
    ? Math.round((completedPackagesCount / totalAllPackages) * 100)
    : 0;

  // Filter wadah berdasarkan input pencarian
  const filteredPackagesWithStats = useMemo(() => {
    if (!searchQuery.trim()) return packagesWithStats;
    const q = searchQuery.toLowerCase();
    return packagesWithStats.filter(item =>
      item.pkg.title.toLowerCase().includes(q) ||
      item.pkg.code.toLowerCase().includes(q) ||
      (item.pkg.description && item.pkg.description.toLowerCase().includes(q))
    );
  }, [packagesWithStats, searchQuery]);

  // Wadah aktif terpilih pada mode FOCUSED
  const activePackageData = useMemo(() => {
    if (filteredPackagesWithStats.length === 0) return null;
    const found = filteredPackagesWithStats.find(p => p.pkg.id === selectedPkgId);
    return found || filteredPackagesWithStats[0];
  }, [filteredPackagesWithStats, selectedPkgId]);

  // Index aktif untuk tombol Previous / Next wadah
  const activePkgIndex = useMemo(() => {
    if (!activePackageData) return 0;
    return filteredPackagesWithStats.findIndex(p => p.pkg.id === activePackageData.pkg.id);
  }, [filteredPackagesWithStats, activePackageData]);

  const prevPkg = activePkgIndex > 0 ? filteredPackagesWithStats[activePkgIndex - 1] : null;
  const nextPkg = activePkgIndex < filteredPackagesWithStats.length - 1 ? filteredPackagesWithStats[activePkgIndex + 1] : null;

  const handleSaveLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      const pkg = packages.find(p => p.id === editingItem.pkgId);
      if (!pkg) throw new Error('Wadah tidak ditemukan.');

      const cleanSheet = editingItem.sheetUrl.trim();
      const cleanForm = editingItem.formUrl.trim();

      // 1. Update subject slot di exam_packages
      dbService.updateExamPackageSubject(
        editingItem.pkgId,
        editingItem.subjectId,
        {
          googleSheetUrl: cleanSheet,
          googleFormUrl: cleanForm,
          syncStatus: cleanSheet ? 'SYNCED' : 'PENDING',
        },
        currentUser
      );

      // 2. Sinkronkan atau buat Tryout pendukung dengan packageId terkait
      const existingTryouts = dbService.getTryouts() || [];
      const matchTryout = existingTryouts.find(
        t => t.packageId === pkg.id && t.subjectId === editingItem.subjectId
      );

      const targetClassIds = pkg.targetClassIds || [];
      const targetGrades = pkg.targetGrades || [];

      if (matchTryout) {
        dbService.updateTryout(
          matchTryout.id,
          {
            googleSheetUrl: cleanSheet || undefined,
            googleFormUrl: cleanForm || undefined,
            title: `${pkg.title} - ${editingItem.subjectName}`,
            assessmentType: pkg.assessmentType,
            targetClassIds: targetClassIds.length > 0 ? targetClassIds : undefined,
          },
          currentUser
        );
      } else if (cleanSheet) {
        const newTo: Tryout = {
          id: `to-sum-${Date.now()}-${editingItem.subjectId}`,
          code: `${pkg.code}-${editingItem.subjectId.slice(-4).toUpperCase()}`,
          title: `${pkg.title} - ${editingItem.subjectName}`,
          academicYearId: pkg.academicYearId,
          packageId: pkg.id,
          assessmentType: pkg.assessmentType,
          subjectId: editingItem.subjectId,
          targetClassIds: targetClassIds.length > 0 ? targetClassIds : undefined,
          startDate: pkg.startDate,
          endDate: pkg.endDate,
          status: 'ACTIVE',
          googleSheetUrl: cleanSheet,
          googleFormUrl: cleanForm || undefined,
          scoringConfig: {
            scoringType: 'EQUAL_WEIGHT',
            maxScore: 100,
            correctScore: 1,
            wrongScore: 0,
            unansweredScore: 0,
            allowNegativeMarking: false,
            passingGrade: 75,
          },
        };
        dbService.saveTryout(newTo);
      }

      onShowToast(`Tautan Spreadsheet respons untuk ${editingItem.subjectName} berhasil disimpan.`);
      setEditingItem(null);
    } catch (err: any) {
      alert(`Gagal menyimpan tautan: ${err.message}`);
    }
  };

  const handleTriggerSync = async (pkg: ExamPackage, subjectId: string, subjectName: string) => {
    const key = `${pkg.id}-${subjectId}`;
    setSyncingKey(key);
    try {
      if (onSyncSubjectSheet) {
        await onSyncSubjectSheet(pkg, subjectId);
      } else {
        // Fallback: cari tryout terkait dan lakukan sinkronisasi
        const allTryouts = dbService.getTryouts();
        const to = allTryouts.find(t => t.packageId === pkg.id && t.subjectId === subjectId);
        if (to && to.googleSheetUrl) {
          onShowToast(`Sinkronisasi respons siswa untuk mapel ${subjectName} sedang berjalan...`);
        } else {
          onShowToast(`Harap isi tautan Google Sheet respons terlebih dahulu.`);
        }
      }
    } catch (err: any) {
      onShowToast(`Sinkronisasi gagal: ${err.message}`);
    } finally {
      setSyncingKey(null);
    }
  };

  // EMPTY STATE: Jika admin belum membuat wadah SAS/SAT
  if (packages.length === 0) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Manajemen Asesmen Sumatif (SAS &amp; SAT)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kelola tautan Google Form soal &amp; Google Sheet respons siswa untuk evaluasi resmi rapor semesteran.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-50/70 dark:bg-slate-900/40 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center max-w-2xl mx-auto space-y-4">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 shadow-inner">
            <FolderKanban className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Belum Ada Jadwal Asesmen SAT / SAS
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
              Admin sekolah belum merilis wadah Sumatif Akhir Semester (SAS) atau Sumatif Akhir Tahun (SAT) untuk tahun ajaran aktif. Begitu admin membuat wadah yang menargetkan kelas yang Anda ampu, slot mata pelajaran dan integrasi Google Form/Sheet akan otomatis siap diisi di sini.
            </p>
          </div>
          <div className="pt-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Seluruh Ujian SAT &amp; SAS Menggunakan Google Form &amp; Google Sheet</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // EMPTY STATE: Jika guru belum memiliki mapel terdaftar di wadah manapun
  if (packagesWithStats.length === 0) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Manajemen Asesmen Sumatif (SAS &amp; SAT)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kelola tautan Google Form soal &amp; Google Sheet respons siswa untuk evaluasi resmi rapor semesteran.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-50/70 dark:bg-slate-900/40 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center max-w-2xl mx-auto space-y-4">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 shadow-inner">
            <BookOpen className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Belum Ada Jadwal Asesmen untuk Mata Pelajaran Anda
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
              Wadah asesmen SAT/SAS telah dibuat oleh admin sekolah, namun mata pelajaran yang Anda ampu belum terdaftar di dalamnya. Hubungi Administrator atau Tim Kurikulum jika Anda ditugaskan mengampu mata pelajaran pada jadwal asesmen ini.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Komponen Kartu Spotlight / Hero Mata Pelajaran
  const renderSubjectCard = (
    pkg: ExamPackage,
    subItem: (typeof packagesWithStats)[0]['userSubjects'][0]
  ) => {
    const hasSheet = subItem.hasSheet;
    const hasForm = subItem.hasForm;
    const isSyncingThis = syncingKey === `${pkg.id}-${subItem.subjectId}`;

    return (
      <div
        key={subItem.subjectId}
        className="bg-white dark:bg-slate-900 border-2 border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
      >
        {/* Header Spotlight Mapel */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/50 dark:border-indigo-800/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {subItem.subjectName}
                </h4>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                  {subItem.subjectCode}
                </span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block">
                Kriteria Ketuntasan (KKTP): <strong>{subItem.passingGrade || 75}</strong>
              </span>
            </div>
          </div>

          {/* Status Badges di Pojok Kanan Atas */}
          <div className="flex items-center gap-2 flex-wrap">
            {subItem.responseCount > 0 ? (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>{subItem.responseCount} Siswa Terdata</span>
              </span>
            ) : (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                0 Siswa Terdata
              </span>
            )}

            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                hasSheet
                  ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
              }`}
            >
              {hasSheet ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Sheet Tertaut</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Belum Ada Sheet</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Dual Workspace Panel: Google Form & Google Sheet */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Panel 1: Google Form Soal */}
          <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Google Form Soal Ujian</span>
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Link Siswa</span>
              </div>
              {hasForm ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono bg-white dark:bg-slate-900 px-2 py-1.5 rounded-lg border border-slate-200/70 dark:border-slate-800">
                  {subItem.googleFormUrl}
                </p>
              ) : (
                <p className="text-xs text-slate-400 italic">Belum ada link form soal (opsional)</p>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end">
              {hasForm ? (
                <a
                  href={subItem.googleFormUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 transition-colors"
                >
                  <span>Buka Form Soal</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-[11px] text-slate-400">Dapat ditautkan melalui tombol Tautkan</span>
              )}
            </div>
          </div>

          {/* Panel 2: Google Spreadsheet Respon */}
          <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Google Spreadsheet Respons</span>
                </span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Sumber Nilai</span>
              </div>
              {hasSheet ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono bg-white dark:bg-slate-900 px-2 py-1.5 rounded-lg border border-slate-200/70 dark:border-slate-800">
                  {subItem.googleSheetUrl}
                </p>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Wajib ditautkan agar respons jawaban siswa dapat ditarik.
                </p>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end">
              {hasSheet ? (
                <a
                  href={subItem.googleSheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-lg border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 transition-colors"
                >
                  <span>Buka Spreadsheet</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-[11px] text-amber-500">Belum ada tautan spreadsheet</span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons: Tautkan, Tarik Respons, Buka Analisis */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setEditingItem({
                  pkgId: pkg.id,
                  pkgTitle: pkg.title,
                  subjectId: subItem.subjectId,
                  subjectName: subItem.subjectName,
                  sheetUrl: subItem.googleSheetUrl || '',
                  formUrl: subItem.googleFormUrl || '',
                })
              }
              className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
            >
              <LinkIcon className="w-3.5 h-3.5 text-indigo-600" />
              <span>{hasSheet ? 'Ganti Tautan' : 'Tautkan Sheet / Form'}</span>
            </button>

            <button
              type="button"
              disabled={!hasSheet || isSyncingThis}
              onClick={() => handleTriggerSync(pkg, subItem.subjectId, subItem.subjectName)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
              title="Tarik data respons siswa terbaru dari Google Sheet"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingThis ? 'animate-spin' : ''}`} />
              <span>{isSyncingThis ? 'Menyinkronkan...' : 'Tarik Respons Siswa'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToAnalytics(pkg.id)}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Award className="w-3.5 h-3.5" />
            <span>Buka Analisis Butir Soal</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── HEADER & SEARCH BAR ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Manajemen Asesmen Sumatif (SAS &amp; SAT)
              </h2>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800">
                {filteredPackagesWithStats.length} Wadah Ditugaskan
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tautkan Google Form soal dan Google Sheet respons siswa untuk mata pelajaran yang Anda ampu.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari wadah SAT / SAS..."
            className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full sm:w-64"
          />
        </div>
      </div>

      {/* ── QUICK PROGRESS & PILL TAB SELECTOR ── */}
      {filteredPackagesWithStats.length > 1 && (
        <div className="space-y-3">
          {/* Progress Tracker Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${completedPackagesCount === totalAllPackages ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
              <span className="text-slate-600 dark:text-slate-300 font-medium">
                Status Integrasi Link: <strong className="text-slate-900 dark:text-slate-100">{completedPackagesCount} dari {totalAllPackages} Wadah</strong> sudah terhubung lengkap ({overallProgressPct}%)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">Mode Tampilan:</span>
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setViewMode('FOCUSED')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'FOCUSED'
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Tampilkan satu wadah terfokus"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Fokus 1 Wadah</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('ALL')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'ALL'
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Tampilkan semua wadah sekaligus"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Tampilkan Semua ({filteredPackagesWithStats.length})</span>
                </button>
              </div>
            </div>
          </div>

          {/* Pill Tab Selector */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {filteredPackagesWithStats.map(item => {
              const isSelected = activePackageData?.pkg.id === item.pkg.id && viewMode === 'FOCUSED';
              const isSAT = item.pkg.assessmentType === 'SAT';
              const targetClasses = classes.filter(c => (item.pkg.targetClassIds || []).includes(c.id));
              const classNames = targetClasses.map(c => c.name).join(', ');

              return (
                <button
                  key={item.pkg.id}
                  type="button"
                  onClick={() => {
                    setSelectedPkgId(item.pkg.id);
                    setViewMode('FOCUSED');
                  }}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 border ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-sm border-emerald-600 ring-2 ring-emerald-500/30'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <span
                    className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      isSelected
                        ? 'bg-emerald-800 text-emerald-100'
                        : isSAT
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                        : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                    }`}
                  >
                    {item.pkg.assessmentType}
                  </span>
                  <span>{item.pkg.title}</span>
                  {classNames && (
                    <span className={`text-[10px] font-normal ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                      ({classNames})
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isSelected
                        ? item.isComplete
                          ? 'bg-emerald-500 text-white'
                          : 'bg-amber-500 text-white'
                        : item.isComplete
                        ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    {item.isComplete ? (
                      <>
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        <span>{item.filledSubjects}/{item.totalSubjects} Selesai</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-2.5 h-2.5" />
                        <span>{item.filledSubjects}/{item.totalSubjects} Belum Lengkap</span>
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DAFTAR WADAH SAT / SAS ── */}
      <div className="space-y-4">
        {filteredPackagesWithStats.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center text-slate-400 text-xs">
            Tidak ada wadah SAT / SAS yang cocok dengan pencarian &apos;{searchQuery}&apos;.
          </div>
        ) : viewMode === 'FOCUSED' && activePackageData ? (
          (() => {
            const item = activePackageData;
            const pkg = item.pkg;
            const isSAT = pkg.assessmentType === 'SAT';
            const targetClasses = classes.filter(c => (pkg.targetClassIds || []).includes(c.id));
            const targetGrades = Array.from(new Set(targetClasses.map(c => c.gradeLevel))).sort();

            return (
              <div
                key={pkg.id}
                className="bg-white dark:bg-slate-900 border-2 border-emerald-500/30 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5 transition-all"
              >
                {/* Header Kartu Wadah */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-lg border ${
                          isSAT
                            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        }`}
                      >
                        {isSAT ? 'SAT (Akhir Tahun)' : 'SAS (Akhir Semester)'}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-400">
                        #{pkg.code}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {pkg.status}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                          item.isComplete
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                        }`}
                      >
                        {item.isComplete ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Link Mapel Lengkap ({item.filledSubjects}/{item.totalSubjects})</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            <span>Belum Lengkap ({item.filledSubjects}/{item.totalSubjects} Mapel Terisi)</span>
                          </>
                        )}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {pkg.title}
                    </h3>
                    {pkg.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{pkg.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onNavigateToAnalytics(pkg.id)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>Buka Analisis SAT/SAS</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Baris Meta: Tanggal & Target Kelas */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50/70 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Pelaksanaan: <strong>{new Date(pkg.startDate).toLocaleDateString('id-ID')}</strong> s/d <strong>{new Date(pkg.endDate).toLocaleDateString('id-ID')}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <School className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>
                      Target Kelas: <strong>{targetClasses.length > 0 ? targetClasses.map(c => c.name).join(', ') : 'Semua Kelas'}</strong>
                      {targetGrades.length > 0 && <span className="text-slate-400"> (Tingkat {targetGrades.join(', ')})</span>}
                    </span>
                  </div>
                </div>

                {/* Daftar Mata Pelajaran Guru di Wadah Ini */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Mata Pelajaran yang Anda Ampu ({item.userSubjects.length} Mapel):</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Tautkan spreadsheet respon untuk menarik data jawaban siswa
                    </span>
                  </div>

                  <div className={`grid grid-cols-1 ${item.userSubjects.length > 1 ? 'xl:grid-cols-2' : ''} gap-4`}>
                    {item.userSubjects.map(subItem => renderSubjectCard(pkg, subItem))}
                  </div>
                </div>

                {/* Step-through Sequential Navigation Bar */}
                {filteredPackagesWithStats.length > 1 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                    {prevPkg ? (
                      <button
                        type="button"
                        onClick={() => setSelectedPkgId(prevPkg.pkg.id)}
                        className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Sebelumnya: {prevPkg.pkg.title}</span>
                      </button>
                    ) : (
                      <div />
                    )}

                    <span className="text-xs font-semibold text-slate-400 text-center">
                      Wadah {activePkgIndex + 1} dari {filteredPackagesWithStats.length}
                    </span>

                    {nextPkg ? (
                      <button
                        type="button"
                        onClick={() => setSelectedPkgId(nextPkg.pkg.id)}
                        className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                      >
                        <span>Selanjutnya: {nextPkg.pkg.title}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          filteredPackagesWithStats.map(item => {
            const pkg = item.pkg;
            const isSAT = pkg.assessmentType === 'SAT';
            const targetClasses = classes.filter(c => (pkg.targetClassIds || []).includes(c.id));
            const targetGrades = Array.from(new Set(targetClasses.map(c => c.gradeLevel))).sort();

            return (
              <div
                key={pkg.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs space-y-5 transition-all hover:border-emerald-200 dark:hover:border-emerald-800/80"
              >
                {/* Header Kartu Wadah */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-lg border ${
                          isSAT
                            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        }`}
                      >
                        {isSAT ? 'SAT (Akhir Tahun)' : 'SAS (Akhir Semester)'}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-400">
                        #{pkg.code}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {pkg.status}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          item.isComplete
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                        }`}
                      >
                        {item.isComplete ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Link Lengkap ({item.filledSubjects}/{item.totalSubjects})</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            <span>Belum Lengkap ({item.filledSubjects}/{item.totalSubjects})</span>
                          </>
                        )}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {pkg.title}
                    </h3>
                    {pkg.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{pkg.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onNavigateToAnalytics(pkg.id)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>Buka Analisis SAT/SAS</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Baris Meta: Tanggal & Target Kelas */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50/70 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Pelaksanaan: <strong>{new Date(pkg.startDate).toLocaleDateString('id-ID')}</strong> s/d <strong>{new Date(pkg.endDate).toLocaleDateString('id-ID')}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <School className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>
                      Target Kelas: <strong>{targetClasses.length > 0 ? targetClasses.map(c => c.name).join(', ') : 'Semua Kelas'}</strong>
                      {targetGrades.length > 0 && <span className="text-slate-400"> (Tingkat {targetGrades.join(', ')})</span>}
                    </span>
                  </div>
                </div>

                {/* Daftar Mata Pelajaran Guru di Wadah Ini */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Mata Pelajaran yang Anda Ampu ({item.userSubjects.length} Mapel):</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Tautkan spreadsheet respon untuk menarik data jawaban siswa
                    </span>
                  </div>

                  <div className={`grid grid-cols-1 ${item.userSubjects.length > 1 ? 'xl:grid-cols-2' : ''} gap-4`}>
                    {item.userSubjects.map(subItem => renderSubjectCard(pkg, subItem))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── MODAL INPUT TAUTAN GOOGLE FORM & SPREADSHEET RESPON ── */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Input Tautan Spreadsheet Asesmen
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Mapel: <strong>{editingItem.subjectName}</strong> · Wadah: <strong>{editingItem.pkgTitle}</strong>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLink} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Tautan Google Spreadsheet Respons Siswa *
                </label>
                <input
                  type="url"
                  required
                  value={editingItem.sheetUrl}
                  onChange={e => setEditingItem({ ...editingItem, sheetUrl: e.target.value })}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200"
                />
                <span className="text-[10px] text-slate-400 block">
                  Pastikan spreadsheet diatur minimal <em>&apos;Anyone with the link can view&apos;</em> agar data respon siswa dapat disinkronkan secara otomatis.
                </span>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Tautan Google Form Soal (Opsional)
                </label>
                <input
                  type="url"
                  value={editingItem.formUrl}
                  onChange={e => setEditingItem({ ...editingItem, formUrl: e.target.value })}
                  placeholder="https://forms.google.com/..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200"
                />
              </div>

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900 text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                <strong>Catatan Ujian Resmi:</strong> Seluruh asesmen SAS &amp; SAT dikelola murni berbasis respons Google Form &amp; Sheet. Setelah menyimpan tautan, Anda dapat langsung mengklik tombol <em>&apos;Tarik Respons&apos;</em> untuk mengimpor nilai dan menganalisis ketuntasan KKTP.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold cursor-pointer text-slate-600 dark:text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold cursor-pointer shadow-sm"
                >
                  Simpan Tautan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
