import React, { useState, useEffect } from 'react';
import {
  FolderKanban, Plus, Search, Filter, CheckCircle2, AlertCircle,
  Calendar, School, BookOpen, Link as LinkIcon, ExternalLink,
  Edit2, Trash2, Check, X, ChevronRight, ChevronDown, Sparkles,
  Clock, FileSpreadsheet, Layers, ShieldCheck, UserCheck, Copy
} from 'lucide-react';
import {
  ExamPackage, ExamPackageSubject, ClassRoom, Subject,
  AcademicYear, TryoutStatus, AssessmentType
} from '../../types/database';
import { DatabaseService } from '../../services/database';
import { generateUuid } from '../../utils/idUtils';

interface ExamPackagesSectionProps {
  dbService: DatabaseService;
  classes: ClassRoom[];
  subjects: Subject[];
  academicYears: AcademicYear[];
  currentUser: any;
  onShowToast: (msg: string) => void;
}

export const ExamPackagesSection: React.FC<ExamPackagesSectionProps> = ({
  dbService,
  classes,
  subjects,
  academicYears,
  currentUser,
  onShowToast
}) => {
  const [packages, setPackages] = useState<ExamPackage[]>(() => dbService.getExamPackages());
  const [, setSyncTick] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TryoutStatus>('ALL');
  const [selectedPackage, setSelectedPackage] = useState<ExamPackage | null>(null);
  const [adminSubFilter, setAdminSubFilter] = useState<'ALL' | 'FILLED' | 'UNFILLED'>('ALL');

  // Modal State for Create/Edit Package
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formType, setFormType] = useState<AssessmentType>('TRYOUT');
  const [formAcademicYearId, setFormAcademicYearId] = useState(
    academicYears.find(a => a.isActive)?.id || academicYears[0]?.id || ''
  );
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [formEndDate, setFormEndDate] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [formDescription, setFormDescription] = useState('');
  const [formTargetClassIds, setFormTargetClassIds] = useState<string[]>([]);
  const [formSubjectIds, setFormSubjectIds] = useState<string[]>([]);

  // Sub-Modal: Quick Input Spreadsheet Link for a Subject inside the package
  const [editingSubjectItem, setEditingSubjectItem] = useState<{
    pkgId: string;
    subjectId: string;
    subjectName: string;
    sheetUrl: string;
    formUrl: string;
  } | null>(null);

  const refreshData = () => {
    const pkgs = dbService.getExamPackages();
    setPackages([...pkgs]);
    setSyncTick(t => t + 1);
    if (selectedPackage) {
      const updated = pkgs.find(p => p.id === selectedPackage.id) || null;
      setSelectedPackage(updated);
    }
  };

  useEffect(() => {
    refreshData();
    return dbService.subscribe(refreshData);
  }, []);

  // Group classes by gradeLevel (e.g. 7, 8, 9 or X, XI, XII)
  const availableGrades = Array.from(new Set(classes.map(c => c.gradeLevel))).sort();

  const generateSmartCode = (type: AssessmentType, targetClassIdsList: string[]) => {
    const grades = Array.from(
      new Set(
        classes
          .filter(c => targetClassIdsList.includes(c.id))
          .map(c => c.gradeLevel)
      )
    ).sort();
    const gradeStr = grades.length > 0 ? grades.join('') : '';
    const prefix = type === 'SAT' ? 'SAT' : type === 'SAS' ? 'SAS' : 'TO';
    const rand = Date.now().toString().slice(-4);
    if (gradeStr) {
      return `${prefix}-KLS${gradeStr}-${rand}`;
    }
    return `${prefix}-${rand}`;
  };

  const handleOpenCreateModal = () => {
    setEditingPackageId(null);
    setFormTitle('');
    setFormCode(`TO-${Date.now().toString().slice(-4)}`);
    setFormType('TRYOUT');
    setFormAcademicYearId(academicYears.find(a => a.isActive)?.id || academicYears[0]?.id || '');
    setFormStartDate(new Date().toISOString().slice(0, 10));
    setFormEndDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    setFormDescription('');
    setFormTargetClassIds([]);
    setFormSubjectIds(subjects.slice(0, 4).map(s => s.id));
    setShowPackageModal(true);
  };

  const handleOpenEditModal = (pkg: ExamPackage) => {
    setEditingPackageId(pkg.id);
    setFormTitle(pkg.title);
    setFormCode(pkg.code);
    setFormType(pkg.assessmentType);
    setFormAcademicYearId(pkg.academicYearId);
    setFormStartDate(pkg.startDate ? pkg.startDate.slice(0, 10) : '');
    setFormEndDate(pkg.endDate ? pkg.endDate.slice(0, 10) : '');
    setFormDescription(pkg.description || '');
    setFormTargetClassIds(pkg.targetClassIds || []);
    setFormSubjectIds(pkg.subjects.map(s => s.subjectId));
    setShowPackageModal(true);
  };

  // Quick Select Helper: Select all classes of a specific grade
  const handleToggleGradeClasses = (grade: string) => {
    const classIdsInGrade = classes.filter(c => c.gradeLevel === grade).map(c => c.id);
    const allSelected = classIdsInGrade.every(id => formTargetClassIds.includes(id));

    if (allSelected) {
      setFormTargetClassIds(prev => prev.filter(id => !classIdsInGrade.includes(id)));
    } else {
      setFormTargetClassIds(prev => Array.from(new Set([...prev, ...classIdsInGrade])));
    }
  };

  const handleToggleSingleClass = (classId: string) => {
    setFormTargetClassIds(prev =>
      prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
    );
  };

  const handleSelectAllClasses = () => {
    if (formTargetClassIds.length === classes.length) {
      setFormTargetClassIds([]);
    } else {
      setFormTargetClassIds(classes.map(c => c.id));
    }
  };

  const handleToggleSubject = (subjectId: string) => {
    setFormSubjectIds(prev =>
      prev.includes(subjectId) ? prev.filter(id => id !== subjectId) : [...prev, subjectId]
    );
  };

  const handleSelectAllSubjects = () => {
    if (formSubjectIds.length === subjects.length) {
      setFormSubjectIds([]);
    } else {
      setFormSubjectIds(subjects.map(s => s.id));
    }
  };

  const handleSavePackage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('Nama Paket Ujian wajib diisi.');
      return;
    }
    const cleanCode = formCode.trim().toUpperCase();
    if (!cleanCode) {
      alert('Kode Paket Ujian wajib diisi.');
      return;
    }
    const duplicatePkg = packages.find(
      p => p.code.toUpperCase() === cleanCode && p.id !== editingPackageId
    );
    if (duplicatePkg) {
      alert(`Kode Paket '${cleanCode}' sudah digunakan oleh paket '${duplicatePkg.title}'. Harap gunakan kode unik agar tidak terjadi bentrok data antar jenjang.`);
      return;
    }
    if (formTargetClassIds.length === 0) {
      alert('Harap pilih minimal 1 kelas target.');
      return;
    }
    if (formSubjectIds.length === 0) {
      alert('Harap pilih minimal 1 mata pelajaran.');
      return;
    }

    // Determine target grades automatically based on selected classes
    const targetGrades = Array.from(
      new Set(
        classes
          .filter(c => formTargetClassIds.includes(c.id))
          .map(c => c.gradeLevel)
      )
    );

    const now = new Date().toISOString();

    if (editingPackageId) {
      const existing = packages.find(p => p.id === editingPackageId);
      if (!existing) return;

      // Preserve existing subject links if subject is still selected
      const updatedSubjects: ExamPackageSubject[] = formSubjectIds.map(subId => {
        const found = existing.subjects.find(s => s.subjectId === subId);
        if (found) return found;
        return {
          id: generateUuid(),
          packageId: existing.id,
          subjectId: subId,
          totalQuestions: 40,
          passingGrade: 75,
          syncStatus: 'PENDING',
          updatedAt: now
        };
      });

      const updatedPkg: ExamPackage = {
        ...existing,
        title: formTitle.trim(),
        code: formCode.trim().toUpperCase(),
        assessmentType: formType,
        academicYearId: formAcademicYearId,
        targetGrades,
        targetClassIds: formTargetClassIds,
        startDate: new Date(formStartDate).toISOString(),
        endDate: new Date(formEndDate).toISOString(),
        description: formDescription.trim(),
        subjects: updatedSubjects,
        updatedAt: now
      };

      dbService.saveExamPackage(updatedPkg, currentUser);
      onShowToast(`Paket Ujian '${updatedPkg.title}' berhasil diperbarui.`);
    } else {
      const newPkgId = generateUuid();
      const newSubjects: ExamPackageSubject[] = formSubjectIds.map((subId) => ({
        id: generateUuid(),
        packageId: newPkgId,
        subjectId: subId,
        totalQuestions: 40,
        passingGrade: 75,
        syncStatus: 'PENDING',
        updatedAt: now
      }));

      const newPkg: ExamPackage = {
        id: newPkgId,
        code: formCode.trim().toUpperCase(),
        title: formTitle.trim(),
        assessmentType: formType,
        academicYearId: formAcademicYearId,
        targetGrades,
        targetClassIds: formTargetClassIds,
        startDate: new Date(formStartDate).toISOString(),
        endDate: new Date(formEndDate).toISOString(),
        status: 'ACTIVE',
        description: formDescription.trim(),
        subjects: newSubjects,
        createdAt: now,
        updatedAt: now
      };

      dbService.saveExamPackage(newPkg, currentUser);
      onShowToast(`Paket Ujian baru '${newPkg.title}' berhasil dibuat!`);
    }

    setShowPackageModal(false);
    refreshData();
  };

  const handleDeletePackage = (pkg: ExamPackage) => {
    if (confirm(`Apakah Anda yakin ingin menghapus Paket Ujian '${pkg.title}'?`)) {
      dbService.deleteExamPackage(pkg.id, currentUser);
      onShowToast(`Paket Ujian '${pkg.title}' telah dihapus.`);
      if (selectedPackage?.id === pkg.id) {
        setSelectedPackage(null);
      }
      refreshData();
    }
  };

  const handleTogglePackageStatus = (pkg: ExamPackage) => {
    const nextStatus: TryoutStatus =
      pkg.status === 'ACTIVE' ? 'COMPLETED' : pkg.status === 'COMPLETED' ? 'DRAFT' : 'ACTIVE';
    dbService.updateExamPackageStatus(pkg.id, nextStatus, currentUser);
    onShowToast(`Status paket '${pkg.title}' diubah menjadi '${nextStatus}'.`);
    refreshData();
  };

  const handleSaveSpreadsheetLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubjectItem) return;

    dbService.updateExamPackageSubject(
      editingSubjectItem.pkgId,
      editingSubjectItem.subjectId,
      {
        googleSheetUrl: editingSubjectItem.sheetUrl.trim(),
        googleFormUrl: editingSubjectItem.formUrl.trim(),
        syncStatus: editingSubjectItem.sheetUrl.trim() ? 'SYNCED' : 'PENDING'
      },
      currentUser
    );

    onShowToast(`Link spreadsheet untuk ${editingSubjectItem.subjectName} berhasil disimpan.`);
    setEditingSubjectItem(null);
    refreshData();
  };

  // Filtered packages
  const filteredPackages = packages.filter(pkg => {
    const matchesSearch =
      pkg.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || pkg.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
              <FolderKanban className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Manajemen Paket Ujian (Wadah)
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
            Kelola wadah ujian (seperti TO Kelas 9, UAS, UTS). Setiap paket mengisolasi kelas target, daftar mata pelajaran, dan link spreadsheet agar data teratur dan akun siswa kelas lain tidak bercampur.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-2xl shadow-sm transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Paket Ujian Baru</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari nama atau kode paket ujian..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">Aktif (Sedang Berjalan)</option>
            <option value="DRAFT">Draft (Konfigurasi)</option>
            <option value="COMPLETED">Selesai</option>
            <option value="ARCHIVED">Diarsipkan</option>
          </select>
        </div>
      </div>

      {/* Grid of Exam Packages */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPackages.map(pkg => {
          const attachedTryouts = (dbService.getTryouts() || []).filter(t => t.packageId === pkg.id);
          const internalCount = attachedTryouts.filter(t => !t.isExternal).length;
          const externalCount = attachedTryouts.filter(t => t.isExternal).length;
          const externalSubjectIdSet = new Set(
            attachedTryouts.filter(t => t.isExternal).flatMap(t => t.externalSubjectIds || [])
          );

          // Subjek terisi jika ada Google Sheet URL atau tercakup dalam TO Eksternal
          const filledSheetsCount = pkg.subjects.filter(
            s => Boolean(s.googleSheetUrl?.trim()) || externalSubjectIdSet.has(s.subjectId)
          ).length;
          const totalSubjects = pkg.subjects.length;
          const isComplete = totalSubjects > 0 && filledSheetsCount === totalSubjects;
          const targetClassNames = classes
            .filter(c => pkg.targetClassIds?.includes(c.id))
            .map(c => c.name);

          return (
            <div
              key={pkg.id}
              className={`bg-white dark:bg-slate-900 border rounded-3xl p-5 shadow-xs transition-all flex flex-col justify-between ${
                selectedPackage?.id === pkg.id
                  ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div>
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-900/50 mr-2">
                      {pkg.code}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      pkg.assessmentType === 'SAS'
                        ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-900/50'
                        : pkg.assessmentType === 'SAT'
                        ? 'bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200/50 dark:border-purple-900/50'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}>
                      {pkg.assessmentType === 'SAS' ? 'SAS (Semester)' : pkg.assessmentType === 'SAT' ? 'SAT (Akhir Tahun)' : 'Try Out'}
                    </span>
                  </div>

                  <button
                    onClick={() => handleTogglePackageStatus(pkg)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                      pkg.status === 'ACTIVE'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : pkg.status === 'COMPLETED'
                        ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                        : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                    }`}
                    title="Klik untuk mengubah status"
                  >
                    ● {pkg.status}
                  </button>
                </div>

                {/* Title */}
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1 line-clamp-1">
                  {pkg.title}
                </h3>

                {/* Tryout Composition Badges */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                  {(pkg.assessmentType === 'SAS' || pkg.assessmentType === 'SAT') ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 flex items-center gap-1">
                      <FileSpreadsheet className="w-3 h-3" />
                      <span>{attachedTryouts.length} Mapel Terjadwal (Google Form)</span>
                    </span>
                  ) : (
                    <>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60 flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        <span>{internalCount} TO Internal</span>
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60 flex items-center gap-1">
                        <FileSpreadsheet className="w-3 h-3" />
                        <span>{externalCount} TO Eksternal</span>
                      </span>
                    </>
                  )}
                </div>
                {pkg.description && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
                    {pkg.description}
                  </p>
                )}

                {/* Target Classes Scope */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1.5 mb-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    <School className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>Target Kelas ({targetClassNames.length} Kelas):</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {targetClassNames.length > 0 ? (
                      targetClassNames.map(name => (
                        <span
                          key={name}
                          className="text-[10px] px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                        >
                          {name}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Belum diatur</span>
                    )}
                  </div>
                </div>

                {/* Spreadsheet Progress Indicator */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 flex items-center gap-1">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                      Keterisian Link Spreadsheet:
                    </span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {filledSheetsCount} / {totalSubjects} Mapel
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isComplete ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{
                        width: `${totalSubjects > 0 ? (filledSheetsCount / totalSubjects) * 100 : 0}%`
                      }}
                    />
                  </div>

                  {/* Ringkasan status mapel yang belum mengisi link */}
                  {(() => {
                    const unfilledSubs = (pkg.subjects || [])
                      .filter(item => !item.googleSheetUrl?.trim())
                      .map(item => subjects.find(s => s.id === item.subjectId)?.name || item.subjectId);

                    if (totalSubjects > 0 && unfilledSubs.length === 0) {
                      return (
                        <div className="mt-2.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/60 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Semua link mapel lengkap ({totalSubjects}/{totalSubjects})</span>
                        </div>
                      );
                    }

                    if (unfilledSubs.length > 0) {
                      return (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/70 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                          <div className="flex items-center justify-between font-bold">
                            <span className="flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              Belum Ada Link ({unfilledSubs.length} Mapel):
                            </span>
                          </div>
                          <div className="text-[10px] text-amber-700/90 dark:text-amber-400 line-clamp-1 font-medium">
                            {unfilledSubs.slice(0, 3).join(', ')}
                            {unfilledSubs.length > 3 ? ` +${unfilledSubs.length - 3} lainnya` : ''}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => setSelectedPackage(selectedPackage?.id === pkg.id ? null : pkg)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{selectedPackage?.id === pkg.id ? 'Tutup Detail' : 'Kelola Mapel & Link'}</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEditModal(pkg)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="Edit Paket"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeletePackage(pkg)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                    title="Hapus Paket"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredPackages.length === 0 && (
          <div className="col-span-full p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
            <FolderKanban className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-40" />
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Belum Ada Paket Ujian
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Silakan klik tombol "Buat Paket Ujian Baru" untuk membuat wadah pertama Anda.
            </p>
          </div>
        )}
      </div>

      {/* Drawer Detail: Mapel & Link Spreadsheet di Dalam Paket yang Dipilih */}
      {selectedPackage && (() => {
        const pkgTryouts = (dbService.getTryouts() || []).filter(t => t.packageId === selectedPackage.id);
        const internalTos = pkgTryouts.filter(t => !t.isExternal);
        const externalTos = pkgTryouts.filter(t => t.isExternal);
        const isSelectedSatSas = selectedPackage.assessmentType === 'SAS' || selectedPackage.assessmentType === 'SAT';

        return (
        <div className="bg-white dark:bg-slate-900 border-2 border-indigo-500/40 rounded-3xl p-6 shadow-lg space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-600 text-white font-mono">
                  {selectedPackage.code}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Kelola Wadah: {selectedPackage.title}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isSelectedSatSas
                  ? `Rekapitulasi jadwal asesmen ${selectedPackage.assessmentType} (Google Form) dan status link spreadsheet tiap mata pelajaran.`
                  : 'Rekapitulasi seluruh Try Out (Internal & Eksternal) dan status link spreadsheet tiap mata pelajaran.'}
              </p>
            </div>

            <button
              onClick={() => setSelectedPackage(null)}
              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer self-start sm:self-auto"
            >
              Tutup Panel
            </button>
          </div>

          {/* ── SECTION A: DAFTAR TRY OUT / ASESMEN TERDAFTAR DI WADAH INI ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {isSelectedSatSas
                    ? `Jadwal Ujian Terdaftar di Wadah Ini (${pkgTryouts.length} Mapel)`
                    : `Try Out Terdaftar di Wadah Ini (${pkgTryouts.length} Paket TO)`}
                </h4>
              </div>
              <div className="flex items-center gap-2">
                {isSelectedSatSas ? (
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-0.5 rounded-lg border border-emerald-200/60 dark:border-emerald-800/60">
                    {pkgTryouts.length} Google Form
                  </span>
                ) : (
                  <>
                    <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950 px-2.5 py-0.5 rounded-lg border border-teal-200/60 dark:border-teal-800/60">
                      {internalTos.length} Internal
                    </span>
                    <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950 px-2.5 py-0.5 rounded-lg border border-purple-200/60 dark:border-purple-800/60">
                      {externalTos.length} Eksternal
                    </span>
                  </>
                )}
              </div>
            </div>

            {pkgTryouts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {pkgTryouts.map(toItem => {
                  const toScores = dbService.getScoresByTryout(toItem.id);
                  const isExt = Boolean(toItem.isExternal || toItem.source === 'EXTERNAL');

                  return (
                    <div
                      key={toItem.id}
                      className="p-3.5 rounded-2xl border bg-slate-50/80 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 space-y-2 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                            {toItem.code}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isSelectedSatSas
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                  : isExt
                                  ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800'
                                  : 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-800'
                              }`}
                            >
                              {isSelectedSatSas ? 'Google Form' : isExt ? 'TO Eksternal' : 'TO Internal'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Hapus jadwal ${isSelectedSatSas ? 'Ujian' : 'Try Out'} '${toItem.title}' (${toItem.code}) beserta seluruh nilainya dari sistem?`)) {
                                  dbService.deleteTryout(toItem.id, currentUser);
                                  onShowToast(`Jadwal '${toItem.title}' (${toItem.code}) berhasil dihapus dari semua perangkat.`);
                                  refreshData();
                                }
                              }}
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                              title={`Hapus ${toItem.code}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                          {toItem.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                          <span>Status: <strong className="uppercase">{toItem.status}</strong></span>
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400">{toScores.length} Siswa Dinilai</span>
                        </div>
                      </div>

                      {isExt && !isSelectedSatSas && toItem.externalSubjects && toItem.externalSubjects.length > 0 && (
                        <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[10px] text-slate-500">
                          <span className="font-medium text-slate-600 dark:text-slate-400">Mapel: </span>
                          <span className="line-clamp-1">{toItem.externalSubjects.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
                {isSelectedSatSas
                  ? `Belum ada jadwal asesmen ${selectedPackage.assessmentType} yang dimasukkan ke wadah ini. Guru dapat menghubungkan Google Form ke wadah ini pada menu Asesmen Sumatif.`
                  : 'Belum ada Try Out yang dimasukkan ke wadah ini. Guru dapat memilih wadah ini saat membuat TO Internal maupun TO Eksternal.'}
              </div>
            )}
          </div>

          {/* ── SECTION B: DAFTAR MAPEL & STATUS INTEGRASI ── */}
          {(() => {
            const unfilledList = selectedPackage.subjects.filter(item => !item.googleSheetUrl?.trim());
            const filledList = selectedPackage.subjects.filter(item => Boolean(item.googleSheetUrl?.trim()));

            const handleCopyWaReminder = () => {
              const missingNames = unfilledList.map(item => subjects.find(s => s.id === item.subjectId)?.name || item.subjectId);
              if (missingNames.length === 0) {
                onShowToast('Seluruh mata pelajaran sudah memiliki tautan spreadsheet.');
                return;
              }

              const text = `🔔 *Pengingat Asesmen ${selectedPackage.assessmentType} - ${selectedPackage.title}*\n\n` +
                `Kepada Bapak/Ibu Guru pengampu mata pelajaran berikut, dimohon untuk segera menginputkan tautan Google Form dan Spreadsheet respons ke sistem:\n\n` +
                missingNames.map((s, idx) => `${idx + 1}. ${s}`).join('\n') +
                `\n\nTerima kasih atas kerja samanya. 🙏`;

              navigator.clipboard.writeText(text);
              onShowToast(`Pesan pengingat untuk ${missingNames.length} mapel berhasil disalin ke clipboard!`);
            };

            const displayedSubjects = selectedPackage.subjects.filter(item => {
              const hasSheet = Boolean(item.googleSheetUrl?.trim());
              if (adminSubFilter === 'FILLED') return hasSheet;
              if (adminSubFilter === 'UNFILLED') return !hasSheet;
              return true;
            });

            return (
              <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Status Mata Pelajaran &amp; Sumber Nilai ({selectedPackage.subjects.length} Mapel)</span>
                  </h4>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Filter Tabs: Semua / Lengkap / Belum */}
                    <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setAdminSubFilter('ALL')}
                        className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                          adminSubFilter === 'ALL'
                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        Semua ({selectedPackage.subjects.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminSubFilter('FILLED')}
                        className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                          adminSubFilter === 'FILLED'
                            ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs font-bold'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        Sudah Lengkap ({filledList.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminSubFilter('UNFILLED')}
                        className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                          adminSubFilter === 'UNFILLED'
                            ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs font-bold'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        Belum Isi ({unfilledList.length})
                      </button>
                    </div>

                    {/* Tombol Salin Pengingat WA */}
                    {unfilledList.length > 0 && (
                      <button
                        type="button"
                        onClick={handleCopyWaReminder}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                        title="Salin pesan pengingat ke clipboard untuk dibagikan ke WhatsApp"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Pengingat WA ({unfilledList.length})</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                        <th className="py-2.5 px-3">Mata Pelajaran</th>
                        <th className="py-2.5 px-3">Status Link</th>
                        <th className="py-2.5 px-3">Terakhir Diperbarui</th>
                        <th className="py-2.5 px-3">Google Spreadsheet</th>
                        <th className="py-2.5 px-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {displayedSubjects.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-xs text-slate-400 italic">
                            Tidak ada mata pelajaran dengan filter ini.
                          </td>
                        </tr>
                      ) : (
                        displayedSubjects.map(item => {
                          const subj = subjects.find(s => s.id === item.subjectId);
                          const hasSheet = Boolean(item.googleSheetUrl?.trim());
                          const extToForSubj = pkgTryouts.find(t =>
                            t.isExternal && (
                              (t.externalSubjectIds && t.externalSubjectIds.includes(item.subjectId)) ||
                              (t.externalSubjects && subj && t.externalSubjects.includes(subj.name))
                            )
                          );
                          const isSyncedViaExternal = Boolean(!hasSheet && extToForSubj && !isSelectedSatSas);

                          return (
                            <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-3 px-3">
                                <div className="font-bold text-slate-900 dark:text-slate-100">
                                  {subj?.name || item.subjectId}
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {subj?.code || 'MAPEL'} • {subj?.category || 'WAJIB'}
                                </span>
                              </td>

                              <td className="py-3 px-3">
                                {hasSheet ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Terhubung (GSheet)</span>
                                  </span>
                                ) : isSyncedViaExternal ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>TO Eksternal ({extToForSubj?.code})</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                                    <AlertCircle className="w-3 h-3" />
                                    <span>Belum Ada Link</span>
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3 text-slate-500">
                                {item.lastUpdatedBy ? (
                                  <div>
                                    <span className="font-medium text-slate-700 dark:text-slate-300 block">
                                      {item.lastUpdatedBy}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('id-ID') : '-'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic">Belum diinput</span>
                                )}
                              </td>

                              <td className="py-3 px-3 max-w-xs truncate text-slate-600 dark:text-slate-400">
                                {hasSheet ? (
                                  <a
                                    href={item.googleSheetUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
                                  >
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{item.googleSheetUrl}</span>
                                  </a>
                                ) : isSyncedViaExternal ? (
                                  <span className="text-purple-700 dark:text-purple-300 text-[11px] font-medium flex items-center gap-1">
                                    <FileSpreadsheet className="w-3.5 h-3.5" />
                                    <span>Rekap Nilai Eksternal ({extToForSubj?.title || extToForSubj?.code})</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[11px] italic">
                                    Belum ada link spreadsheet
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3 text-right">
                                <button
                                  onClick={() =>
                                    setEditingSubjectItem({
                                      pkgId: selectedPackage.id,
                                      subjectId: item.subjectId,
                                      subjectName: subj?.name || item.subjectId,
                                      sheetUrl: item.googleSheetUrl || '',
                                      formUrl: item.googleFormUrl || ''
                                    })
                                  }
                                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                                >
                                  {hasSheet ? 'Ganti Link' : 'Input Link (Bantu Guru)'}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
        );
      })()}

      {/* MODAL 1: BUAT / EDIT PAKET UJIAN */}
      {showPackageModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {editingPackageId ? 'Edit Paket Ujian (Wadah)' : 'Buat Paket Ujian Baru'}
                </h3>
              </div>
              <button
                onClick={() => setShowPackageModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePackage} className="space-y-4 text-xs">
              {/* Row 1: Judul & Kode */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Nama Paket Ujian *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="Contoh: Try Out 1 Kelas 9 2024/2025"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Kode Paket *
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormCode(generateSmartCode(formType, formTargetClassIds))}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      title="Generate kode unik otomatis sesuai tipe asesmen dan jenjang kelas"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Buat Kode Cerdas</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={e => setFormCode(e.target.value.toUpperCase())}
                    placeholder="Contoh: SAT-KLS9 atau TO-KLS8"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl uppercase font-mono"
                  />
                </div>
              </div>

              {/* Row 2: Tipe & Tahun Ajaran */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Tipe Asesmen
                  </label>
                  <select
                    value={formType}
                    onChange={e => {
                      const nextType = e.target.value as AssessmentType;
                      setFormType(nextType);
                      if (
                        !formCode ||
                        formCode.startsWith('TO-') ||
                        formCode.startsWith('SAS-') ||
                        formCode.startsWith('SAT-') ||
                        formCode.startsWith('PKT-')
                      ) {
                        setFormCode(generateSmartCode(nextType, formTargetClassIds));
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="TRYOUT">Try Out (TO)</option>
                    <option value="SAS">Sumatif Akhir Semester (SAS)</option>
                    <option value="SAT">Sumatif Akhir Tahun (SAT)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Tahun Ajaran
                  </label>
                  <select
                    value={formAcademicYearId}
                    onChange={e => setFormAcademicYearId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    {academicYears.map(ay => (
                      <option key={ay.id} value={ay.id}>
                        {ay.yearLabel} ({ay.semester === 'ODD' ? 'Ganjil' : 'Genap'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Target Kelas (Sesuai kesepakatan: Tombol Cepat Tingkat + Checkbox Ruang Kelas) */}
              <div className="space-y-2 p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/60 rounded-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                      Target Kelas (Wadah ini berlaku untuk siapa?) *
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Siswa di luar kelas ini tidak akan melihat paket ini di akunnya.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleSelectAllClasses}
                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer self-start sm:self-auto"
                  >
                    {formTargetClassIds.length === classes.length ? 'Batal Pilih Semua' : 'Pilih Semua Kelas'}
                  </button>
                </div>

                {/* Tombol Pintas per Tingkat */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500 font-semibold mr-1">
                    Pilih Cepat Tingkat:
                  </span>
                  {availableGrades.map(grade => {
                    const classIdsInGrade = classes.filter(c => c.gradeLevel === grade).map(c => c.id);
                    const isAllInGradeSelected = classIdsInGrade.every(id =>
                      formTargetClassIds.includes(id)
                    );

                    return (
                      <button
                        key={grade}
                        type="button"
                        onClick={() => handleToggleGradeClasses(grade)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                          isAllInGradeSelected
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {isAllInGradeSelected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        <span>Semua Kelas {grade}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Checkbox per Ruang Kelas */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  {classes.map(c => {
                    const isSelected = formTargetClassIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        onClick={() => handleToggleSingleClass(c.id)}
                        className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer select-none transition-colors ${
                          isSelected
                            ? 'bg-indigo-100 dark:bg-indigo-950/80 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-200 font-bold'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="rounded-sm text-indigo-600 focus:ring-0"
                        />
                        <span>{c.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Row 4: Pilihan Mata Pelajaran */}
              <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                      Mata Pelajaran yang Dimasukkan ke Wadah *
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Pilih mapel apa saja yang diujikan dalam paket ini.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleSelectAllSubjects}
                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    {formSubjectIds.length === subjects.length ? 'Batal Pilih Semua' : 'Pilih Semua Mapel'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {subjects.map(s => {
                    const isSelected = formSubjectIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        onClick={() => handleToggleSubject(s.id)}
                        className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer select-none transition-colors ${
                          isSelected
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-bold'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="rounded-sm text-emerald-600 focus:ring-0"
                        />
                        <span className="truncate">{s.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPackageModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold cursor-pointer text-slate-600 dark:text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold cursor-pointer shadow-sm"
                >
                  {editingPackageId ? 'Simpan Perubahan' : 'Buat Paket Ujian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: INPUT / GANTI LINK SPREADSHEET (BANTU GURU SENIOR) */}
      {editingSubjectItem && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Input Link Spreadsheet
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Mapel: <strong>{editingSubjectItem.subjectName}</strong>
                  </span>
                </div>
              </div>
              <button
                onClick={() => setEditingSubjectItem(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSpreadsheetLink} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Tautan Google Spreadsheet Hasil Respon Siswa *
                </label>
                <input
                  type="url"
                  required
                  value={editingSubjectItem.sheetUrl}
                  onChange={e =>
                    setEditingSubjectItem({ ...editingSubjectItem, sheetUrl: e.target.value })
                  }
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
                <span className="text-[10px] text-slate-400 block">
                  Pastikan spreadsheet diatur agar dapat diakses (minimal 'Anyone with the link can view').
                </span>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Tautan Google Form Soal (Opsional)
                </label>
                <input
                  type="url"
                  value={editingSubjectItem.formUrl}
                  onChange={e =>
                    setEditingSubjectItem({ ...editingSubjectItem, formUrl: e.target.value })
                  }
                  placeholder="https://forms.google.com/..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900 text-[11px] text-emerald-800 dark:text-emerald-300">
                <strong>Fitur Bantuan:</strong> Link ini akan tersimpan dengan catatan telah diinput oleh <strong>{currentUser?.name || 'Admin'}</strong>, sehingga guru yang bersangkutan tidak perlu menginputnya lagi.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingSubjectItem(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold cursor-pointer text-slate-600 dark:text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold cursor-pointer shadow-sm"
                >
                  Simpan Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
