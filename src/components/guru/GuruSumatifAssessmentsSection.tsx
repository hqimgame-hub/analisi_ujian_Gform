import React, { useState } from 'react';
import {
  FolderKanban, FileSpreadsheet, ExternalLink, RefreshCw,
  CheckCircle2, AlertCircle, Calendar, School, BookOpen,
  Award, Sparkles, X, ChevronRight, Link as LinkIcon, Check, Users
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

  // Modal State for Editing Google Form & Google Sheet Links
  const [editingItem, setEditingItem] = useState<{
    pkgId: string;
    pkgTitle: string;
    subjectId: string;
    subjectName: string;
    sheetUrl: string;
    formUrl: string;
  } | null>(null);

  // Filter packages by search query
  const filteredPackages = packages.filter(pkg => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      pkg.title.toLowerCase().includes(q) ||
      pkg.code.toLowerCase().includes(q) ||
      (pkg.description && pkg.description.toLowerCase().includes(q))
    );
  });

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
                {packages.length} Wadah Aktif
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

      {/* ── DAFTAR WADAH SAT / SAS ── */}
      <div className="space-y-4">
        {filteredPackages.map(pkg => {
          const isSAT = pkg.assessmentType === 'SAT';
          const targetClasses = classes.filter(c => (pkg.targetClassIds || []).includes(c.id));
          const targetGrades = Array.from(new Set(targetClasses.map(c => c.gradeLevel))).sort();

          // Saring mata pelajaran yang diampu guru dalam paket ini
          const userSubjectsInPkg = (pkg.subjects || []).map(pkgSub => {
            const fullSub = subjects.find(s => s.id === pkgSub.subjectId);
            return {
              ...pkgSub,
              subjectName: fullSub?.name || 'Mata Pelajaran',
              subjectCode: fullSub?.code || 'MAPEL',
            };
          });

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
                    <span>Slot Mata Pelajaran Anda:</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {userSubjectsInPkg.length} Mata Pelajaran Terdaftar
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {userSubjectsInPkg.map(subItem => {
                    const hasSheet = Boolean(subItem.googleSheetUrl?.trim());
                    const hasForm = Boolean(subItem.googleFormUrl?.trim());
                    const isSyncingThis = syncingKey === `${pkg.id}-${subItem.subjectId}`;

                    return (
                      <div
                        key={subItem.subjectId}
                        className="bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                                {subItem.subjectCode}
                              </span>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                {subItem.subjectName}
                              </h4>
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                              KKTP Ketuntasan: <strong>{subItem.passingGrade || 75}</strong>
                            </span>
                          </div>

                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                              hasSheet
                                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                            }`}
                          >
                            {hasSheet ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Sheet Tertaut</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-3 h-3 text-amber-600" />
                                <span>Belum Ada Sheet</span>
                              </>
                            )}
                          </span>
                        </div>

                        {/* Status Tautan Link Google Form & Sheet */}
                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                            <span className="text-[11px] font-semibold text-slate-500">Google Sheet Respons:</span>
                            {hasSheet ? (
                              <a
                                href={subItem.googleSheetUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline flex items-center gap-1 text-[11px]"
                              >
                                <FileSpreadsheet className="w-3 h-3" />
                                <span>Buka Spreadsheet</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">Belum diinput</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                            <span className="text-[11px] font-semibold text-slate-500">Google Form Soal:</span>
                            {hasForm ? (
                              <a
                                href={subItem.googleFormUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1 text-[11px]"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Buka Form</span>
                              </a>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">Opsional</span>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons: Input Link & Sync Respon */}
                        <div className="flex items-center gap-2 pt-1">
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
                            className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                          >
                            <LinkIcon className="w-3 h-3 text-indigo-600" />
                            <span>{hasSheet ? 'Ganti Tautan' : 'Tautkan Sheet'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={!hasSheet || isSyncingThis}
                            onClick={() => handleTriggerSync(pkg, subItem.subjectId, subItem.subjectName)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                            title="Tarik data respons siswa terbaru dari Google Sheet"
                          >
                            <RefreshCw className={`w-3 h-3 ${isSyncingThis ? 'animate-spin' : ''}`} />
                            <span>{isSyncingThis ? 'Menyinkronkan...' : 'Tarik Respons'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
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
