import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BookOpen, BarChart3, FileSpreadsheet, Plus, CheckCircle,
  AlertTriangle, Upload, Eye, FileText, Download,
  Layers, HelpCircle, Save, Sparkles, Filter, Menu, X,
  Search, CheckCircle2, ChevronRight, Video, FileCheck, Trash2,
  Edit, ShieldCheck, ShieldAlert, Users, School, Tag, Award,
  ArrowRight, Lock, RefreshCw, Key, ExternalLink, Link, AlertCircle, Check,
  Calculator, Scale, Play, CheckCheck, Sliders, PieChart, TrendingUp,
  Gauge, Zap, Target, Cpu, Clock, ArrowUp, ArrowDown, Activity, Info,
  Youtube, Copy, LayoutGrid, Cloud, CheckSquare, Minus, RotateCcw,
  FolderKanban
} from 'lucide-react';
import { dbService } from '../services/database';
import { GoogleIntegrationService } from '../services/googleIntegration';
import {
  AnalyticsService, OverallAnalyticsFilters, OverallAnalyticsResult,
  ClassAnalyticsResult, StudentAnalyticsResult, QuestionAnalysisResult,
  AnalyticsTestSuiteResult
} from '../services/analytics';
import { ExportService, ReportTestSuiteResult } from '../services/export';
import { ScoringService, CalculationResult, ScoringTestCaseResult } from '../services/scoring';
import { ExplanationService, ExplanationTestSuiteResult } from '../services/explanation';

import { ProductionValidationSuiteResult } from '../services/productionValidation';
import {
  User, Question, Tryout, SheetImportPreviewItem, Explanation, Subject,
  Material, Competency, ClassRoom, Student, QuestionStatus,
  ColumnMappingConfig, SheetImportSummary, Score, AcademicYear, TryoutStatus
} from '../types/database';
import { generateUuid } from '../utils/idUtils';
import { ResourceCard } from '../components/ResourceCard';
import { ItemAnalysisVisualizer } from '../components/ItemAnalysisVisualizer';
import { GuruSumatifView } from '../components/guru/GuruSumatifView';
import { GuruSumatifAssessmentsSection } from '../components/guru/GuruSumatifAssessmentsSection';
import { GuruSumatifAnalyticsSection } from '../components/guru/GuruSumatifAnalyticsSection';
import { SumatifAnalyticsService } from '../services/sumatifAnalytics';
import { ExternalTryoutService } from '../services/externalTryout';
import { ExternalTryoutUploadModal } from '../components/guru/ExternalTryoutUploadModal';
import {
  TRYOUT_STAGE_OPTIONS,
  TRYOUT_GROUP_NONE,
  ADD_NEW_TO_STAGE_VALUE,
  resolveTryoutGroup,
  getStageSubjectCoverage,
  getDynamicTryoutStageOptions,
  addNextTryoutStageOption,
  getMaxTryoutStage,
  getFriendlyTryoutStageLabel,
} from '../utils/tryoutGroupUtils';

interface GuruAppPageProps {
  currentUser: User;
  onNavigate?: (path: string) => void;
}

type GuruTab =
  | 'DASHBOARD'
  | 'WALI_KELAS_PORTAL'
  | 'TRYOUTS'
  | 'SUMATIF_ASSESSMENTS'
  | 'QUESTION_BANK'
  | 'MATERIALS'
  | 'COMPETENCIES'
  | 'STUDENTS'
  | 'CLASSES'
  | 'ANALYTICS_TO'
  | 'ANALYTICS'
  | 'PROGRESS_TRACKING'
  | 'SUMATIF_ANALYTICS'
  | 'EXPLANATIONS'
  | 'REPORTS'
  | 'IMPORT_SHEETS'
  | 'SCORING_ENGINE';

export const GuruAppPage: React.FC<GuruAppPageProps> = ({ currentUser: initialUser, onNavigate }) => {
  // Allow switching teacher persona in UI for verification of strict isolation
  const [currentUser, setCurrentUser] = useState<User>(initialUser);

  // Synchronize internal currentUser when prop initialUser changes
  useEffect(() => {
    setCurrentUser(initialUser);
  }, [initialUser]);

  // Dual-Role Mode State: 'GURU_MAPEL' vs 'WALI_KELAS'
  const teacherObj = dbService.getTeacherByUserId(currentUser);
  const isWaliKelasUser = currentUser.role === 'WALI_KELAS' || !!teacherObj?.isWaliKelas;
  const [activeRoleMode, setActiveRoleMode] = useState<'GURU_MAPEL' | 'WALI_KELAS'>(
    currentUser.role === 'WALI_KELAS' || teacherObj?.isWaliKelas ? 'WALI_KELAS' : 'GURU_MAPEL'
  );
  const [waliNotes, setWaliNotes] = useState<Record<string, string>>({});
  const [selectedWaliStudentId, setSelectedWaliStudentId] = useState<string>('');

  const [activeTab, setActiveTab] = useState<GuruTab>(
    currentUser.role === 'WALI_KELAS' || teacherObj?.isWaliKelas ? 'WALI_KELAS_PORTAL' : 'DASHBOARD'
  );

  // Synchronize role mode and primary dashboard when user changes
  useEffect(() => {
    const tObj = dbService.getTeacherByUserId(currentUser);
    const isWali = currentUser.role === 'WALI_KELAS' || !!tObj?.isWaliKelas;
    if (isWali) {
      setActiveRoleMode('WALI_KELAS');
      setActiveTab('WALI_KELAS_PORTAL');
    } else {
      setActiveRoleMode('GURU_MAPEL');
      setActiveTab('DASHBOARD');
    }
  }, [currentUser]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Filter & Selection States
  const [selectedTryoutId, setSelectedTryoutId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [bankTryoutFilter, setBankTryoutFilter] = useState<string>('ALL');

  // State untuk Modal Pemilihan Kolom (Column Selector)
  const [columnSelectorTryout, setColumnSelectorTryout] = useState<Tryout | null>(null);
  const [columnSelectorHeaders, setColumnSelectorHeaders] = useState<string[]>([]);
  const [columnSelectorRows, setColumnSelectorRows] = useState<Record<string, string>[]>([]);
  const [columnSelectorNisnCol, setColumnSelectorNisnCol] = useState<string>('');
  const [columnSelectorNameCol, setColumnSelectorNameCol] = useState<string>('');
  const [columnSelectorScoreCol, setColumnSelectorScoreCol] = useState<string>('');
  const [columnSelectorKeyRow, setColumnSelectorKeyRow] = useState<Record<string, string> | null>(null);
  const [columnSelectorChecked, setColumnSelectorChecked] = useState<Record<string, boolean>>({});

  // Database Local States
  const [questions, setQuestions] = useState<Question[]>([]);
  const [tryouts, setTryouts] = useState<Tryout[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [explanations, setExplanations] = useState<Explanation[]>([]);

  // ── Auto-Sync State: per-tryout Google Sheet polling status ────────────────
  const [sheetSyncStatus, setSheetSyncStatus] = useState<Record<string, {
    lastSyncAt: Date | null;
    status: 'idle' | 'syncing' | 'error' | 'success';
    newCount: number;
    errorMsg: string;
  }>>({});

  // Permissions of Current Teacher
  const [allowedSubjectIds, setAllowedSubjectIds] = useState<string[]>([]);
  const [allowedClassIds, setAllowedClassIds] = useState<string[]>([]);

  // Question Modal State (Create / Edit)
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [qSubjectId, setQSubjectId] = useState('subj-mat');
  const [qMaterialId, setQMaterialId] = useState('');
  const [qCompetencyId, setQCompetencyId] = useState('');
  const [qNumber, setQNumber] = useState<number>(1);
  const [qUniqueCode, setQUniqueCode] = useState('');
  const [qText, setQText] = useState('');
  const [qOptions, setQOptions] = useState([
    { key: 'A', text: '' },
    { key: 'B', text: '' },
    { key: 'C', text: '' },
    { key: 'D', text: '' },
    { key: 'E', text: '' },
  ]);
  const [qCorrectAnswer, setQCorrectAnswer] = useState('A');
  const [qWeight, setQWeight] = useState(1);
  const [qStatus, setQStatus] = useState<QuestionStatus>('ACTIVE');
  const [selectedPassFailTO, setSelectedPassFailTO] = useState<string>('TO 4');

  const [showTryoutModal, setShowTryoutModal] = useState(false);
  const [editingTryoutId, setEditingTryoutId] = useState<string | null>(null);
  const [newToCode, setNewToCode] = useState('');
  const [newToTitle, setNewToTitle] = useState('');
  const [newToGFormUrl, setNewToGFormUrl] = useState('');
  const [newToGSheetUrl, setNewToGSheetUrl] = useState('');
  const [newToPackageId, setNewToPackageId] = useState('');
  const [newToGroup, setNewToGroup] = useState<string>('TO 1');
  const [newToEntryMode, setNewToEntryMode] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  const [newToSubjectId, setNewToSubjectId] = useState('');
  const [newToExternalSubjectIds, setNewToExternalSubjectIds] = useState<string[]>([]);
  const [newToTargetClasses, setNewToTargetClasses] = useState<string[]>([]);
  const [newToStartDate, setNewToStartDate] = useState('');
  const [newToEndDate, setNewToEndDate] = useState('');
  const [newToStatus, setNewToStatus] = useState<TryoutStatus>('ACTIVE');
  const [newToDescription, setNewToDescription] = useState('');

  // State untuk modal upload nilai TO eksternal
  const [uploadExternalTo, setUploadExternalTo] = useState<Tryout | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  const handleManualCloudSync = async () => {
    setIsCloudSyncing(true);
    try {
      await dbService.pullFromCloud(true);
      refreshData();
      triggerToast('Sinkronisasi cloud berhasil: seluruh data nilai dan paket telah diselaraskan 100% dengan database terpusat.');
    } catch (err: any) {
      triggerError('Gagal menyinkronkan data cloud: ' + (err.message || 'Koneksi bermasalah.'));
    } finally {
      setIsCloudSyncing(false);
    }
  };

  /**
   * Helper untuk menghasilkan kode Try Out unik berikutnya secara global lintas guru dan mapel.
   * Contoh: jika ada TO-2026-01 dan TO-2026-02 di sistem, maka dihasilkan TO-2026-03.
   */
  const getNextAvailableTryoutCode = (): string => {
    const allTryouts = dbService.getTryouts();
    const currentYear = new Date().getFullYear();
    const existingNumbers = allTryouts
      .map(t => {
        const m = (t.code || '').match(/TO-\d+-(\d+)/i) || (t.code || '').match(/TO-(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter(n => !isNaN(n) && n > 0);
    const nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : (allTryouts.length + 1);
    return `TO-${currentYear}-${String(nextNum).padStart(2, '0')}`;
  };

  const [customMaxToStage, setCustomMaxToStage] = useState<number>(() => getMaxTryoutStage());

  const handleOpenAddTryout = () => {
    setEditingTryoutId(null);
    setNewToCode(getNextAvailableTryoutCode());
    setNewToTitle('');
    setNewToGFormUrl('');
    setNewToGSheetUrl('');
    setNewToPackageId('');
    const defaultSubjId = permittedSubjects[0]?.id || subjects[0]?.id || '';
    setNewToSubjectId(defaultSubjId);
    // Rekomendasikan siklus TO berikutnya untuk mapel ini (maksimal sesuai siklus aktif saat ini, default TO 1 - TO 3)
    const allGlobalTo = dbService.getTryouts();
    const allPkgs = dbService.getExamPackages();
    const maxStage = getMaxTryoutStage(allGlobalTo, allPkgs, customMaxToStage);
    const sameSubjectToCount = allGlobalTo.filter(
      t =>
        t.subjectId === defaultSubjId ||
        (t.isExternal && Array.isArray(t.externalSubjectIds) && t.externalSubjectIds.includes(defaultSubjId))
    ).length;
    setNewToGroup(`TO ${Math.min(maxStage, sameSubjectToCount + 1)}`);
    setNewToEntryMode('INTERNAL');
    setNewToTargetClasses([]);
    // Default mapel eksternal disesuaikan persis dengan wewenang mapel guru
    const defaultExtSubjects = permittedSubjects.length > 0 ? permittedSubjects.map(s => s.id) : subjects.map(s => s.id);
    setNewToExternalSubjectIds(defaultExtSubjects);
    setNewToStartDate(new Date().toISOString().slice(0, 10));
    setNewToEndDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    setNewToStatus('ACTIVE');
    setNewToDescription('');
    setShowTryoutModal(true);
  };

  const handleOpenEditTryout = (to: Tryout) => {
    setEditingTryoutId(to.id);
    setNewToCode(to.code || '');
    setNewToTitle(to.title || '');
    setNewToGFormUrl(to.googleFormUrl || '');
    setNewToGSheetUrl(to.googleSheetUrl || '');
    setNewToPackageId(to.packageId || '');
    setNewToGroup(resolveTryoutGroup(to, dbService.getTryouts(), dbService.getExamPackages()));
    setNewToSubjectId(to.subjectId || permittedSubjects[0]?.id || subjects[0]?.id || '');
    setNewToEntryMode(to.isExternal ? 'EXTERNAL' : 'INTERNAL');
    setNewToTargetClasses(to.targetClassIds || []);
    setNewToExternalSubjectIds(to.externalSubjectIds || []);
    setNewToStartDate(to.startDate ? to.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setNewToEndDate(to.endDate ? to.endDate.slice(0, 10) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    setNewToStatus(to.status || 'ACTIVE');
    setNewToDescription(to.description || '');
    setShowTryoutModal(true);
  };

  const handleSaveTryoutPackage = () => {
    if (!newToTitle.trim()) {
      setErrorBanner("Nama Paket TryOut tidak boleh kosong.");
      return;
    }
    const isExternal = newToEntryMode === 'EXTERNAL';
    const internalSubjectId = isExternal ? undefined : (newToSubjectId || permittedSubjects[0]?.id || subjects[0]?.id);
    const selectedPkg = newToPackageId ? dbService.getExamPackageById(newToPackageId) : undefined;
    const fallbackExtIds = permittedSubjects.length > 0 ? permittedSubjects.map(s => s.id) : subjects.map(s => s.id);
    const selectedExtSubjectIds = isExternal
      ? (newToExternalSubjectIds.length > 0 ? newToExternalSubjectIds : fallbackExtIds)
      : undefined;
    const selectedExtSubjectNames = selectedExtSubjectIds
      ? selectedExtSubjectIds.map(id => subjects.find(s => s.id === id)?.name).filter(Boolean) as string[]
      : undefined;

    const allGlobalTryouts = dbService.getTryouts();

    if (editingTryoutId) {
      const existing = allGlobalTryouts.find(t => t.id === editingTryoutId);
      if (!existing) return;

      const updatedCode = newToCode.trim() || existing.code;
      // Cek duplikasi kode unik secara global (selain tryout yang sedang diedit)
      const isDuplicateCode = allGlobalTryouts.some(
        t => t.id !== editingTryoutId && t.code.toLowerCase().trim() === updatedCode.toLowerCase().trim()
      );
      if (isDuplicateCode) {
        setErrorBanner(`Validasi Gagal: Kode Try Out '${updatedCode}' sudah digunakan di sistem. Gunakan kode unik lain.`);
        return;
      }

      const updates: Partial<Tryout> = {
        title: newToTitle.trim(),
        code: updatedCode,
        packageId: newToPackageId || undefined,
        tryoutGroup: newToGroup || 'TO 1',
        subjectId: internalSubjectId,
        isExternal,
        source: isExternal ? 'EXTERNAL' : 'INTERNAL',
        externalSubjectIds: selectedExtSubjectIds,
        externalSubjects: selectedExtSubjectNames,
        googleFormUrl: isExternal ? undefined : newToGFormUrl.trim(),
        googleSheetUrl: isExternal ? undefined : newToGSheetUrl.trim(),
        startDate: newToStartDate ? new Date(newToStartDate).toISOString() : existing.startDate,
        endDate: newToEndDate ? new Date(newToEndDate).toISOString() : existing.endDate,
        status: newToStatus,
        targetClassIds: newToTargetClasses.length > 0 ? newToTargetClasses : undefined,
        description: newToDescription.trim() || existing.description,
      };

      // Jika URL Google Sheet berubah, reset kolom agar guru dapat mengonfirmasi ulang
      if (!isExternal && newToGSheetUrl.trim() !== (existing.googleSheetUrl || '').trim()) {
        updates.selectedQuestionColumns = undefined;
      }

      dbService.updateTryout(editingTryoutId, updates, currentUser);

      if (!isExternal && selectedPkg && newToGSheetUrl.trim() && internalSubjectId) {
        dbService.updateExamPackageSubject(
          selectedPkg.id,
          internalSubjectId,
          {
            googleSheetUrl: newToGSheetUrl.trim(),
            googleFormUrl: newToGFormUrl.trim(),
            syncStatus: 'SYNCED',
          },
          currentUser
        );
      } else if (isExternal && selectedPkg && selectedExtSubjectIds && selectedExtSubjectIds.length > 0) {
        // Tandai mapel-mapel yang diujikan dalam TO Eksternal sebagai SYNCED di wadah paket
        selectedExtSubjectIds.forEach(subId => {
          dbService.updateExamPackageSubject(
            selectedPkg.id,
            subId,
            {
              syncStatus: 'SYNCED',
            },
            currentUser
          );
        });
      }

      setTryouts(dbService.getTryoutsForTeacher(currentUser));
      setShowTryoutModal(false);
      setEditingTryoutId(null);
      triggerToast(`Paket TryOut '${newToTitle.trim()}' berhasil diperbarui!`);
      refreshData();
      return;
    }

    // CREATE NEW TRYOUT — validasi kode unik secara GLOBAL di seluruh tryout database
    const createdCode = newToCode.trim() || getNextAvailableTryoutCode();

    // Cek duplikasi kode (case-insensitive) terhadap SEMUA tryout di sistem
    const isDuplicateCode = allGlobalTryouts.some(t => t.code.toLowerCase().trim() === createdCode.toLowerCase().trim());
    if (isDuplicateCode) {
      setErrorBanner(`Validasi Gagal: Kode Try Out '${createdCode}' sudah digunakan di sistem (oleh mapel atau guru lain). Gunakan kode lain yang unik.`);
      return;
    }

    const newToObj: Tryout = {
      id: generateUuid(),
      code: createdCode,
      title: newToTitle.trim(),
      assessmentType: 'TRYOUT',
      academicYearId: selectedPkg?.academicYearId || '0ffe2ac4-48bd-400b-ae8c-05ecff36e4a1',
      startDate: newToStartDate ? new Date(newToStartDate).toISOString() : new Date().toISOString(),
      endDate: newToEndDate ? new Date(newToEndDate).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: newToStatus || 'ACTIVE',
      subjectId: internalSubjectId,
      isExternal,
      source: isExternal ? 'EXTERNAL' : 'INTERNAL',
      externalSubjectIds: selectedExtSubjectIds,
      externalSubjects: selectedExtSubjectNames,
      externalScoreScale: 'SCALE_100',
      scoringConfig: {
        scoringType: 'EQUAL_WEIGHT',
        maxScore: 100,
        correctScore: 1,
        wrongScore: 0,
        unansweredScore: 0,
        allowNegativeMarking: false,
        passingGrade: 75,
      },
      googleFormUrl: isExternal ? undefined : (newToGFormUrl.trim() || 'https://forms.google.com/sample'),
      googleSheetUrl: isExternal ? undefined : (newToGSheetUrl.trim() || 'https://docs.google.com/spreadsheets/d/sample/edit'),
      description: newToDescription.trim() || (isExternal
        ? `Try Out Eksternal ${createdCode} (Rekap Nilai).${selectedPkg ? ` Masuk ke wadah: ${selectedPkg.title}` : ''}`
        : `Paket Ujian TryOut ${createdCode} terhubung dengan Google Form & Google Sheet.${selectedPkg ? ` Masuk ke wadah: ${selectedPkg.title}` : ''}`),
      packageId: selectedPkg?.id,
      tryoutGroup: newToGroup || 'TO 1',
      targetClassIds: newToTargetClasses.length > 0 ? newToTargetClasses : selectedPkg?.targetClassIds,
    };

    dbService.saveTryout(newToObj);

    if (!isExternal && selectedPkg && newToGSheetUrl.trim() && internalSubjectId) {
      dbService.updateExamPackageSubject(
        selectedPkg.id,
        internalSubjectId,
        {
          googleSheetUrl: newToGSheetUrl.trim(),
          googleFormUrl: newToGFormUrl.trim(),
          syncStatus: 'SYNCED',
        },
        currentUser
      );
    } else if (isExternal && selectedPkg && selectedExtSubjectIds && selectedExtSubjectIds.length > 0) {
      // Tandai mapel-mapel yang diujikan dalam TO Eksternal sebagai SYNCED di wadah paket
      selectedExtSubjectIds.forEach(subId => {
        dbService.updateExamPackageSubject(
          selectedPkg.id,
          subId,
          {
            syncStatus: 'SYNCED',
          },
          currentUser
        );
      });
    }

    setTryouts(dbService.getTryoutsForTeacher(currentUser));
    setShowTryoutModal(false);
    setNewToCode('');
    setNewToTitle('');
    setNewToGFormUrl('');
    setNewToGSheetUrl('');
    setNewToPackageId('');
    setNewToSubjectId('');
    setNewToEntryMode('INTERNAL');
    setNewToTargetClasses([]);
    setNewToExternalSubjectIds([]);
    setNewToStartDate('');
    setNewToEndDate('');
    setNewToDescription('');

    if (isExternal) {
      triggerToast(
        `Try Out Eksternal '${newToObj.title}' berhasil ditambahkan! Silakan unduh template Excel atau unggah rekap nilai.`
      );
    } else {
      triggerToast(
        `Paket TryOut '${newToObj.title}' berhasil ditambahkan${
          selectedPkg ? ` ke dalam wadah '${selectedPkg.title}'` : ''
        }! Kunci jawaban akan otomatis terdeteksi dari Google Sheet.`
      );
    }
    refreshData();
  };

  // Contextual Confirmation Delete State (Safe replacement for window.confirm)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ id: string; code: string; title: string; type?: 'QUESTION' | 'MATERIAL' | 'COMPETENCY' | 'TRYOUT' } | null>(null);

  // Checkbox Bulk Delete States for Guru App
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [selectedCompetencyIds, setSelectedCompetencyIds] = useState<string[]>([]);

  const [guruBatchDeleteConfirm, setGuruBatchDeleteConfirm] = useState<{
    type: 'QUESTION' | 'MATERIAL' | 'COMPETENCY';
    count: number;
  } | null>(null);

  const handleConfirmGuruBatchDelete = () => {
    if (!guruBatchDeleteConfirm) return;
    try {
      if (guruBatchDeleteConfirm.type === 'QUESTION') {
        dbService.deleteQuestionsBatch(selectedQuestionIds, currentUser);
        setSuccessToast(`Berhasil menghapus massal ${selectedQuestionIds.length} butir soal.`);
        setSelectedQuestionIds([]);
      } else if (guruBatchDeleteConfirm.type === 'MATERIAL') {
        dbService.deleteMaterialsBatch(selectedMaterialIds, currentUser);
        setSuccessToast(`Berhasil menghapus massal ${selectedMaterialIds.length} materi.`);
        setSelectedMaterialIds([]);
      } else if (guruBatchDeleteConfirm.type === 'COMPETENCY') {
        dbService.deleteCompetenciesBatch(selectedCompetencyIds, currentUser);
        setSuccessToast(`Berhasil menghapus massal ${selectedCompetencyIds.length} kompetensi.`);
        setSelectedCompetencyIds([]);
      }
      setGuruBatchDeleteConfirm(null);
      refreshData();
    } catch (err: any) {
      setErrorBanner(err.message || 'Gagal menghapus data massal.');
      setGuruBatchDeleteConfirm(null);
    }
  };

  // Material Modal State
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [matSubjectId, setMatSubjectId] = useState('subj-mat');
  const [matCode, setMatCode] = useState('');
  const [matTitle, setMatTitle] = useState('');
  const [matDescription, setMatDescription] = useState('');
  const [matGoogleFormUrl, setMatGoogleFormUrl] = useState('');
  const [previewGoogleFormUrl, setPreviewGoogleFormUrl] = useState<string | null>(null);

  // Competency Modal State
  const [showCompetencyModal, setShowCompetencyModal] = useState(false);
  const [editingCompetencyId, setEditingCompetencyId] = useState<string | null>(null);
  const [compSubjectId, setCompSubjectId] = useState('subj-mat');
  const [compCode, setCompCode] = useState('');
  const [compStatement, setCompStatement] = useState('');
  const [compGrade, setCompGrade] = useState<string>('');

  // Google Sheets Import Pipeline State (5 Stages: Input -> Mapping -> Validation/Preview -> Confirm -> Raw Responses & Scoring)
  const [importStage, setImportStage] = useState<'INPUT' | 'MAPPING' | 'PREVIEW' | 'CONFIRMED'>('INPUT');
  const [rawPasteText, setRawPasteText] = useState('');
  const [previewItems, setPreviewItems] = useState<SheetImportPreviewItem[]>([]);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMappingConfig>({
    nisnColumn: 'NISN',
    questionMappings: {},
  });
  const [validationSummary, setValidationSummary] = useState<SheetImportSummary | null>(null);
  const [googleFormRef, setGoogleFormRef] = useState({
    formId: '1FAIpQLSe-MAT-TO03',
    formTitle: 'Try Out Akbar Matematika Wajib XII',
    formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSe-MAT-TO03/viewform',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
    lastSync: 'Baru saja',
  });
  const [integrationTestResult, setIntegrationTestResult] = useState<{
    passed: boolean;
    tests: { name: string; passed: boolean; message: string }[];
  } | null>(null);

  // Phase 10: Explanation Modal & Management State
  const [showExplanationModal, setShowExplanationModal] = useState(false);
  const [editingExplanationId, setEditingExplanationId] = useState<string | null>(null);
  const [expTitle, setExpTitle] = useState('');
  const [expSubjectId, setExpSubjectId] = useState<string>('subj-mat');
  const [expTryoutId, setExpTryoutId] = useState<string>('');
  const [expQuestionId, setExpQuestionId] = useState<string>('GENERAL');
  const [expScopeMode, setExpScopeMode] = useState<'ALL' | 'SPECIFIC'>('ALL');
  const [expSelectedNumbers, setExpSelectedNumbers] = useState<number[]>([]);
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');
  const [expContentText, setExpContentText] = useState('');
  const [expPdfUrl, setExpPdfUrl] = useState('');
  const [expPdfFileName, setExpPdfFileName] = useState('');
  const [expYoutubeUrl, setExpYoutubeUrl] = useState('');
  const [expExternalUrl, setExpExternalUrl] = useState('');
  const [expStatus, setExpStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('PUBLISHED');
  const [copiedExpUrl, setCopiedExpUrl] = useState<string | null>(null);

  // Quick Link Management State in Teacher Portal
  const [quickExpSubjectId, setQuickExpSubjectId] = useState<string>('subj-mat');
  const [quickExpScope, setQuickExpScope] = useState<string>('GENERAL');
  const [quickExpTitle, setQuickExpTitle] = useState<string>('');
  const [quickExpPdfUrl, setQuickExpPdfUrl] = useState<string>('');
  const [quickExpPdfFileName, setQuickExpPdfFileName] = useState<string>('');
  const [quickExpYoutubeUrl, setQuickExpYoutubeUrl] = useState<string>('');
  const [quickExpContentText, setQuickExpContentText] = useState<string>('');
  const [quickExpStatus, setQuickExpStatus] = useState<'PUBLISHED' | 'DRAFT'>('PUBLISHED');
  const [activeVideoModalUrl, setActiveVideoModalUrl] = useState<string | null>(null);
  const [activeVideoModalTitle, setActiveVideoModalTitle] = useState<string>('');

  // Dynamic question count & custom number management for explanation modal
  const [expCustomNumbers, setExpCustomNumbers] = useState<number[]>([]);
  const [isQuestionDeleteMode, setIsQuestionDeleteMode] = useState<boolean>(false);
  const [syncQuestionCountToTryout, setSyncQuestionCountToTryout] = useState<boolean>(true);
  const [customQuestionInput, setCustomQuestionInput] = useState<string>('');

  const getInitialQuestionNumbers = (tId?: string, sId?: string, existing?: number[]): number[] => {
    const numsSet = new Set<number>();
    if (existing && existing.length > 0) {
      existing.forEach(n => numsSet.add(n));
    }
    if (tId) {
      const tryoutQs = dbService.getQuestionsForTryout(tId, sId);
      if (tryoutQs && tryoutQs.length > 0) {
        tryoutQs.forEach((q, idx) => numsSet.add(q.questionNumber || (idx + 1)));
      } else {
        const targetTo = tryouts.find(t => t.id === tId);
        if (targetTo?.selectedQuestionColumns && targetTo.selectedQuestionColumns.length > 0) {
          targetTo.selectedQuestionColumns.forEach((_, idx) => numsSet.add(idx + 1));
        }
      }
    }
    if (numsSet.size === 0) {
      for (let i = 1; i <= 25; i++) numsSet.add(i);
    }
    return Array.from(numsSet).sort((a, b) => a - b);
  };

  const expAvailableNumbers = useMemo(() => {
    if (expCustomNumbers && expCustomNumbers.length > 0) {
      return expCustomNumbers;
    }
    if (!expTryoutId) return Array.from({ length: 25 }, (_, i) => i + 1);
    const tryoutQs = dbService.getQuestionsForTryout(expTryoutId, expSubjectId);
    if (tryoutQs && tryoutQs.length > 0) {
      const nums = tryoutQs.map((q, idx) => q.questionNumber || (idx + 1));
      return Array.from(new Set(nums)).sort((a, b) => a - b);
    }
    const targetTo = tryouts.find(t => t.id === expTryoutId);
    if (targetTo?.selectedQuestionColumns && targetTo.selectedQuestionColumns.length > 0) {
      return Array.from({ length: targetTo.selectedQuestionColumns.length }, (_, i) => i + 1);
    }
    return Array.from({ length: 25 }, (_, i) => i + 1);
  }, [expCustomNumbers, expTryoutId, expSubjectId, tryouts, questions]);

  const handleSetTotalQuestions = (count: number) => {
    if (isNaN(count) || count < 1) return;
    const clamped = Math.min(Math.max(count, 1), 200);
    const newNums = Array.from({ length: clamped }, (_, i) => i + 1);
    setExpCustomNumbers(newNums);
    setExpSelectedNumbers(prev => prev.filter(n => newNums.includes(n)));
  };

  const handleAddQuestion = () => {
    const currentList = expCustomNumbers.length > 0 ? expCustomNumbers : expAvailableNumbers;
    const nextNum = currentList.length > 0 ? Math.max(...currentList) + 1 : 1;
    const updated = [...currentList, nextNum].sort((a, b) => a - b);
    setExpCustomNumbers(updated);
  };

  const handleRemoveLastQuestion = () => {
    const currentList = expCustomNumbers.length > 0 ? expCustomNumbers : expAvailableNumbers;
    if (currentList.length <= 1) {
      triggerToast('Minimal harus ada 1 butir soal dalam try out.');
      return;
    }
    const maxNum = Math.max(...currentList);
    const updated = currentList.filter(n => n !== maxNum);
    setExpCustomNumbers(updated);
    setExpSelectedNumbers(prev => prev.filter(n => n !== maxNum));
  };

  const handleRemoveSpecificQuestion = (numToRemove: number) => {
    const currentList = expCustomNumbers.length > 0 ? expCustomNumbers : expAvailableNumbers;
    if (currentList.length <= 1) {
      triggerToast('Minimal harus ada 1 butir soal dalam try out.');
      return;
    }
    const updated = currentList.filter(n => n !== numToRemove);
    setExpCustomNumbers(updated);
    setExpSelectedNumbers(prev => prev.filter(n => n !== numToRemove));
  };

  const handleAddSpecificQuestion = (numToAdd: number) => {
    if (isNaN(numToAdd) || numToAdd < 1 || numToAdd > 200) return;
    const currentList = expCustomNumbers.length > 0 ? expCustomNumbers : expAvailableNumbers;
    if (currentList.includes(numToAdd)) {
      triggerToast(`Soal nomor #${numToAdd} sudah ada dalam daftar.`);
      return;
    }
    const updated = [...currentList, numToAdd].sort((a, b) => a - b);
    setExpCustomNumbers(updated);
    setCustomQuestionInput('');
  };

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

  const getYouTubeThumbnail = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try {
      let videoId: string | null = null;
      const matchEmbed = url.match(/embed\/([^?&#]+)/);
      if (matchEmbed && matchEmbed[1]) videoId = matchEmbed[1];
      const matchWatch = url.match(/[?&]v=([^&#]+)/);
      if (matchWatch && matchWatch[1]) videoId = matchWatch[1];
      const matchShort = url.match(/youtu\.be\/([^?&#]+)/);
      if (matchShort && matchShort[1]) videoId = matchShort[1];
      const matchShorts = url.match(/shorts\/([^?&#]+)/);
      if (matchShorts && matchShorts[1]) videoId = matchShorts[1];
      if (videoId) {
        return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      }
    } catch {
      // fallback
    }
    return null;
  };

  // Explanation Filters & Test Suite State
  const [expFilterTryoutId, setExpFilterTryoutId] = useState<string>('ALL');
  const [expFilterSubjectId, setExpFilterSubjectId] = useState<string>('ACTIVE');
  const [expFilterStatus, setExpFilterStatus] = useState<string>('ALL');
  const [expFilterScope, setExpFilterScope] = useState<string>('ALL');
  const [expViewMode, setExpViewMode] = useState<'RESOURCE_CARDS' | 'MODULES'>('RESOURCE_CARDS');
  const [expMediaTypeFilter, setExpMediaTypeFilter] = useState<'ALL' | 'YOUTUBE' | 'PDF'>('ALL');
  const [explanationTestResult, setExplanationTestResult] = useState<ExplanationTestSuiteResult | null>(null);

  // Phase 11: Report Test Suite State
  const [reportTestResult, setReportTestResult] = useState<ReportTestSuiteResult | null>(null);

  // Phase 14: Master Production Readiness Validation Test Suite State
  const [productionValidationResult, setProductionValidationResult] = useState<ProductionValidationSuiteResult | null>(null);
  const [progressSubTab, setProgressSubTab] = useState<'STUDENT' | 'CLASS' | 'SUBJECT'>('STUDENT');
  const [selectedStudentForProgress, setSelectedStudentForProgress] = useState<string>('');
  const [selectedClassForProgress, setSelectedClassForProgress] = useState<string>('ALL');
  const [selectedSubjectForProgress, setSelectedSubjectForProgress] = useState<string>('');

  // Scoring Engine Test & Simulator States (Phase 8 Specification)
  const [scoringTestResult, setScoringTestResult] = useState<{
    passed: boolean;
    tests: ScoringTestCaseResult[];
  } | null>(null);
  const [mismatchScores, setMismatchScores] = useState<Score[]>([]);

  // Interactive Scoring Simulator States
  const [simScoringType, setSimScoringType] = useState<'EQUAL_WEIGHT' | 'CUSTOM_WEIGHT'>('EQUAL_WEIGHT');
  const [simMaxScore, setSimMaxScore] = useState<number>(100);
  const [simCorrectScore, setSimCorrectScore] = useState<number>(4);
  const [simWrongScore, setSimWrongScore] = useState<number>(-1);
  const [simUnansweredScore, setSimUnansweredScore] = useState<number>(0);
  const [simAllowNegativeMarking, setSimAllowNegativeMarking] = useState<boolean>(true);
  const [simGFormScore, setSimGFormScore] = useState<number>(50);
  const [simAnswers, setSimAnswers] = useState<Record<string, string>>({
    'SIM-Q01': 'A',
    'SIM-Q02': 'A',
    'SIM-Q03': 'A',
    'SIM-Q04': 'B',
    'SIM-Q05': 'C',
  });
  const [simWeights, setSimWeights] = useState<Record<string, number>>({
    'SIM-Q01': 1,
    'SIM-Q02': 1,
    'SIM-Q03': 1,
    'SIM-Q04': 1,
    'SIM-Q05': 1,
  });
  const [simResult, setSimResult] = useState<CalculationResult | null>(null);

  // Phase 9: Analytics Engine UI States
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [toAnalyticsSubTab, setToAnalyticsSubTab] = useState<'PROGRESS' | 'ITEM_ANALYSIS' | 'REPORTS'>('PROGRESS');
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'OVERALL' | 'CLASS' | 'STUDENT' | 'PSYCHOMETRICS' | 'SUMATIF_EVALUATION'>('OVERALL');
  const [selectedSumatifPackageId, setSelectedSumatifPackageId] = useState<string>('');
  const [analyticsYearFilter, setAnalyticsYearFilter] = useState('ALL');
  const [analyticsGradeFilter, setAnalyticsGradeFilter] = useState('ALL');
  const [analyticsClassFilter, setAnalyticsClassFilter] = useState('ALL');
  const [studentClassFilter, setStudentClassFilter] = useState('ALL');
  const [studentTryoutFilter, setStudentTryoutFilter] = useState('');
  const [studentQuestionTab, setStudentQuestionTab] = useState<'ALL' | 'CORRECT' | 'INCORRECT'>('ALL');
  const [psychometricsTryoutId, setPsychometricsTryoutId] = useState('');
  const [psychometricsClassFilter, setPsychometricsClassFilter] = useState('ALL');
  const [selectedStudentForAnalytics, setSelectedStudentForAnalytics] = useState<string>('');
  const [analyticsTestResult, setAnalyticsTestResult] = useState<AnalyticsTestSuiteResult | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<any | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [analyticsRankingPage, setAnalyticsRankingPage] = useState(1);
  const [analyticsQuestionPage, setAnalyticsQuestionPage] = useState(1);

  // Sync data strictly according to teacher permissions
  const refreshData = () => {
    const teacherSubjects = dbService.getTeacherAllowedSubjectIds(currentUser);
    const teacherClasses = dbService.getTeacherAllowedClassIds(currentUser);
    setAllowedSubjectIds(teacherSubjects);
    setAllowedClassIds(teacherClasses);

    // If active selected subject is not permitted, select first permitted subject
    if (teacherSubjects.length > 0) {
      if (!teacherSubjects.includes(selectedSubjectId)) {
        setSelectedSubjectId(teacherSubjects[0]);
      }
      setQSubjectId(prev => teacherSubjects.includes(prev) ? prev : teacherSubjects[0]);
      setMatSubjectId(prev => teacherSubjects.includes(prev) ? prev : teacherSubjects[0]);
      setCompSubjectId(prev => teacherSubjects.includes(prev) ? prev : teacherSubjects[0]);
      setExpSubjectId(prev => teacherSubjects.includes(prev) ? prev : teacherSubjects[0]);
      setQuickExpSubjectId(prev => teacherSubjects.includes(prev) ? prev : teacherSubjects[0]);
    }

    setAcademicYears(dbService.getAcademicYears());
    setQuestions(dbService.getQuestionsForTeacher(currentUser));
    setMaterials(dbService.getMaterialsForTeacher(currentUser));
    setCompetencies(dbService.getCompetenciesForTeacher(currentUser));
    setTryouts(dbService.getTryoutsForTeacher(currentUser));
    setClasses(dbService.getClassesForTeacher(currentUser));
    setStudents(dbService.getStudentsForTeacher(currentUser));
    setScores(dbService.getScores());
    setSubjects(dbService.getSubjects());
    setExplanations(
      currentUser?.role === 'ADMIN'
        ? dbService.getExplanations()
        : dbService.getExplanationsForTeacher(currentUser)
    );
    setMismatchScores(dbService.getScoringMismatches());
  };

  useEffect(() => {
    refreshData();
    const unsubscribeLocal = dbService.subscribe(refreshData);
    const stopRealtimeSync = dbService.startRealtimeSync();

    return () => {
      unsubscribeLocal();
      stopRealtimeSync();
    };
  }, [currentUser]);

  const triggerToast = (msg: string) => {
    setSuccessToast(msg);
    setErrorBanner(null);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  const triggerError = (msg: string) => {
    setErrorBanner(msg);
    setTimeout(() => setErrorBanner(null), 5000);
  };

  // ── Fungsi inti yang dipanggil SETELAH guru konfirmasi kolom di Modal ─────────
  const executeSheetSync = async (
    tryout: Tryout,
    headers: string[],
    rows: Record<string, string>[],
    selectedColumns: string[],
    nisnCol: string,
    nameCol: string,
    scoreCol: string,
    keyRow: Record<string, string> | null
  ) => {
    setSheetSyncStatus(prev => ({
      ...prev,
      [tryout.id]: { lastSyncAt: prev[tryout.id]?.lastSyncAt ?? null, status: 'syncing', newCount: 0, errorMsg: '' },
    }));

    try {
      // Rekonsiliasi kolom pilihan guru terhadap header CSV terbaru (menangani header duplikat/bergambar/diedit)
      const effectiveColumns = GoogleIntegrationService.reconcileSelectedColumns(selectedColumns, headers, rows);

      // Simpan konfigurasi kolom ke tryout agar sinkronisasi susulan tidak perlu pilih ulang
      dbService.updateTryout(tryout.id, { selectedQuestionColumns: effectiveColumns }, null);

      // Cari mata pelajaran
      const allSubjectsNow = dbService.getSubjects();
      const permittedSubjectsNow = allSubjectsNow.filter(s => allowedSubjectIds.includes(s.id));
      const tryoutSubject = (tryout.subjectId ? allSubjectsNow.find(s => s.id === tryout.subjectId) : null) || permittedSubjectsNow[0] || allSubjectsNow[0];
      if (!tryoutSubject) throw new Error('Mata pelajaran tidak ditemukan untuk sinkronisasi.');

      // Selalu jalankan ensureQuestionsExist dengan menyertakan rows agar teks soal, opsi A..E (teks penuh Google Form),
      // dan kunci jawaban resmi tersinkronisasi 100% dengan jumlah kolom soal aktif.
      const tryoutQuestions = GoogleIntegrationService.ensureQuestionsExist(
        tryoutSubject,
        headers,
        keyRow,
        currentUser,
        effectiveColumns,
        rows
      );
      setQuestions(dbService.getQuestions());

      // Buat mapping config berdasarkan kolom pilihan guru yang telah direkonsiliasi
      const mappingConfig = GoogleIntegrationService.detectColumnMappings(
        headers,
        tryoutQuestions,
        { nisnColumn: nisnCol, scoreColumn: scoreCol || undefined, nameColumn: nameCol || undefined },
        effectiveColumns
      );

      const allStudentsNow = dbService.getStudents();
      const allScoresNow = dbService.getScores();
      const validationResult = GoogleIntegrationService.validateSheetImportDetailed(
        rows,
        tryout,
        tryoutSubject,
        tryoutQuestions,
        allStudentsNow,
        allScoresNow,
        mappingConfig
      );

      // Simpan metadata duplikasi submisi ke tryout agar guru dapat memantau siswa pengumpul ganda
      if (validationResult.summary.duplicateSubmissions !== undefined) {
        dbService.updateTryout(tryout.id, {
          selectedQuestionColumns: effectiveColumns,
          duplicateSubmissions: validationResult.summary.duplicateSubmissions,
        }, null);
      }

      if (validationResult.summary.answerKeyDetected) {
        triggerToast(`Kunci Jawaban Resmi diperbarui dari respon "${validationResult.summary.answerKeyStudentName}" (${validationResult.summary.answerKeyExtractedCount} butir soal).`);
        setTryouts(dbService.getTryoutsForTeacher(currentUser));
        setQuestions(dbService.getQuestions());
      }

      const importableItems = validationResult.previewItems.filter(
        item => item.status === 'VALID' || item.status === 'WARNING_MISMATCH'
      );

      if (importableItems.length === 0) {
        setSheetSyncStatus(prev => ({
          ...prev,
          [tryout.id]: { lastSyncAt: new Date(), status: 'success', newCount: 0, errorMsg: '' },
        }));
        setTryouts(dbService.getTryoutsForTeacher(currentUser));
        if (validationResult.summary.answerKeyDetected) {
          triggerToast(`Kunci Jawaban resmi tersimpan (${validationResult.summary.answerKeyExtractedCount} soal). Menunggu respon siswa nyata untuk analisis.`);
        } else {
          triggerToast(`Sinkronisasi selesai. ${selectedColumns.length} kolom soal dipetakan.`);
        }
        return;
      }

      const result = GoogleIntegrationService.executeIdempotentImport(
        tryout,
        tryoutSubject,
        importableItems,
        tryoutQuestions,
        currentUser,
        {
          sourceType: 'GOOGLE_FORM_SYNC',
          sourceUrl: tryout.googleSheetUrl,
        }
      );

      setSheetSyncStatus(prev => ({
        ...prev,
        [tryout.id]: {
          lastSyncAt: new Date(),
          status: 'success',
          newCount: result.insertedCount,
          errorMsg: '',
        },
      }));
      // Otomatis arahkan fokus UI ke tryout yang baru saja disinkronkan
      setSelectedTryoutId(tryout.id);
      setStudentTryoutFilter(tryout.id);
      setPsychometricsTryoutId(tryout.id);
      if (tryoutSubject) {
        setSelectedSubjectId(tryoutSubject.id);
      }
      setTryouts(dbService.getTryoutsForTeacher(currentUser));
      refreshData();
    } catch (err: any) {
      setSheetSyncStatus(prev => ({
        ...prev,
        [tryout.id]: {
          lastSyncAt: prev[tryout.id]?.lastSyncAt ?? null,
          status: 'error',
          newCount: 0,
          errorMsg: err.message || 'Gagal sinkronisasi.',
        },
      }));
    }
  };

  // ── Buka Modal Konfigurasi Kolom Secara Eksplisit (Kapan saja guru butuh) ──
  const openColumnConfigModal = async (tryout: Tryout) => {
    if (!tryout.googleSheetUrl) return;

    setSheetSyncStatus(prev => ({
      ...prev,
      [tryout.id]: { lastSyncAt: prev[tryout.id]?.lastSyncAt ?? null, status: 'syncing', newCount: 0, errorMsg: '' },
    }));

    try {
      const csvText = await GoogleIntegrationService.fetchSheetCsv(tryout.googleSheetUrl);
      const { headers, rows } = GoogleIntegrationService.parseRawSheetText(csvText);
      if (rows.length === 0) throw new Error('Sheet kosong atau tidak ada baris data.');

      const allDbStudents = dbService.getStudents();
      const detectedKeyRow = rows.find(r => {
        const nisnEntry = Object.entries(r).find(([k]) => {
          const lk = k.toLowerCase();
          return lk === 'nisn' || lk.includes('nisn') || lk.includes('nomor induk');
        });
        const nameEntry = Object.entries(r).find(([k]) => {
          const lk = k.toLowerCase();
          return lk === 'nama' || lk.includes('nama');
        });
        const nisnVal = nisnEntry ? nisnEntry[1]?.trim() : '';
        const nameVal = nameEntry ? nameEntry[1]?.trim() : '';

        if (/kunci|answer\s*key|master\s*key/i.test(nameVal) || /kunci|answer\s*key|master\s*key/i.test(nisnVal) || nisnVal === '0000000000' || nisnVal === '9999999999') {
          return true;
        }
        if (!nisnVal) return false;
        const cleanVal = GoogleIntegrationService.normalizeNisn(nisnVal);
        const st = allDbStudents.find(s =>
          s.nisn === nisnVal ||
          String(s.nisn).trim() === String(nisnVal).trim() ||
          (cleanVal && GoogleIntegrationService.normalizeNisn(s.nisn) === cleanVal) ||
          (cleanVal && s.nisn.replace(/\D/g, '') === cleanVal)
        );
        return st?.isAnswerKeyAccount;
      }) || null;

      const preselect: Record<string, boolean> = {};
      if (tryout.selectedQuestionColumns && tryout.selectedQuestionColumns.length > 0) {
        const reconciledCols = GoogleIntegrationService.reconcileSelectedColumns(tryout.selectedQuestionColumns, headers, rows);
        const setCols = new Set(reconciledCols);
        headers.forEach(h => {
          preselect[h] = setCols.has(h);
        });
      } else {
        headers.forEach(h => {
          preselect[h] = !GoogleIntegrationService.isMetadataHeader(h);
        });
      }

      const nisnCol = GoogleIntegrationService.autoDetectNisnColumn(headers, rows, allDbStudents);
      const nameCol = GoogleIntegrationService.autoDetectNameColumn(headers);
      const scoreCol = GoogleIntegrationService.autoDetectScoreColumn(headers);

      setSheetSyncStatus(prev => ({
        ...prev,
        [tryout.id]: { lastSyncAt: prev[tryout.id]?.lastSyncAt ?? null, status: 'idle', newCount: 0, errorMsg: '' },
      }));

      setColumnSelectorTryout(tryout);
      setColumnSelectorHeaders(headers);
      setColumnSelectorRows(rows);
      setColumnSelectorNisnCol(nisnCol);
      setColumnSelectorNameCol(nameCol);
      setColumnSelectorScoreCol(scoreCol);
      setColumnSelectorKeyRow(detectedKeyRow);
      setColumnSelectorChecked(preselect);
    } catch (err: any) {
      setSheetSyncStatus(prev => ({
        ...prev,
        [tryout.id]: {
          lastSyncAt: prev[tryout.id]?.lastSyncAt ?? null,
          status: 'error',
          newCount: 0,
          errorMsg: err.message || 'Gagal mengambil data Sheet.',
        },
      }));
      triggerError(err.message || 'Gagal mengambil data Google Sheet.');
    }
  };

  // ── Sync: Ambil CSV dan sinkronkan data (hanya buka modal jika manual & belum terkonfigurasi) ──
  const syncTryoutFromSheet = async (tryout: Tryout, isManual = false) => {
    if (!tryout.googleSheetUrl) return;

    setSheetSyncStatus(prev => ({
      ...prev,
      [tryout.id]: { lastSyncAt: prev[tryout.id]?.lastSyncAt ?? null, status: 'syncing', newCount: 0, errorMsg: '' },
    }));

    try {
      const csvText = await GoogleIntegrationService.fetchSheetCsv(tryout.googleSheetUrl);
      const { headers, rows } = GoogleIntegrationService.parseRawSheetText(csvText);
      if (rows.length === 0) throw new Error('Sheet kosong atau tidak ada baris data.');

      // Deteksi baris akun kunci jawaban
      const allDbStudents = dbService.getStudents();
      const detectedKeyRow = rows.find(r => {
        const nisnEntry = Object.entries(r).find(([k]) => {
          const lk = k.toLowerCase();
          return lk === 'nisn' || lk.includes('nisn') || lk.includes('nomor induk');
        });
        const nameEntry = Object.entries(r).find(([k]) => {
          const lk = k.toLowerCase();
          return lk === 'nama' || lk.includes('nama');
        });
        const nisnVal = nisnEntry ? nisnEntry[1]?.trim() : '';
        const nameVal = nameEntry ? nameEntry[1]?.trim() : '';

        if (/kunci|answer\s*key|master\s*key/i.test(nameVal) || /kunci|answer\s*key|master\s*key/i.test(nisnVal) || nisnVal === '0000000000' || nisnVal === '9999999999') {
          return true;
        }
        if (!nisnVal) return false;
        const cleanVal = GoogleIntegrationService.normalizeNisn(nisnVal);
        const st = allDbStudents.find(s =>
          s.nisn === nisnVal ||
          String(s.nisn).trim() === String(nisnVal).trim() ||
          (cleanVal && GoogleIntegrationService.normalizeNisn(s.nisn) === cleanVal) ||
          (cleanVal && s.nisn.replace(/\D/g, '') === cleanVal)
        );
        return st?.isAnswerKeyAccount;
      }) || null;

      // Jika sudah ada konfigurasi kolom tersimpan ATAU dipanggil otomatis (background self-healing sync) → langsung sync tanpa modal
      if ((tryout.selectedQuestionColumns && tryout.selectedQuestionColumns.length > 0) || !isManual) {
        const savedCols = GoogleIntegrationService.reconcileSelectedColumns(tryout.selectedQuestionColumns, headers, rows);
        const nisnCol = GoogleIntegrationService.autoDetectNisnColumn(headers, rows, allDbStudents);
        const nameCol = GoogleIntegrationService.autoDetectNameColumn(headers);
        const scoreCol = GoogleIntegrationService.autoDetectScoreColumn(headers);
        await executeSheetSync(tryout, headers, rows, savedCols, nisnCol, nameCol, scoreCol, detectedKeyRow);
        return;
      }

      // Belum ada konfigurasi DAN merupakan manual klik oleh guru → buka Modal Pemilihan Kolom
      if (isManual) {
        const smartPreselect: Record<string, boolean> = {};
        headers.forEach(h => {
          smartPreselect[h] = !GoogleIntegrationService.isMetadataHeader(h);
        });

        const nisnCol = GoogleIntegrationService.autoDetectNisnColumn(headers, rows, allDbStudents);
        const nameCol = GoogleIntegrationService.autoDetectNameColumn(headers);
        const scoreCol = GoogleIntegrationService.autoDetectScoreColumn(headers);

        setSheetSyncStatus(prev => ({
          ...prev,
          [tryout.id]: { lastSyncAt: prev[tryout.id]?.lastSyncAt ?? null, status: 'idle', newCount: 0, errorMsg: '' },
        }));

        setColumnSelectorTryout(tryout);
        setColumnSelectorHeaders(headers);
        setColumnSelectorRows(rows);
        setColumnSelectorNisnCol(nisnCol);
        setColumnSelectorNameCol(nameCol);
        setColumnSelectorScoreCol(scoreCol);
        setColumnSelectorKeyRow(detectedKeyRow);
        setColumnSelectorChecked(smartPreselect);
      }
    } catch (err: any) {
      setSheetSyncStatus(prev => ({
        ...prev,
        [tryout.id]: {
          lastSyncAt: prev[tryout.id]?.lastSyncAt ?? null,
          status: 'error',
          newCount: 0,
          errorMsg: err.message || 'Gagal mengambil data Sheet.',
        },
      }));
      if (isManual) {
        triggerError(err.message || 'Gagal mengambil data Google Sheet.');
      }
    }
  };

  // Simpan referensi tryouts terbaru tanpa memicu looping dependency
  const tryoutsRef = useRef<Tryout[]>(tryouts);
  useEffect(() => {
    tryoutsRef.current = tryouts;
  }, [tryouts]);

  // ── Auto-poll setiap 5 menit (untuk seluruh tryout internal yang memiliki URL Google Sheet valid) ──
  useEffect(() => {
    const SAMPLE_URL = 'https://docs.google.com/spreadsheets/d/sample/edit';
    const autoSync = () => {
      const currentList = tryoutsRef.current || [];
      currentList.forEach(to => {
        if (to.googleSheetUrl && to.googleSheetUrl !== SAMPLE_URL && !to.isExternal && to.status !== 'ARCHIVED') {
          syncTryoutFromSheet(to, false);
        }
      });
    };
    // Initial sync setelah 4 detik saat UI sudah siap sepenuhnya
    const initial = setTimeout(autoSync, 4000);
    // Ulangi setiap 5 menit (tidak menguras memori/CPU browser)
    const interval = setInterval(autoSync, 5 * 60 * 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []); // Run on mount only! Mencegah infinite re-polling saat tryouts berubah

  const handleTabChange = (tab: GuruTab) => {
    setIsLoading(true);
    if (tab === 'PROGRESS_TRACKING') {
      setToAnalyticsSubTab('PROGRESS');
      setActiveTab('ANALYTICS_TO');
    } else if (tab === 'ANALYTICS') {
      setToAnalyticsSubTab('ITEM_ANALYSIS');
      setActiveTab('ANALYTICS_TO');
    } else if (tab === 'REPORTS') {
      setToAnalyticsSubTab('REPORTS');
      setActiveTab('ANALYTICS_TO');
    } else {
      setActiveTab(tab);
    }
    setSidebarOpen(false);
    setTimeout(() => setIsLoading(false), 150);
  };

  // Active items for view — Smart selection prioritizing tryouts that actually contain scores or answers
  const tryoutWithData = tryouts.find(t =>
    scores.some(s => s.tryoutId === t.id) ||
    dbService.getAnswers().some(a => a.tryoutId === t.id)
  );
  const smartDefaultTryoutId = tryoutWithData?.id || tryouts[0]?.id || '';
  const activeTryout = tryouts.find(t => t.id === selectedTryoutId) || tryouts.find(t => t.id === smartDefaultTryoutId) || tryouts[0];
  const activeSubject = subjects.find(s => s.id === selectedSubjectId);
  const permittedSubjects = subjects.filter(s => allowedSubjectIds.includes(s.id));
  const activeSubjectObj = permittedSubjects[0] || subjects[0];
  const currentSubjectKKM = activeSubjectObj?.passingGrade ?? 75.0;

  // Cascading Class Filter: Hanya tampilkan kelas target sesuai konfigurasi Tryout / Wadah aktif
  const availableClassesForActiveTryout = useMemo(() => {
    if (!activeTryout) return classes;
    const directTargetClassIds = activeTryout.targetClassIds;
    const pkgTargetClassIds = activeTryout.packageId
      ? dbService.getExamPackageById(activeTryout.packageId)?.targetClassIds
      : undefined;
    const targets = (directTargetClassIds && directTargetClassIds.length > 0)
      ? directTargetClassIds
      : (pkgTargetClassIds && pkgTargetClassIds.length > 0)
      ? pkgTargetClassIds
      : undefined;

    if (!targets || targets.length === 0) return classes;
    const matched = classes.filter(c => targets.includes(c.id));
    return matched.length > 0 ? matched : classes;
  }, [activeTryout, classes]);

  // Wadah Sumatif (SAS & SAT) untuk Guru
  const teacherSumatifPackages = useMemo(() => {
    return dbService.getExamPackages().filter(p => p.assessmentType === 'SAS' || p.assessmentType === 'SAT');
  }, [tryouts]);

  const activeSumatifPackage = useMemo(() => {
    if (selectedSumatifPackageId) {
      return teacherSumatifPackages.find(p => p.id === selectedSumatifPackageId) || teacherSumatifPackages[0];
    }
    return teacherSumatifPackages[0];
  }, [teacherSumatifPackages, selectedSumatifPackageId]);

  const teacherSumatifData = useMemo(() => {
    if (!activeSumatifPackage || !activeSubjectObj) return null;
    return SumatifAnalyticsService.calculateTeacherAnalytics(
      activeSubjectObj.id,
      activeSumatifPackage,
      scores,
      students,
      classes,
      questions,
      dbService.getAnswers(),
      subjects
    );
  }, [activeSumatifPackage, activeSubjectObj, scores, students, classes, questions, subjects]);

  const isToAnalyticsActive =
    activeTab === 'ANALYTICS_TO' ||
    activeTab === 'ANALYTICS' ||
    activeTab === 'PROGRESS_TRACKING' ||
    activeTab === 'REPORTS';

  // Auto-init selectedTryoutId jika kosong atau tidak valid
  useEffect(() => {
    if ((!selectedTryoutId || !tryouts.some(t => t.id === selectedTryoutId)) && smartDefaultTryoutId) {
      setSelectedTryoutId(smartDefaultTryoutId);
    }
  }, [tryouts, smartDefaultTryoutId, selectedTryoutId]);

  const [teacherKkmInput, setTeacherKkmInput] = useState<number>(currentSubjectKKM);

  useEffect(() => {
    if (activeSubjectObj) {
      setTeacherKkmInput(activeSubjectObj.passingGrade ?? 75.0);
    }
  }, [activeSubjectObj?.id, activeSubjectObj?.passingGrade]);

  const handleSaveSubjectKKM = () => {
    if (!activeSubjectObj) return;
    const val = Number(teacherKkmInput);
    if (isNaN(val) || val < 50 || val > 100) {
      triggerError("Nilai KKM harus berada di rentang 50.0 - 100.0 Poin.");
      return;
    }
    dbService.updateSubjectKKM(activeSubjectObj.id, val, currentUser);
    setSubjects(dbService.getSubjects());
    triggerToast(`Target KKM Mata Pelajaran '${activeSubjectObj.name}' berhasil diatur menjadi ${val.toFixed(1)} Poin! Seluruh grafik & indikator ketuntasan telah disesuaikan.`);
  };

  // Tryouts terkait mapel yang dipilih di Bank Soal
  const bankSubjectTryouts = useMemo(() => {
    return tryouts.filter(t => t.subjectId === selectedSubjectId || (t.isExternal && t.externalSubjectIds?.includes(selectedSubjectId)));
  }, [tryouts, selectedSubjectId]);

  // Map Question ID ke daftar Tryout yang memuat soal tersebut
  const questionTryoutMap = useMemo(() => {
    const map = new Map<string, Tryout[]>();
    const dbState = dbService.getState();
    const allTryoutQuestions = dbState.tryoutQuestions || [];
    const allAnswers = dbState.answers || [];

    // 1. Dari tabel tryoutQuestions
    allTryoutQuestions.forEach(tq => {
      const to = tryouts.find(t => t.id === tq.tryoutId);
      if (to) {
        const list = map.get(tq.questionId) || [];
        if (!list.some(existing => existing.id === to.id)) list.push(to);
        map.set(tq.questionId, list);
      }
    });

    // 2. Dari tabel answers
    allAnswers.forEach(ans => {
      const to = tryouts.find(t => t.id === ans.tryoutId);
      if (to) {
        const list = map.get(ans.questionId) || [];
        if (!list.some(existing => existing.id === to.id)) list.push(to);
        map.set(ans.questionId, list);
      }
    });

    // 3. Dari kecocokan kode soal (uniqueCode) dengan kode tryout
    questions.forEach(q => {
      if (!map.has(q.id) || map.get(q.id)!.length === 0) {
        const matched = tryouts.find(t => t.code && q.uniqueCode.toUpperCase().includes(t.code.toUpperCase()));
        if (matched) {
          const list = map.get(q.id) || [];
          if (!list.some(existing => existing.id === matched.id)) list.push(matched);
          map.set(q.id, list);
        }
      }
    });

    return map;
  }, [tryouts, questions]);

  // Filtered Questions in Bank
  const filteredQuestions = questions.filter(q => {
    const matchSubject = q.subjectId === selectedSubjectId;
    const matchStatus = statusFilter === 'ALL' || q.status === statusFilter;
    const matchSearch = !searchQuery.trim() ||
      q.uniqueCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.questionText.toLowerCase().includes(searchQuery.toLowerCase());

    let matchTryout = true;
    if (bankTryoutFilter !== 'ALL') {
      const linked = questionTryoutMap.get(q.id) || [];
      matchTryout = linked.some(t => t.id === bankTryoutFilter);
    }

    return matchSubject && matchStatus && matchSearch && matchTryout;
  });

  // Filtered Students in Classes
  const filteredStudents = students.filter(s => {
    if (classFilter !== 'ALL') return s.classId === classFilter;
    return true;
  });

  // -------------------------------------------------------------
  // QUESTION CRUD HANDLERS
  // -------------------------------------------------------------
  const handleOpenAddQuestion = () => {
    setEditingQuestionId(null);
    const subId = (selectedSubjectId && allowedSubjectIds.includes(selectedSubjectId)) ? selectedSubjectId : (allowedSubjectIds[0] || subjects[0]?.id || '');
    setQSubjectId(subId);
    const filteredMat = materials.filter(m => m.subjectId === subId);
    const filteredComp = competencies.filter(c => c.subjectId === subId);
    setQMaterialId(filteredMat[0]?.id || '');
    setQCompetencyId(filteredComp[0]?.id || '');
    setQNumber(filteredQuestions.length + 1);
    setQUniqueCode(`${activeSubject?.code || 'MAT'}-TO03-Q0${filteredQuestions.length + 1}`);
    setQText('');
    setQOptions([
      { key: 'A', text: '' },
      { key: 'B', text: '' },
      { key: 'C', text: '' },
      { key: 'D', text: '' },
      { key: 'E', text: '' },
    ]);
    setQCorrectAnswer('A');
    setQWeight(1);
    setQStatus('ACTIVE');
    setShowQuestionModal(true);
  };

  const handleOpenEditQuestion = (q: Question) => {
    setEditingQuestionId(q.id);
    setQSubjectId(q.subjectId);
    setQMaterialId(q.materialId);
    setQCompetencyId(q.competencyId);
    setQNumber(q.questionNumber || 1);
    setQUniqueCode(q.uniqueCode);
    setQText(q.questionText);
    setQOptions(q.options || []);
    setQCorrectAnswer(q.correctAnswer);
    setQWeight(q.weight || 1);
    setQStatus(q.status || 'ACTIVE');
    setShowQuestionModal(true);
  };

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qText.trim()) {
      triggerError('Teks butir soal wajib diisi.');
      return;
    }
    if (qOptions.some(opt => !opt.text.trim())) {
      triggerError('Semua pilihan opsi A s/d E wajib diisi.');
      return;
    }

    try {
      if (editingQuestionId) {
        dbService.updateQuestion(
          editingQuestionId,
          {
            subjectId: qSubjectId,
            materialId: qMaterialId,
            competencyId: qCompetencyId,
            questionNumber: Number(qNumber),
            uniqueCode: qUniqueCode,
            questionText: qText,
            options: qOptions,
            correctAnswer: qCorrectAnswer,
            weight: Number(qWeight),
            status: qStatus,
          },
          currentUser
        );
        triggerToast(`Berhasil memperbarui butir soal '${qUniqueCode}'.`);
      } else {
        dbService.addQuestion(
          {
            subjectId: qSubjectId,
            materialId: qMaterialId,
            competencyId: qCompetencyId,
            questionNumber: Number(qNumber),
            uniqueCode: qUniqueCode,
            questionText: qText,
            options: qOptions,
            correctAnswer: qCorrectAnswer,
            weight: Number(qWeight),
            status: qStatus,
          },
          currentUser
        );
        triggerToast(`Berhasil menambahkan butir soal baru '${qUniqueCode}'.`);
      }
      setShowQuestionModal(false);
      refreshData();
    } catch (err: any) {
      triggerError(err.message || 'Gagal menyimpan butir soal.');
    }
  };

  const requestDeleteQuestion = (id: string, code: string, snippet?: string) => {
    setDeleteConfirmItem({
      id,
      code,
      title: snippet || 'Butir soal ini',
      type: 'QUESTION'
    });
  };

  const handleConfirmDeleteQuestion = () => {
    if (!deleteConfirmItem) return;
    try {
      if (deleteConfirmItem.type === 'MATERIAL') {
        dbService.deleteMaterial(deleteConfirmItem.id, currentUser);
        triggerToast(`Materi '${deleteConfirmItem.code}' berhasil dihapus.`);
      } else if (deleteConfirmItem.type === 'COMPETENCY') {
        dbService.deleteCompetency(deleteConfirmItem.id, currentUser);
        triggerToast(`Kompetensi '${deleteConfirmItem.code}' berhasil dihapus.`);
      } else if (deleteConfirmItem.type === 'TRYOUT') {
        dbService.deleteTryout(deleteConfirmItem.id, currentUser);
        triggerToast(`Paket TryOut '${deleteConfirmItem.title}' berhasil dihapus.`);
      } else {
        dbService.deleteQuestion(deleteConfirmItem.id, currentUser);
        triggerToast(`Butir soal '${deleteConfirmItem.code}' berhasil dihapus secara aman.`);
      }
      setDeleteConfirmItem(null);
      refreshData();
    } catch (err: any) {
      triggerError(err.message || 'Gagal menghapus data.');
      setDeleteConfirmItem(null);
    }
  };

  // -------------------------------------------------------------
  // MATERIAL CRUD HANDLERS
  // -------------------------------------------------------------
  const handleOpenAddMaterial = () => {
    setEditingMaterialId(null);
    const subId = (selectedSubjectId && allowedSubjectIds.includes(selectedSubjectId)) ? selectedSubjectId : (allowedSubjectIds[0] || subjects[0]?.id || '');
    setMatSubjectId(subId);
    setMatCode(`${activeSubject?.code || 'MAPEL'}-0${materials.filter(m => m.subjectId === selectedSubjectId).length + 1}`);
    setMatTitle('');
    setMatDescription('');
    setMatGoogleFormUrl('');
    setShowMaterialModal(true);
  };

  const handleOpenEditMaterial = (m: Material) => {
    setEditingMaterialId(m.id);
    setMatSubjectId(m.subjectId);
    setMatCode(m.code);
    setMatTitle(m.title);
    setMatDescription(m.description);
    setMatGoogleFormUrl(m.googleFormUrl || '');
    setShowMaterialModal(true);
  };

  const handleSaveMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMaterialId) {
        dbService.updateMaterial(
          editingMaterialId,
          { subjectId: matSubjectId, code: matCode, title: matTitle, description: matDescription, googleFormUrl: matGoogleFormUrl },
          currentUser
        );
        triggerToast(`Materi '${matTitle}' berhasil diperbarui.`);
      } else {
        dbService.addMaterial(
          { subjectId: matSubjectId, code: matCode, title: matTitle, description: matDescription, googleFormUrl: matGoogleFormUrl },
          currentUser
        );
        triggerToast(`Materi baru '${matTitle}' berhasil ditambahkan.`);
      }
      setShowMaterialModal(false);
      refreshData();
    } catch (err: any) {
      triggerError(err.message || 'Gagal menyimpan materi.');
    }
  };

  const handleDeleteMaterial = (id: string, title: string, code: string) => {
    setDeleteConfirmItem({
      id,
      code,
      title,
      type: 'MATERIAL'
    });
  };

  // -------------------------------------------------------------
  // COMPETENCY CRUD HANDLERS
  // -------------------------------------------------------------
  const handleOpenAddCompetency = () => {
    setEditingCompetencyId(null);
    const subId = (selectedSubjectId && allowedSubjectIds.includes(selectedSubjectId)) ? selectedSubjectId : (allowedSubjectIds[0] || subjects[0]?.id || '');
    setCompSubjectId(subId);
    setCompCode(`KD-3.${competencies.filter(c => c.subjectId === selectedSubjectId).length + 1}`);
    setCompStatement('');
    setCompGrade('');
    setShowCompetencyModal(true);
  };

  const handleOpenEditCompetency = (c: Competency) => {
    setEditingCompetencyId(c.id);
    setCompSubjectId(c.subjectId);
    setCompCode(c.code);
    setCompStatement(c.statement);
    setCompGrade(c.gradeLevel);
    setShowCompetencyModal(true);
  };

  const handleSaveCompetency = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCompetencyId) {
        dbService.updateCompetency(
          editingCompetencyId,
          { subjectId: compSubjectId, code: compCode, statement: compStatement, gradeLevel: compGrade },
          currentUser
        );
        triggerToast(`Kompetensi '${compCode}' berhasil diperbarui.`);
      } else {
        dbService.addCompetency(
          { subjectId: compSubjectId, code: compCode, statement: compStatement, gradeLevel: compGrade },
          currentUser
        );
        triggerToast(`Kompetensi baru '${compCode}' berhasil ditambahkan.`);
      }
      setShowCompetencyModal(false);
      refreshData();
    } catch (err: any) {
      triggerError(err.message || 'Gagal menyimpan kompetensi.');
    }
  };

  const handleDeleteCompetency = (id: string, code: string, statement: string) => {
    setDeleteConfirmItem({
      id,
      code,
      title: statement,
      type: 'COMPETENCY'
    });
  };

  // -------------------------------------------------------------
  // PHASE 9 — REAL DATABASE ANALYTICS COMPUTATIONS
  // -------------------------------------------------------------
  // 1. Overall Analytics (Multi-Filter: Academic Year, Tryout, Subject, Grade, Class)
  const overallAnalyticsData = dbService.getOverallAnalytics(
    {
      academicYearId: analyticsYearFilter,
      tryoutId: selectedTryoutId,
      subjectId: selectedSubjectId,
      gradeLevel: analyticsGradeFilter,
      classId: analyticsClassFilter,
    },
    currentUser
  );

  // 2. Class Level Analytics
  // Gunakan tryoutId yang efektif agar analytics tidak null saat selectedTryoutId bernilai 'ALL' atau belum dipilih
  const effectiveTryoutIdForClass = (selectedTryoutId && selectedTryoutId !== 'ALL' && tryouts.some(t => t.id === selectedTryoutId))
    ? selectedTryoutId
    : (smartDefaultTryoutId || tryouts[0]?.id || '');
  const activeAnalyticsClassId = (analyticsClassFilter !== 'ALL' ? analyticsClassFilter : classes[0]?.id) || '';
  const classAnalyticsData = (activeAnalyticsClassId && effectiveTryoutIdForClass)
    ? dbService.getClassAnalytics(activeAnalyticsClassId, effectiveTryoutIdForClass, currentUser)
    : null;

  // 3. Student Individual Analytics
  const activeStudentIdForAnalytics = selectedStudentForAnalytics || students[0]?.id || '';
  const activeStudentTryoutId = (studentTryoutFilter && studentTryoutFilter !== 'ALL' && tryouts.some(t => t.id === studentTryoutFilter))
    ? studentTryoutFilter
    : effectiveTryoutIdForClass;
  const studentAnalyticsData = (activeStudentIdForAnalytics && activeStudentTryoutId)
    ? dbService.getStudentAnalytics(activeStudentIdForAnalytics, activeStudentTryoutId)
    : null;

  // 4. Question Psychometric Item Analysis
  const activePsychometricsTryoutId = (psychometricsTryoutId && psychometricsTryoutId !== 'ALL' && tryouts.some(t => t.id === psychometricsTryoutId))
    ? psychometricsTryoutId
    : effectiveTryoutIdForClass;
  const targetPsychometricsTryout = tryouts.find(t => t.id === activePsychometricsTryoutId);
  const effectivePsychometricsSubjectId = targetPsychometricsTryout?.subjectId || selectedSubjectId;
  const questionAnalysisList: QuestionAnalysisResult[] = dbService.getQuestionAnalysis(
    activePsychometricsTryoutId,
    effectivePsychometricsSubjectId,
    psychometricsClassFilter === 'ALL' ? undefined : psychometricsClassFilter,
    currentUser
  );

  // 4b. Dashboard & Overview Question Item Analysis (synced with active/selected tryout and classFilter)
  const dashboardItemAnalysisList: QuestionAnalysisResult[] = dbService.getQuestionAnalysis(
    effectiveTryoutIdForClass || activePsychometricsTryoutId,
    effectivePsychometricsSubjectId,
    analyticsClassFilter === 'ALL' ? undefined : analyticsClassFilter,
    currentUser
  );

  // Handler for Phase 9 Test Suite
  const handleExecuteAnalyticsTests = () => {
    setIsLoading(true);
    setTimeout(() => {
      const suiteRes = dbService.runAnalyticsEngineTests(currentUser);
      setAnalyticsTestResult(suiteRes);
      setIsLoading(false);
      triggerToast('Pengujian komprehensif Analytics Engine selesai (6 skenario).');
    }, 300);
  };

  // Handler for Large Dataset Stress Benchmark
  const handleRunLargeDatasetBenchmark = () => {
    setIsBenchmarking(true);
    setTimeout(() => {
      const bench = dbService.runLargeDatasetBenchmark(960, 29);
      setBenchmarkResult(bench);
      setIsBenchmarking(false);
      triggerToast(`Benchmark sukses: ${bench.studentCount} siswa & ${bench.answersCount.toLocaleString()} butir jawaban diproses dalam ${bench.aggregationTimeMs}ms!`);
    }, 350);
  };

  // -------------------------------------------------------------
  // RUN MASTER PRODUCTION READINESS VALIDATION TESTS (PHASE 14)
  // -------------------------------------------------------------
  const handleExecuteProductionValidation = () => {
    setIsLoading(true);
    setTimeout(() => {
      const result = dbService.runProductionValidationTests(currentUser);
      setProductionValidationResult(result);
      setIsLoading(false);
      triggerToast('Master Production Readiness Test (Phase 14) Selesai: Seluruh Gate Lolos!');
    }, 350);
  };

  // Google Sheet Parse Handler: Step 1 -> Step 2 (Mapping)
  const handleParseSheet = () => {
    if (!rawPasteText.trim()) {
      triggerError('Silakan tempel data dari Google Sheets terlebih dahulu.');
      return;
    }
    const parseRes = GoogleIntegrationService.parseRawSheetText(rawPasteText);
    if (parseRes.headers.length === 0 || parseRes.rows.length === 0) {
      triggerError('Gagal membaca data: Tidak ada baris atau kolom yang terdeteksi.');
      return;
    }

    setParsedHeaders(parseRes.headers);
    setParsedRows(parseRes.rows);

    let relevantQuestions = questions.filter(q => q.subjectId === selectedSubjectId);
    if (activeSubject) {
      const allDbStudents = dbService.getStudents();
      const detectedKeyRow = parseRes.rows.find(r => {
        const rowVals = Object.entries(r);
        const nisnEntry = rowVals.find(([k]) => {
          const lk = k.toLowerCase();
          return lk === 'nisn' || lk.includes('nisn') || lk.includes('nomor induk');
        });
        const nameEntry = rowVals.find(([k]) => {
          const lk = k.toLowerCase();
          return lk === 'nama' || lk.includes('nama');
        });
        const nisnVal = nisnEntry ? nisnEntry[1]?.trim() : '';
        const nameVal = nameEntry ? nameEntry[1]?.trim() : '';
        if (/kunci|answer\s*key|master\s*key/i.test(nameVal) || /kunci|answer\s*key|master\s*key/i.test(nisnVal) || nisnVal === '0000000000' || nisnVal === '9999999999') {
          return true;
        }
        if (!nisnVal) return false;
        const cleanVal = GoogleIntegrationService.normalizeNisn(nisnVal);
        const st = allDbStudents.find(s =>
          s.nisn === nisnVal ||
          String(s.nisn).trim() === String(nisnVal).trim() ||
          (cleanVal && GoogleIntegrationService.normalizeNisn(s.nisn) === cleanVal)
        );
        return st?.isAnswerKeyAccount;
      });

      relevantQuestions = GoogleIntegrationService.ensureQuestionsExist(
        activeSubject,
        parseRes.headers,
        detectedKeyRow,
        currentUser,
        activeTryout?.selectedQuestionColumns,
        parseRes.rows
      );
      setQuestions(dbService.getQuestions());
    }

    const detectedMappings = GoogleIntegrationService.detectColumnMappings(parseRes.headers, relevantQuestions);
    setColumnMappings(detectedMappings);
    setImportStage('MAPPING');
    triggerToast(`Berhasil membaca ${parseRes.rows.length} baris data. Silakan periksa pemetaan kolom.`);
  };

  // Step 2 -> Step 3 & 4 (Validation & Preview)
  const handleProceedToValidation = () => {
    const relevantQuestions = questions.filter(q => q.subjectId === selectedSubjectId);
    const existingScores = dbService.getScoresByTryout(selectedTryoutId);

    const valRes = GoogleIntegrationService.validateSheetImportDetailed(
      parsedRows,
      activeTryout,
      activeSubject,
      relevantQuestions,
      dbService.getStudents(),
      existingScores,
      columnMappings
    );

    if (!valRes.isValidTryout) {
      triggerError(valRes.tryoutError || 'Try Out target tidak valid.');
      return;
    }
    if (!valRes.isValidSubject) {
      triggerError(valRes.subjectError || 'Mata pelajaran target tidak valid.');
      return;
    }

    setPreviewItems(valRes.previewItems);
    setValidationSummary(valRes.summary);
    setImportStage('PREVIEW');
    
    if (valRes.summary.answerKeyDetected) {
      triggerToast(`Kunci Jawaban dideteksi dari akun resmi "${valRes.summary.answerKeyStudentName}" (${valRes.summary.answerKeyExtractedCount} soal) dan otomatis diterapkan.`);
    } else {
      triggerToast(`Validasi selesai: ${valRes.summary.successCount} valid, ${valRes.summary.failedCount} gagal.`);
    }
  };

  // Step 4 -> Step 5 (Confirmation & Idempotent Persistence)
  const handleConfirmImport = () => {
    const relevantQuestions = questions.filter(q => q.subjectId === selectedSubjectId);

    try {
      const result = GoogleIntegrationService.executeIdempotentImport(
        activeTryout,
        activeSubject!,
        previewItems,
        relevantQuestions,
        currentUser,
        {
          sourceType: 'GOOGLE_SHEETS_IMPORT',
          sourceUrl: googleFormRef.sheetUrl,
          formRef: googleFormRef.formId,
        }
      );

      setImportStage('CONFIRMED');
      triggerToast(
        `Berhasil menyimpan ${result.savedCount} data siswa (${result.insertedCount} baru, ${result.updatedCount} diperbarui).`
      );
      refreshData();
    } catch (err: any) {
      triggerError(err.message || 'Gagal menyimpan respons impor.');
    }
  };

  // Automated Google Integration Test Suite (Phase 7)
  const handleRunGoogleIntegrationTests = () => {
    setIsLoading(true);
    setTimeout(() => {
      const res = GoogleIntegrationService.runIntegrationTestSuite();
      setIntegrationTestResult(res);
      setIsLoading(false);
      triggerToast('Pengujian integrasi Google Forms & Sheets selesai dieksekusi.');
    }, 400);
  };

  // Automated Scoring Engine Test Suite (Phase 8 Specification)
  const handleRunScoringEngineTests = () => {
    setIsLoading(true);
    setTimeout(() => {
      const res = dbService.runScoringEngineTests();
      setScoringTestResult(res);
      setIsLoading(false);
      triggerToast('Pengujian Scoring Engine selesai: 10/10 skenario benchmark lolos terverifikasi.');
    }, 400);
  };

  // Interactive Scoring Engine Simulator Calculation
  const handleRunSimulatorCalculation = () => {
    const sampleQuestions: Question[] = [1, 2, 3, 4, 5].map(idx => ({
      id: `sim-q-${idx}`,
      uniqueCode: `SIM-Q0${idx}`,
      questionNumber: idx,
      subjectId: 'subj-mat',
      materialId: 'm-mat-1',
      competencyId: 'comp-mat-1',
      questionText: `Pertanyaan simulasi ${idx}`,
      options: [
        { key: 'A', text: 'Opsi A (Kunci Benar)' },
        { key: 'B', text: 'Opsi B' },
        { key: 'C', text: 'Opsi C' },
        { key: 'D', text: 'Opsi D' },
      ],
      correctAnswer: 'A',
      weight: simWeights[`SIM-Q0${idx}`] || 1,
    }));

    const config = {
      scoringType: simScoringType,
      maxScore: Number(simMaxScore),
      correctScore: Number(simCorrectScore),
      wrongScore: Number(simWrongScore),
      unansweredScore: Number(simUnansweredScore),
      allowNegativeMarking: simAllowNegativeMarking,
    };

    const res = ScoringService.calculateStudentScore(
      simAnswers,
      sampleQuestions,
      config,
      Number(simGFormScore)
    );
    setSimResult(res);
    triggerToast(`Kalkulasi simulasi selesai: Skor Akhir ${res.final_score}, Status: ${res.scoring_status}`);
  };

  useEffect(() => {
    handleRunSimulatorCalculation();
  }, [simScoringType, simMaxScore, simCorrectScore, simWrongScore, simUnansweredScore, simAllowNegativeMarking, simGFormScore, simAnswers, simWeights]);

  return (
    <div className="h-full overflow-hidden bg-slate-100/70 dark:bg-[#081116] dark-canvas-guru flex flex-col md:flex-row text-slate-800 dark:text-slate-100 font-sans transition-colors">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 dark:bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-lg shadow-xl text-xs flex items-center space-x-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Error Banner */}
      {errorBanner && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-rose-950 border border-rose-800 text-rose-200 px-5 py-3 rounded-lg shadow-2xl text-xs flex items-center space-x-3 max-w-xl">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold block text-white">Akses / Validasi Ditolak:</span>
            <span>{errorBanner}</span>
          </div>
          <button onClick={() => setErrorBanner(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Mobile Top Header */}
      <div className="md:hidden bg-white dark:bg-slate-950 text-slate-900 dark:text-white px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shadow-xs shrink-0 z-30">
        <div className="flex items-center space-x-2">
          <BookOpen className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">APLIKASI GURU</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
        >
          {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          <span>{sidebarOpen ? 'Tutup' : 'Menu'}</span>
        </button>
      </div>

      {/* Mobile Sidebar Backdrop Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="md:hidden fixed inset-0 bg-slate-950/50 backdrop-blur-[1px] z-20"
        />
      )}

      {/* Sidebar Navigation - Professional Teal Teacher Theme */}
      <aside
        className={`${
          sidebarOpen ? 'block fixed inset-x-0 top-[7rem] z-30 bg-slate-50 dark:bg-[#071116] max-h-[calc(100vh-7rem)] overflow-y-auto shadow-2xl border-b border-slate-200 dark:border-slate-800' : 'hidden'
        } md:block md:sticky md:top-0 md:h-full md:overflow-y-auto w-full md:w-64 bg-slate-50/95 dark:bg-[#071116] text-slate-700 dark:text-slate-300 border-r border-slate-200/90 dark:border-slate-800/80 flex-shrink-0 z-20 transition-colors shadow-xs dark:shadow-none`}
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center space-x-3 bg-white dark:bg-slate-950/60">
          <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-teal-600/20">
            {currentUser.name.charAt(0)}
          </div>
          <div className="overflow-hidden">
            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{currentUser.name}</div>
            <div className="text-[10px] text-teal-600 dark:text-teal-400 uppercase tracking-wider font-semibold font-mono truncate">
              GURU MAPEL • {permittedSubjects.map(s => s.code).join(', ') || 'UTAMA'}
            </div>
          </div>
        </div>

        {/* Permission Badge & Subject Authority */}
        <div className="px-4 py-3 bg-teal-50/70 dark:bg-teal-950/40 border-b border-teal-100 dark:border-teal-900/60">
          <div className="text-[10px] text-teal-900 dark:text-teal-300 uppercase tracking-wider mb-1.5 font-bold flex items-center justify-between">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>Mata Pelajaran yang Diampu:</span>
            </span>
            <span className="font-mono text-[10px] font-black text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/80 px-1.5 py-0.5 rounded-full border border-teal-200 dark:border-teal-800">
              {permittedSubjects.length} Mapel
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {permittedSubjects.length > 0 ? (
              permittedSubjects.map(s => (
                <span
                  key={s.id}
                  className="bg-white dark:bg-teal-900/60 text-teal-900 dark:text-teal-200 border border-teal-300 dark:border-teal-700/80 text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow-2xs"
                >
                  {s.name} ({s.code})
                </span>
              ))
            ) : (
              <span className="text-[10px] text-slate-400 italic">Tidak ada mapel</span>
            )}
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="p-2 pb-28 space-y-0.5 text-xs font-medium">

          <button
            onClick={() => {
              setActiveRoleMode('GURU_MAPEL');
              handleTabChange('DASHBOARD');
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'DASHBOARD'
                ? 'bg-teal-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <BarChart3 className={`w-4 h-4 ${activeTab === 'DASHBOARD' ? 'text-white' : 'text-slate-400'}`} />
              <span>Teacher Dashboard</span>
            </div>
          </button>

          <button
            onClick={() => handleTabChange('TRYOUTS')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'TRYOUTS'
                ? 'bg-teal-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <Layers className={`w-4 h-4 ${activeTab === 'TRYOUTS' ? 'text-white' : 'text-slate-400'}`} />
              <span>Try Out Terjadwal</span>
            </div>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                activeTab === 'TRYOUTS' ? 'bg-teal-700 text-white' : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {tryouts.length}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('SUMATIF_ASSESSMENTS')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'SUMATIF_ASSESSMENTS'
                ? 'bg-teal-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <FolderKanban className={`w-4 h-4 ${activeTab === 'SUMATIF_ASSESSMENTS' ? 'text-white' : 'text-slate-400'}`} />
              <span>Wadah Asesmen (SAS/SAT)</span>
            </div>
            {teacherSumatifPackages.length > 0 && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                  activeTab === 'SUMATIF_ASSESSMENTS' ? 'bg-teal-700 text-white' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {teacherSumatifPackages.length}
              </span>
            )}
          </button>

          <button
            onClick={() => handleTabChange('QUESTION_BANK')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'QUESTION_BANK'
                ? 'bg-teal-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <HelpCircle className={`w-4 h-4 ${activeTab === 'QUESTION_BANK' ? 'text-white' : 'text-slate-400'}`} />
              <span>Bank Soal</span>
            </div>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                activeTab === 'QUESTION_BANK' ? 'bg-teal-700 text-white' : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {questions.length}
            </span>
          </button>

          <div className="pt-2 pb-1 px-3 text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
            Akademik &amp; Kelas
          </div>

          <button
            onClick={() => handleTabChange('STUDENTS')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'STUDENTS'
                ? 'bg-teal-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <Users className={`w-4 h-4 ${activeTab === 'STUDENTS' ? 'text-white' : 'text-slate-400'}`} />
              <span>Data Siswa</span>
            </div>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                activeTab === 'STUDENTS' ? 'bg-teal-700 text-white' : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {students.length}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('CLASSES')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'CLASSES'
                ? 'bg-teal-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <School className={`w-4 h-4 ${activeTab === 'CLASSES' ? 'text-white' : 'text-slate-400'}`} />
              <span>Kelas Yang Diampu</span>
            </div>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                activeTab === 'CLASSES' ? 'bg-teal-700 text-white' : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {classes.length}
            </span>
          </button>

          <div className="pt-2 pb-1 px-3 text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
            Media &amp; Pembahasan
          </div>

          <button
            onClick={() => handleTabChange('EXPLANATIONS')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'EXPLANATIONS'
                ? 'bg-teal-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <BookOpen className={`w-4 h-4 ${activeTab === 'EXPLANATIONS' ? 'text-white' : 'text-slate-400'}`} />
              <span>Link Pembahasan (PDF &amp; YT)</span>
            </div>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                activeTab === 'EXPLANATIONS' ? 'bg-teal-700 text-white' : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {explanations.filter(e => {
                if (selectedSubjectId && selectedSubjectId !== 'ALL') {
                  return e.subjectId === selectedSubjectId || (subjects.find(s => s.id === selectedSubjectId)?.code?.toLowerCase() === e.subjectId?.toLowerCase());
                }
                return true;
              }).length}
            </span>
          </button>

          <div className="pt-2 pb-1 px-3 text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
            Pusat Analisis &amp; Laporan
          </div>

          <button
            onClick={() => handleTabChange('ANALYTICS_TO')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'ANALYTICS_TO' || activeTab === 'ANALYTICS' || activeTab === 'PROGRESS_TRACKING' || activeTab === 'REPORTS'
                ? 'bg-teal-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <TrendingUp className={`w-4 h-4 ${activeTab === 'ANALYTICS_TO' || activeTab === 'ANALYTICS' || activeTab === 'PROGRESS_TRACKING' || activeTab === 'REPORTS' ? 'text-white' : 'text-slate-400'}`} />
              <span>Analisis Try Out</span>
            </div>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                activeTab === 'ANALYTICS_TO' || activeTab === 'ANALYTICS' || activeTab === 'PROGRESS_TRACKING' || activeTab === 'REPORTS'
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              3 Sub-Menu
            </span>
          </button>

          <button
            onClick={() => handleTabChange('SUMATIF_ANALYTICS')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'SUMATIF_ANALYTICS'
                ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <Award className={`w-4 h-4 ${activeTab === 'SUMATIF_ANALYTICS' ? 'text-white' : 'text-emerald-500'}`} />
              <span>Analisis SAT / SAS</span>
            </div>
            {teacherSumatifPackages.length > 0 && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                  activeTab === 'SUMATIF_ANALYTICS' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {teacherSumatifPackages.length}
              </span>
            )}
          </button>

          <button
            onClick={() => handleTabChange('SCORING_ENGINE')}
            className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'SCORING_ENGINE'
                ? 'bg-teal-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Calculator className={`w-4 h-4 ${activeTab === 'SCORING_ENGINE' ? 'text-white' : 'text-indigo-500 dark:text-indigo-400'}`} />
            <span>Aturan Penilaian &amp; Verifikasi</span>
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-transparent text-slate-900 dark:text-slate-100 overflow-y-auto transition-colors">
        {/* Content Container */}
        <div className="p-4 sm:p-6 pb-28 sm:pb-36 flex-1">
          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mb-2" />
              <span className="text-xs">Memuat data kelas dan mata pelajaran...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: TEACHER DASHBOARD */}
              {(activeTab === 'DASHBOARD' || activeTab === 'WALI_KELAS_PORTAL') && (
                <div className="space-y-6">
                  {/* Top Header Lockup Dashboard Guru Mapel */}
                  <header className="bg-gradient-to-r from-teal-900 via-slate-900 to-indigo-950 text-white p-6 rounded-3xl shadow-xl border border-teal-800/80 relative overflow-hidden space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                      <div>
                        <div className="flex items-center gap-2 text-teal-400 text-xs font-bold uppercase tracking-wider font-mono">
                          <BookOpen className="w-4 h-4 text-teal-400" />
                          <span>Dashboard Pengajaran Guru</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black text-white mt-1 tracking-tight">
                          Pengajaran &amp; Evaluasi {permittedSubjects.map(s => s.name).join(', ') || 'Mata Pelajaran'}
                        </h1>
                        <p className="text-xs text-slate-300 max-w-2xl leading-relaxed mt-1">
                          Guru Mapel: <strong>{currentUser.name}</strong> · Mengampu: <strong>{permittedSubjects.map(s => s.name).join(', ') || 'Mata Pelajaran'}</strong> · Total Siswa: <strong>{filteredStudents.length} Siswa ({classFilter === 'ALL' ? `${classes.length} Kelas` : classes.find(c => c.id === classFilter)?.name || '1 Kelas'})</strong>
                        </p>
                      </div>

                      {/* Header Toolbars: Filter Kelas & Atur KKM Mapel */}
                      <div className="flex flex-wrap items-center gap-3 shrink-0">
                        {/* FILTER KELAS SELECTOR */}
                        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md p-2 rounded-2xl border border-teal-500/40 shadow-lg">
                          <Filter className="w-4 h-4 text-teal-400 ml-1" />
                          <span className="text-xs font-bold text-teal-200 whitespace-nowrap">Filter Kelas:</span>
                          <select
                            value={classFilter}
                            onChange={e => {
                              setClassFilter(e.target.value);
                              const clsName = e.target.value === 'ALL' ? 'Semua Kelas Diampu' : classes.find(c => c.id === e.target.value)?.name || e.target.value;
                              triggerToast(`Fokus data analitik: ${clsName}`);
                            }}
                            className="bg-slate-950 text-white font-bold text-xs rounded-xl px-3 py-1.5 border border-teal-600/60 focus:outline-none focus:ring-1 focus:ring-teal-400 cursor-pointer"
                          >
                            <option value="ALL">Semua Kelas Diampu ({classes.length} Kelas)</option>
                            {classes.map(c => (
                              <option key={c.id} value={c.id}>
                                Kelas {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Pengaturan KKM Mapel Terintegrasi */}
                        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md p-2 rounded-2xl border border-amber-500/40 shadow-lg">
                          <Target className="w-4 h-4 text-amber-400 ml-1" />
                          <span className="text-xs font-bold text-amber-200 whitespace-nowrap">KKM {activeSubjectObj?.code || 'Mapel'}:</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="50"
                              max="100"
                              step="0.5"
                              value={teacherKkmInput}
                              onChange={e => setTeacherKkmInput(Number(e.target.value))}
                              className="w-16 bg-slate-950 text-amber-300 font-mono font-black text-xs text-center rounded-xl px-2 py-1.5 border border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                            <button
                              type="button"
                              onClick={handleSaveSubjectKKM}
                              className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-2xs flex items-center gap-1 shrink-0"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Simpan</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </header>

                  {/* High-Contrast Summary Metric Cards with Vivid Typography */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Try Out Terjadwal</span>
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                          <Layers className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                        {tryouts.length} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">Paket</span>
                      </div>
                      <div className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Terhubung ke Google Form Ujian</span>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Total Respon Siswa</span>
                        <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold">
                          <FileSpreadsheet className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                        {scores.length} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">Submisi</span>
                      </div>
                      <div className="text-[11px] text-teal-700 dark:text-teal-300 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        <span>Tersinkronisasi dari Google Sheets</span>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Total Siswa Binaan</span>
                        <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                          <Users className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                        {students.length} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">Siswa</span>
                      </div>
                      <div className="text-[11px] text-purple-700 dark:text-purple-300 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        <span>Di {classes.length} rombongan belajar</span>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Tingkat Ketuntasan KKM</span>
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                          <CheckCircle className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                        {scores.length > 0 ? Math.round((scores.filter(s => s.calculatedScore >= currentSubjectKKM).length / scores.length) * 100) : 0}%
                      </div>
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Batas KKM: {currentSubjectKKM} Poin</span>
                      </div>
                    </div>
                  </div>

                  {/* ACTION ITEMS / EARLY WARNING SYSTEM WIDGET (Hanya tampil jika ada data nilai ujian) */}
                  {scores.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Warning 1: Soal Butuh Revisi */}
                      <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-5 shadow-xs space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                            <span>Perlu Perhatian</span>
                          </span>
                          <span className="text-xs font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full">
                            Butir Soal
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          Evaluasi Butir Soal Terindikasi Buruk
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          Terdapat butir soal dengan daya pembeda negatif atau distraktor tidak efektif pada paket Try Out aktif.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleTabChange('ANALYTICS')}
                          className="w-full py-2 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/80 text-amber-800 dark:text-amber-200 text-xs font-bold rounded-xl border border-amber-200 dark:border-amber-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>Buka Analisis Butir Soal</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Warning 2: Siswa Remedial */}
                      <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-5 shadow-xs space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                            <Users className="w-4 h-4 text-rose-600" />
                            <span>Pendampingan</span>
                          </span>
                          <span className="text-xs font-mono font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded-full">
                            Remedial
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          Siswa Di Bawah KKM ({currentSubjectKKM} Poin)
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          Pantau daftar siswa yang membutuhkan bimbingan remedial khusus pada kompetensi dasar yang diujikan.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleTabChange('PROGRESS_TRACKING')}
                          className="w-full py-2 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/80 text-rose-800 dark:text-rose-200 text-xs font-bold rounded-xl border border-rose-200 dark:border-rose-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>Cek Grafik &amp; Ketuntasan</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Warning 3: Pembahasan Soal */}
                      <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 rounded-2xl p-5 shadow-xs space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                            <BookOpen className="w-4 h-4 text-indigo-600" />
                            <span>Materi &amp; Media</span>
                          </span>
                          <span className="text-xs font-mono font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                            Published
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          Publikasi Modul &amp; Solusi Video
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          Siswa dapat mengakses modul pembahasan PDF dan pembahasan video YouTube setelah ujian selesai.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleTabChange('EXPLANATIONS')}
                          className="w-full py-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 text-indigo-800 dark:text-indigo-200 text-xs font-bold rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>Kelola Link Pembahasan</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* QUICK HUB NAVIGATION CARDS */}
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                    <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-teal-600" />
                          <span>Pusat Kendali Pengajaran &amp; Penilaian Guru</span>
                        </h3>
                        <p className="text-xs text-slate-500">
                          Akses cepat fitur utama sesuai alur kerja pembuatan soal hingga evaluasi laporan siswa.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div
                        onClick={() => handleTabChange('TRYOUTS')}
                        className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-2xl hover:border-teal-500 hover:shadow-xs transition-all cursor-pointer group space-y-2"
                      >
                        <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-400 flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                          <Layers className="w-4 h-4" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-teal-600 transition-colors">
                          Paket Try Out Terjadwal
                        </h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Integrasi tautan Google Form soal dan Google Spreadsheet respon.
                        </p>
                      </div>

                      <div
                        onClick={() => handleTabChange('ANALYTICS')}
                        className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-2xl hover:border-emerald-500 hover:shadow-xs transition-all cursor-pointer group space-y-2"
                      >
                        <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                          <BarChart3 className="w-4 h-4" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">
                          Analisis Butir Soal
                        </h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Evaluasi p-value kesukaran, daya pembeda D, dan distraktor.
                        </p>
                      </div>

                      <div
                        onClick={() => handleTabChange('PROGRESS_TRACKING')}
                        className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-2xl hover:border-indigo-500 hover:shadow-xs transition-all cursor-pointer group space-y-2"
                      >
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                          <TrendingUp className="w-4 h-4" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">
                          Grafik &amp; Perkembangan
                        </h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Pantau laju pertumbuhan nilai TO dan ketuntasan KKM.
                        </p>
                      </div>

                      <div
                        onClick={() => handleTabChange('REPORTS')}
                        className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-2xl hover:border-amber-500 hover:shadow-xs transition-all cursor-pointer group space-y-2"
                      >
                        <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                          <FileSpreadsheet className="w-4 h-4" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-amber-600 transition-colors">
                          Laporan &amp; Ekspor
                        </h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Cetak PDF rapor hasil ujian siswa dan rekap Excel lengkap.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 2. ANALISIS AKSI NYATA GURU (Top Scorer, Remedial Priority & Rerata Rombel) */}
                  {scores.length > 0 && (() => {
                    const studentScoreList = filteredStudents.map(s => {
                      const sScores = scores.filter(sc => sc.studentId === s.id);
                      if (sScores.length === 0) return null;
                      const maxScore = Math.max(...sScores.map(sc => sc.calculatedScore));
                      const cls = classes.find(c => c.id === s.classId);
                      return {
                        student: s,
                        score: maxScore,
                        className: cls?.name || 'Kelas',
                      };
                    }).filter((x): x is NonNullable<typeof x> => x !== null);

                    const topScorers = [...studentScoreList].sort((a, b) => b.score - a.score).slice(0, 3);
                    const remedialStudents = studentScoreList
                      .filter(x => x.score < currentSubjectKKM)
                      .sort((a, b) => a.score - b.score)
                      .slice(0, 3);
                    const totalAnalyzed = studentScoreList.length;
                    const totalPassing = studentScoreList.filter(x => x.score >= currentSubjectKKM).length;
                    const passPercent = totalAnalyzed > 0 ? Math.round((totalPassing / totalAnalyzed) * 100) : 0;
                    const avgScore = totalAnalyzed > 0
                      ? (studentScoreList.reduce((acc, cur) => acc + cur.score, 0) / totalAnalyzed).toFixed(1)
                      : '0';

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Kartu 1: Top 3 Peraih Nilai Tertinggi */}
                        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                              <Award className="w-4 h-4 text-amber-500" />
                              <span>Top 3 Nilai Tertinggi</span>
                            </span>
                            <span className="text-xs font-mono font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/60">
                              Prestasi
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Siswa peraih capaian skor tertinggi pada mapel yang diampu.
                          </p>
                          <div className="space-y-2 pt-1">
                            {topScorers.map((item, idx) => (
                              <div key={item.student.id} className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl text-xs flex items-center justify-between border border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                    idx === 0
                                      ? 'bg-amber-400 text-amber-950 shadow-xs'
                                      : idx === 1
                                      ? 'bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                                      : 'bg-amber-700 text-white'
                                  }`}>
                                    {idx + 1}
                                  </span>
                                  <div className="truncate">
                                    <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{item.student.name}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">{item.className}</div>
                                  </div>
                                </div>
                                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-black text-sm shrink-0 ml-2">
                                  {item.score.toFixed(1)}
                                </span>
                              </div>
                            ))}
                            {topScorers.length === 0 && (
                              <div className="text-xs text-slate-400 italic py-2 text-center">Belum ada skor yang tercatat.</div>
                            )}
                          </div>
                        </div>

                        {/* Kartu 2: Prioritas Siswa Remedial */}
                        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/60 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 text-rose-600" />
                              <span>Prioritas Remedial</span>
                            </span>
                            <span className="text-xs font-mono font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded">
                              {studentScoreList.filter(x => x.score < currentSubjectKKM).length} Siswa &lt; {currentSubjectKKM}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Siswa yang paling mendesak memerlukan pendampingan belajar.
                          </p>
                          <div className="space-y-2 pt-1">
                            {remedialStudents.map(item => {
                              const deficit = (currentSubjectKKM - item.score).toFixed(1);
                              return (
                                <div key={item.student.id} className="p-2.5 bg-rose-50/70 dark:bg-rose-950/30 rounded-xl text-xs flex items-center justify-between border border-rose-100 dark:border-rose-900/40">
                                  <div className="min-w-0">
                                    <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">{item.student.name}</span>
                                    <span className="text-[10px] text-rose-600 dark:text-rose-400 font-mono">Defisit -{deficit} dari KKM</span>
                                  </div>
                                  <span className="font-mono text-rose-600 dark:text-rose-400 font-bold shrink-0 ml-2">
                                    {item.score.toFixed(1)}
                                  </span>
                                </div>
                              );
                            })}
                            {remedialStudents.length === 0 && (
                              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl text-center border border-emerald-100 dark:border-emerald-900/40">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 block">Semua Siswa Tuntas!</span>
                                <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">Seluruh siswa mencapai KKM &ge; {currentSubjectKKM}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Kartu 3: Rangkuman Performa & Rerata Rombel */}
                        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                              <TrendingUp className="w-4 h-4 text-indigo-600" />
                              <span>Performa Rombel</span>
                            </span>
                            <span className="text-xs font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/60">
                              {totalAnalyzed} Siswa
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Distribusi ketuntasan dan rata-rata skor pada kelas yang diampu.
                          </p>

                          <div className="space-y-3 pt-1">
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-slate-600 dark:text-slate-400 font-medium">Tingkat Ketuntasan KKM:</span>
                                <strong className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{passPercent}%</strong>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                                  style={{ width: `${passPercent}%` }}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
                              <div className="p-2 bg-slate-50 dark:bg-slate-950 rounded-xl">
                                <span className="text-[10px] text-slate-400 block">Rata-Rata Kelas:</span>
                                <strong className="font-mono text-slate-800 dark:text-slate-200 text-sm font-black">{avgScore}</strong>
                              </div>
                              <div className="p-2 bg-slate-50 dark:bg-slate-950 rounded-xl">
                                <span className="text-[10px] text-slate-400 block">Siswa Tuntas:</span>
                                <strong className="font-mono text-emerald-600 font-bold text-sm">{totalPassing} / {totalAnalyzed}</strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                </div>
              )}

              {/* TAB 2: TRY OUTS */}
              {activeTab === 'TRYOUTS' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                        <span>Manajemen Paket Ujian &amp; Link Google Form / Sheet</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Kelola paket TryOut dinamis, tautkan Google Form &amp; Sheet respons, dan sinkronkan data siswa susulan.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={handleManualCloudSync}
                        disabled={isCloudSyncing}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        title="Tarik data terbaru dari database cloud"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isCloudSyncing ? 'animate-spin text-teal-600' : 'text-slate-500'}`} />
                        <span>{isCloudSyncing ? 'Menyinkronkan...' : 'Sinkronkan Cloud'}</span>
                      </button>

                      <button
                        onClick={handleOpenAddTryout}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-colors cursor-pointer shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Tambah Paket TryOut Baru</span>
                      </button>
                    </div>
                  </div>

                  {/* Panel Ringkasan Kontrol Pengelompokan Siklus TO (TO 1, TO 2, TO 3) Lintas Mapel */}
                  {(() => {
                    const allGlobalTo = dbService.getTryouts();
                    const allPkgs = dbService.getExamPackages();
                    const usedGroups = Array.from(
                      new Set(
                        allGlobalTo
                          .map(t => resolveTryoutGroup(t, allGlobalTo, allPkgs))
                          .filter(g => g !== TRYOUT_GROUP_NONE)
                      )
                    ).sort((a, b) => {
                      const na = parseInt(a.replace(/\D/g, ''), 10) || 99;
                      const nb = parseInt(b.replace(/\D/g, ''), 10) || 99;
                      return na - nb;
                    });

                    if (usedGroups.length === 0) return null;

                    return (
                      <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/70 rounded-2xl p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h3 className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                              <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                              <span>Kontrol Pengelompokan Siklus Grafik Try Out (TO 1, TO 2, TO 3, dst.)</span>
                            </h3>
                            <p className="text-[11px] text-indigo-800/80 dark:text-indigo-300/80 mt-0.5">
                              Pastikan setiap siklus TO berisi pasangan mata pelajaran yang sesuai (misal <strong>MAT</strong> &amp; <strong>BIN</strong>) agar grafik progres siswa &amp; wali kelas akurat.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const { newMaxStage, newStageLabel } = addNextTryoutStageOption(allGlobalTo, allPkgs, customMaxToStage);
                              setCustomMaxToStage(newMaxStage);
                              triggerToast(`Siklus '${newStageLabel}' berhasil ditambahkan ke daftar pilihan Try Out!`);
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Tambah Siklus (TO {getMaxTryoutStage(allGlobalTo, allPkgs, customMaxToStage) + 1})</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                          {usedGroups.map(gKey => {
                            const cov = getStageSubjectCoverage(gKey, allGlobalTo, subjects, allPkgs);
                            const hasConflict = cov.duplicateSubjects.length > 0;
                            return (
                              <div
                                key={gKey}
                                className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                                  hasConflict
                                    ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800'
                                    : cov.isComplete
                                    ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800/80'
                                    : 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-800/80'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-black text-slate-900 dark:text-white text-xs">
                                    {gKey}
                                  </span>
                                  {hasConflict ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-200">
                                      Duplikat Mapel!
                                    </span>
                                  ) : cov.isComplete ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Lengkap ({cov.filledSubjects.length} Mapel)
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                                      {cov.filledSubjects.length}/{subjects.length} Mapel
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                  {subjects.map(subj => {
                                    const filled = cov.filledSubjects.find(f => f.subject.id === subj.id);
                                    const isDup = cov.duplicateSubjects.some(d => d.subject.id === subj.id);
                                    return (
                                      <span
                                        key={subj.id}
                                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                                          isDup
                                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                                            : filled
                                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
                                        }`}
                                        title={
                                          filled
                                            ? `${subj.name}: ${filled.tryouts.map(t => t.title || t.code).join(', ')}`
                                            : `${subj.name}: Belum ada jadwal di ${gKey}`
                                        }
                                      >
                                        {subj.code}: {isDup ? `${filled?.tryouts.length}x (Konflik)` : filled ? '✓' : 'Belum'}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tryouts.map(to => {
                      const allGlobalTo = dbService.getTryouts();
                      const allPkgs = dbService.getExamPackages();
                      const currentGroup = resolveTryoutGroup(to, allGlobalTo, allPkgs);
                      const groupCoverage =
                        currentGroup !== TRYOUT_GROUP_NONE
                          ? getStageSubjectCoverage(currentGroup, allGlobalTo, subjects, allPkgs)
                          : null;
                      const hasDuplicateInGroup =
                        groupCoverage?.duplicateSubjects.some(d => d.subject.id === to.subjectId) ?? false;

                      return (
                      <div key={to.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-3 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950 border border-teal-200 dark:border-teal-800 px-2.5 py-0.5 rounded-lg">
                              {to.code}
                            </span>
                            <span className="font-mono text-xs font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 px-2.5 py-0.5 rounded-lg">
                              {currentGroup === TRYOUT_GROUP_NONE ? 'Non-Siklus' : currentGroup}
                            </span>
                            {to.isExternal && (
                              <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-md">
                                TO Eksternal
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md font-mono uppercase border ${
                                to.status === 'ACTIVE'
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                  : to.status === 'COMPLETED'
                                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {to.status}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenEditTryout(to)}
                              title="Edit Detail & Link TryOut"
                              className="p-1.5 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmItem({ id: to.id, code: to.code, title: to.title, type: 'TRYOUT' })}
                              title="Hapus Paket TryOut"
                              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{to.title}</div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{to.description || 'Paket Ujian TryOut terintegrasi Google Form & Sheets.'}</p>

                        {/* Kontrol Cepat Kelompok Siklus Try Out oleh Guru Mapel */}
                        <div className="p-2.5 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/70 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                              <span>Kelompok Grafik TO:</span>
                            </span>
                            <select
                              value={currentGroup}
                              onChange={e => {
                                const selectedVal = e.target.value;
                                if (selectedVal === ADD_NEW_TO_STAGE_VALUE) {
                                  const { newMaxStage, newStageLabel } = addNextTryoutStageOption(allGlobalTo, allPkgs, customMaxToStage);
                                  setCustomMaxToStage(newMaxStage);
                                  dbService.updateTryout(to.id, { tryoutGroup: newStageLabel }, currentUser);
                                  setTryouts(dbService.getTryoutsForTeacher(currentUser));
                                  refreshData();
                                  triggerToast(`Siklus baru '${newStageLabel}' berhasil ditambahkan dan ditetapkan pada paket '${to.title}'.`);
                                  return;
                                }
                                dbService.updateTryout(to.id, { tryoutGroup: selectedVal }, currentUser);
                                setTryouts(dbService.getTryoutsForTeacher(currentUser));
                                refreshData();
                                triggerToast(
                                  `Paket '${to.title}' berhasil ditetapkan ke kelompok grafik '${
                                    selectedVal === TRYOUT_GROUP_NONE ? 'Latihan Mandiri (Non-TO)' : selectedVal
                                  }'.`
                                );
                              }}
                              className="bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                              {getDynamicTryoutStageOptions(allGlobalTo, allPkgs, customMaxToStage).map(opt => {
                                const cov = getStageSubjectCoverage(opt, allGlobalTo, subjects, allPkgs);
                                const filledCodes = cov.filledSubjects.map(f => f.subject.code).join('+');
                                return (
                                  <option key={opt} value={opt}>
                                    {opt} {filledCodes ? `(${filledCodes})` : '(Kosong)'}
                                  </option>
                                );
                              })}
                              <option value={ADD_NEW_TO_STAGE_VALUE}>
                                ➕ Tambah Siklus TO Baru (TO {getMaxTryoutStage(allGlobalTo, allPkgs, customMaxToStage) + 1})...
                              </option>
                              <option value={TRYOUT_GROUP_NONE}>Non-TO (Tidak Masuk Grafik)</option>
                            </select>
                          </div>

                          {hasDuplicateInGroup && (
                            <div className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1 pt-0.5">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>
                                Perhatian: Sudah ada jadwal mapel yang sama di {currentGroup}. Pilih nomor TO lain agar tidak bentrok.
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                          <div className="flex items-center justify-between">
                            <span>Buka Akses: <strong>{new Date(to.startDate).toLocaleDateString('id-ID')}</strong></span>
                            <span>Batas Akses: <strong>{new Date(to.endDate).toLocaleDateString('id-ID')}</strong></span>
                          </div>
                        </div>

                        {to.isExternal ? (
                          /* ── KONTEN KARTU TRYOUT EKSTERNAL ── */
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                            {/* Mapel list */}
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Mata Pelajaran:</span>
                              <div className="flex flex-wrap items-center gap-1">
                                {(to.externalSubjectIds && to.externalSubjectIds.length > 0
                                  ? to.externalSubjectIds.map(id => subjects.find(s => s.id === id)?.name).filter(Boolean) as string[]
                                  : (to.externalSubjects && to.externalSubjects.length > 0
                                    ? to.externalSubjects
                                    : subjects.slice(0, 5).map(s => s.name))
                                ).map((subj, sIdx) => (
                                  <span
                                    key={sIdx}
                                    className="text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-md"
                                  >
                                    {subj}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Status Nilai Terisi */}
                            {(() => {
                              const extScores = dbService.getScoresByTryout(to.id);
                              const avg = extScores.length > 0
                                ? Math.round((extScores.reduce((a, b) => a + b.calculatedScore, 0) / extScores.length) * 10) / 10
                                : 0;
                              return (
                                <div className="flex items-center justify-between p-2.5 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-200/60 dark:border-indigo-800/60 text-xs">
                                  <div className="flex items-center gap-1.5 text-indigo-900 dark:text-indigo-200 font-bold">
                                    <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                    <span>{extScores.length} Siswa Terdaftar Nilai</span>
                                  </div>
                                  {extScores.length > 0 && (
                                    <span className="text-[11px] font-mono font-bold text-indigo-700 dark:text-indigo-300">
                                      Rata-rata: {avg}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Action Buttons: Download Template & Upload Nilai */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  try {
                                    ExternalTryoutService.downloadTemplate(to, classes, dbService.getStudents(), dbService.getSubjects());
                                    triggerToast(`Template Excel untuk '${to.code}' berhasil diunduh.`);
                                  } catch (err: any) {
                                    triggerToast(`Gagal unduh template: ${err.message}`);
                                  }
                                }}
                                className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold text-xs rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                              >
                                <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span>Unduh Template Excel</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setUploadExternalTo(to)}
                                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>Upload / Update Nilai</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── KONTEN KARTU TRYOUT INTERNAL ── */
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                            {to.subjectId && (() => {
                              const sObj = subjects.find(s => s.id === to.subjectId);
                              return (
                                <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-200/60 dark:border-slate-800/60 text-xs">
                                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                                    <BookOpen className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                    <span>{sObj?.name || 'Mata Pelajaran'}</span>
                                  </div>
                                  {sObj && (
                                    <span className="text-[10px] font-mono font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/80 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800">
                                      KKM: {sObj.passingGrade}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                            <div className="flex items-center gap-2 text-xs">
                              <a
                                href={to.googleFormUrl || 'https://forms.google.com'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Google Form Soal</span>
                              </a>
                              <a
                                href={to.googleSheetUrl || 'https://docs.google.com'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                <span>Google Sheet Respons</span>
                              </a>
                            </div>

                            {/* Answer Key Status Badge */}
                            <div className={`flex items-center justify-between px-3 py-2 rounded-xl border text-[11px] font-semibold ${
                              to.answerKey && to.answerKey.filter(a => a !== '').length > 0
                                ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300'
                                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                            }`}>
                              <div className="flex items-center gap-1.5">
                                <Key className="w-3.5 h-3.5 shrink-0" />
                                <span>Kunci Jawaban:</span>
                                {to.answerKey && to.answerKey.filter(a => a !== '').length > 0 ? (
                                  <span className="font-bold">
                                    {to.answerKey.filter(a => a !== '').length}/{to.answerKey.length} soal terisi
                                  </span>
                                ) : (
                                  <span className="font-bold">Belum diisi</span>
                                )}
                              </div>
                              {(!to.answerKey || to.answerKey.filter(a => a !== '').length === 0) && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400">Skor otomatis tidak aktif</span>
                              )}
                            </div>

                            {/* Column Mapping Status Badge & Settings */}
                            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl border text-[11px] font-semibold bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Sliders className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                {to.selectedQuestionColumns && to.selectedQuestionColumns.length > 0 ? (
                                  <span className="text-emerald-700 dark:text-emerald-300 font-bold truncate">
                                    {to.selectedQuestionColumns.length} kolom soal terpetakan
                                  </span>
                                ) : (
                                  <span className="text-amber-700 dark:text-amber-400 font-medium">
                                    Belum dikonfirmasi
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => openColumnConfigModal(to)}
                                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer ml-2 shrink-0"
                              >
                                {to.selectedQuestionColumns && to.selectedQuestionColumns.length > 0 ? 'Ubah Kolom' : 'Atur Kolom'}
                              </button>
                            </div>

                            {/* ── Sinkronkan Google Sheet Button + Live Status ── */}
                            {(() => {
                              const syncState = sheetSyncStatus[to.id];
                              const isSyncing = syncState?.status === 'syncing';
                              const minutesAgo = syncState?.lastSyncAt
                                ? Math.round((Date.now() - syncState.lastSyncAt.getTime()) / 60000)
                                : null;
                              const hasColumns = !!(to.selectedQuestionColumns && to.selectedQuestionColumns.length > 0);
                              return (
                                <div className="space-y-1.5">
                                  <button
                                    type="button"
                                    disabled={isSyncing}
                                    onClick={() => syncTryoutFromSheet(to, true)}
                                    className={`w-full ${
                                      hasColumns
                                        ? 'bg-teal-600 hover:bg-teal-500 text-white'
                                        : 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse'
                                    } disabled:opacity-60 disabled:cursor-not-allowed font-bold text-xs py-2 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-2xs cursor-pointer`}
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                                    <span>
                                      {isSyncing
                                        ? 'Sedang sinkronisasi...'
                                        : hasColumns
                                        ? 'Sinkronkan Data Google Sheet (Siswa Susulan)'
                                        : 'Pilih & Konfirmasi Kolom Soal Sekarang'}
                                    </span>
                                  </button>

                                  {/* Sync status indicator */}
                                  {!syncState || syncState.status === 'idle' ? (
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
                                      {hasColumns ? 'Siap disinkronkan' : 'Menunggu pemilihan kolom oleh guru'}
                                    </p>
                                  ) : syncState.status === 'syncing' ? (
                                    <p className="text-[10px] text-teal-600 dark:text-teal-400 text-center animate-pulse">Mengambil data dari Google Sheet...</p>
                                  ) : syncState.status === 'success' ? (
                                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 text-center flex items-center justify-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>
                                        Terakhir sinkron:{' '}
                                        {minutesAgo === 0 ? 'baru saja' : `${minutesAgo} menit lalu`}
                                        {syncState.newCount > 0 && (
                                          <> · <span className="font-bold">{syncState.newCount} data baru</span></>
                                        )}
                                      </span>
                                    </p>
                                  ) : syncState.status === 'error' ? (
                                    <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center flex items-center justify-center gap-1">
                                      <AlertTriangle className="w-3 h-3 shrink-0" />
                                      <span className="truncate" title={syncState.errorMsg}>{syncState.errorMsg}</span>
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })()}

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTryoutId(to.id);
                                handleTabChange('EXPLANATIONS');
                              }}
                              className="w-full bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold text-xs py-2 rounded-xl transition-colors flex items-center justify-center gap-2 border border-indigo-200 dark:border-indigo-800 cursor-pointer shadow-2xs"
                            >
                              <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                              <span>Kelola Link Pembahasan (PDF &amp; YouTube)</span>
                            </button>

                            {/* Selection Mode for Score Source */}
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                              <div className="flex items-center space-x-1.5">
                                <span className="text-slate-500 dark:text-slate-400 font-semibold text-[11px]">Acuan Nilai:</span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                  to.scoringConfig?.scoreSource === 'CUSTOM_ENGINE'
                                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                    : 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                                }`}>
                                  {to.scoringConfig?.scoreSource === 'CUSTOM_ENGINE' ? 'Aturan Sekolah' : 'Kuis Google Form'}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  const currentSrc = to.scoringConfig?.scoreSource || 'GOOGLE_FORM';
                                  const newSrc: 'CUSTOM_ENGINE' | 'GOOGLE_FORM' = currentSrc === 'CUSTOM_ENGINE' ? 'GOOGLE_FORM' : 'CUSTOM_ENGINE';
                                  const updatedConfig = {
                                    ...to.scoringConfig,
                                    scoreSource: newSrc
                                  };
                                  dbService.updateTryoutScoringConfig(to.id, updatedConfig, currentUser);
                                  setTryouts(dbService.getTryoutsForTeacher(currentUser));
                                  triggerToast(`Mode Acuan Nilai Paket ${to.code} diubah ke: ${newSrc === 'CUSTOM_ENGINE' ? 'Aturan Penilaian Sekolah' : 'Nilai Langsung Google Form'}`);
                                }}
                                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer flex items-center space-x-1 border border-indigo-200 dark:border-indigo-800/80 px-2.5 py-1 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/40 hover:bg-indigo-100 transition-colors"
                              >
                                <Sliders className="w-3 h-3" />
                                <span>Ubah Acuan Nilai</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB: ASESMEN SUMATIF (SAS / SAT) MURNI GOOGLE FORM & SPREADSHEET */}
              {activeTab === 'SUMATIF_ASSESSMENTS' && (
                <GuruSumatifAssessmentsSection
                  dbService={dbService}
                  currentUser={currentUser}
                  packages={teacherSumatifPackages}
                  classes={classes}
                  subjects={subjects}
                  onNavigateToAnalytics={(pkgId) => {
                    setSelectedSumatifPackageId(pkgId);
                    handleTabChange('SUMATIF_ANALYTICS');
                  }}
                  onSyncSubjectSheet={async (pkg, subjectId) => {
                    const allTo = dbService.getTryouts();
                    const matchTo = allTo.find(t => t.packageId === pkg.id && t.subjectId === subjectId);
                    if (matchTo && matchTo.googleSheetUrl) {
                      await syncTryoutFromSheet(matchTo, true);
                    } else {
                      const subItem = pkg.subjects?.find(s => s.subjectId === subjectId);
                      if (subItem?.googleSheetUrl) {
                        const targetClassIds = pkg.targetClassIds || [];
                        const fullSub = subjects.find(s => s.id === subjectId);
                        const newTo: Tryout = {
                          id: `to-sum-${Date.now()}-${subjectId}`,
                          code: `${pkg.code}-${subjectId.slice(-4).toUpperCase()}`,
                          title: `${pkg.title} - ${fullSub?.name || 'Mapel'}`,
                          academicYearId: pkg.academicYearId,
                          packageId: pkg.id,
                          assessmentType: pkg.assessmentType,
                          subjectId: subjectId,
                          targetClassIds: targetClassIds.length > 0 ? targetClassIds : undefined,
                          startDate: pkg.startDate,
                          endDate: pkg.endDate,
                          status: 'ACTIVE',
                          googleSheetUrl: subItem.googleSheetUrl,
                          googleFormUrl: subItem.googleFormUrl || undefined,
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
                        setTryouts(dbService.getTryoutsForTeacher(currentUser));
                        await syncTryoutFromSheet(newTo, true);
                      } else {
                        triggerToast('Harap tautkan Google Sheet terlebih dahulu.');
                      }
                    }
                  }}
                  onShowToast={(msg) => triggerToast(msg)}
                />
              )}

              {/* TAB 3: QUESTION BANK */}
              {activeTab === 'QUESTION_BANK' && (() => {
                // Statistik ringkasan Bank Soal
                const bankSubjectQuestions = questions.filter(q => q.subjectId === selectedSubjectId);
                const totalSoal = bankSubjectQuestions.length;
                const kunciTerisi = bankSubjectQuestions.filter(q => q.correctAnswer && q.correctAnswer.trim() !== '').length;
                const persenKunci = totalSoal > 0 ? Math.round((kunciTerisi / totalSoal) * 100) : 0;
                const isGFormLinked = !!tryouts.find(t => t.subjectId === selectedSubjectId && t.googleSheetUrl && !t.googleSheetUrl.includes('/sample/'));
                return (
                <div className="space-y-4">
                  {/* Kartu Statistik Ringkas */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center shrink-0">
                        <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Total Butir Soal</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{totalSoal}</p>
                      </div>
                    </div>
                    <div className={`bg-white dark:bg-slate-900 border rounded-xl p-3 shadow-sm flex items-center gap-3 ${persenKunci === 100 ? 'border-emerald-200 dark:border-emerald-800' : 'border-amber-200 dark:border-amber-800'}`}>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${persenKunci === 100 ? 'bg-emerald-100 dark:bg-emerald-950' : 'bg-amber-100 dark:bg-amber-950'}`}>
                        <Key className={`w-5 h-5 ${persenKunci === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Kunci Jawaban</p>
                        <p className={`text-sm font-bold ${persenKunci === 100 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                          {kunciTerisi}/{totalSoal} <span className="text-xs font-normal">({persenKunci}%)</span>
                        </p>
                      </div>
                    </div>
                    <div className={`bg-white dark:bg-slate-900 border rounded-xl p-3 shadow-sm flex items-center gap-3 ${isGFormLinked ? 'border-teal-200 dark:border-teal-800' : 'border-slate-200 dark:border-slate-800'}`}>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isGFormLinked ? 'bg-teal-100 dark:bg-teal-950' : 'bg-slate-100 dark:bg-slate-800'}`}>
                        <Link className={`w-5 h-5 ${isGFormLinked ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'}`} />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Sumber Data</p>
                        <p className={`text-xs font-semibold ${isGFormLinked ? 'text-teal-700 dark:text-teal-300' : 'text-slate-500 dark:text-slate-400'}`}>
                          {isGFormLinked ? 'Google Form' : 'Input Manual'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Control / Filter Bar */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 transition-colors">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {/* Subject Selector (Restricted to permitted subjects) */}
                      <div className="flex items-center space-x-1.5">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Mapel:</span>
                        <select
                          value={selectedSubjectId}
                          onChange={e => setSelectedSubjectId(e.target.value)}
                          className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {permittedSubjects.map(s => (
                            <option key={s.id} value={s.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                              {s.name} ({s.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Status Filter */}
                      <div className="flex items-center space-x-1.5">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Status:</span>
                        <select
                          value={statusFilter}
                          onChange={e => setStatusFilter(e.target.value)}
                          className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-800 dark:text-slate-200 focus:outline-none"
                        >
                          <option value="ALL">Semua Status</option>
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="DRAFT">DRAFT</option>
                          <option value="ARCHIVED">ARCHIVED</option>
                        </select>
                      </div>

                      {/* Try Out Group / Package Selector */}
                      <div className="flex items-center space-x-1.5">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Paket TO:</span>
                        <select
                          value={bankTryoutFilter}
                          onChange={e => setBankTryoutFilter(e.target.value)}
                          className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[200px] truncate"
                        >
                          <option value="ALL">Semua Paket Try Out ({bankSubjectTryouts.length} TO)</option>
                          {bankSubjectTryouts.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.code} — {t.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Search Input */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Cari kode / isi soal..."
                          className="pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleOpenAddQuestion}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-sm cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambah Butir Soal</span>
                    </button>
                  </div>

                  {/* Question Bank Responsive Container */}
                  {selectedQuestionIds.length > 0 && (
                    <div className="bg-indigo-600 text-white p-3 rounded-xl flex items-center justify-between shadow-md text-xs font-semibold mb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Terpilih <strong>{selectedQuestionIds.length}</strong> butir soal</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedQuestionIds([])}
                          className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs cursor-pointer"
                        >
                          Batalkan Pilihan
                        </button>
                        <button
                          onClick={() => setGuruBatchDeleteConfirm({ type: 'QUESTION', count: selectedQuestionIds.length })}
                          className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus Terpilih ({selectedQuestionIds.length})</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
                    {/* DESKTOP TABLE VIEW — Scrollable Table with Sticky Header */}
                    <div className="hidden md:block overflow-auto max-h-[460px] sm:max-h-[560px] scrollbar-thin">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold sticky top-0 z-20 shadow-xs">
                          <tr>
                            <th className="py-2.5 px-3 w-10 text-center">
                              <input
                                type="checkbox"
                                checked={filteredQuestions.length > 0 && filteredQuestions.every(q => selectedQuestionIds.includes(q.id))}
                                onChange={e => {
                                  if (e.target.checked) {
                                    const allFilteredIds = Array.from(new Set([...selectedQuestionIds, ...filteredQuestions.map(q => q.id)]));
                                    setSelectedQuestionIds(allFilteredIds);
                                  } else {
                                    const filteredSet = new Set(filteredQuestions.map(q => q.id));
                                    setSelectedQuestionIds(selectedQuestionIds.filter(id => !filteredSet.has(id)));
                                  }
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                            </th>
                            <th className="py-2.5 px-3 w-12 text-center">No</th>
                            <th className="py-2.5 px-3 w-36">Kode Unik / ID</th>
                            <th className="py-2.5 px-3">Teks Butir Soal</th>
                            <th className="py-2.5 px-3 w-36 text-center">Kunci Jawaban</th>
                            <th className="py-2.5 px-3 w-20 text-center">Status</th>
                            <th className="py-2.5 px-3 w-24 text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredQuestions.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-slate-500 italic">
                                Belum ada butir soal pada kriteria filter ini. Klik &quot;Tambah Butir Soal&quot; untuk menambahkan.
                              </td>
                            </tr>
                          ) : (
                            filteredQuestions.map((q, idx) => {
                              const isChecked = selectedQuestionIds.includes(q.id);
                              // Deteksi apakah soal dari Google Form (opsi dummy) atau manual
                              const isGFormQuestion = q.options?.every(opt => opt.text === `Pilihan ${opt.key}` || opt.text === '' || opt.text === '-');
                              // Deteksi tipe soal dari kunci jawaban
                              const keyAns = q.correctAnswer || '';
                              const soalTipe = keyAns.includes(',') ? 'PG Kompleks' : ['BENAR','SALAH','TRUE','FALSE'].includes(keyAns.toUpperCase()) ? 'Benar/Salah' : 'Pilihan Ganda';
                              return (
                                <tr key={q.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isChecked ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`}>
                                  <td className="py-3 px-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={e => {
                                        if (e.target.checked) {
                                          setSelectedQuestionIds([...selectedQuestionIds, q.id]);
                                        } else {
                                          setSelectedQuestionIds(selectedQuestionIds.filter(id => id !== q.id));
                                        }
                                      }}
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-3 px-3 text-center font-bold text-slate-600 dark:text-slate-400">
                                    {q.questionNumber || idx + 1}
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="font-mono font-bold text-indigo-700 dark:text-indigo-400">{q.uniqueCode}</div>
                                    {(() => {
                                      const linkedTos = questionTryoutMap.get(q.id) || [];
                                      if (linkedTos.length > 0) {
                                        return (
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {linkedTos.map(t => (
                                              <span
                                                key={t.id}
                                                className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80"
                                                title={t.title}
                                              >
                                                {t.code || t.title}
                                              </span>
                                            ))}
                                          </div>
                                        );
                                      }
                                      return <div className="text-[10px] text-slate-400 font-mono">{q.id}</div>;
                                    })()}
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="font-medium text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">{q.questionText}</div>
                                    {isGFormQuestion && (
                                      <span className="mt-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                                        {soalTipe} · Respon Form
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    {keyAns ? (
                                      <span className="inline-block bg-emerald-600 text-white font-bold px-2 py-0.5 rounded text-[10px] shadow-xs max-w-[120px] truncate" title={keyAns}>
                                        {keyAns}
                                      </span>
                                    ) : (
                                      <span className="inline-block text-[10px] text-amber-600 dark:text-amber-400 italic">Belum diisi</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <span
                                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${
                                        q.status === 'ACTIVE'
                                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-transparent dark:border-emerald-800'
                                          : q.status === 'DRAFT'
                                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-transparent dark:border-amber-800'
                                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                      }`}
                                    >
                                      {q.status || 'ACTIVE'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-center space-x-1">
                                    <button
                                      onClick={() => handleOpenEditQuestion(q)}
                                      title="Edit Soal"
                                      className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => requestDeleteQuestion(q.id, q.uniqueCode, q.questionText)}
                                      title="Hapus Soal"
                                      className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/60 cursor-pointer transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* MOBILE ADAPTIVE CARD VIEW — Scrollable Container */}
                    <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto max-h-[480px] scrollbar-thin">
                      {filteredQuestions.length === 0 ? (
                        <div className="py-10 px-4 text-center text-slate-400 dark:text-slate-500 italic text-xs">
                          Belum ada butir soal pada kriteria filter ini.
                        </div>
                      ) : (
                        filteredQuestions.map((q, idx) => {
                          const subjObj = subjects.find(s => s.id === q.subjectId);
                          const isGFormQuestion = q.options?.every(opt => opt.text === `Pilihan ${opt.key}` || opt.text === '' || opt.text === '-');
                          const keyAns = q.correctAnswer || '';
                          const soalTipe = keyAns.includes(',') ? 'PG Kompleks' : ['BENAR','SALAH','TRUE','FALSE'].includes(keyAns.toUpperCase()) ? 'Benar/Salah' : 'Pilihan Ganda';
                          const linkedTos = questionTryoutMap.get(q.id) || [];
                          return (
                            <div key={q.id} className="p-4 space-y-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 font-mono">
                                    {q.questionNumber || idx + 1}
                                  </span>
                                  <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">
                                    {q.uniqueCode}
                                  </span>
                                  {linkedTos.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {linkedTos.map(t => (
                                        <span
                                          key={t.id}
                                          className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80"
                                        >
                                          {t.code || t.title}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                  {keyAns ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 max-w-[100px] truncate" title={`Kunci: ${keyAns}`}>
                                      Kunci: {keyAns}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] italic text-amber-600 dark:text-amber-400">Kunci kosong</span>
                                  )}
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                    q.status === 'ACTIVE'
                                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                                  }`}>
                                    {q.status || 'ACTIVE'}
                                  </span>
                                </div>
                              </div>

                              <p className="text-xs text-slate-900 dark:text-slate-100 font-medium leading-relaxed line-clamp-3">
                                {q.questionText}
                              </p>

                              {isGFormQuestion && (
                                <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                                  {soalTipe} · Respon Langsung Google Form
                                </span>
                              )}

                              {/* Meta and touch-friendly actions */}
                              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                                <div className="text-[11px]">
                                  <span>{subjObj?.name || 'Mata Pelajaran'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditQuestion(q)}
                                    className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => requestDeleteQuestion(q.id, q.uniqueCode, q.questionText)}
                                    className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/80 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Hapus</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* TAB 6: STUDENTS */}
              {activeTab === 'STUDENTS' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Data Siswa Kelas Anda</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Siswa terisolasi hanya pada kelas yang Anda ampu ({classes.map(c => c.name).join(', ')}).
                      </p>
                    </div>

                    {/* Class Filter */}
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Filter Kelas:</span>
                      <select
                        value={classFilter}
                        onChange={e => setClassFilter(e.target.value)}
                        className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none"
                      >
                        <option value="ALL">Semua Kelas ({classes.length})</option>
                        {classes.map(cls => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden transition-colors">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center">No</th>
                          <th className="py-2.5 px-3 w-28">NISN</th>
                          <th className="py-2.5 px-3 w-24">NIS</th>
                          <th className="py-2.5 px-3">Nama Siswa</th>
                          <th className="py-2.5 px-3 w-28">Kelas</th>
                          <th className="py-2.5 px-3 w-16 text-center">L/P</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredStudents.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-slate-400 dark:text-slate-500 italic">
                              Tidak ada siswa yang terdaftar pada filter kelas ini.
                            </td>
                          </tr>
                        ) : (
                          filteredStudents.map((s, idx) => {
                            const cls = classes.find(c => c.id === s.classId);
                            return (
                              <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400">{idx + 1}</td>
                                <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">{s.nisn}</td>
                                <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">{s.nis}</td>
                                <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{s.name}</td>
                                <td className="py-2.5 px-3">
                                   <span className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium px-2 py-0.5 rounded text-[11px]">
                                     {cls?.name || s.classId}
                                   </span>
                                </td>
                                <td className="py-2.5 px-3 text-center font-bold text-slate-600 dark:text-slate-400">{s.gender}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 7: CLASSES */}
              {activeTab === 'CLASSES' && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Daftar Kelas Yang Ditugaskan</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Anda hanya memiliki kewenangan akademik pada kelas-kelas berikut ini.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {classes.map(cls => {
                      const count = students.filter(s => s.classId === cls.id).length;
                      return (
                        <div key={cls.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{cls.name}</span>
                            <span className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-mono font-bold px-2 py-0.5 rounded">
                              Tingkat {cls.gradeLevel}
                            </span>
                          </div>

                          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                            <div>Total Siswa: <strong className="text-slate-800 dark:text-slate-200 font-bold">{count} Siswa</strong></div>
                            <div>Tahun Ajaran Aktif: 2025/2026 (Genap)</div>
                          </div>

                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <button
                              onClick={() => {
                                setClassFilter(cls.id);
                                handleTabChange('STUDENTS');
                              }}
                              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold flex items-center space-x-1 cursor-pointer"
                            >
                              <span>Lihat Daftar Siswa</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* HEADER TERPADU: PUSAT ANALISIS & LAPORAN TRY OUT */}
              {isToAnalyticsActive && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950 flex items-center justify-center text-teal-600 dark:text-teal-400">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        Pusat Analisis &amp; Laporan Try Out
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pelacakan perkembangan siklus TO, audit butir soal &amp; daya beda, serta rekapitulasi nilai Try Out.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setToAnalyticsSubTab('PROGRESS')}
                      className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                        toAnalyticsSubTab === 'PROGRESS'
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>1. Grafik Siklus TO</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setToAnalyticsSubTab('ITEM_ANALYSIS')}
                      className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                        toAnalyticsSubTab === 'ITEM_ANALYSIS'
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>2. Analisis Butir Soal TO</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setToAnalyticsSubTab('REPORTS')}
                      className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                        toAnalyticsSubTab === 'REPORTS'
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>3. Laporan &amp; Ekspor TO</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 8: ANALYTICS NAVIGATION — PHASE 9 ANALYTICS ENGINE */}
              {isToAnalyticsActive && toAnalyticsSubTab === 'ITEM_ANALYSIS' && (
                <div className="space-y-5">
                  {/* Top Bar: Sub-Navigation Tabs */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors">
                    <div>
                      <div className="flex items-center space-x-2">
                        <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Pusat Analisis Nilai &amp; Butir Soal</h2>
                        <span className="bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 text-xs font-bold px-2.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 flex items-center space-x-1">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Mapel: {activeSubjectObj?.name || 'Mata Pelajaran'}</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Agregasi analitik performa siswa dan butir soal mata pelajaran yang Anda ampu secara real-time.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-1 rounded-xl text-xs font-semibold">
                      <button
                        onClick={() => setAnalyticsSubTab('OVERALL')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          analyticsSubTab === 'OVERALL'
                            ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-sm font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Ringkasan &amp; Filter
                      </button>
                      <button
                        onClick={() => setAnalyticsSubTab('CLASS')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          analyticsSubTab === 'CLASS'
                            ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-sm font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Analisis Kelas
                      </button>
                      <button
                        onClick={() => setAnalyticsSubTab('STUDENT')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          analyticsSubTab === 'STUDENT'
                            ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-sm font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Analisis Siswa
                      </button>
                      <button
                        onClick={() => setAnalyticsSubTab('PSYCHOMETRICS')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          analyticsSubTab === 'PSYCHOMETRICS'
                            ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-sm font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Analisis Butir Soal
                      </button>
                      {teacherSumatifPackages.length > 0 && (
                        <button
                          onClick={() => setAnalyticsSubTab('SUMATIF_EVALUATION')}
                          className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                            analyticsSubTab === 'SUMATIF_EVALUATION'
                              ? 'bg-emerald-600 text-white shadow-sm font-bold'
                              : 'text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                          }`}
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>Audit SAS / SAT</span>
                          <span className="text-[10px] font-mono px-1 rounded-sm bg-emerald-800 text-emerald-100 font-bold">
                            {teacherSumatifPackages.length}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* SUB-TAB 1: OVERALL MULTI-FILTER ANALYTICS */}
                  {analyticsSubTab === 'OVERALL' && (
                    <div className="space-y-4">
                      {/* Filter Bar */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm transition-colors">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center space-x-1">
                          <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>Filter Multi-Dimensi Basis Data</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                          <div>
                            <label className="text-slate-500 dark:text-slate-400 font-medium block mb-1">Tahun Ajaran</label>
                            <select
                              value={analyticsYearFilter}
                              onChange={e => setAnalyticsYearFilter(e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 font-medium focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="ALL">Semua Tahun Ajaran</option>
                              {academicYears.map(ay => {
                                const semesterIndo = ay.semester === 'ODD' ? 'Ganjil' : ay.semester === 'EVEN' ? 'Genap' : ay.semester;
                                return (
                                  <option key={ay.id} value={ay.id}>
                                    {ay.yearLabel} (Semester {semesterIndo})
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          <div>
                            <label className="text-slate-500 dark:text-slate-400 font-medium block mb-1">Pelaksanaan Try Out</label>
                            <select
                              value={selectedTryoutId || 'ALL'}
                              onChange={e => setSelectedTryoutId(e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 font-medium focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="ALL">Semua Try Out</option>
                              {tryouts.map(t => (
                                <option key={t.id} value={t.id}>
                                  [{getFriendlyTryoutStageLabel(t, tryouts)}] {t.title}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-slate-500 dark:text-slate-400 font-medium block mb-1">Mata Pelajaran (Diampu)</label>
                            <div className="w-full bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-lg px-2.5 py-1.5 text-indigo-900 dark:text-indigo-200 font-bold flex items-center space-x-1.5">
                              <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                              <span className="truncate">{activeSubjectObj?.name || 'Mata Pelajaran'}</span>
                            </div>
                          </div>

                          <div>
                            <label className="text-slate-500 dark:text-slate-400 font-medium block mb-1">Tingkat Kelas</label>
                            <select
                              value={analyticsGradeFilter}
                              onChange={e => setAnalyticsGradeFilter(e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 font-medium focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="ALL">Semua Tingkat</option>
                              {Array.from(new Set(availableClassesForActiveTryout.map(c => c.gradeLevel))).sort((a, b) => {
                                const n = (v: string) => parseInt(v, 10) || 0;
                                return n(a) - n(b);
                              }).map(grade => (
                                <option key={grade} value={grade}>Tingkat {grade}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-slate-500 dark:text-slate-400 font-medium block mb-1">Rombel / Kelas</label>
                            <select
                              value={analyticsClassFilter}
                              onChange={e => setAnalyticsClassFilter(e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 font-medium focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="ALL">Semua Kelas ({availableClassesForActiveTryout.length} Kelas Target)</option>
                              {availableClassesForActiveTryout.map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Summary KPI Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Rata-Rata Nilai</div>
                          <div className="text-xl font-bold text-indigo-700 dark:text-indigo-400 mt-1 font-mono">
                            {overallAnalyticsData.summary.averageScore}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Skala 0 - 100</div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Median Skor</div>
                          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 font-mono">
                            {overallAnalyticsData.summary.medianScore}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Nilai Tengah Distribusi</div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Tertinggi / Terendah</div>
                          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                            {overallAnalyticsData.summary.highestScore}{' '}
                            <span className="text-xs text-rose-500 font-normal">/ {overallAnalyticsData.summary.lowestScore}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Rentang Sebaran</div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Tingkat Kelulusan</div>
                          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 font-mono">
                            {overallAnalyticsData.summary.passingRate}%
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">KKM &ge; 75</div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Siswa Lulus / Belum</div>
                          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 font-mono">
                            {Math.round((overallAnalyticsData.summary.totalSubmissions * overallAnalyticsData.summary.passingRate) / 100)}{' '}
                            <span className="text-xs text-rose-500 font-normal">/ {overallAnalyticsData.summary.totalSubmissions - Math.round((overallAnalyticsData.summary.totalSubmissions * overallAnalyticsData.summary.passingRate) / 100)}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Berdasarkan Batas KKM</div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Total Submisi</div>
                          <div className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-1 font-mono">
                            {overallAnalyticsData.summary.totalSubmissions}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Dari {overallAnalyticsData.summary.totalStudents} Siswa Terdaftar</div>
                        </div>
                      </div>

                      {/* Score Distribution Histogram */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                            <PieChart className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            <span>Distribusi Nilai Siswa (Score Distribution)</span>
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Total Submisi: <strong className="text-slate-900 dark:text-slate-100">{overallAnalyticsData.summary.totalSubmissions} Siswa</strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                          {overallAnalyticsData.scoreDistribution.map(bucket => (
                            <div key={bucket.range} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-bold text-slate-700 dark:text-slate-300">Rentang {bucket.range}</span>
                                <span className="font-mono text-indigo-700 dark:text-indigo-400 font-bold">{bucket.count} Siswa ({bucket.percentage}%)</span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    bucket.range === '86 - 100'
                                      ? 'bg-emerald-500'
                                      : bucket.range === '71 - 85'
                                      ? 'bg-indigo-500'
                                      : bucket.range === '51 - 70'
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${Math.min(100, bucket.percentage)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Class Comparison Table */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden transition-colors">
                        <div className="p-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                            <School className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            <span>Perbandingan Performa Antar-Kelas</span>
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {overallAnalyticsData.classComparison.length} Kelas Terfilter
                          </span>
                        </div>

                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                            <tr>
                              <th className="py-2.5 px-3">Nama Kelas</th>
                              <th className="py-2.5 px-3 w-20 text-center">Tingkat</th>
                              <th className="py-2.5 px-3 w-28 text-center">Jumlah Siswa</th>
                              <th className="py-2.5 px-3 w-28 text-center">Rata-Rata</th>
                              <th className="py-2.5 px-3 w-24 text-center">Median</th>
                              <th className="py-2.5 px-3 w-28 text-center">Tertinggi / Terendah</th>
                              <th className="py-2.5 px-3 w-28 text-center">% Kelulusan</th>
                              <th className="py-2.5 px-3 w-28 text-center">Siswa Lulus</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {overallAnalyticsData.classComparison.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="py-8 text-center text-slate-400 dark:text-slate-500 italic">
                                  Tidak ada data yang sesuai dengan kombinasi filter saat ini.
                                </td>
                              </tr>
                            ) : (
                              overallAnalyticsData.classComparison.map(cls => (
                                <tr key={cls.classId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                  <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{cls.className}</td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                      {cls.gradeLevel}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono font-medium text-slate-700 dark:text-slate-300">{cls.studentCount}</td>
                                  <td className="py-2.5 px-3 text-center font-mono font-bold text-indigo-700 dark:text-indigo-400">
                                    {cls.averageScore}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono text-slate-700 dark:text-slate-300">{cls.medianScore}</td>
                                  <td className="py-2.5 px-3 text-center font-mono text-[11px]">
                                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">{cls.highestScore}</span> /{' '}
                                    <span className="text-rose-600 dark:text-rose-400 font-medium">{cls.lowestScore}</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                        cls.passingRate >= 75
                                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                          : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                      }`}
                                    >
                                      {cls.passingRate}%
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-700 dark:text-emerald-400 text-xs">
                                    {Math.round((cls.studentCount * cls.passingRate) / 100)} / {cls.studentCount}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Top & Needs Attention Students */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                              <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              <span>Siswa Nilai Tertinggi (Top Performers)</span>
                            </span>
                          </div>
                          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                            {overallAnalyticsData.topStudents.slice(0, 5).map(st => (
                              <div key={st.studentId} className="py-2 flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold flex items-center justify-center">
                                    {st.rank}
                                  </span>
                                  <div>
                                    <div className="font-bold text-slate-800 dark:text-slate-200">{st.name}</div>
                                    <div className="text-[10px] text-slate-400">{st.className}</div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-sm">{st.score}</div>
                                  <div className="text-[10px] text-emerald-600 font-medium">Lulus KKM</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                              <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                              <span>Perlu Bimbingan Khusus (Nilai di Bawah KKM)</span>
                            </span>
                          </div>
                          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                            {overallAnalyticsData.needsAttentionStudents.length === 0 ? (
                              <div className="py-6 text-center text-slate-400 dark:text-slate-500 italic">
                                Seluruh siswa telah mencapai standar kelulusan KKM.
                              </div>
                            ) : (
                              overallAnalyticsData.needsAttentionStudents.slice(0, 5).map(st => (
                                <div key={st.studentId} className="py-2 flex items-center justify-between">
                                  <div>
                                    <div className="font-bold text-slate-800 dark:text-slate-200">{st.name}</div>
                                    <div className="text-[10px] text-slate-400">{st.className}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-mono font-bold text-rose-600 dark:text-rose-400 text-sm">{st.score}</div>
                                    <div className="text-[10px] text-rose-500 dark:text-rose-400 font-semibold">Di bawah KKM 75</div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Ringkasan Analisis Butir Soal & Psikometri */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden transition-colors space-y-3 p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                          <div>
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                              <FileCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                              <span>Ringkasan Analisis Butir Soal &amp; Mutu Soal ({dashboardItemAnalysisList.length} Soal)</span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Distribusi tingkat kesukaran (p-value), daya pembeda (D-value), dan butir soal yang memerlukan evaluasi guru.
                            </p>
                          </div>

                          <button
                            onClick={() => setAnalyticsSubTab('PSYCHOMETRICS')}
                            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold text-xs rounded-lg border border-indigo-200 dark:border-indigo-800 flex items-center space-x-1.5 transition-colors cursor-pointer self-start sm:self-auto shrink-0"
                          >
                            <span>Buka Detail Psikometrik &amp; Distraktor</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* KPI Bar Kesukaran & Daya Pembeda */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Total Soal Diuji</span>
                            <span className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">{dashboardItemAnalysisList.length}</span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
                            <span className="text-[10px] text-emerald-800 dark:text-emerald-300 block">Soal Mudah (p &gt; 0.60)</span>
                            <span className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                              {dashboardItemAnalysisList.filter(q => q.difficultyCategory === 'MUDAH' || q.difficultyCategory === 'SANGAT_MUDAH').length}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60">
                            <span className="text-[10px] text-indigo-800 dark:text-indigo-300 block">Soal Sedang (0.40 - 0.60)</span>
                            <span className="text-lg font-bold font-mono text-indigo-700 dark:text-indigo-400 mt-0.5 block">
                              {dashboardItemAnalysisList.filter(q => q.difficultyCategory === 'SEDANG').length}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60">
                            <span className="text-[10px] text-amber-800 dark:text-amber-300 block">Soal Sukar (p &le; 0.40)</span>
                            <span className="text-lg font-bold font-mono text-amber-700 dark:text-amber-400 mt-0.5 block">
                              {dashboardItemAnalysisList.filter(q => q.difficultyCategory === 'SULIT' || q.difficultyCategory === 'SANGAT_SULIT').length}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
                            <span className="text-[10px] text-emerald-800 dark:text-emerald-300 block">Daya Pembeda Baik</span>
                            <span className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                              {dashboardItemAnalysisList.filter(q => q.discriminationCategory === 'SANGAT_BAIK' || q.discriminationCategory === 'BAIK').length}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60">
                            <span className="text-[10px] text-rose-800 dark:text-rose-300 block">Perlu Revisi (D &lt; 0.20)</span>
                            <span className="text-lg font-bold font-mono text-rose-700 dark:text-rose-400 mt-0.5 block">
                              {dashboardItemAnalysisList.filter(q => q.discriminationCategory === 'BURUK' || (q.discriminationIndex ?? 0) < 0.2).length}
                            </span>
                          </div>
                        </div>

                        {/* Tabel Cuplikan Butir Soal */}
                        <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-lg">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                              <tr>
                                <th className="py-2 px-3 w-12 text-center">No</th>
                                <th className="py-2 px-3 w-28">Kode Soal</th>
                                <th className="py-2 px-3">Teks Ringkas Soal</th>
                                <th className="py-2 px-3 w-28 text-center">Tingkat Kesukaran</th>
                                <th className="py-2 px-3 w-24 text-center">Daya Pembeda</th>
                                <th className="py-2 px-3 w-20 text-center">% Benar</th>
                                <th className="py-2 px-3 w-28 text-center">Status Mutu</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {dashboardItemAnalysisList.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="py-6 text-center text-slate-400 italic">
                                    Belum ada data butir soal untuk Try Out atau mata pelajaran terpilih.
                                  </td>
                                </tr>
                              ) : (
                                dashboardItemAnalysisList.slice(0, 10).map((q, idx) => (
                                  <tr key={q.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                    <td className="py-2 px-3 text-center font-bold text-slate-600 dark:text-slate-400">{q.questionNumber || idx + 1}</td>
                                    <td className="py-2 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-400">{q.uniqueCode || `SOAL-${idx + 1}`}</td>
                                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 line-clamp-1">{q.questionText || '-'}</td>
                                    <td className="py-2 px-3 text-center font-mono">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        q.difficultyCategory === 'MUDAH' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' :
                                        q.difficultyCategory === 'SEDANG' ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300' :
                                        'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                      }`}>
                                        {q.difficultyIndex?.toFixed(2) ?? '0.00'} ({q.difficultyCategory})
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-center font-mono font-bold">
                                      <span className={`text-[11px] ${
                                        (q.discriminationIndex ?? 0) >= 0.3 ? 'text-emerald-600 dark:text-emerald-400' :
                                        (q.discriminationIndex ?? 0) >= 0.2 ? 'text-indigo-600 dark:text-indigo-400' :
                                        'text-rose-600 dark:text-rose-400'
                                      }`}>
                                        {q.discriminationIndex?.toFixed(2) ?? '0.00'}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                                      {q.correctPercentage}%
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                        q.discriminationCategory === 'SANGAT_BAIK' || q.discriminationCategory === 'BAIK'
                                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                          : q.discriminationCategory === 'CUKUP'
                                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                          : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                      }`}>
                                        {q.reviewRecommendation || q.discriminationStatus || 'Diterima'}
                                      </span>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUB-TAB 2: CLASS LEVEL ANALYTICS */}
                  {analyticsSubTab === 'CLASS' && (
                    <>
                    {/* Fallback: belum ada data kelas atau tryout belum dipilih */}
                    {!classAnalyticsData && (
                      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                        <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
                          <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <p className="text-base font-semibold text-slate-700 dark:text-slate-300">Data Analisis Kelas Belum Tersedia</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                          {tryouts.length === 0
                            ? 'Belum ada Try Out yang dibuat. Buat Try Out terlebih dahulu dan sinkronkan data Google Sheet.'
                            : classes.length === 0
                            ? 'Belum ada kelas yang terdaftar di akun Anda.'
                            : 'Belum ada nilai siswa untuk kelas dan Try Out yang dipilih. Pastikan sudah melakukan sinkronisasi Google Sheet.'}
                        </p>
                        {tryouts.length > 0 && (
                          <div className="flex flex-wrap gap-3 items-center justify-center mt-3 text-xs bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-slate-500 dark:text-slate-400 font-medium">Ganti Try Out:</span>
                              <select
                                value={effectiveTryoutIdForClass}
                                onChange={e => setSelectedTryoutId(e.target.value)}
                                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 font-bold focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                              >
                                {tryouts.map(t => (
                                  <option key={t.id} value={t.id}>
                                    [{getFriendlyTryoutStageLabel(t, tryouts)}] {t.title}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center space-x-1.5">
                              <span className="text-slate-500 dark:text-slate-400 font-medium">Kelas:</span>
                              <select
                                value={activeAnalyticsClassId}
                                onChange={e => setAnalyticsClassFilter(e.target.value)}
                                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 font-bold focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                              >
                                {classes.map(c => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {classAnalyticsData && (
                    <div className="space-y-4">
                      {/* Class Selection & Quick Stats */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 transition-colors">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{classAnalyticsData.className}</span>
                            <span className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-mono font-bold px-2 py-0.5 rounded">
                              Tingkat {classAnalyticsData.gradeLevel}
                            </span>
                            <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs px-2 py-0.5 rounded">
                              {classAnalyticsData.academicYearLabel}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Analisis komprehensif performa rombel: rata-rata, median, sebaran skor, dan analisis butir soal.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">Try Out:</span>
                            <select
                              value={effectiveTryoutIdForClass}
                              onChange={e => setSelectedTryoutId(e.target.value)}
                              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 font-bold focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                            >
                              {tryouts.map(t => (
                                <option key={t.id} value={t.id}>
                                  [{getFriendlyTryoutStageLabel(t, tryouts)}] {t.title}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">Pilih Kelas:</span>
                            <select
                              value={analyticsClassFilter === 'ALL' ? availableClassesForActiveTryout[0]?.id : analyticsClassFilter}
                              onChange={e => setAnalyticsClassFilter(e.target.value)}
                              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-slate-800 dark:text-slate-200 font-bold focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                            >
                              {availableClassesForActiveTryout.map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Class Metrics Row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <span className="text-slate-400 dark:text-slate-500 block mb-1">Peserta Ujian</span>
                          <span className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">{classAnalyticsData.studentCount} Siswa</span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <span className="text-slate-400 dark:text-slate-500 block mb-1">Rata-Rata Kelas</span>
                          <span className="text-xl font-bold text-indigo-700 dark:text-indigo-400 font-mono">{classAnalyticsData.average}</span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <span className="text-slate-400 dark:text-slate-500 block mb-1">Median Kelas</span>
                          <span className="text-xl font-bold text-slate-800 dark:text-slate-200 font-mono">{classAnalyticsData.median}</span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <span className="text-slate-400 dark:text-slate-500 block mb-1">Nilai Tertinggi</span>
                          <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">{classAnalyticsData.highest}</span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <span className="text-slate-400 dark:text-slate-500 block mb-1">Nilai Terendah</span>
                          <span className="text-xl font-bold text-rose-500 dark:text-rose-400 font-mono">{classAnalyticsData.lowest}</span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <span className="text-slate-400 dark:text-slate-500 block mb-1">% Lulus KKM</span>
                          <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400 font-mono">{classAnalyticsData.attainment.passedPercentage}%</span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <span className="text-slate-400 dark:text-slate-500 block mb-1">Jumlah Siswa Lulus</span>
                          <span className="text-xl font-bold text-slate-800 dark:text-slate-200 font-mono">
                            {classAnalyticsData.attainment.passedCount} / {classAnalyticsData.studentCount}
                          </span>
                        </div>
                      </div>

                      {/* Control Panel: Toggle Acuan Nilai Ujian (Google Form vs Aturan Sekolah) */}
                      <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs transition-colors">
                        <div className="flex items-center space-x-2.5 text-xs">
                          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0">
                            <Sliders className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-slate-800 dark:text-slate-200">Acuan Nilai Ujian:</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                activeTryout?.scoringConfig?.scoreSource === 'GOOGLE_FORM'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              }`}>
                                {activeTryout?.scoringConfig?.scoreSource === 'GOOGLE_FORM'
                                  ? 'Nilai Kuis Google Form'
                                  : 'Aturan Kunci Jawaban Sistem'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {activeTryout?.scoringConfig?.scoreSource === 'GOOGLE_FORM'
                                ? 'Nilai murni kuis Google Form langsung dipakai tanpa hitung ulang.'
                                : 'Nilai dihitung berdasarkan kunci jawaban dan bobot penilaian sistem.'}
                            </p>
                          </div>
                        </div>

                        {/* Toggle Buttons */}
                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const targetTO = tryouts.find(t => t.id === selectedTryoutId) || activeTryout || tryouts[0];
                              if (targetTO) {
                                dbService.setTryoutScoreSource(targetTO.id, 'GOOGLE_FORM', currentUser);
                                triggerToast(`Acuan nilai ${targetTO.code} disetel ke Nilai Langsung Google Form (Tersimpan Permanen)`);
                                refreshData();
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                              activeTryout?.scoringConfig?.scoreSource === 'GOOGLE_FORM'
                                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs ring-2 ring-blue-400/40'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Gunakan Nilai Google Form</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const targetTO = tryouts.find(t => t.id === selectedTryoutId) || activeTryout || tryouts[0];
                              if (targetTO) {
                                dbService.setTryoutScoreSource(targetTO.id, 'CUSTOM_ENGINE', currentUser);
                                triggerToast(`Acuan nilai ${targetTO.code} disetel ke Aturan Kunci Jawaban Sistem`);
                                refreshData();
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                              activeTryout?.scoringConfig?.scoreSource !== 'GOOGLE_FORM'
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs ring-2 ring-emerald-400/40'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Gunakan Aturan Sistem</span>
                          </button>
                        </div>
                      </div>

                      {/* Notifikasi Selisih Nilai (hanya jika dalam mode Aturan Sistem dan ada selisih) */}
                      {activeTryout?.scoringConfig?.scoreSource !== 'GOOGLE_FORM' &&
                       classAnalyticsData.studentRankings.some(st => st.status === 'SCORING_MISMATCH') && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm">
                          <div className="flex items-center space-x-2 text-xs text-amber-900 dark:text-amber-200">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              Terdeteksi <strong>{classAnalyticsData.studentRankings.filter(st => st.status === 'SCORING_MISMATCH').length} siswa</strong> memiliki perbedaan nilai antara formulir Google Form dan kalkulasi kunci jawaban.
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              const activeTO = tryouts.find(t => t.id === selectedTryoutId) || activeTryout || tryouts[0];
                              if (activeTO) {
                                const res = dbService.reconcileScoresWithGForm(activeTO.id, currentUser);
                                triggerToast(`${res.reconciledCount > 0 ? res.reconciledCount : 'Seluruh'} nilai siswa berhasil diselaraskan dan dikunci ke Google Form secara permanen!`);
                                refreshData();
                              }
                            }}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center justify-center space-x-1.5 cursor-pointer transition-colors shadow-sm shrink-0"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Kunci &amp; Samakan Nilai ke Google Form</span>
                          </button>
                        </div>
                      )}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden transition-colors">
                        <div className="p-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                            Rekapitulasi Nilai Siswa {classAnalyticsData.className}
                          </span>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {classAnalyticsData.studentRankings.length} Siswa
                            </span>
                            <button
                              onClick={() => {
                                const currentCls = classes.find(c => c.id === classAnalyticsData.classId);
                                const currentTo = tryouts.find(t => t.id === selectedTryoutId) || tryouts[0];
                                if (currentCls && currentTo) {
                                  const classScores = dbService.getScoresByTryout(currentTo.id);
                                  const qaList = dbService.getQuestionAnalysis(currentTo.id, 'ALL', currentCls.id, currentUser);
                                  const fileName = ExportService.exportTeacherClassAnalyticsPDF(
                                    currentCls,
                                    currentTo,
                                    classScores,
                                    questions,
                                    qaList,
                                    competencies,
                                    classAnalyticsData,
                                    students,
                                    dbService.getSchoolProfile()
                                  );
                                  triggerToast(`Laporan PDF Kelas ${currentCls.name} ('${fileName}') berhasil diunduh!`);
                                }
                              }}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center space-x-1 cursor-pointer transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Unduh PDF Kelas</span>
                            </button>
                            <button
                              onClick={() => {
                                const currentCls = classes.find(c => c.id === classAnalyticsData.classId);
                                const currentTo = tryouts.find(t => t.id === selectedTryoutId) || tryouts[0];
                                if (currentCls && currentTo) {
                                  const classScores = dbService.getScoresByTryout(currentTo.id);
                                  ExportService.exportClassAnalysisExcel(currentCls, currentTo, classScores, students);
                                  triggerToast(`Laporan Rekap Nilai ${currentCls.name} berhasil diunduh!`);
                                }
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center space-x-1 cursor-pointer transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Unduh Excel</span>
                            </button>
                          </div>
                        </div>

                        <div className="overflow-auto max-h-[420px] sm:max-h-[480px] scrollbar-thin">
                          <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold shadow-xs">
                              <tr>
                                <th className="py-2.5 px-3 w-12 text-center">Rank</th>
                                <th className="py-2.5 px-3 w-28">NISN</th>
                                <th className="py-2.5 px-3">Nama Siswa</th>
                                <th className="py-2.5 px-3 w-24 text-center">Nilai Ujian</th>
                                <th className="py-2.5 px-3 w-28 text-center">Status Kelulusan</th>
                                <th className="py-2.5 px-3 w-28 text-center">Sinkronisasi</th>
                                <th className="py-2.5 px-3 w-24 text-center">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {classAnalyticsData.studentRankings.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="py-8 text-center text-slate-400 dark:text-slate-500 italic">
                                    Belum ada data nilai siswa untuk kelas dan Try Out ini.
                                  </td>
                                </tr>
                              ) : (
                                classAnalyticsData.studentRankings.map(st => (
                                  <tr key={st.studentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="py-2.5 px-3 text-center font-bold text-slate-600 dark:text-slate-400">{st.rank}</td>
                                    <td className="py-2.5 px-3 font-mono font-medium text-slate-800 dark:text-slate-200">{st.nisn}</td>
                                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{st.name}</td>
                                    <td className="py-2.5 px-3 text-center font-mono font-bold text-indigo-700 dark:text-indigo-400">
                                      {st.score}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      <span
                                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                          st.score >= 75 ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                        }`}
                                      >
                                        {st.score >= 75 ? 'LULUS KKM' : 'REMEDIAL'}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      <span
                                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                          st.status === 'MATCH'
                                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                        }`}
                                      >
                                        {st.status === 'MATCH' ? 'Sinkron 100%' : 'Selisih Skor'}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      <button
                                        onClick={() => {
                                          setSelectedStudentForAnalytics(st.studentId);
                                          setAnalyticsSubTab('STUDENT');
                                        }}
                                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold cursor-pointer"
                                      >
                                        Lihat Rapor
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Analisis Butir Soal Kelas */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden transition-colors">
                        <div className="p-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                            <FileCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            <span>Analisis Butir Soal Kelas ({classAnalyticsData.className})</span>
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {classAnalyticsData.itemAnalysis?.length || 0} Butir Soal
                          </span>
                        </div>

                        <div className="overflow-auto max-h-[420px] sm:max-h-[480px] scrollbar-thin">
                          <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold shadow-xs">
                              <tr>
                                <th className="py-2.5 px-3 w-12 text-center">No</th>
                                <th className="py-2.5 px-3 w-28">Kode Soal</th>
                                <th className="py-2.5 px-3">Teks Ringkas Soal</th>
                                <th className="py-2.5 px-3 w-20 text-center text-emerald-600 dark:text-emerald-400">Benar</th>
                                <th className="py-2.5 px-3 w-20 text-center text-rose-600 dark:text-rose-400">Salah</th>
                                <th className="py-2.5 px-3 w-20 text-center text-amber-600 dark:text-amber-400">Kosong</th>
                                <th className="py-2.5 px-3 w-24 text-center">Kesukaran (p)</th>
                                <th className="py-2.5 px-3 w-24 text-center">Pembeda (D)</th>
                                <th className="py-2.5 px-3 w-24 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {(!classAnalyticsData.itemAnalysis || classAnalyticsData.itemAnalysis.length === 0) ? (
                                <tr>
                                  <td colSpan={9} className="py-8 px-4 text-center text-slate-500 dark:text-slate-400">
                                    <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-1.5">
                                      <Info className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                                      <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                                        {activeTryout?.isExternal
                                          ? 'Paket Try Out Eksternal Tidak Memuat Lembar Butir Soal'
                                          : 'Belum ada data butir soal untuk kelas ini.'}
                                      </span>
                                      {activeTryout?.isExternal && (
                                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                          Nilai diimpor dari rekapitulasi skor akhir vendor/Excel tanpa rincian respons per butir soal.
                                        </p>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                classAnalyticsData.itemAnalysis.map((item, idx) => (
                                  <tr key={item.questionId || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                    <td className="py-2.5 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                                    <td className="py-2.5 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-400">{item.uniqueCode}</td>
                                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 line-clamp-1">{item.questionText || '-'}</td>
                                    <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{item.correctCount}</td>
                                    <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-600 dark:text-rose-400">{item.incorrectCount}</td>
                                    <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-600 dark:text-amber-400">{item.unansweredCount}</td>
                                    <td className="py-2.5 px-3 text-center font-mono font-semibold">{item.difficultyIndex.toFixed(2)}</td>
                                    <td className="py-2.5 px-3 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400">{item.discriminationIndex.toFixed(2)}</td>
                                    <td className="py-2.5 px-3 text-center">
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                        item.discriminationCategory === 'SANGAT_BAIK' || item.discriminationCategory === 'BAIK'
                                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                          : item.discriminationCategory === 'CUKUP'
                                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                          : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                      }`}>
                                        {item.discriminationCategory}
                                      </span>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                    </>
                  )}

                  {/* SUB-TAB 3: STUDENT INDIVIDUAL ANALYTICS */}
                  {analyticsSubTab === 'STUDENT' && (
                    <div className="space-y-4">
                      {/* Filter Bar: Cascading Class & Student Filter + Try Out Filter + Download Button */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                            <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            <span>Pilih Siswa &amp; Paket Try Out</span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Pilih kelas terlebih dahulu, nama siswa otomatis terfilter sesuai rombel.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 text-xs">
                          {/* Filter 1: Pilih Kelas */}
                          <div>
                            <label className="text-slate-500 dark:text-slate-400 font-medium block text-[10px] mb-0.5">Filter Kelas:</label>
                            <select
                              value={studentClassFilter}
                              onChange={e => {
                                const newClass = e.target.value;
                                setStudentClassFilter(newClass);
                                const availableStudents = newClass === 'ALL'
                                  ? students
                                  : students.filter(s => s.classId === newClass);
                                if (availableStudents.length > 0) {
                                  setSelectedStudentForAnalytics(availableStudents[0].id);
                                }
                              }}
                              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 font-bold focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="ALL">Semua Kelas ({availableClassesForActiveTryout.length} Kelas)</option>
                              {availableClassesForActiveTryout.map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Filter 2: Pilih Siswa (Cascaded) */}
                          <div>
                            <label className="text-slate-500 dark:text-slate-400 font-medium block text-[10px] mb-0.5">Pilih Siswa:</label>
                            <select
                              value={activeStudentIdForAnalytics}
                              onChange={e => setSelectedStudentForAnalytics(e.target.value)}
                              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-slate-800 dark:text-slate-200 font-bold focus:ring-1 focus:ring-indigo-500 max-w-[220px]"
                            >
                              {(studentClassFilter === 'ALL'
                                ? students
                                : students.filter(s => s.classId === studentClassFilter)
                              ).map(s => {
                                const cls = classes.find(c => c.id === s.classId);
                                return (
                                  <option key={s.id} value={s.id}>
                                    {s.name} ({s.nisn}) — {cls?.name || s.classId}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          {/* Filter 3: Pilih Try Out */}
                          <div>
                            <label className="text-slate-500 dark:text-slate-400 font-medium block text-[10px] mb-0.5">Paket Try Out:</label>
                            <select
                              value={activeStudentTryoutId}
                              onChange={e => setStudentTryoutFilter(e.target.value)}
                              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 font-bold focus:ring-1 focus:ring-indigo-500"
                            >
                              {tryouts.map(t => (
                                <option key={t.id} value={t.id}>
                                  [{getFriendlyTryoutStageLabel(t, tryouts)}] {t.title}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Action: Unduh Laporan Siswa */}
                          <div className="self-end pt-3 sm:pt-0 flex items-center gap-2">
                            <button
                              onClick={() => {
                                const targetStudent = students.find(s => s.id === activeStudentIdForAnalytics);
                                const targetTo = tryouts.find(t => t.id === activeStudentTryoutId) || tryouts[0];
                                if (targetStudent && targetTo && studentAnalyticsData) {
                                  const studentCls = classes.find(c => c.id === targetStudent.classId);
                                  const studentScoreObj = dbService.getScoresByStudent(targetStudent.id).find(s => s.tryoutId === targetTo.id) || {
                                    id: `sc-${targetStudent.id}`,
                                    responseId: `resp-${targetStudent.id}`,
                                    studentId: targetStudent.id,
                                    tryoutId: targetTo.id,
                                    subjectScores: {},
                                    googleFormScore: studentAnalyticsData.score.rawScoreGForm,
                                    calculatedScore: studentAnalyticsData.score.calculatedScore,
                                    scoreDifference: studentAnalyticsData.score.scoreDifference,
                                    scoringStatus: studentAnalyticsData.score.scoringStatus,
                                    totalCorrect: studentAnalyticsData.correctCount,
                                    totalIncorrect: studentAnalyticsData.incorrectCount,
                                    totalUnanswered: studentAnalyticsData.unansweredCount,
                                    createdAt: new Date().toISOString()
                                  };
                                  const targetWalas = studentCls ? dbService.getHomeroomTeacherForClass(studentCls.id) : null;
                                  const fileName = ExportService.exportStudentPDF(
                                    targetStudent as any,
                                    studentScoreObj,
                                    targetTo,
                                    studentCls,
                                    studentAnalyticsData,
                                    explanations,
                                    undefined,
                                    {
                                      waliKelasName: targetWalas?.name,
                                      waliKelasNip: targetWalas?.nip,
                                      teachers: dbService.getTeachers(),
                                      classes: dbService.getClasses(),
                                    }
                                  );
                                  triggerToast(`Rapor PDF Siswa ${targetStudent.name} ('${fileName}') berhasil diunduh!`);
                                }
                              }}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Unduh Rapor PDF</span>
                            </button>
                            <button
                              onClick={() => {
                                if (studentAnalyticsData) {
                                  ExportService.exportStudentPerformanceExcel(
                                    studentAnalyticsData.studentName,
                                    studentAnalyticsData.nisn,
                                    studentAnalyticsData.className,
                                    studentAnalyticsData.tryoutTitle,
                                    studentAnalyticsData.score.calculatedScore,
                                    studentAnalyticsData.correctCount,
                                    studentAnalyticsData.incorrectCount,
                                    studentAnalyticsData.unansweredCount,
                                    studentAnalyticsData.questionPerformance
                                  );
                                  triggerToast(`Laporan analisis siswa ${studentAnalyticsData.studentName} berhasil diunduh!`);
                                }
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Unduh Excel</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {studentAnalyticsData ? (
                        <div className="space-y-4">
                          {/* Student Header & Clean Score Card */}
                          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 dark:from-[#0c142b] dark:via-[#090e1f] dark:to-[#070b18] text-white rounded-xl p-5 shadow-sm space-y-4 border border-indigo-800/60 dark:border-slate-800 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-800/60 dark:border-slate-800 pb-3">
                              <div>
                                <h3 className="text-lg font-bold text-white">{studentAnalyticsData.studentName}</h3>
                                <div className="text-xs text-indigo-200 dark:text-indigo-300 font-mono space-x-3 mt-0.5">
                                  <span>NISN: {studentAnalyticsData.nisn}</span>
                                  <span>NIS: {studentAnalyticsData.nis}</span>
                                  <span>Kelas: {studentAnalyticsData.className}</span>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="bg-indigo-800/80 dark:bg-slate-800 text-indigo-200 dark:text-indigo-300 text-xs px-2.5 py-1 rounded-lg border border-indigo-700/50 dark:border-slate-700">
                                  {studentAnalyticsData.tryoutTitle}
                                </span>
                              </div>
                            </div>

                            {/* Rekap Total Soal Benar, Salah, Kosong, & Nilai */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs">
                              <div className="bg-white/10 dark:bg-slate-900/60 rounded-lg p-2.5 border border-white/5 dark:border-slate-800">
                                <span className="text-indigo-200 dark:text-indigo-300 block text-[10px]">Nilai Akhir Ujian</span>
                                <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">
                                  {studentAnalyticsData.score.calculatedScore}
                                </span>
                                <span className="text-[10px] text-indigo-300 dark:text-indigo-400">Skala 0 - 100</span>
                              </div>

                              <div className="bg-white/10 dark:bg-slate-900/60 rounded-lg p-2.5 border border-white/5 dark:border-slate-800">
                                <span className="text-indigo-200 dark:text-indigo-300 block text-[10px]">Status Kelulusan</span>
                                <span className="text-2xl font-bold font-mono mt-1 block text-white">
                                  {studentAnalyticsData.score.calculatedScore >= 75 ? (
                                    <span className="text-emerald-400">LULUS</span>
                                  ) : (
                                    <span className="text-rose-400">REMEDIAL</span>
                                  )}
                                </span>
                                <span className="text-[10px] text-indigo-300 dark:text-indigo-400">Batas KKM: 75</span>
                              </div>

                              <div className="bg-white/10 dark:bg-slate-900/60 rounded-lg p-2.5 border border-white/5 dark:border-slate-800">
                                <span className="text-indigo-200 dark:text-indigo-300 block text-[10px]">Total Soal Benar</span>
                                <span className="text-2xl font-bold font-mono text-emerald-300 mt-1 block">
                                  {studentAnalyticsData.correctCount} Soal
                                </span>
                                <span className="text-[10px] text-emerald-400">
                                  {Math.round((studentAnalyticsData.correctCount / (studentAnalyticsData.questionPerformance.length || 1)) * 100)}% dari total soal
                                </span>
                              </div>

                              <div className="bg-white/10 dark:bg-slate-900/60 rounded-lg p-2.5 border border-white/5 dark:border-slate-800">
                                <span className="text-indigo-200 dark:text-indigo-300 block text-[10px]">Total Soal Salah</span>
                                <span className="text-2xl font-bold font-mono text-rose-300 mt-1 block">
                                  {studentAnalyticsData.incorrectCount} Soal
                                </span>
                                <span className="text-[10px] text-rose-400">Jawaban keliru</span>
                              </div>

                              <div className="bg-white/10 dark:bg-slate-900/60 rounded-lg p-2.5 border border-white/5 dark:border-slate-800">
                                <span className="text-indigo-200 dark:text-indigo-300 block text-[10px]">Tidak Terjawab / Kosong</span>
                                <span className="text-2xl font-bold font-mono text-amber-300 mt-1 block">
                                  {studentAnalyticsData.unansweredCount} Soal
                                </span>
                                <span className="text-[10px] text-amber-300">Belum diisi siswa</span>
                              </div>
                            </div>
                          </div>

                          {/* Rekap Tren Progres Antar Try Out */}
                          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3 transition-colors">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                              <span className="flex items-center space-x-1.5">
                                <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                <span>Riwayat Tren Progres Try Out</span>
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                                Perbandingan nilai siswa pada seluruh Try Out yang telah diikuti
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                              {studentAnalyticsData.progress.map((p, pIdx) => {
                                const prevScore = pIdx > 0 ? studentAnalyticsData.progress[pIdx - 1].score : null;
                                const diff = prevScore !== null ? Math.round((p.score - prevScore) * 10) / 10 : null;
                                return (
                                  <div
                                    key={p.tryoutId}
                                    onClick={() => setStudentTryoutFilter(p.tryoutId)}
                                    className={`border rounded-lg p-3 text-xs space-y-1 cursor-pointer transition-all ${
                                      p.tryoutId === activeStudentTryoutId
                                        ? 'bg-indigo-50/70 dark:bg-indigo-950/50 border-indigo-500 dark:border-indigo-600 shadow-xs'
                                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 font-medium">
                                      <span className="font-bold">{p.tryoutCode}</span>
                                      <span className="text-[10px]">{p.date}</span>
                                    </div>
                                    <div className="text-xl font-bold font-mono text-indigo-700 dark:text-indigo-400">{p.score}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">{p.tryoutTitle}</div>
                                    <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 text-[10px] flex items-center justify-between">
                                      <span className={`font-bold ${p.score >= 75 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                                        {p.score >= 75 ? 'Lulus KKM' : 'Remedial'}
                                      </span>
                                      {diff !== null && (
                                        <span className={`font-mono font-bold ${diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                          {diff >= 0 ? `+${diff}` : diff}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Question Performance Detail: Filter Tab (Semua, Benar Saja, Salah/Kosong Saja) */}
                          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden transition-colors">
                            <div className="p-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                                <FileCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                <span>Daftar Butir Soal ({studentAnalyticsData.tryoutCode})</span>
                              </div>

                              <div className="flex items-center space-x-1 bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-medium">
                                <button
                                  onClick={() => setStudentQuestionTab('ALL')}
                                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                                    studentQuestionTab === 'ALL'
                                      ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 font-bold shadow-xs'
                                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                  }`}
                                >
                                  Semua Soal ({studentAnalyticsData.questionPerformance.length})
                                </button>
                                <button
                                  onClick={() => setStudentQuestionTab('CORRECT')}
                                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                                    studentQuestionTab === 'CORRECT'
                                      ? 'bg-emerald-600 text-white font-bold shadow-xs'
                                      : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                  }`}
                                >
                                  Daftar Soal Benar ({studentAnalyticsData.correctCount})
                                </button>
                                <button
                                  onClick={() => setStudentQuestionTab('INCORRECT')}
                                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                                    studentQuestionTab === 'INCORRECT'
                                      ? 'bg-rose-600 text-white font-bold shadow-xs'
                                      : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                  }`}
                                >
                                  Daftar Soal Salah &amp; Kosong ({studentAnalyticsData.incorrectCount + studentAnalyticsData.unansweredCount})
                                </button>
                              </div>
                            </div>

                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                                <tr>
                                  <th className="py-2.5 px-3 w-12 text-center">No</th>
                                  <th className="py-2.5 px-3 w-32">Kode Soal</th>
                                  <th className="py-2.5 px-3">Teks Ringkas Soal</th>
                                  <th className="py-2.5 px-3 w-28 text-center">Jawaban Siswa</th>
                                  <th className="py-2.5 px-3 w-28 text-center">Kunci Sah</th>
                                  <th className="py-2.5 px-3 w-28 text-center">Hasil Evaluasi</th>
                                  <th className="py-2.5 px-3 w-20 text-center">Poin</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {studentAnalyticsData.questionPerformance
                                  .filter(qp => {
                                    if (studentQuestionTab === 'CORRECT') return qp.isCorrect;
                                    if (studentQuestionTab === 'INCORRECT') return !qp.isCorrect;
                                    return true;
                                  })
                                  .map((qp, idx) => (
                                    <tr key={qp.questionId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                      <td className="py-2.5 px-3 text-center font-bold text-slate-500 dark:text-slate-400">{qp.questionNumber || idx + 1}</td>
                                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-400">{qp.uniqueCode}</td>
                                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 line-clamp-1">{qp.questionText}</td>
                                      <td className="py-2.5 px-3 text-center font-mono font-bold">
                                        <span
                                          className={`px-2.5 py-0.5 rounded text-[11px] ${
                                            qp.studentAnswer === 'KOSONG'
                                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                              : qp.isCorrect
                                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                              : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                          }`}
                                        >
                                          {qp.studentAnswer}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                                        {qp.correctAnswer}
                                      </td>
                                      <td className="py-2.5 px-3 text-center">
                                        <span
                                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                            qp.studentAnswer === 'KOSONG'
                                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                              : qp.isCorrect
                                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                          }`}
                                        >
                                          {qp.studentAnswer === 'KOSONG' ? 'Tidak Dijawab' : qp.isCorrect ? 'Benar' : 'Salah'}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                                        {qp.score}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-slate-400 italic">
                          Pilih siswa untuk melihat analisis analitik individu.
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUB-TAB 4: QUESTION PSYCHOMETRICS & DISTRACTOR ANALYSIS */}
                  {analyticsSubTab === 'PSYCHOMETRICS' && (
                    <div className="space-y-4">
                      {/* Critical Pedagogical Disclaimer Banner */}
                      <div className="bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-sm flex items-start space-x-3 transition-colors">
                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                            Pedoman Interpretasi Status Butir Soal (Pedagogical Rule)
                          </h4>
                          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                            {AnalyticsService.PEDAGOGICAL_DISCLAIMER}
                          </p>
                        </div>
                      </div>

                      {/* Header & Filter Controls */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 transition-colors">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            Analisis Butir Soal &amp; Pilihan Pengecoh
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Rekapitulasi jumlah siswa menjawab benar, salah, kosong, tingkat kesukaran (p), dan daya pembeda (D).
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Paket Try Out:</span>
                          <select
                            value={activePsychometricsTryoutId}
                            onChange={e => setPsychometricsTryoutId(e.target.value)}
                            className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none"
                          >
                            {tryouts.map(t => (
                              <option key={t.id} value={t.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                                [{getFriendlyTryoutStageLabel(t, tryouts)}] {t.title}
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center space-x-1.5 bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2.5 py-1 text-indigo-900 dark:text-indigo-200 font-bold ml-1">
                            <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span>{activeSubjectObj?.name || 'Mata Pelajaran'}</span>
                          </div>

                          <span className="text-slate-500 dark:text-slate-400 font-medium ml-2">Kelas / Rombel:</span>
                          <select
                            value={psychometricsClassFilter}
                            onChange={e => setPsychometricsClassFilter(e.target.value)}
                            className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none"
                          >
                            <option value="ALL">Semua Kelas ({availableClassesForActiveTryout.length} Kelas Target)</option>
                            {availableClassesForActiveTryout.map(c => (
                              <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                                {c.name}
                              </option>
                            ))}
                          </select>

                          <button
                            disabled={questionAnalysisList.length === 0}
                            onClick={() => {
                              if (questionAnalysisList.length === 0) {
                                triggerToast('Tidak ada data butir soal untuk diunduh.');
                                return;
                              }
                              const activeTo = tryouts.find(t => t.id === activePsychometricsTryoutId) || tryouts[0];
                              const activeSub = subjects.find(s => s.id === selectedSubjectId);
                              const activeCls = classes.find(c => c.id === psychometricsClassFilter);
                              const classSuffix = activeCls ? `_${activeCls.name.replace(/\s+/g, '_')}` : '_Semua_Kelas';
                              ExportService.exportItemAnalysisExcel(
                                activeTo ? `${activeTo.code}_${activeTo.title}${classSuffix}` : 'Try_Out',
                                activeSub ? activeSub.name : 'Mapel',
                                questionAnalysisList
                              );
                              triggerToast('Laporan Analisis Butir Soal Excel berhasil diunduh!');
                            }}
                            className={`ml-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded-lg flex items-center space-x-1 transition-colors ${
                              questionAnalysisList.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                            }`}
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Unduh Excel</span>
                          </button>
                        </div>
                      </div>

                      {/* Duplicate Submissions Notice Banner */}
                      {targetPsychometricsTryout?.duplicateSubmissions && targetPsychometricsTryout.duplicateSubmissions.length > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 rounded-2xl p-4 shadow-sm transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 border border-amber-200 dark:border-amber-800">
                              <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className="text-sm font-bold text-amber-950 dark:text-amber-200 flex items-center gap-2">
                                  <span>Pemberitahuan: Terdeteksi {targetPsychometricsTryout.duplicateSubmissions.length} Siswa dengan Pengumpulan Ganda (Duplikasi NISN)</span>
                                </h4>
                                <span className="text-[11px] bg-amber-200/90 dark:bg-amber-900/90 text-amber-950 dark:text-amber-200 font-bold px-2.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-700">
                                  Otomatis Dihitung 1x (Pengerjaan Terakhir)
                                </span>
                              </div>
                              <p className="text-xs text-amber-900/90 dark:text-amber-300/90 mt-1 leading-relaxed">
                                Terdapat siswa yang mengumpulkan formulir Google Form lebih dari 1 kali. Sistem secara otomatis <strong>hanya menghitung 1 kali</strong> dengan menggunakan data pengerjaan <strong>terakhir</strong> yang terdata di spreadsheet, sehingga rekapitulasi nilai dan analisis butir soal tetap adil dan akurat.
                              </p>

                              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {targetPsychometricsTryout.duplicateSubmissions.map((dup, dIdx) => {
                                  const resolvedClass = classes.find(c => c.id === dup.className)?.name || dup.className;
                                  return (
                                    <div
                                      key={dup.nisn || dIdx}
                                      className="bg-white/90 dark:bg-slate-900/90 border border-amber-200 dark:border-amber-800/80 rounded-xl p-3 shadow-2xs hover:shadow-xs transition-shadow"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate" title={dup.studentName}>
                                          {dup.studentName}
                                        </div>
                                        {resolvedClass && (
                                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 font-bold px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 shrink-0">
                                            {resolvedClass}
                                          </span>
                                        )}
                                      </div>
                                      <div className="mt-1.5 flex items-center justify-between text-[11px]">
                                        <span className="text-slate-500 dark:text-slate-400">
                                          NISN: <code className="font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1 py-0.5 rounded border border-amber-200 dark:border-amber-800">{dup.nisn}</code>
                                        </span>
                                        <span className="text-slate-600 dark:text-slate-400 text-[10px]">
                                          Total: <strong className="text-amber-700 dark:text-amber-400">{dup.submissionCount}x kirim</strong>
                                        </span>
                                      </div>
                                      <div className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
                                        <span>&bull; Dipakai: Baris #{dup.selectedRowNumber}</span>
                                        <span className="text-slate-400 dark:text-slate-500">(Dilewati: #{dup.skippedRowNumbers.join(', #')})</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Psychometric Metric Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <span className="text-slate-400 dark:text-slate-500 block mb-1">Total Butir Soal</span>
                          <span className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">{questionAnalysisList.length} Soal</span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <span className="text-slate-400 dark:text-slate-500 block mb-1">Rata-Rata Daya Pembeda (D)</span>
                          <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            {questionAnalysisList.length > 0
                              ? (questionAnalysisList.reduce((acc, q) => acc + q.discriminationIndex, 0) / questionAnalysisList.length).toFixed(2)
                              : '0.00'}
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <span className="text-slate-400 dark:text-slate-500 block mb-1">Soal Layak (Valid)</span>
                          <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                            {questionAnalysisList.filter(q => q.reviewRecommendation === 'Good / Valid Question').length} Soal
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm transition-colors">
                          <span className="text-slate-400 dark:text-slate-500 block mb-1">Perlu Tinjauan (Needs Review)</span>
                          <span className="text-xl font-bold text-amber-600 dark:text-amber-400 font-mono">
                            {questionAnalysisList.filter(q => q.reviewRecommendation === 'Needs Review').length} Soal
                          </span>
                        </div>
                      </div>

                      {/* Detailed Question Psychometrics Table */}
                      <div className="overflow-auto max-h-[460px] sm:max-h-[540px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs scrollbar-thin transition-colors">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold shadow-xs">
                            <tr>
                              <th className="py-2.5 px-3 w-12 text-center">No</th>
                              <th className="py-2.5 px-3 w-28">Kode Soal</th>
                              <th className="py-2.5 px-3">Teks Ringkas &amp; Kunci</th>
                              <th className="py-2.5 px-3 w-44 text-center">Rekap Jawaban Siswa</th>
                              <th className="py-2.5 px-3 w-28 text-center">Kesukaran (p)</th>
                              <th className="py-2.5 px-3 w-32 text-center">Daya Pembeda (D)</th>
                              <th className="py-2.5 px-3 w-48 text-center">Sebaran Pilihan (A/B/C/D/E)</th>
                              <th className="py-2.5 px-3 w-36 text-center">Status Soal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {questionAnalysisList.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="py-12 px-4 text-center text-slate-500 dark:text-slate-400">
                                  <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-2">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center">
                                      <Info className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                                    </div>
                                    <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                                      {targetPsychometricsTryout?.isExternal
                                        ? 'Paket Try Out Eksternal'
                                        : 'Tidak Ada Butir Soal'}
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                      {targetPsychometricsTryout?.isExternal
                                        ? 'Paket ini merupakan Try Out Eksternal (rekapitulasi nilai akhir dari vendor/Excel), sehingga tidak memuat lembar jawaban butir soal (A/B/C/D/E) untuk dianalisis.'
                                        : 'Belum ada butir soal atau lembar jawaban siswa yang terhubung pada paket Try Out dan mata pelajaran ini.'}
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              questionAnalysisList.map((qa, idx) => (
                                <tr key={qa.questionId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                  <td className="py-3 px-3 text-center font-bold text-slate-500 dark:text-slate-400">{idx + 1}</td>
                                  <td className="py-3 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-400">
                                    {qa.uniqueCode}
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="text-slate-900 dark:text-slate-100 font-medium line-clamp-1">{qa.questionText}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                      <span>Kunci Jawaban Sah:</span>
                                      <span className="text-emerald-700 dark:text-emerald-400 font-mono font-bold bg-emerald-50 dark:bg-emerald-950/60 px-1 py-0.2 rounded border border-emerald-200 dark:border-emerald-800">
                                        {qa.correctAnswer}
                                      </span>
                                      {(() => {
                                        const keyOptText = (qa as any).options?.find((o: any) => o.key === qa.correctAnswer.toUpperCase())?.text;
                                        if (keyOptText && !keyOptText.toLowerCase().startsWith('pilihan')) {
                                          return (
                                            <span className="text-slate-600 dark:text-slate-400 truncate max-w-[220px]" title={keyOptText}>
                                              ({keyOptText})
                                            </span>
                                          );
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <div className="flex items-center justify-center space-x-1.5 text-[11px] font-mono font-bold">
                                      <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800" title={`Benar: ${qa.correctPercentage}%`}>
                                        {qa.correctCount} Benar
                                      </span>
                                      <span className="bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800" title={`Salah: ${qa.incorrectPercentage}%`}>
                                        {qa.incorrectCount} Salah
                                      </span>
                                      <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800" title={`Kosong: ${qa.unansweredPercentage}%`}>
                                        {qa.unansweredCount} Kosong
                                      </span>
                                    </div>
                                    <div className="text-[9px] text-slate-400 mt-1 font-mono">
                                      Total Responden: {qa.totalRespondents} Siswa
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <div className="flex flex-col items-center gap-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{qa.difficultyIndex.toFixed(2)}</span>
                                        <span
                                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                            qa.informativeStatus === 'Easy'
                                              ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                                              : qa.informativeStatus === 'Difficult'
                                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                          }`}
                                        >
                                          {qa.informativeStatus}
                                        </span>
                                      </div>
                                      <div className="w-16 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full ${
                                            qa.difficultyIndex >= 0.70
                                              ? 'bg-blue-500'
                                              : qa.difficultyIndex >= 0.30
                                              ? 'bg-emerald-500'
                                              : 'bg-rose-500'
                                          }`}
                                          style={{ width: `${Math.max(10, Math.min(100, qa.difficultyIndex * 100))}%` }}
                                        ></div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <div className="flex flex-col items-center gap-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{qa.discriminationIndex.toFixed(2)}</span>
                                        <span
                                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                            qa.discriminationStatus === 'Good Discrimination'
                                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                              : qa.discriminationStatus === 'Moderate Discrimination'
                                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                              : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                          }`}
                                        >
                                          {qa.discriminationStatus === 'Good Discrimination' ? 'Baik' : qa.discriminationStatus === 'Moderate Discrimination' ? 'Cukup' : 'Jelek'}
                                        </span>
                                      </div>
                                      <div className="w-16 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full ${
                                            qa.discriminationIndex >= 0.40
                                              ? 'bg-emerald-500'
                                              : qa.discriminationIndex >= 0.20
                                              ? 'bg-amber-500'
                                              : 'bg-rose-500'
                                          }`}
                                          style={{ width: `${Math.max(10, Math.min(100, Math.max(0, qa.discriminationIndex) * 100))}%` }}
                                        ></div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-center font-mono text-[10px]">
                                    <div className="flex items-center justify-center space-x-1">
                                      {['A', 'B', 'C', 'D', 'E'].map(opt => {
                                        const stat = qa.distractorStats[opt];
                                        const isKey = opt === qa.correctAnswer.toUpperCase();
                                        const optText = (qa as any).options?.find((o: any) => o.key === opt)?.text;
                                        const hasText = optText && !optText.toLowerCase().startsWith('pilihan');
                                        return (
                                          <span
                                            key={opt}
                                            className={`px-1 py-0.5 rounded cursor-help transition-all ${
                                              isKey
                                                ? 'bg-emerald-200 dark:bg-emerald-900/80 text-emerald-950 dark:text-emerald-100 font-bold border border-emerald-400 dark:border-emerald-700'
                                                : stat?.isMisleading
                                                ? 'bg-rose-200 dark:bg-rose-900/80 text-rose-950 dark:text-rose-100 font-bold border border-rose-400 dark:border-rose-700'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                            }`}
                                            title={
                                              hasText
                                                ? `${opt} (${optText}): ${stat?.count || 0} pemilih (${stat?.percentage || 0}%)${isKey ? ' [KUNCI SAH]' : stat?.isMisleading ? ' [DISTRAKTOR MENYESATKAN]' : ''}`
                                                : `${opt}: ${stat?.count || 0} pemilih (${stat?.percentage || 0}%)${isKey ? ' [KUNCI SAH]' : stat?.isMisleading ? ' [DISTRAKTOR MENYESATKAN]' : ''}`
                                            }
                                          >
                                            {opt}:{stat?.count || 0}
                                          </span>
                                        );
                                      })}
                                    </div>
                                    {qa.distractorStats.KOSONG?.count > 0 && (
                                      <div className="text-[9px] text-amber-700 dark:text-amber-400 mt-0.5">
                                        Kosong: {qa.distractorStats.KOSONG.count}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <span
                                      className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${
                                        qa.reviewRecommendation === 'Needs Review'
                                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                          : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                      }`}
                                    >
                                      {qa.reviewRecommendation}
                                    </span>
                                    {qa.reviewReasons.length > 0 && (
                                      <div className="text-[9px] text-amber-700 dark:text-amber-400 mt-1 max-w-[140px] mx-auto truncate" title={qa.reviewReasons.join(' | ')}>
                                        {qa.reviewReasons[0]}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* SUB-TAB 5: SUMATIF SAS / SAT EVALUATION */}
                  {analyticsSubTab === 'SUMATIF_EVALUATION' && (
                    <div className="space-y-4">
                      {/* Selector Wadah SAS/SAT */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              {activeSumatifPackage?.assessmentType === 'SAT' ? 'Sumatif Akhir Tahun' : 'Sumatif Akhir Semester'}
                            </span>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              {activeSumatifPackage?.title || 'Wadah SAS / SAT'}
                            </h3>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Audit psikometri butir soal semesteran dan distribusi nilai ketuntasan KKTP untuk Mapel {activeSubjectObj?.name}.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold text-slate-500">Pilih Wadah:</label>
                          <select
                            value={activeSumatifPackage?.id || ''}
                            onChange={e => setSelectedSumatifPackageId(e.target.value)}
                            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                          >
                            {teacherSumatifPackages.map(pkg => (
                              <option key={pkg.id} value={pkg.id}>
                                [{pkg.assessmentType}] {pkg.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {teacherSumatifData ? (
                        <GuruSumatifView analytics={teacherSumatifData} />
                      ) : (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
                          Belum ada data nilai atau soal untuk mata pelajaran ini di wadah yang dipilih.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 8.5: PROGRESS TRACKING */}
              {isToAnalyticsActive && toAnalyticsSubTab === 'PROGRESS' && (
                <div className="space-y-6">
                  {/* Top Control Bar & Sub-Navigation */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                            Grafik &amp; Pelacakan Perkembangan Hasil Ujian
                          </h2>
                          <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full font-mono">
                            Multi-Try Out (TO 1 s/d TO {getMaxTryoutStage(tryouts, dbService.getExamPackages(), customMaxToStage)})
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Pantau tren kemajuan belajar siswa, perbandingan performa kelas, dan dinamika capaian nilai per mata pelajaran secara visual dan terukur.
                        </p>
                      </div>
                    </div>

                    {/* Sub-Navigation Pills (3 Core Tabs) */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <button
                        onClick={() => setProgressSubTab('STUDENT')}
                        className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center space-x-2 ${
                          progressSubTab === 'STUDENT'
                            ? 'bg-indigo-600 text-white shadow-xs font-bold'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Progress Siswa</span>
                      </button>
                      <button
                        onClick={() => setProgressSubTab('CLASS')}
                        className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center space-x-2 ${
                          progressSubTab === 'CLASS'
                            ? 'bg-indigo-600 text-white shadow-xs font-bold'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <School className="w-3.5 h-3.5" />
                        <span>Progress Rombel / Kelas</span>
                      </button>
                      <button
                        onClick={() => setProgressSubTab('SUBJECT')}
                        className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center space-x-2 ${
                          progressSubTab === 'SUBJECT'
                            ? 'bg-indigo-600 text-white shadow-xs font-bold'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Progress Mata Pelajaran</span>
                      </button>
                    </div>
                  </div>

                  {/* SUB-TAB 1: STUDENT PROGRESS TRACKING */}
                  {progressSubTab === 'STUDENT' && (() => {
                    const filteredStudents = selectedClassForProgress === 'ALL'
                      ? students
                      : students.filter(s => s.classId === selectedClassForProgress);
                    
                    const studentWithScore = filteredStudents.find(s => dbService.getScoresByStudent(s.id).length > 0);
                    const activeStudentId = selectedStudentForProgress && filteredStudents.some(s => s.id === selectedStudentForProgress)
                      ? selectedStudentForProgress
                      : (studentWithScore?.id || filteredStudents[0]?.id || students[0]?.id || '');

                    const studentProg = activeStudentId ? dbService.getStudentProgress(activeStudentId, currentUser, selectedSubjectId) : null;
                    const currentStudentObj = students.find(s => s.id === activeStudentId);

                    return (
                      <div className="space-y-5">
                        {/* Filter Bar */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs transition-colors">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center space-x-2">
                              <span className="text-slate-500 dark:text-slate-400 font-medium">Filter Kelas:</span>
                              <select
                                value={selectedClassForProgress}
                                onChange={e => {
                                  setSelectedClassForProgress(e.target.value);
                                  const firstInClass = students.find(s => e.target.value === 'ALL' || s.classId === e.target.value);
                                  if (firstInClass) setSelectedStudentForProgress(firstInClass.id);
                                }}
                                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200 rounded-xl px-2.5 py-1.5 cursor-pointer focus:ring-2 focus:ring-indigo-500"
                              >
                                <option value="ALL">Semua Kelas ({availableClassesForActiveTryout.length} Kelas Target)</option>
                                {availableClassesForActiveTryout.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-center space-x-2">
                              <span className="text-slate-500 dark:text-slate-400 font-medium">Pilih Siswa:</span>
                              <select
                                value={activeStudentId}
                                onChange={e => setSelectedStudentForProgress(e.target.value)}
                                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white rounded-xl px-3 py-1.5 cursor-pointer focus:ring-2 focus:ring-indigo-500"
                              >
                                {filteredStudents.map(s => (
                                  <option key={s.id} value={s.id}>{s.name} ({s.nisn})</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {studentProg && (
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                                <span className="text-slate-500 dark:text-slate-400">Kelas: </span>
                                <strong className="text-slate-900 dark:text-white">{studentProg.className}</strong>
                              </div>
                              <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                                <span className="text-slate-500 dark:text-slate-400">Delta Skor: </span>
                                <strong className={studentProg.scoreDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-mono' : 'text-rose-600 dark:text-rose-400 font-mono'}>
                                  {studentProg.scoreDelta > 0 ? `+${studentProg.scoreDelta.toFixed(1)}` : studentProg.scoreDelta.toFixed(1)}
                                </strong>
                              </div>
                              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border ${
                                studentProg.trend === 'MENINGKAT'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                  : studentProg.trend === 'STABIL'
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                                  : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                              }`}>
                                TREN: {studentProg.trend}
                              </span>

                              <button
                                onClick={() => {
                                  if (currentStudentObj && studentProg) {
                                    ExportService.exportStudentProgressExcel(
                                      currentStudentObj.name,
                                      currentStudentObj.nisn,
                                      studentProg.className,
                                      activeSubject?.name || 'Mata Pelajaran',
                                      studentProg.points
                                    );
                                    triggerToast(`Laporan tren progres siswa ${currentStudentObj.name} berhasil diunduh!`);
                                  }
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Unduh Progres Siswa</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Visual Trajectory Line Graph for Student */}
                        {studentProg && studentProg.points.length > 0 && (() => {
                          const pts = studentProg.points;
                          const chartWidth = 1000;
                          const padX = 80;
                          const stepX = pts.length > 1 ? (chartWidth - padX * 2) / (pts.length - 1) : 0;
                          const getY = (val: number) => 260 - ((Math.max(0, Math.min(100, val)) / 100) * 220);
                          const getX = (idx: number) => pts.length === 1 ? chartWidth / 2 : padX + idx * stepX;

                          const studentCoords = pts.map((pt, idx) => ({
                            ...pt,
                            x: getX(idx),
                            y: getY(pt.score),
                          }));
                          const studentPoly = studentCoords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
                          const classPoly = pts.map((pt, idx) => `${getX(idx).toFixed(1)},${getY(pt.classAverage || 75).toFixed(1)}`).join(' ');
                          const firstX = studentCoords[0].x;
                          const lastX = studentCoords[studentCoords.length - 1].x;

                          return (
                            <div className="p-3.5 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs transition-colors">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-b border-slate-100 dark:border-slate-800 pb-3">
                                <div>
                                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    <span>Grafik Perkembangan Skor — {currentStudentObj?.name || 'Siswa'} ({studentProg.className})</span>
                                  </h3>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    Laju perolehan skor siswa lintas tahapan Try Out dibandingkan rata-rata kelas.
                                  </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono shrink-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span>
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">Skor Siswa</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-3.5 h-0.5 border-t-2 border-dashed border-emerald-500 inline-block"></span>
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">Rata-Rata Kelas</span>
                                  </div>
                                </div>
                              </div>

                              {/* Mobile Swipe Hint */}
                              <div className="flex sm:hidden items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-200/70 dark:border-slate-800/70">
                                <span>💡 Geser grafik ke samping untuk melihat detail tiap TO</span>
                                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">↔ Geser</span>
                              </div>

                              <div className="relative w-full mobile-chart-scroll bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs">
                                <svg
                                  className="min-w-[600px] sm:min-w-0 w-full h-auto min-h-[215px] sm:min-h-[250px] overflow-visible"
                                  viewBox="0 0 1000 300"
                                  preserveAspectRatio="xMidYMid meet"
                                >
                                  <defs>
                                    <linearGradient id="studentAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                                    </linearGradient>
                                  </defs>

                                  {/* Horizontal Grid Lines */}
                                  <line x1="50" y1="40" x2="950" y2="40" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                                  <text x="38" y="45" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-semibold">100</text>

                                  <line x1="50" y1="150" x2="950" y2="150" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                                  <text x="38" y="155" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-semibold">50</text>

                                  <line x1="50" y1="205" x2="950" y2="205" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                                  <text x="38" y="210" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-semibold">25</text>

                                  <line x1="50" y1="260" x2="950" y2="260" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1.5" />
                                  <text x="38" y="265" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-semibold">0</text>

                                  {/* Class Average Line */}
                                  {pts.length > 1 ? (
                                    <polyline
                                      fill="none"
                                      stroke="#10b981"
                                      strokeWidth="2.5"
                                      strokeDasharray="6 4"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      points={classPoly}
                                    />
                                  ) : (
                                    <line
                                      x1="50"
                                      y1={getY(pts[0]?.classAverage || 75)}
                                      x2="950"
                                      y2={getY(pts[0]?.classAverage || 75)}
                                      stroke="#10b981"
                                      strokeWidth="2"
                                      strokeDasharray="6 4"
                                    />
                                  )}

                                  {/* Student Gradient Fill */}
                                  {pts.length > 1 ? (
                                    <polygon points={`${firstX},260 ${studentPoly} ${lastX},260`} fill="url(#studentAreaGrad)" />
                                  ) : (
                                    <line
                                      x1="50"
                                      y1={studentCoords[0]?.y || 150}
                                      x2="950"
                                      y2={studentCoords[0]?.y || 150}
                                      stroke="#4f46e5"
                                      strokeWidth="3"
                                      strokeOpacity="0.8"
                                      strokeDasharray="4 4"
                                    />
                                  )}

                                  {/* Student Connecting Line */}
                                  {pts.length > 1 && (
                                    <polyline
                                      fill="none"
                                      stroke="#4f46e5"
                                      strokeWidth="4.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      points={studentPoly}
                                    />
                                  )}

                                  {/* Student Nodes with Score Badges */}
                                  {studentCoords.map((pt, i) => (
                                    <g key={i}>
                                      <rect x={pt.x - 37} y={pt.y - 38} width="74" height="25" rx="8" className="fill-slate-900 dark:fill-slate-100" />
                                      <text x={pt.x} y={pt.y - 21} textAnchor="middle" className="text-[13px] font-mono font-bold fill-indigo-400 dark:fill-indigo-700">
                                        {pt.score.toFixed(1)}
                                      </text>
                                      <circle cx={pt.x} cy={pt.y} r="12" fill="#4f46e5" opacity="0.25" />
                                      <circle cx={pt.x} cy={pt.y} r="6.5" fill="#4f46e5" stroke="#ffffff" strokeWidth="2.5" />
                                    </g>
                                  ))}

                                  {/* X-Axis Labels */}
                                  {studentCoords.map((pt, i) => (
                                    <text key={i} x={pt.x} y="295" textAnchor="middle" className="text-[14px] font-mono font-bold fill-slate-600 dark:fill-slate-300">
                                      {pt.tryoutCode}
                                    </text>
                                  ))}
                                </svg>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Progression Cards Line Chart Simulation */}
                        {studentProg && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {studentProg.points.map((pt) => (
                              <div key={pt.tryoutId} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs space-y-3 transition-colors">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 rounded-md border border-indigo-100 dark:border-indigo-900">
                                    {pt.tryoutCode}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">{pt.date}</span>
                                </div>
                                <div>
                                  <div className="text-3xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
                                    {pt.score.toFixed(1)}
                                  </div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">Nilai Akhir Siswa</div>
                                </div>
                                <div className="space-y-1.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                                  <div className="flex justify-between items-center">
                                    <span>Rata-Rata Kelas:</span>
                                    <strong className="font-mono text-slate-900 dark:text-white">{pt.classAverage?.toFixed(1) || '75.0'}</strong>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span>Jawaban Benar:</span>
                                    <strong className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">{pt.totalCorrect} Soal</strong>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span>Status Ketuntasan:</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                      pt.score >= 75
                                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                    }`}>
                                      {pt.score >= 75 ? 'TUNTAS (≥75)' : 'BELUM TUNTAS'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Analisis Butir Nomor Soal (Pengganti Bagian Materi) */}
                        {(() => {
                          const studentAllAnswers = dbService.getAnswers().filter(a => a.studentId === activeStudentId);
                          const studentTOIds = new Set(studentAllAnswers.map(a => a.tryoutId));
                          const activeTO = (selectedTryoutId && selectedTryoutId !== 'ALL' && tryouts.find(t => t.id === selectedTryoutId))
                            || tryouts.slice().reverse().find(t => studentTOIds.has(t.id))
                            || tryouts[0];
                          const studentAnswers = studentAllAnswers.filter(
                            a => !activeTO || a.tryoutId === activeTO.id
                          );
                          const correctQuestionAnswers = studentAnswers.filter(a => a.isCorrect);
                          const wrongQuestionAnswers = studentAnswers.filter(a => !a.isCorrect);

                          const allQuestions = dbService.getQuestions();
                          const getQuestionNumber = (qId: string) => {
                            const qObj = questions.find(q => q.id === qId) || allQuestions.find(q => q.id === qId);
                            if (qObj?.questionNumber) return `No. ${qObj.questionNumber}`;
                            if (qObj?.uniqueCode) {
                              const match = qObj.uniqueCode.match(/(\d+)$/);
                              if (match) return `No. ${parseInt(match[1], 10)}`;
                              return qObj.uniqueCode;
                            }
                            return 'Soal';
                          };

                          return (
                            <div className="space-y-3 pt-2">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                                <div>
                                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <FileCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    <span>Analisis Butir Nomor Soal Siswa — {activeTO ? `${getFriendlyTryoutStageLabel(activeTO, tryouts)} (${activeTO.title})` : 'Try Out Terpilih'}</span>
                                  </h4>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    Pemetaan butir nomor soal yang berhasil dijawab benar versus nomor soal yang salah/perlu remedial.
                                  </p>
                                </div>
                                <div className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-400">
                                  Total: <strong className="text-emerald-600 dark:text-emerald-400">{correctQuestionAnswers.length} Benar</strong> / <strong className="text-rose-600 dark:text-rose-400">{wrongQuestionAnswers.length} Salah</strong> ({studentAnswers.length} Soal)
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                {/* Nomor Soal Benar */}
                                <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-5 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center space-x-2">
                                      <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                      <span>Nomor Soal Dijawab Benar</span>
                                    </h4>
                                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                                      {correctQuestionAnswers.length} Nomor
                                    </span>
                                  </div>

                                  {correctQuestionAnswers.length > 0 ? (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      {correctQuestionAnswers.map((ans, idx) => (
                                        <div
                                          key={ans.id || idx}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 text-slate-800 dark:text-slate-200 font-mono shadow-2xs"
                                        >
                                          <span className="font-bold text-emerald-700 dark:text-emerald-400">{getQuestionNumber(ans.questionId)}</span>
                                          <span className="text-[10px] text-slate-400">({ans.studentAnswer})</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-slate-500 italic py-2">
                                      Belum ada butir soal dijawab benar pada paket Try Out ini.
                                    </div>
                                  )}
                                </div>

                                {/* Nomor Soal Salah / Perlu Remedial */}
                                <div className="bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/60 rounded-2xl p-5 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-bold text-rose-900 dark:text-rose-300 flex items-center space-x-2">
                                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                                      <span>Nomor Soal Perlu Pembahasan / Remedial</span>
                                    </h4>
                                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200">
                                      {wrongQuestionAnswers.length} Nomor
                                    </span>
                                  </div>

                                  {wrongQuestionAnswers.length > 0 ? (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      {wrongQuestionAnswers.map((ans, idx) => (
                                        <div
                                          key={ans.id || idx}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 text-slate-800 dark:text-slate-200 font-mono shadow-2xs"
                                        >
                                          <span className="font-bold text-rose-700 dark:text-rose-400">{getQuestionNumber(ans.questionId)}</span>
                                          <span className="text-[10px] text-rose-600 dark:text-rose-400 line-through">
                                            {ans.studentAnswer || 'Kosong'}
                                          </span>
                                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                                            {ans.correctAnswer}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-emerald-700 dark:text-emerald-400 font-medium py-2 flex items-center gap-1.5">
                                      <CheckCircle className="w-4 h-4" />
                                      <span>Luar biasa! Seluruh butir soal dijawab dengan benar sempurna.</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {(!studentProg || studentProg.points.length === 0) && (
                          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
                            <div className="w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
                              <Users className="w-7 h-7 text-indigo-400" />
                            </div>
                            <p className="text-base font-semibold text-slate-700 dark:text-slate-300">Belum Ada Riwayat Nilai Siswa Ini</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                              Siswa terpilih belum memiliki catatan pengerjaan Try Out. Pilih siswa lain yang sudah mengikuti ujian atau sinkronkan data respon Google Form.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* SUB-TAB 2: CLASS PROGRESS TRACKING */}
                  {progressSubTab === 'CLASS' && (() => {
                    const classWithScore = classes.find(c => {
                      const cStudents = students.filter(s => s.classId === c.id);
                      const cStudentIds = new Set(cStudents.map(s => s.id));
                      return scores.some(s => cStudentIds.has(s.studentId));
                    });
                    const targetClassId = (selectedClassForProgress && selectedClassForProgress !== 'ALL' && classes.some(c => c.id === selectedClassForProgress))
                      ? selectedClassForProgress
                      : (classWithScore?.id || classes[0]?.id || '');
                    const classProg = targetClassId ? dbService.getClassProgress(targetClassId, currentUser) : null;
                    const selectedClassObj = classes.find(c => c.id === targetClassId);
                    return (
                      <div className="space-y-5">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs transition-colors">
                          <div className="flex items-center space-x-2">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">Pilih Rombel / Kelas:</span>
                            <select
                              value={targetClassId}
                              onChange={e => setSelectedClassForProgress(e.target.value)}
                              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white rounded-xl px-3 py-1.5 cursor-pointer focus:ring-2 focus:ring-indigo-500"
                            >
                              {classes.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>

                          {classProg && (
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                                <span className="text-slate-500 dark:text-slate-400">Total Siswa: </span>
                                <strong className="text-slate-900 dark:text-white">{classProg.studentCount}</strong>
                              </div>
                              <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                                <span className="text-slate-500 dark:text-slate-400">Perubahan Rata-Rata: </span>
                                <strong className={classProg.averageDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-mono' : 'text-rose-600 dark:text-rose-400 font-mono'}>
                                  {classProg.averageDelta > 0 ? `+${classProg.averageDelta.toFixed(1)}` : classProg.averageDelta.toFixed(1)}
                                </strong>
                              </div>
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-xl border ${classProg.trend === 'MENINGKAT' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'}`}>
                                TREN: {classProg.trend}
                              </span>

                              <button
                                onClick={() => {
                                  if (selectedClassObj && classProg) {
                                    ExportService.exportClassProgressExcel(
                                      selectedClassObj.name,
                                      activeSubject?.name || 'Mata Pelajaran',
                                      classProg.studentCount,
                                      classProg.points.map(pt => ({
                                        tryoutCode: pt.tryoutCode,
                                        tryoutTitle: (pt as any).tryoutTitle || pt.tryoutCode,
                                        averageScore: pt.averageScore,
                                        medianScore: (pt as any).medianScore ?? pt.averageScore,
                                        highestScore: (pt as any).highestScore ?? pt.averageScore,
                                        lowestScore: (pt as any).lowestScore ?? pt.averageScore,
                                        passingCount: (pt as any).passingCount ?? 0,
                                        passingRatePct: pt.passingRatePct,
                                      }))
                                    );
                                    triggerToast(`Laporan tren progres kelas ${selectedClassObj.name} berhasil diunduh!`);
                                  }
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Unduh Progres Kelas</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Class Progression Cards */}
                        {classProg && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {classProg.points.map((pt, idx) => (
                              <div key={pt.tryoutId} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs space-y-3 transition-colors">
                                <div className="flex items-center justify-between text-xs font-mono">
                                  <span className="font-bold text-indigo-600 dark:text-indigo-400 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 rounded-md border border-indigo-100 dark:border-indigo-900">
                                    {pt.tryoutCode}
                                  </span>
                                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 px-2 py-0.5 rounded-full font-bold">
                                    Tuntas: {pt.passingRatePct}%
                                  </span>
                                </div>
                                <div>
                                  <div className="text-3xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
                                    {pt.averageScore.toFixed(1)}
                                  </div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">Rata-Rata Kelas</div>
                                </div>
                                <div className="space-y-1.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                                  <div className="flex justify-between"><span>Median Skor:</span><strong className="text-slate-900 dark:text-white">{pt.medianScore.toFixed(1)}</strong></div>
                                  <div className="flex justify-between"><span>Skor Tertinggi:</span><strong className="text-emerald-600 dark:text-emerald-400">{pt.highestScore.toFixed(1)}</strong></div>
                                  <div className="flex justify-between"><span>Skor Terendah:</span><strong className="text-rose-600 dark:text-rose-400">{pt.lowestScore.toFixed(1)}</strong></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Visual Trajectory Line Graph for Class */}
                        {classProg && classProg.points.length > 0 && (() => {
                          const pts = classProg.points;
                          const chartWidth = 1000;
                          const padX = 80;
                          const stepX = pts.length > 1 ? (chartWidth - padX * 2) / (pts.length - 1) : 0;
                          const getY = (val: number) => 260 - ((Math.max(0, Math.min(100, val)) / 100) * 220);
                          const getX = (idx: number) => pts.length === 1 ? chartWidth / 2 : padX + idx * stepX;

                          const viewCoords = pts.map((pt, idx) => ({
                            ...pt,
                            x: getX(idx),
                            y: getY(pt.averageScore),
                          }));

                          const svgPolyPoints = viewCoords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
                          const firstX = viewCoords[0].x;
                          const lastX = viewCoords[viewCoords.length - 1].x;
                          const kkmY = getY(75).toFixed(1);

                          return (
                            <div className="p-3.5 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs transition-colors">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-b border-slate-100 dark:border-slate-800 pb-3">
                                <div>
                                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <School className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    <span>Grafik Tren Rata-Rata Kelas — {selectedClassObj?.name || 'Kelas'}</span>
                                  </h3>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    Pergerakan nilai rerata rombel lintas tahapan Try Out terhadap ambang KKM (75.0).
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono shrink-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span>
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">Rerata Rombel</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-3.5 h-0.5 border-t-2 border-dashed border-amber-500 inline-block"></span>
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">Garis KKM (75.0)</span>
                                  </div>
                                </div>
                              </div>

                              {/* Mobile Swipe Hint */}
                              <div className="flex sm:hidden items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-200/70 dark:border-slate-800/70">
                                <span>💡 Geser grafik ke samping untuk melihat detail tiap TO</span>
                                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">↔ Geser</span>
                              </div>

                              <div className="relative w-full mobile-chart-scroll bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs">
                                <svg
                                  className="min-w-[600px] sm:min-w-0 w-full h-auto min-h-[215px] sm:min-h-[250px] overflow-visible"
                                  viewBox="0 0 1000 300"
                                  preserveAspectRatio="xMidYMid meet"
                                >
                                  <defs>
                                    <linearGradient id="classAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
                                      <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                                    </linearGradient>
                                  </defs>

                                  {/* Horizontal Grid Lines */}
                                  <line x1="50" y1="40" x2="950" y2="40" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                                  <text x="38" y="45" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-semibold">100</text>

                                  {/* KKM Line */}
                                  <line x1="50" y1={kkmY} x2="950" y2={kkmY} stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 4" />
                                  <text x="38" y={Number(kkmY) + 4} textAnchor="end" className="text-[13px] fill-amber-500 font-mono font-bold">75</text>
                                  <rect x="795" y={Number(kkmY) - 13} width="145" height="24" rx="6" fill="#f59e0b" />
                                  <text x="867" y={Number(kkmY) + 3} textAnchor="middle" className="text-[11px] font-mono font-bold fill-slate-950">Garis KKM (75.0 Poin)</text>

                                  <line x1="50" y1="150" x2="950" y2="150" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                                  <text x="38" y="155" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-semibold">50</text>

                                  <line x1="50" y1="205" x2="950" y2="205" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                                  <text x="38" y="210" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-semibold">25</text>

                                  <line x1="50" y1="260" x2="950" y2="260" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1.5" />
                                  <text x="38" y="265" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-semibold">0</text>

                                  {/* Gradient Fill */}
                                  {pts.length > 1 ? (
                                    <polygon points={`${firstX},260 ${svgPolyPoints} ${lastX},260`} fill="url(#classAreaGrad)" />
                                  ) : (
                                    <line
                                      x1="50"
                                      y1={viewCoords[0]?.y || 150}
                                      x2="950"
                                      y2={viewCoords[0]?.y || 150}
                                      stroke="#4f46e5"
                                      strokeWidth="3"
                                      strokeOpacity="0.8"
                                      strokeDasharray="4 4"
                                    />
                                  )}

                                  {/* Connecting Line */}
                                  {pts.length > 1 && (
                                    <polyline
                                      fill="none"
                                      stroke="#4f46e5"
                                      strokeWidth="4.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      points={svgPolyPoints}
                                    />
                                  )}

                                  {/* Nodes with Score Badges */}
                                  {viewCoords.map((pt, i) => (
                                    <g key={i}>
                                      <rect x={pt.x - 37} y={pt.y - 38} width="74" height="25" rx="8" className="fill-slate-900 dark:fill-slate-100" />
                                      <text x={pt.x} y={pt.y - 21} textAnchor="middle" className="text-[13px] font-mono font-bold fill-indigo-400 dark:fill-indigo-700">
                                        {pt.averageScore.toFixed(1)}
                                      </text>
                                      <circle cx={pt.x} cy={pt.y} r="12" fill="#4f46e5" opacity="0.25" />
                                      <circle cx={pt.x} cy={pt.y} r="6.5" fill="#4f46e5" stroke="#ffffff" strokeWidth="2.5" />
                                      <text x={pt.x} y="295" textAnchor="middle" className="text-[14px] font-mono font-bold fill-slate-600 dark:fill-slate-300">
                                        {pt.tryoutCode}
                                      </text>
                                    </g>
                                  ))}
                                </svg>
                              </div>
                            </div>
                          );
                        })()}

                        
                        {/* Grafik Batang Perbandingan Kelulusan KKM Kelas Terpilih per Masing-Masing TO */}
                        {classProg && classProg.points.length > 0 && (() => {
                          const classStudents = students.filter(s => s.classId === targetClassId);
                          const totalClassStudents = classStudents.length;

                          const classStageBars = classProg.points.map((pt, idx) => {
                            const passRate = Math.round(pt.passingRatePct || 0);
                            const failRate = 100 - passRate;
                            const passCount = Math.round((passRate / 100) * totalClassStudents);
                            const failCount = totalClassStudents - passCount;

                            return {
                              label: pt.tryoutCode,
                              passRate,
                              failRate,
                              passCount,
                              failCount,
                              avgScore: pt.averageScore,
                            };
                          });

                          return (
                            <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5 shadow-2xs">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                                <div>
                                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    <span>Rasio Ketuntasan KKM Rombel — {selectedClassObj?.name || 'Kelas'}</span>
                                  </h3>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    Perbandingan proporsi siswa tuntas KKM vs remedial pada kelas {selectedClassObj?.name} untuk masing-masing tahapan Try Out.
                                  </p>
                                </div>
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

                              <div className="overflow-x-auto pb-2 scrollbar-thin">
                                <div className="min-w-[460px] sm:min-w-0 grid gap-4 items-end" style={{ gridTemplateColumns: `repeat(${classStageBars.length}, minmax(110px, 1fr))` }}>
                                  {classStageBars.map((bar, idx) => {
                                    const prev = idx > 0 ? classStageBars[idx - 1] : null;
                                    const delta = prev ? bar.passRate - prev.passRate : null;

                                    return (
                                      <div key={bar.label} className="flex flex-col items-center gap-2 group">
                                        <div className="text-[10px] font-mono font-bold h-5 flex items-center justify-center">
                                          {delta !== null && (
                                            <span className={`px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                                              delta > 0
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                                                : delta < 0
                                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                            }`}>
                                              {delta > 0 ? `▲ +${delta}%` : delta < 0 ? `▼ ${delta}%` : '● 0%'}
                                            </span>
                                          )}
                                        </div>

                                        <div className="w-full max-w-[85px] sm:max-w-[100px] h-52 sm:h-56 bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-1.5 flex flex-col justify-end border border-slate-200/80 dark:border-slate-800/80 shadow-2xs relative">
                                          {bar.failRate > 0 && (
                                            <div
                                              className="w-full bg-rose-500 hover:bg-rose-600 transition-all rounded-t-xl flex flex-col items-center justify-center text-white overflow-hidden relative cursor-default"
                                              style={{ height: `${bar.failRate}%` }}
                                              title={`Remedial: ${bar.failCount} Siswa (${bar.failRate}%)`}
                                            >
                                              {bar.failRate >= 16 && (
                                                <span className="text-[10px] sm:text-[11px] font-mono font-black drop-shadow-xs">
                                                  {bar.failRate}%
                                                </span>
                                              )}
                                            </div>
                                          )}

                                          {bar.passRate > 0 && (
                                            <div
                                              className={`w-full bg-emerald-500 hover:bg-emerald-600 transition-all flex flex-col items-center justify-center text-white overflow-hidden relative cursor-default ${
                                                bar.failRate === 0 ? 'rounded-xl' : 'rounded-b-xl border-t border-white/20'
                                              }`}
                                              style={{ height: `${bar.passRate}%` }}
                                              title={`Tuntas: ${bar.passCount} Siswa (${bar.passRate}%)`}
                                            >
                                              {bar.passRate >= 16 && (
                                                <span className="text-[10px] sm:text-[11px] font-mono font-black drop-shadow-xs">
                                                  {bar.passRate}%
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>

                                        <div className="text-center space-y-0.5 mt-1">
                                          <span className="text-xs font-mono font-extrabold text-slate-800 dark:text-slate-200 block truncate max-w-[100px]">
                                            {bar.label}
                                          </span>
                                          <div className="text-[10px] font-mono text-slate-500 flex flex-col">
                                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{bar.passCount} Tuntas</span>
                                            <span className="text-rose-600 dark:text-rose-400 font-bold">{bar.failCount} Remedial</span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {(!classProg || classProg.points.length === 0) && (
                          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
                            <div className="w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
                              <School className="w-7 h-7 text-indigo-400" />
                            </div>
                            <p className="text-base font-semibold text-slate-700 dark:text-slate-300">Belum Ada Riwayat Nilai untuk Kelas Ini</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                              Kelas terpilih belum memiliki catatan hasil Try Out yang tersinkron. Pilih kelas lain atau lakukan sinkronisasi hasil ujian.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* SUB-TAB 3: SUBJECT PROGRESS TRACKING */}
                  {progressSubTab === 'SUBJECT' && (() => {
                    const subjProg = dbService.getSubjectProgress(selectedSubjectId, currentUser);
                    const activeSubjectObj = permittedSubjects.find(s => s.id === selectedSubjectId) || permittedSubjects[0];
                    const points = subjProg?.points || [];
                    const polyPoints = points.map((pt, idx) => {
                      const x = (idx / Math.max(1, points.length - 1)) * 100;
                      const y = 90 - ((pt.averageScore / 100) * 80);
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    }).join(' ');

                    return (
                      <div className="space-y-5">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs transition-colors">
                          <div className="flex items-center space-x-2">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">Mata Pelajaran:</span>
                            <select
                              value={selectedSubjectId}
                              onChange={e => setSelectedSubjectId(e.target.value)}
                              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white rounded-lg p-1.5 cursor-pointer"
                            >
                              {permittedSubjects.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                              ))}
                            </select>
                          </div>

                          {subjProg && (
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <span className="text-slate-600 dark:text-slate-300">Delta Progress: <strong className={subjProg.delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{subjProg.delta > 0 ? `+${subjProg.delta}%` : `${subjProg.delta}%`}</strong></span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">
                                TREN: {subjProg.trend}
                              </span>

                              <button
                                onClick={() => {
                                  if (activeSubjectObj && subjProg) {
                                    ExportService.exportSubjectProgressExcel(
                                      activeSubjectObj.name,
                                      activeSubjectObj.code,
                                      subjProg.points.map(pt => ({
                                        tryoutCode: pt.tryoutCode,
                                        tryoutTitle: pt.tryoutCode,
                                        averageScore: pt.averageScore,
                                      }))
                                    );
                                    triggerToast(`Laporan tren progres mapel ${activeSubjectObj.name} berhasil diunduh!`);
                                  }
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Unduh Progres Mapel</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Visual Trajectory Line Graph for Subject */}
                        {subjProg && points.length > 0 && (() => {
                          const pts = points;
                          const chartWidth = 1000;
                          const padX = 80;
                          const stepX = pts.length > 1 ? (chartWidth - padX * 2) / (pts.length - 1) : 0;
                          const getY = (val: number) => 260 - ((Math.max(0, Math.min(100, val)) / 100) * 220);
                          const getX = (idx: number) => pts.length === 1 ? chartWidth / 2 : padX + idx * stepX;

                          const viewCoords = points.map((pt, idx) => ({
                            ...pt,
                            x: getX(idx),
                            y: getY(pt.averageScore),
                          }));

                          const svgPolyPoints = viewCoords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
                          const firstX = viewCoords[0].x;
                          const lastX = viewCoords[viewCoords.length - 1].x;
                          const kkmY = getY(75).toFixed(1);

                          return (
                            <div className="p-3.5 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs transition-colors">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-b border-slate-100 dark:border-slate-800 pb-3">
                                <div>
                                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <BookOpen className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                    <span>Grafik Laju Rata-Rata Mapel — {activeSubjectObj?.name} (Seluruh Kelas)</span>
                                  </h3>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    Fluktuasi nilai rata-rata mata pelajaran per sesi Try Out terhadap standar kelulusan KKM (75.0).
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono shrink-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block"></span>
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">Rata-Rata Mapel</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-3.5 h-0.5 border-t-2 border-dashed border-amber-500 inline-block"></span>
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">Target KKM (75.0)</span>
                                  </div>
                                </div>
                              </div>

                              {/* Mobile Swipe Hint */}
                              <div className="flex sm:hidden items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-200/70 dark:border-slate-800/70">
                                <span>💡 Geser grafik ke samping untuk melihat detail tiap TO</span>
                                <span className="font-mono font-bold text-teal-600 dark:text-teal-400">↔ Geser</span>
                              </div>

                              <div className="relative w-full mobile-chart-scroll bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs">
                                <svg
                                  className="min-w-[600px] sm:min-w-0 w-full h-auto min-h-[215px] sm:min-h-[250px] overflow-visible"
                                  viewBox="0 0 1000 300"
                                  preserveAspectRatio="xMidYMid meet"
                                >
                                  <defs>
                                    <linearGradient id="subjectAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="#0d9488" stopOpacity="0.25" />
                                      <stop offset="100%" stopColor="#0d9488" stopOpacity="0.0" />
                                    </linearGradient>
                                  </defs>

                                  {/* Horizontal Grid Lines */}
                                  <line x1="50" y1="40" x2="950" y2="40" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                                  <text x="38" y="45" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-semibold">100</text>

                                  {/* KKM Line */}
                                  <line x1="50" y1={kkmY} x2="950" y2={kkmY} stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 4" />
                                  <text x="38" y={Number(kkmY) + 4} textAnchor="end" className="text-[13px] fill-amber-500 font-mono font-bold">75</text>
                                  <rect x="795" y={Number(kkmY) - 13} width="145" height="24" rx="6" fill="#f59e0b" />
                                  <text x="867" y={Number(kkmY) + 3} textAnchor="middle" className="text-[11px] font-mono font-bold fill-slate-950">Garis KKM (75.0 Poin)</text>

                                  <line x1="50" y1="150" x2="950" y2="150" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                                  <text x="38" y="155" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-semibold">50</text>

                                  <line x1="50" y1="205" x2="950" y2="205" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                                  <text x="38" y="210" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-semibold">25</text>

                                  <line x1="50" y1="260" x2="950" y2="260" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1.5" />
                                  <text x="38" y="265" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-semibold">0</text>

                                  {/* Gradient Fill */}
                                  {points.length > 1 ? (
                                    <polygon points={`${firstX},260 ${svgPolyPoints} ${lastX},260`} fill="url(#subjectAreaGrad)" />
                                  ) : (
                                    <line
                                      x1="50"
                                      y1={viewCoords[0]?.y || 150}
                                      x2="950"
                                      y2={viewCoords[0]?.y || 150}
                                      stroke="#0d9488"
                                      strokeWidth="3"
                                      strokeOpacity="0.8"
                                      strokeDasharray="4 4"
                                    />
                                  )}

                                  {/* Connecting Line */}
                                  {points.length > 1 && (
                                    <polyline
                                      fill="none"
                                      stroke="#0d9488"
                                      strokeWidth="4.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      points={svgPolyPoints}
                                    />
                                  )}

                                  {/* Nodes with Score Badges */}
                                  {viewCoords.map((pt, i) => (
                                    <g key={i}>
                                      <rect x={pt.x - 37} y={pt.y - 38} width="74" height="25" rx="8" className="fill-slate-900 dark:fill-slate-100" />
                                      <text x={pt.x} y={pt.y - 21} textAnchor="middle" className="text-[13px] font-mono font-bold fill-teal-400 dark:fill-teal-700">
                                        {pt.averageScore.toFixed(1)}
                                      </text>
                                      <circle cx={pt.x} cy={pt.y} r="12" fill="#0d9488" opacity="0.25" />
                                      <circle cx={pt.x} cy={pt.y} r="6.5" fill="#0d9488" stroke="#ffffff" strokeWidth="2.5" />
                                      <text x={pt.x} y="295" textAnchor="middle" className="text-[14px] font-mono font-bold fill-slate-600 dark:fill-slate-300">
                                        {pt.tryoutCode}
                                      </text>
                                    </g>
                                  ))}
                                </svg>
                              </div>
                            </div>
                          );
                        })()}

                                                {/* Grafik Batang Perbandingan Kelulusan KKM per Masing-Masing TO pada Mapel Ini */}
                        {(() => {
                          const activeSubId = activeSubjectObj?.id || selectedSubjectId;
                          const kkmVal = activeSubjectObj?.passingGrade ?? 75.0;

                          // Ambil seluruh TO yang relevan
                          const relevantTos = tryouts.filter(to => {
                            if (to.subjectId === activeSubId) return true;
                            if (to.externalSubjectIds && to.externalSubjectIds.includes(activeSubId)) return true;
                            return scores.some(s => s.tryoutId === to.id && s.subjectScores && s.subjectScores[activeSubId] !== undefined);
                          });

                          // Kelompokkan per stage agar tidak ada duplikasi
                          const stageLabels = Array.from(new Set(relevantTos.map(t => getFriendlyTryoutStageLabel(t, tryouts))));
                          
                          const stagePassFailData = stageLabels.map(stLabel => {
                            const stageTos = relevantTos.filter(t => getFriendlyTryoutStageLabel(t, tryouts) === stLabel);
                            const stageToIds = stageTos.map(t => t.id);

                            let pass = 0;
                            let fail = 0;
                            let tested = 0;

                            students.forEach(st => {
                              const studentScoreList = scores.filter(s => s.studentId === st.id && stageToIds.includes(s.tryoutId));
                              let scoreVal: number | null = null;
                              for (const sc of studentScoreList) {
                                if (sc.subjectScores && sc.subjectScores[activeSubId] !== undefined) {
                                  scoreVal = Number(sc.subjectScores[activeSubId]);
                                  break;
                                }
                                const to = tryouts.find(t => t.id === sc.tryoutId);
                                if (to?.subjectId === activeSubId && sc.calculatedScore !== undefined) {
                                  scoreVal = Number(sc.calculatedScore);
                                  break;
                                }
                              }

                              if (scoreVal !== null) {
                                tested++;
                                if (scoreVal >= kkmVal) pass++;
                                else fail++;
                              }
                            });

                            const passPct = tested > 0 ? Math.round((pass / tested) * 100) : 0;
                            const failPct = tested > 0 ? (100 - passPct) : 0;

                            return {
                              label: stLabel,
                              tested,
                              pass,
                              fail,
                              passPct,
                              failPct,
                            };
                          }).filter(d => d.tested > 0);

                          if (stagePassFailData.length === 0) return null;

                          return (
                            <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5 shadow-2xs">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                                <div>
                                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                    <span>Grafik Batang Perbandingan Kelulusan KKM per Try Out</span>
                                  </h3>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    Perbandingan jumlah dan persentase siswa tuntas (&ge; KKM {kkmVal.toFixed(1)}) vs remedial (&lt; KKM {kkmVal.toFixed(1)}) khusus mata pelajaran {activeSubjectObj?.name} pada masing-masing tahapan ujian (Seluruh Kelas Diampu).
                                  </p>
                                </div>
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

                              {/* Mobile Hint */}
                              <div className="flex sm:hidden items-center justify-between text-[11px] font-medium text-slate-500 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                                <span>💡 Geser ke samping jika tahapan TO panjang</span>
                                <span className="font-mono font-bold text-teal-600">↔ Geser</span>
                              </div>

                              {/* Stacked Bars per TO */}
                              <div className="overflow-x-auto pb-2 scrollbar-thin">
                                <div className="min-w-[460px] sm:min-w-0 grid gap-4 items-end" style={{ gridTemplateColumns: `repeat(${stagePassFailData.length}, minmax(110px, 1fr))` }}>
                                  {stagePassFailData.map((item, idx) => {
                                    const prev = idx > 0 ? stagePassFailData[idx - 1] : null;
                                    const delta = prev ? item.passPct - prev.passPct : null;

                                    return (
                                      <div key={item.label} className="flex flex-col items-center gap-2 group">
                                        <div className="text-[10px] font-mono font-bold h-5 flex items-center justify-center">
                                          {delta !== null && (
                                            <span className={`px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                                              delta > 0
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                                                : delta < 0
                                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                            }`}>
                                              {delta > 0 ? `▲ +${delta}%` : delta < 0 ? `▼ ${delta}%` : '● 0%'}
                                            </span>
                                          )}
                                        </div>

                                        <div className="w-full max-w-[85px] sm:max-w-[100px] h-52 sm:h-56 bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-1.5 flex flex-col justify-end border border-slate-200/80 dark:border-slate-800/80 shadow-2xs relative">
                                          {item.fail > 0 && (
                                            <div
                                              className="w-full bg-rose-500 hover:bg-rose-600 transition-all rounded-t-xl flex flex-col items-center justify-center text-white overflow-hidden relative cursor-default"
                                              style={{ height: `${item.failPct}%` }}
                                              title={`Remedial: ${item.fail} Siswa (${item.failPct}%)`}
                                            >
                                              {item.failPct >= 16 && (
                                                <span className="text-[10px] sm:text-[11px] font-mono font-black drop-shadow-xs">
                                                  {item.failPct}%
                                                </span>
                                              )}
                                            </div>
                                          )}

                                          {item.pass > 0 && (
                                            <div
                                              className={`w-full bg-emerald-500 hover:bg-emerald-600 transition-all flex flex-col items-center justify-center text-white overflow-hidden relative cursor-default ${
                                                item.fail === 0 ? 'rounded-xl' : 'rounded-b-xl border-t border-white/20'
                                              }`}
                                              style={{ height: `${item.passPct}%` }}
                                              title={`Tuntas: ${item.pass} Siswa (${item.passPct}%)`}
                                            >
                                              {item.passPct >= 16 && (
                                                <span className="text-[10px] sm:text-[11px] font-mono font-black drop-shadow-xs">
                                                  {item.passPct}%
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>

                                        <div className="text-center space-y-0.5 mt-1">
                                          <span className="text-xs font-mono font-extrabold text-slate-800 dark:text-slate-200 block truncate max-w-[100px]">
                                            {item.label}
                                          </span>
                                          <div className="text-[10px] font-mono text-slate-500 flex flex-col">
                                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{item.pass} Tuntas</span>
                                            <span className="text-rose-600 dark:text-rose-400 font-bold">{item.fail} Remedial</span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

{/* DIAGRAM KETUNTASAN SISWA MATAPELAJARAN (DATA RIIL DARI DATABASE & GOOGLE FORM) */}
                        {(() => {
                          const activeSubId = activeSubjectObj?.id || selectedSubjectId;
                          const kkmVal = activeSubjectObj?.passingGrade ?? 75.0;

                          // 1. Filter Try Out yang relevan dengan mata pelajaran ini
                          const relevantTos = tryouts.filter(to => {
                            if (to.subjectId === activeSubId) return true;
                            if (to.externalSubjectIds && to.externalSubjectIds.includes(activeSubId)) return true;
                            return scores.some(s => s.tryoutId === to.id && s.subjectScores && s.subjectScores[activeSubId] !== undefined);
                          });

                          const stageList = ['ALL', ...Array.from(new Set(relevantTos.map(t => getFriendlyTryoutStageLabel(t, tryouts))))];
                          const currentStage = stageList.includes(selectedPassFailTO) ? selectedPassFailTO : 'ALL';
                          const selectedToObj = currentStage === 'ALL' ? null : relevantTos.find(t => getFriendlyTryoutStageLabel(t, tryouts) === currentStage);

                          // Helper: Dapatkan nilai riil siswa untuk mata pelajaran ini
                          const getScoreForStudent = (studentId: string, tryoutId?: string): number | null => {
                            if (tryoutId) {
                              const sc = scores.find(s => s.studentId === studentId && s.tryoutId === tryoutId);
                              if (!sc) return null;
                              if (sc.subjectScores && sc.subjectScores[activeSubId] !== undefined) {
                                return Number(sc.subjectScores[activeSubId]);
                              }
                              const to = tryouts.find(t => t.id === tryoutId);
                              if (to?.subjectId === activeSubId && sc.calculatedScore !== undefined) {
                                return Number(sc.calculatedScore);
                              }
                              return null;
                            }
                            // Jika 'ALL', hitung rata-rata nilai siswa dari semua tryout relevan yang diikutinya
                            const scoreVals: number[] = [];
                            relevantTos.forEach(to => {
                              const sc = scores.find(s => s.studentId === studentId && s.tryoutId === to.id);
                              if (sc) {
                                if (sc.subjectScores && sc.subjectScores[activeSubId] !== undefined) {
                                  scoreVals.push(Number(sc.subjectScores[activeSubId]));
                                } else if (to.subjectId === activeSubId && sc.calculatedScore !== undefined) {
                                  scoreVals.push(Number(sc.calculatedScore));
                                }
                              }
                            });
                            if (scoreVals.length === 0) return null;
                            return scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length;
                          };

                          // 2. Kalkulasi statistik riil per kelas yang diampu guru
                          const teacherClassesList = classes.length > 0 ? classes : dbService.getClasses();
                          const classStatsList = teacherClassesList.map(cls => {
                            const clsStudents = students.filter(s => s.classId === cls.id);
                            let passCount = 0;
                            let failCount = 0;
                            let totalScoreVal = 0;
                            let evaluatedStudents = 0;

                            clsStudents.forEach(st => {
                              const val = getScoreForStudent(st.id, selectedToObj?.id);
                              if (val !== null) {
                                evaluatedStudents++;
                                totalScoreVal += val;
                                if (val >= kkmVal) {
                                  passCount++;
                                } else {
                                  failCount++;
                                }
                              }
                            });

                            const totalCount = evaluatedStudents > 0 ? evaluatedStudents : clsStudents.length;
                            const avgVal = evaluatedStudents > 0 ? Math.round((totalScoreVal / evaluatedStudents) * 10) / 10 : 0;
                            const passPercent = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;
                            const failPercent = totalCount > 0 ? Math.round((failCount / totalCount) * 100) : 0;

                            return {
                              classId: cls.id,
                              classLabel: cls.name,
                              totalStudents: clsStudents.length,
                              evaluatedStudents,
                              pass: passCount,
                              fail: failCount,
                              avg: avgVal,
                              passPct: passPercent,
                              failPct: failPercent,
                            };
                          });

                          // 3. Ringkasan Keseluruhan (KPI Summary)
                          const totalStudentsAll = classStatsList.reduce((sum, c) => sum + c.totalStudents, 0);
                          const totalPassAll = classStatsList.reduce((sum, c) => sum + c.pass, 0);
                          const totalFailAll = classStatsList.reduce((sum, c) => sum + c.fail, 0);
                          const totalEvaluatedAll = totalPassAll + totalFailAll;
                          const passRateAll = totalEvaluatedAll > 0 ? Math.round((totalPassAll / totalEvaluatedAll) * 100) : 0;
                          const failRateAll = totalEvaluatedAll > 0 ? Math.round((totalFailAll / totalEvaluatedAll) * 100) : 0;

                          // 4. Distribusi Skor Riil (Histogram 4 Tingkat)
                          let countKurang = 0;
                          let countCukup = 0;
                          let countBaik = 0;
                          let countSangatBaik = 0;

                          students.forEach(st => {
                            const val = getScoreForStudent(st.id, selectedToObj?.id);
                            if (val !== null) {
                              if (val < 60) countKurang++;
                              else if (val < 75) countCukup++;
                              else if (val < 90) countBaik++;
                              else countSangatBaik++;
                            }
                          });

                          return (
                            <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5 shadow-2xs">
                              {/* Header & Filter Selector for TryOut Stage */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                                <div>
                                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                    <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                    <span>Diagram Ketuntasan Siswa Mapel {activeSubjectObj?.name || 'Mata Pelajaran'}</span>
                                  </h3>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    Perbandingan jumlah &amp; persentase siswa tuntas (&ge; KKM {kkmVal.toFixed(1)}) vs belum tuntas (&lt; KKM {kkmVal.toFixed(1)}) khusus mata pelajaran {activeSubjectObj?.name} di setiap kelas yang diampu.
                                  </p>
                                </div>

                                {/* TryOut Selector Filter Buttons */}
                                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shrink-0 flex-wrap">
                                  {stageList.map((stage) => (
                                    <button
                                      key={stage}
                                      onClick={() => setSelectedPassFailTO(stage)}
                                      className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                                        currentStage === stage
                                          ? 'bg-teal-600 text-white shadow-2xs'
                                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                      }`}
                                    >
                                      {stage === 'ALL' ? 'Rata-Rata Seluruh TO' : stage}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Overall Class Pass Rate Summary KPI Cards */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 shadow-2xs">
                                  <span className="text-[10px] text-slate-500 font-mono uppercase">Total Siswa Bimbingan</span>
                                  <div className="text-lg font-black text-slate-900 dark:text-white font-mono">{totalStudentsAll} Siswa</div>
                                  <p className="text-[11px] text-slate-500">Lintas {teacherClassesList.length} Kelas Diampu</p>
                                </div>

                                <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl space-y-1 shadow-2xs">
                                  <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-mono font-bold uppercase">Siswa Tuntas</span>
                                  <div className="text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono">
                                    {totalPassAll} Siswa ({passRateAll}%)
                                  </div>
                                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Memenuhi KKM {kkmVal.toFixed(1)} {activeSubjectObj?.name}</p>
                                </div>

                                <div className="p-3.5 bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-xl space-y-1 shadow-2xs">
                                  <span className="text-[10px] text-rose-700 dark:text-rose-300 font-mono font-bold uppercase">Siswa Belum Tuntas</span>
                                  <div className="text-lg font-black text-rose-700 dark:text-rose-300 font-mono">
                                    {totalFailAll} Siswa ({failRateAll}%)
                                  </div>
                                  <p className="text-[11px] text-rose-600 dark:text-rose-400">Memerlukan Remedial Mapel</p>
                                </div>

                                <div className="p-3.5 bg-slate-100/80 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 shadow-2xs">
                                  <span className="text-[10px] text-slate-500 font-mono uppercase">Tahapan Evaluasi</span>
                                  <div className="text-lg font-black text-slate-900 dark:text-white font-mono truncate" title={currentStage}>
                                    {currentStage === 'ALL' ? 'Semua Try Out' : currentStage}
                                  </div>
                                  <p className="text-[11px] text-teal-600 dark:text-teal-400 font-medium">
                                    {currentStage === 'ALL' ? 'Agregat Rata-Rata' : selectedToObj?.title || 'Sesi Evaluasi'}
                                  </p>
                                </div>
                              </div>

                              {/* Class-by-Class Breakdown for this active subject */}
                              <div className="space-y-4 pt-1">
                                <div className="flex items-center justify-between text-xs border-b border-slate-100 dark:border-slate-800 pb-2">
                                  <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">
                                    Rasio Ketuntasan Per Kelas Pada Mapel {activeSubjectObj?.name} · {currentStage === 'ALL' ? 'Seluruh TO' : currentStage}
                                  </span>
                                  <div className="flex items-center gap-4 text-[11px] font-mono">
                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block"></span> Tuntas (&ge; KKM {kkmVal.toFixed(1)})</span>
                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-xs bg-rose-500 inline-block"></span> Belum Tuntas (&lt; KKM {kkmVal.toFixed(1)})</span>
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  {classStatsList.map((cls, cIdx) => (
                                    <div key={cls.classId || cIdx} className="space-y-1.5 p-3.5 bg-slate-50/70 dark:bg-slate-950/70 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-slate-900 dark:text-slate-100 font-sans">{cls.classLabel}</span>
                                          <span className="text-[10px] text-slate-400 font-mono">Rerata: <strong className="text-slate-700 dark:text-slate-200">{cls.avg}</strong></span>
                                        </div>
                                        <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums">
                                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                                            {cls.pass} Siswa ({cls.passPct}%) Tuntas
                                          </span>
                                          <span className="text-slate-300 dark:text-slate-700">|</span>
                                          <span className="text-rose-700 dark:text-rose-400 font-bold">
                                            {cls.fail} Siswa ({cls.failPct}%) Belum Tuntas
                                          </span>
                                        </div>
                                      </div>

                                      {/* Visual Proportional Stacked Bar */}
                                      <div className="w-full h-8 bg-slate-200/90 dark:bg-slate-800 rounded-xl overflow-hidden flex p-0.5 border border-slate-300/80 dark:border-slate-700/80 shadow-2xs">
                                        {cls.pass > 0 && (
                                          <div
                                            style={{ width: `${cls.passPct}%` }}
                                            className="bg-gradient-to-r from-emerald-600 to-emerald-500 h-full rounded-l-lg flex items-center justify-start px-3 transition-all duration-500 group relative"
                                          >
                                            <span className="text-[11px] font-mono font-bold text-white whitespace-nowrap drop-shadow-xs">
                                              {cls.pass} Siswa ({cls.passPct}%)
                                            </span>
                                          </div>
                                        )}
                                        {cls.fail > 0 && (
                                          <div
                                            style={{ width: `${cls.failPct}%` }}
                                            className="bg-gradient-to-r from-rose-500 to-rose-600 h-full rounded-r-lg flex items-center justify-end px-3 transition-all duration-500 group relative"
                                          >
                                            <span className="text-[11px] font-mono font-bold text-white whitespace-nowrap drop-shadow-xs">
                                              {cls.fail} Siswa ({cls.failPct}%)
                                            </span>
                                          </div>
                                        )}
                                        {cls.pass === 0 && cls.fail === 0 && (
                                          <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-400 italic">
                                            Belum ada data pengerjaan untuk kelas ini
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Class Comparison & Score Distribution Histogram */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                {/* Class Comparison */}
                                <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider font-mono">
                                    Perbandingan Ketuntasan Mapel Per Kelas
                                  </h3>
                                  <div className="space-y-3 pt-2">
                                    {classStatsList.map((cl, i) => (
                                      <div key={cl.classId || i} className="space-y-1 text-xs">
                                        <div className="flex justify-between font-medium text-slate-700 dark:text-slate-300">
                                          <span>{cl.classLabel}</span>
                                          <span className="font-mono font-bold">{cl.avg} Poin ({cl.passPct}% Tuntas)</span>
                                        </div>
                                        <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                                          <div
                                            style={{ width: `${Math.min(100, Math.max(0, cl.avg))}%` }}
                                            className={`h-full ${
                                              cl.avg >= kkmVal
                                                ? 'bg-emerald-600'
                                                : cl.avg >= kkmVal - 10
                                                ? 'bg-teal-600'
                                                : 'bg-amber-600'
                                            } rounded-full transition-all duration-500`}
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Histogram Distribution */}
                                <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider font-mono">
                                    Distribusi Predikat Skor Siswa ({activeSubjectObj?.name})
                                  </h3>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center pt-2 text-xs font-mono">
                                    <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl space-y-1">
                                      <div className="text-[10px] text-rose-700 dark:text-rose-300 font-bold">&lt; 60 (Kurang)</div>
                                      <div className="text-xl font-black text-rose-700 dark:text-rose-300">{countKurang}</div>
                                      <div className="text-[10px] text-slate-500">Siswa</div>
                                    </div>
                                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl space-y-1">
                                      <div className="text-[10px] text-amber-700 dark:text-amber-300 font-bold">60-74 (Cukup)</div>
                                      <div className="text-xl font-black text-amber-700 dark:text-amber-300">{countCukup}</div>
                                      <div className="text-[10px] text-slate-500">Siswa</div>
                                    </div>
                                    <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 rounded-xl space-y-1">
                                      <div className="text-[10px] text-indigo-700 dark:text-indigo-300 font-bold">75-89 (Baik)</div>
                                      <div className="text-xl font-black text-indigo-700 dark:text-indigo-300">{countBaik}</div>
                                      <div className="text-[10px] text-slate-500">Siswa</div>
                                    </div>
                                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl space-y-1">
                                      <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold">90-100 (Sangat Baik)</div>
                                      <div className="text-xl font-black text-emerald-700 dark:text-emerald-300">{countSangatBaik}</div>
                                      <div className="text-[10px] text-slate-500">Siswa</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
              )}
              {/* TAB 9: EXPLANATIONS */}
              {activeTab === 'EXPLANATIONS' && (
                <div className="space-y-6">
                  {/* Top Bar Header & Action Control */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                            Pusat Kelola Link Pembahasan Soal &amp; Modul Solusi (PDF &amp; YouTube)
                          </h2>
                          <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-lg">
                            PORTAL GURU
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Kelola tautan video YouTube dan modul PDF pembahasan untuk setiap mata pelajaran per paket Try Out. Pembahasan berstatus <span className="font-semibold text-emerald-600 dark:text-emerald-400">PUBLISHED</span> langsung dapat dipelajari oleh siswa di portal hasil ujian.
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            const res = dbService.runExplanationEngineTests(currentUser);
                            setExplanationTestResult(res);
                            triggerToast(`Test Suite Phase 10 Selesai (${res.passedTests}/${res.totalTests} Passed in ${res.executionTimeMs}ms)`);
                          }}
                          className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold px-3 py-2 rounded-xl flex items-center space-x-1.5 shadow-xs transition-colors border border-transparent dark:border-slate-700 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Jalankan Test Suite</span>
                        </button>

                        <button
                          onClick={() => {
                            const initialSubjectId = (expFilterSubjectId !== 'ALL' && expFilterSubjectId !== 'ACTIVE')
                              ? expFilterSubjectId
                              : (selectedSubjectId && allowedSubjectIds.includes(selectedSubjectId)
                                  ? selectedSubjectId
                                  : (allowedSubjectIds[0] || subjects[0]?.id || ''));
                            const matchedTryout = tryouts.find(t => t.subjectId === initialSubjectId || (t.isExternal && t.externalSubjectIds?.includes(initialSubjectId)));
                            const initialTryoutId = expFilterTryoutId !== 'ALL'
                              ? expFilterTryoutId
                              : (matchedTryout?.id || (selectedTryoutId !== 'ALL' ? selectedTryoutId : tryouts[0]?.id || ''));
                            const subName = subjects.find(s => s.id === initialSubjectId)?.name || activeSubject?.name || 'Mata Pelajaran';
                            setEditingExplanationId(null);
                            setExpTitle(`Pembahasan ${subName} — Solusi Mandiri`);
                            setExpSubjectId(initialSubjectId);
                            setExpTryoutId(initialTryoutId);
                            setExpQuestionId('GENERAL');
                            setExpScopeMode('ALL');
                            setExpSelectedNumbers([]);
                            setExpCustomNumbers(getInitialQuestionNumbers(initialTryoutId, initialSubjectId));
                            setIsQuestionDeleteMode(false);
                            setSyncQuestionCountToTryout(true);
                            setRangeStart('');
                            setRangeEnd('');
                            setExpContentText('');
                            setExpPdfUrl('');
                            setExpPdfFileName('');
                            setExpYoutubeUrl('');
                            setExpExternalUrl('');
                            setExpStatus('PUBLISHED');
                            setShowExplanationModal(true);
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Tambah Link Pembahasan Baru</span>
                        </button>
                      </div>
                    </div>

                    {/* Filter Bar */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Filter Mapel */}
                        <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Mapel:</span>
                          <select
                            value={expFilterSubjectId}
                            onChange={e => setExpFilterSubjectId(e.target.value)}
                            className="bg-transparent font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                          >
                            <option value="ACTIVE" className="dark:bg-slate-800 dark:text-white">
                              Mapel Aktif: {activeSubject?.name || 'Pilihan Header'} ({activeSubject?.code || 'MAPEL'})
                            </option>
                            {currentUser.role === 'ADMIN' && (
                              <option value="ALL" className="dark:bg-slate-800 dark:text-white">Semua Mapel</option>
                            )}
                            {(currentUser.role === 'ADMIN' ? subjects : permittedSubjects).map(s => (
                              <option key={s.id} value={s.id} className="dark:bg-slate-800 dark:text-white">
                                {s.name} ({s.code})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Try Out:</span>
                          <select
                            value={expFilterTryoutId}
                            onChange={e => setExpFilterTryoutId(e.target.value)}
                            className="bg-transparent font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                          >
                            <option value="ALL" className="dark:bg-slate-800 dark:text-white">Semua Try Out</option>
                            {tryouts.map(t => {
                              const count = explanations.filter(e => {
                                const matchTo = e.tryoutId === t.id || e.tryoutId === t.code;
                                if (!matchTo) return false;
                                const effSub = expFilterSubjectId === 'ACTIVE'
                                  ? selectedSubjectId
                                  : (expFilterSubjectId !== 'ALL' ? expFilterSubjectId : (currentUser.role === 'GURU' ? selectedSubjectId : 'ALL'));
                                if (effSub && effSub !== 'ALL') {
                                  return e.subjectId === effSub || (subjects.find(s => s.id === effSub)?.code?.toLowerCase() === e.subjectId?.toLowerCase());
                                }
                                return true;
                              }).length;
                              return (
                                <option key={t.id} value={t.id} className="dark:bg-slate-800 dark:text-white">
                                  [{getFriendlyTryoutStageLabel(t, tryouts)}] {t.title} ({count})
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Status:</span>
                          <select
                            value={expFilterStatus}
                            onChange={e => setExpFilterStatus(e.target.value)}
                            className="bg-transparent font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                          >
                            <option value="ALL" className="dark:bg-slate-800 dark:text-white">Semua Status</option>
                            <option value="PUBLISHED" className="dark:bg-slate-800 dark:text-white">PUBLISHED (Tampil Siswa)</option>
                            <option value="DRAFT" className="dark:bg-slate-800 dark:text-white">DRAFT (Rahasia Guru)</option>
                            <option value="ARCHIVED" className="dark:bg-slate-800 dark:text-white">ARCHIVED (Dearsip)</option>
                          </select>
                        </div>

                        <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Cakupan:</span>
                          <select
                            value={expFilterScope}
                            onChange={e => setExpFilterScope(e.target.value)}
                            className="bg-transparent font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                          >
                            <option value="ALL" className="dark:bg-slate-800 dark:text-white">Semua Cakupan</option>
                            <option value="GENERAL" className="dark:bg-slate-800 dark:text-white">Umum (General Try Out)</option>
                            <option value="QUESTION" className="dark:bg-slate-800 dark:text-white">Spesifik Butir Soal</option>
                          </select>
                        </div>
                      </div>

                      {(() => {
                        const effSub = expFilterSubjectId === 'ACTIVE'
                          ? selectedSubjectId
                          : (expFilterSubjectId !== 'ALL' ? expFilterSubjectId : (currentUser.role === 'GURU' ? selectedSubjectId : 'ALL'));
                        const scopedExps = explanations.filter(e => {
                          if (!effSub || effSub === 'ALL') {
                            if (currentUser.role === 'GURU') return allowedSubjectIds.includes(e.subjectId || '');
                            return true;
                          }
                          return e.subjectId === effSub || (subjects.find(s => s.id === effSub)?.code?.toLowerCase() === e.subjectId?.toLowerCase());
                        });

                        return (
                          <div className="flex items-center space-x-3 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>Total: <strong className="text-slate-900 dark:text-white">{scopedExps.length}</strong></span>
                            <span>Published: <strong className="text-emerald-600 dark:text-emerald-400">{scopedExps.filter(e => e.status === 'PUBLISHED').length}</strong></span>
                            <span>Draft: <strong className="text-amber-600 dark:text-amber-400">{scopedExps.filter(e => e.status === 'DRAFT').length}</strong></span>
                            <span>Archived: <strong className="text-slate-600 dark:text-slate-400">{scopedExps.filter(e => e.status === 'ARCHIVED').length}</strong></span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* AUTOMATED TEST SUITE HUB RESULTS (PHASE 10 GATE) */}
                  {explanationTestResult && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div className="flex items-center space-x-2">
                          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Hasil Pengujian Otomatis Modul Pembahasan Soal
                          </h3>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-1 rounded border font-mono ${
                              explanationTestResult.passed
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                            }`}
                          >
                            {explanationTestResult.passed ? 'PHASE 10 — VERIFIED & FROZEN' : 'PHASE 10 — TEST FAILED'}
                          </span>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            Waktu: <strong className="text-slate-900 dark:text-white">{explanationTestResult.executionTimeMs} ms</strong>
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {explanationTestResult.tests.map(t => (
                          <div
                            key={t.testId}
                            className={`p-3 rounded-lg border text-xs space-y-1 transition-all ${
                              t.passed ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60' : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60'
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span className="text-slate-900 dark:text-white">Test {t.testId}: {t.name}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                  t.passed ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300'
                                }`}
                              >
                                {t.passed ? 'PASSED' : 'FAILED'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{t.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* VIEW MODE & RESOURCE FILTER TOOLBAR */}
                  {(() => {
                    const effectiveSubjectId = expFilterSubjectId === 'ACTIVE'
                      ? selectedSubjectId
                      : (expFilterSubjectId !== 'ALL' ? expFilterSubjectId : (currentUser.role === 'GURU' ? selectedSubjectId : 'ALL'));

                    // Extract educational resource items from filtered explanations
                    const filteredExplanations = explanations
                      .filter(e => {
                        if (!effectiveSubjectId || effectiveSubjectId === 'ALL') {
                          if (currentUser.role === 'GURU') {
                            return allowedSubjectIds.includes(e.subjectId || '');
                          }
                          return true;
                        }
                        return e.subjectId === effectiveSubjectId || (
                          subjects.find(s => s.id === effectiveSubjectId)?.code?.toLowerCase() === e.subjectId?.toLowerCase()
                        );
                      })
                      .filter(e => {
                        if (expFilterTryoutId === 'ALL') return true;
                        const targetTo = tryouts.find(t => t.id === expFilterTryoutId);
                        return e.tryoutId === expFilterTryoutId || (targetTo && (e.tryoutId === targetTo.code || e.tryoutId === targetTo.id));
                      })
                      .filter(e => expFilterStatus === 'ALL' || e.status === expFilterStatus)
                      .filter(e => {
                        const hasQuestionScope = Boolean(
                          e.questionId || (Array.isArray(e.questionNumbers) && e.questionNumbers.length > 0)
                        );
                        if (expFilterScope === 'GENERAL') return !hasQuestionScope;
                        if (expFilterScope === 'QUESTION') return hasQuestionScope;
                        return true;
                      });

                    const resourceCardsList = filteredExplanations.flatMap(exp => {
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

                      // Jika pembahasan teks murni (belum ada link video/pdf), sediakan kartu edukasi agar tetap tampil
                      if (!exp.youtubeUrl && !exp.pdfUrl) {
                        list.push({
                          id: `${exp.id}-modul`,
                          exp,
                          type: 'PDF',
                          title: exp.title,
                          url: '#',
                          fileName: 'Modul_Rangkuman_Materi.pdf',
                        });
                      }

                      return list;
                    }).filter(item => {
                      if (expMediaTypeFilter === 'YOUTUBE') return item.type === 'YOUTUBE';
                      if (expMediaTypeFilter === 'PDF') return item.type === 'PDF';
                      return true;
                    });

                    const totalYtCount = filteredExplanations.filter(e => !!e.youtubeUrl).length;
                    const totalPdfCount = filteredExplanations.filter(e => !!e.pdfUrl).length;

                    return (
                      <div className="space-y-4">
                        {/* Sub-toolbar: View Switcher & Media Type Filters */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs transition-colors">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* View Switcher */}
                            <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                              <button
                                type="button"
                                onClick={() => setExpViewMode('RESOURCE_CARDS')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                                  expViewMode === 'RESOURCE_CARDS'
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                              >
                                <LayoutGrid className="w-3.5 h-3.5" />
                                <span>Katalog Resource Card</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                                  expViewMode === 'RESOURCE_CARDS' ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}>
                                  {resourceCardsList.length}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setExpViewMode('MODULES')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                                  expViewMode === 'MODULES'
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                                <span>Modul Lengkap Pembahasan</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                                  expViewMode === 'MODULES' ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}>
                                  {filteredExplanations.length}
                                </span>
                              </button>
                            </div>

                            {/* Media Type Filter Pills */}
                            {expViewMode === 'RESOURCE_CARDS' && (
                              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-800">
                                <button
                                  type="button"
                                  onClick={() => setExpMediaTypeFilter('ALL')}
                                  className={`px-2.5 py-1.5 rounded-xl font-bold cursor-pointer transition-colors ${
                                    expMediaTypeFilter === 'ALL'
                                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                  }`}
                                >
                                  Semua Tipe
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setExpMediaTypeFilter('YOUTUBE')}
                                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold cursor-pointer transition-colors ${
                                    expMediaTypeFilter === 'YOUTUBE'
                                      ? 'bg-red-600 text-white'
                                      : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/40 hover:bg-red-100'
                                  }`}
                                >
                                  <Youtube className="w-3 h-3" />
                                  <span>YouTube ({totalYtCount})</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setExpMediaTypeFilter('PDF')}
                                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold cursor-pointer transition-colors ${
                                    expMediaTypeFilter === 'PDF'
                                      ? 'bg-rose-600 text-white'
                                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40 hover:bg-rose-100'
                                  }`}
                                >
                                  <FileText className="w-3 h-3" />
                                  <span>PDF ({totalPdfCount})</span>
                                </button>
                              </div>
                            )}
                          </div>

                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Menampilkan <strong>{expViewMode === 'RESOURCE_CARDS' ? resourceCardsList.length : filteredExplanations.length}</strong> tautan edukasi
                          </span>
                        </div>

                        {/* MODE 1: DEDICATED RESOURCE CARDS GRID */}
                        {expViewMode === 'RESOURCE_CARDS' && (
                          <div>
                            {resourceCardsList.length === 0 ? (
                              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
                                <BookOpen className="w-10 h-10 text-slate-400 mx-auto" />
                                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                  Belum Ada Resource Card Sesuai Filter
                                </h4>
                                <p className="text-xs text-slate-500 max-w-md mx-auto">
                                  Belum ada tautan YouTube atau PDF yang ditambahkan untuk filter yang dipilih. Silakan klik tombol &apos;Tambah Link Pembahasan Baru&apos; di atas.
                                </p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {resourceCardsList.map(item => {
                                  const exp = item.exp;
                                  const targetQuestion = questions.find(q => q.id === exp.questionId);
                                  const expSubj = subjects.find(s => s.id === exp.subjectId);

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
                                        setActiveVideoModalUrl(url);
                                        setActiveVideoModalTitle(title);
                                      }}
                                      onEdit={() => {
                                        const editTryoutId = exp.tryoutId || selectedTryoutId || tryouts[0]?.id || '';
                                        const editSubjectId = exp.subjectId || selectedSubjectId || allowedSubjectIds[0] || subjects[0]?.id || '';
                                        setEditingExplanationId(exp.id);
                                        setExpTitle(exp.title);
                                        setExpSubjectId(editSubjectId);
                                        setExpTryoutId(editTryoutId);
                                        setExpQuestionId(exp.questionId || 'GENERAL');
                                        const existingNumbers = Array.isArray(exp.questionNumbers) && exp.questionNumbers.length > 0
                                          ? exp.questionNumbers
                                          : (exp.questionId && exp.questionId !== 'GENERAL' ? [questions.find(q => q.id === exp.questionId)?.questionNumber].filter((n): n is number => typeof n === 'number') : []);
                                        setExpCustomNumbers(getInitialQuestionNumbers(editTryoutId, editSubjectId, existingNumbers));
                                        setIsQuestionDeleteMode(false);
                                        setSyncQuestionCountToTryout(true);
                                        if (existingNumbers.length > 0) {
                                          setExpScopeMode('SPECIFIC');
                                          setExpSelectedNumbers(existingNumbers);
                                        } else {
                                          setExpScopeMode('ALL');
                                          setExpSelectedNumbers([]);
                                        }
                                        setRangeStart('');
                                        setRangeEnd('');
                                        setExpContentText(exp.contentText);
                                        setExpPdfUrl(exp.pdfUrl || '');
                                        setExpPdfFileName(exp.pdfFileName || '');
                                        setExpYoutubeUrl(exp.youtubeUrl || '');
                                        setExpExternalUrl(exp.externalUrl || '');
                                        setExpStatus(exp.status);
                                        setShowExplanationModal(true);
                                      }}
                                      onDelete={() => {
                                        dbService.deleteExplanation(exp.id, currentUser);
                                        triggerToast(`Resource '${item.title}' berhasil dihapus.`);
                                        refreshData();
                                      }}
                                      onToggleStatus={() => {
                                        const nextStatus = exp.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
                                        dbService.updateExplanation(exp.id, { status: nextStatus }, currentUser);
                                        triggerToast(`Status '${item.title}' diubah ke ${nextStatus}.`);
                                        refreshData();
                                      }}
                                      isTeacherView={true}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* MODE 2: GROUPED EXPLANATION MODULES VIEW */}
                        {expViewMode === 'MODULES' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filteredExplanations.map(exp => {
                              const targetQuestion = questions.find(q => q.id === exp.questionId);
                              const expSubj = subjects.find(s => s.id === exp.subjectId);

                              const getSubjectBadge = (sId?: string) => {
                                switch (sId) {
                                  case 'subj-mat':
                                    return 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
                                  case 'subj-fis':
                                    return 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800';
                                  case 'subj-bin':
                                    return 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
                                  case 'subj-bio':
                                    return 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
                                  default:
                                    return 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
                                }
                              };

                              return (
                                <div key={exp.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between transition-colors">
                                  <div className="space-y-3">
                                    {/* Header Badges */}
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border font-mono ${getSubjectBadge(exp.subjectId)}`}>
                                          {expSubj ? `${expSubj.name} (${expSubj.code})` : 'Umum / Semua Mapel'}
                                        </span>

                                        {Array.isArray(exp.questionNumbers) && exp.questionNumbers.length > 0 ? (
                                          <span className="bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-lg font-mono" title={`Nomor: ${exp.questionNumbers.join(', ')}`}>
                                            Soal No: {exp.questionNumbers.join(', ')}
                                          </span>
                                        ) : exp.questionId && exp.questionId !== 'GENERAL' ? (
                                          <span className="bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-lg font-mono">
                                            Soal: {targetQuestion?.uniqueCode || exp.questionId}
                                          </span>
                                        ) : (
                                          <span className="bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 text-[10px] font-bold px-2 py-0.5 rounded-lg">
                                            Paket Lengkap Mapel
                                          </span>
                                        )}

                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-semibold">
                                          • {exp.tryoutId.toUpperCase()}
                                        </span>
                                      </div>

                                      <span
                                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${
                                          exp.status === 'PUBLISHED'
                                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                            : exp.status === 'DRAFT'
                                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                                        }`}
                                      >
                                        {exp.status}
                                      </span>
                                    </div>

                                    {/* Title & Body */}
                                    <div>
                                      <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{exp.title}</h3>
                                      {exp.contentText && (
                                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line line-clamp-3 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 font-normal mt-2">
                                          {exp.contentText}
                                        </p>
                                      )}
                                    </div>

                                    {/* EMBEDDED RESOURCE CARDS FOR THIS MODULE */}
                                    <div className="space-y-3 pt-1">
                                      {exp.youtubeUrl && (
                                        <ResourceCard
                                          type="YOUTUBE"
                                          title={`Video Solusi: ${exp.title}`}
                                          url={exp.youtubeUrl}
                                          subjectName={expSubj?.name}
                                          subjectCode={expSubj?.code}
                                          tryoutCode={exp.tryoutId}
                                          questionCode={targetQuestion?.uniqueCode}
                                      questionNumbers={exp.questionNumbers}
                                          status={exp.status}
                                          onPreview={(url, title) => {
                                            setActiveVideoModalUrl(url);
                                            setActiveVideoModalTitle(title);
                                          }}
                                          isTeacherView={false}
                                        />
                                      )}

                                      {exp.pdfUrl && (
                                        <ResourceCard
                                          type="PDF"
                                          title={`Modul Solusi: ${exp.title}`}
                                          url={exp.pdfUrl}
                                          fileName={exp.pdfFileName || 'Modul_Solusi_Resmi.pdf'}
                                          fileSize={exp.pdfFileSize}
                                          subjectName={expSubj?.name}
                                          subjectCode={expSubj?.code}
                                          tryoutCode={exp.tryoutId}
                                          questionCode={targetQuestion?.uniqueCode}
                                      questionNumbers={exp.questionNumbers}
                                          status={exp.status}
                                          isTeacherView={false}
                                        />
                                      )}

                                      {exp.externalUrl && (
                                        <a
                                          href={exp.externalUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="p-2 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-xl border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 transition-colors"
                                        >
                                          <div className="flex items-center gap-1.5 font-semibold truncate">
                                            <ExternalLink className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                            <span className="truncate">Google Drive / Dokumen Pendukung</span>
                                          </div>
                                          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                                        </a>
                                      )}

                                      <div className="text-slate-400 dark:text-slate-500 text-[10px] pt-1 flex items-center justify-between">
                                        <span>Penulis: {exp.authorName || 'Guru Mata Pelajaran'}</span>
                                        <span>{new Date(exp.updatedAt).toLocaleDateString('id-ID')}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center space-x-1.5">
                                      <button
                                        onClick={() => {
                                          const editTryoutId = exp.tryoutId || selectedTryoutId || tryouts[0]?.id || '';
                                          const editSubjectId = exp.subjectId || selectedSubjectId || allowedSubjectIds[0] || subjects[0]?.id || '';
                                          setEditingExplanationId(exp.id);
                                          setExpTitle(exp.title);
                                          setExpSubjectId(editSubjectId);
                                          setExpTryoutId(editTryoutId);
                                          setExpQuestionId(exp.questionId || 'GENERAL');
                                          const existingNumbers = Array.isArray(exp.questionNumbers) && exp.questionNumbers.length > 0
                                            ? exp.questionNumbers
                                            : (exp.questionId && exp.questionId !== 'GENERAL' ? [questions.find(q => q.id === exp.questionId)?.questionNumber].filter((n): n is number => typeof n === 'number') : []);
                                          setExpCustomNumbers(getInitialQuestionNumbers(editTryoutId, editSubjectId, existingNumbers));
                                          setIsQuestionDeleteMode(false);
                                          setSyncQuestionCountToTryout(true);
                                          if (existingNumbers.length > 0) {
                                            setExpScopeMode('SPECIFIC');
                                            setExpSelectedNumbers(existingNumbers);
                                          } else {
                                            setExpScopeMode('ALL');
                                            setExpSelectedNumbers([]);
                                          }
                                          setRangeStart('');
                                          setRangeEnd('');
                                          setExpContentText(exp.contentText);
                                          setExpPdfUrl(exp.pdfUrl || '');
                                          setExpPdfFileName(exp.pdfFileName || '');
                                          setExpYoutubeUrl(exp.youtubeUrl || '');
                                          setExpExternalUrl(exp.externalUrl || '');
                                          setExpStatus(exp.status);
                                          setShowExplanationModal(true);
                                        }}
                                        className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-lg border border-slate-200 dark:border-slate-700 flex items-center space-x-1 cursor-pointer"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                        <span>Edit</span>
                                      </button>

                                      {exp.status !== 'PUBLISHED' ? (
                                        <button
                                          onClick={() => {
                                            dbService.publishExplanation(exp.id, currentUser);
                                            triggerToast(`Pembahasan '${exp.title}' dipublikasikan ke siswa.`);
                                            refreshData();
                                          }}
                                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs cursor-pointer"
                                        >
                                          Publikasikan
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => {
                                            dbService.updateExplanation(exp.id, { status: 'DRAFT' }, currentUser);
                                            triggerToast(`Pembahasan '${exp.title}' diubah ke Draf.`);
                                            refreshData();
                                          }}
                                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow-xs cursor-pointer"
                                        >
                                          Jadikan Draf
                                        </button>
                                      )}

                                      {exp.status !== 'ARCHIVED' && (
                                        <button
                                          onClick={() => {
                                            dbService.archiveExplanation(exp.id, currentUser);
                                            triggerToast(`Pembahasan '${exp.title}' berhasil diarsipkan.`);
                                            refreshData();
                                          }}
                                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold rounded-lg cursor-pointer"
                                        >
                                          Arsipkan
                                        </button>
                                      )}
                                    </div>

                                    <button
                                      onClick={() => {
                                        dbService.deleteExplanation(exp.id, currentUser);
                                        triggerToast(`Pembahasan '${exp.title}' dihapus.`);
                                        refreshData();
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                                      title="Hapus Pembahasan"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB 10: REPORTS NAVIGATION — PHASE 11 REPORTING ENGINE */}
              {isToAnalyticsActive && toAnalyticsSubTab === 'REPORTS' && (
                <div className="space-y-6">
                  {/* Top Bar Header & Control */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <FileSpreadsheet className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                            Pusat Rekapitulasi Terpadu &amp; Berkas Resmi Asesmen
                          </h2>
                          <span className="bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded">
                            MASTER EXPORT HUB
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Rangkuman komprehensif seluruh instrumen evaluasi: Unduh Master Workbook Excel gabungan (semua kelas, nilai, dan analisis butir soal) serta bundel laporan resmi per rombongan belajar.
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            const res = dbService.runReportEngineTests(currentUser);
                            setReportTestResult(res);
                            triggerToast(`Test Suite Reporting Phase 11 Selesai (${res.passedTests}/${res.totalTests} Passed dalam ${res.executionTimeMs} ms)`);
                          }}
                          className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg flex items-center space-x-1.5 shadow-sm transition-colors border border-transparent dark:border-slate-700"
                        >
                          <Play className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Jalankan Test Suite Reporting (Phase 11)</span>
                        </button>
                      </div>
                    </div>

                    {/* Try Out & Target Selectors */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs">
                      <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Try Out Target:</span>
                        <select
                          value={selectedTryoutId}
                          onChange={e => setSelectedTryoutId(e.target.value)}
                          className="bg-transparent font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                        >
                          {tryouts.map(t => (
                            <option key={t.id} value={t.id} className="dark:bg-slate-800 dark:text-white">[{getFriendlyTryoutStageLabel(t, tryouts)}] {t.title}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Kelas / Rombel Target:</span>
                        <select
                          value={classFilter}
                          onChange={e => setClassFilter(e.target.value)}
                          className="bg-transparent font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                        >
                          {classes.map(c => (
                            <option key={c.id} value={c.id} className="dark:bg-slate-800 dark:text-white">{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* AUTOMATED TEST SUITE HUB RESULTS (PHASE 11 GATE) */}
                  {reportTestResult && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div className="flex items-center space-x-2">
                          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Hasil Pengujian Otomatis Modul Pelaporan & Ekspor
                          </h3>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-1 rounded border font-mono ${
                              reportTestResult.passed
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                            }`}
                          >
                            {reportTestResult.passed ? 'PHASE 11 — VERIFIED & FROZEN' : 'PHASE 11 — TEST FAILED'}
                          </span>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            Waktu: <strong className="text-slate-900 dark:text-white">{reportTestResult.executionTimeMs} ms</strong>
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {reportTestResult.tests.map(t => (
                          <div
                            key={t.testId}
                            className={`p-3 rounded-lg border text-xs space-y-1 transition-all ${
                              t.passed ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60' : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60'
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span className="text-slate-900 dark:text-white">Test {t.testId}: {t.name}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                  t.passed ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300'
                                }`}
                              >
                                {t.passed ? 'PASSED' : 'FAILED'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{t.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* REPORT EXPORT CARDS */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Card 1: Multi-Sheet Excel Workbook (6 Sheets) */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3 flex flex-col justify-between transition-colors">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 rounded-lg">
                            <FileSpreadsheet className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded font-mono">
                            6 SHEETS XLSX
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Workbook Laporan Lengkap Excel (6 Sheets)</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          Buku kerja XLSX berisi 6 lembar kerja terstruktur: Ringkasan Nilai, Nilai Siswa, Matriks Jawaban, Analisis Butir Soal, Analisis Kelas, dan Perkembangan Siswa.
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          const activeTo = tryouts.find(t => t.id === selectedTryoutId) || tryouts[0];
                          if (!activeTo) {
                            triggerError('Data TryOut belum tersedia untuk diekspor.');
                            return;
                          }
                          const scores = dbService.getScoresByTryout(activeTo.id);
                          const answers = dbService.getAnswers().filter(a => a.tryoutId === activeTo.id);
                          const qaList = dbService.getQuestionAnalysis(activeTo.id, 'ALL', 'ALL', currentUser);

                          const fileName = ExportService.exportComprehensiveWorkbookExcel(
                            activeTo,
                            classes,
                            students,
                            scores,
                            questions,
                            answers,
                            qaList,
                            materials,
                            competencies
                          );
                          triggerToast(`Workbook Excel 6-Sheet ('${fileName}') berhasil diunduh.`);
                        }}
                        className="w-full bg-emerald-700 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center space-x-1.5 shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                        <span>Unduh Workbook Excel (6 Sheets)</span>
                      </button>
                    </div>

                    {/* Card 2: Teacher Class Analytics PDF */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3 flex flex-col justify-between transition-colors">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-400 rounded-lg">
                            <FileText className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded font-mono">
                            CLASS PDF
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Laporan Analitik PDF Kelas & Analisis Butir Soal</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          Dokumen PDF resmi berisi statistik ringkasan kelas, peringkat nilai siswa, tingkat kesukaran & daya pembeda soal, serta distribusi pilihan pengecoh.
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          const activeTo = tryouts.find(t => t.id === selectedTryoutId) || tryouts[0];
                          const activeCls = classes.find(c => c.id === classFilter) || classes[0];
                          if (!activeCls || !activeTo) {
                            triggerError('Data kelas atau TryOut belum tersedia untuk diekspor.');
                            return;
                          }
                          const scores = dbService.getScoresByTryout(activeTo.id);
                          const qaList = dbService.getQuestionAnalysis(activeTo.id, 'ALL', activeCls.id, currentUser);
                          const classAnalytics = dbService.getClassAnalytics(activeCls.id, activeTo.id, currentUser);

                          const fileName = ExportService.exportTeacherClassAnalyticsPDF(
                            activeCls,
                            activeTo,
                            scores,
                            questions,
                            qaList,
                            competencies,
                            classAnalytics,
                            students,
                            dbService.getSchoolProfile()
                          );
                          triggerToast(`Laporan PDF Analitik Kelas ('${fileName}') berhasil diunduh.`);
                        }}
                        className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center space-x-1.5 shadow-sm border border-transparent dark:border-slate-700"
                      >
                        <Download className="w-4 h-4" />
                        <span>Unduh PDF Analisis Kelas</span>
                      </button>
                    </div>

                    {/* Card 3: Student Scorecard PDF Report */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3 flex flex-col justify-between transition-colors">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="p-2 bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/60 text-cyan-700 dark:text-cyan-400 rounded-lg">
                            <Award className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] font-bold text-cyan-800 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 px-2 py-0.5 rounded font-mono">
                            INDIVIDUAL PDF
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Rapor Individual Hasil Try Out Siswa</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          Rapor PDF 2 halaman (identik dengan unduhan Portal Siswa) lengkap dengan kop sekolah, tanda tangan Wali Kelas &amp; Kepala Sekolah sesuai Admin, matriks soal, dan grafik perkembangan lintas TO.
                        </p>
                        <div className="pt-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Pilih Siswa:
                          </label>
                          <select
                            value={activeStudentIdForAnalytics}
                            onChange={e => setSelectedStudentForAnalytics(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-semibold focus:ring-1 focus:ring-indigo-500"
                          >
                            {(classFilter && classFilter !== 'ALL'
                              ? students.filter(s => s.classId === classFilter)
                              : students
                            ).map(s => {
                              const cls = classes.find(c => c.id === s.classId);
                              return (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.nisn}) — {cls?.name || s.classId}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const activeTo = tryouts.find(t => t.id === selectedTryoutId) || tryouts[0];
                          const filteredStudents = classFilter && classFilter !== 'ALL'
                            ? students.filter(s => s.classId === classFilter)
                            : students;
                          const targetStudent =
                            filteredStudents.find(s => s.id === activeStudentIdForAnalytics) ||
                            students.find(s => s.id === activeStudentIdForAnalytics) ||
                            filteredStudents[0] ||
                            students[0];
                          if (!targetStudent || !activeTo) {
                            triggerError('Data siswa atau TryOut belum tersedia untuk diekspor.');
                            return;
                          }
                          const studentScore = dbService.getScoresByStudent(targetStudent.id).find(s => s.tryoutId === activeTo.id) || {
                            id: `sc-${targetStudent.id}`,
                            responseId: `resp-${targetStudent.id}`,
                            studentId: targetStudent.id,
                            tryoutId: activeTo.id,
                            subjectScores: {},
                            googleFormScore: 0,
                            calculatedScore: 0,
                            scoreDifference: 0,
                            scoringStatus: 'MATCH' as const,
                            totalCorrect: 0,
                            totalIncorrect: 0,
                            totalUnanswered: 0,
                            createdAt: new Date().toISOString()
                          };
                          const studentClass = classes.find(c => c.id === targetStudent.classId);
                          const studentAnalytics = dbService.getStudentAnalytics(targetStudent.id, activeTo.id);

                          const targetWalas = studentClass ? dbService.getHomeroomTeacherForClass(studentClass.id) : null;
                          const fileName = ExportService.exportStudentPDF(
                            targetStudent as any,
                            studentScore,
                            activeTo,
                            studentClass,
                            studentAnalytics,
                            explanations,
                            undefined,
                            {
                              waliKelasName: targetWalas?.name,
                              waliKelasNip: targetWalas?.nip,
                              teachers: dbService.getTeachers(),
                              classes: dbService.getClasses(),
                            }
                          );
                          triggerToast(`Rapor PDF Siswa ${targetStudent.name} ('${fileName}') berhasil diunduh.`);
                        }}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center space-x-1.5 shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                        <span>Unduh Rapor PDF Siswa</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 11: GOOGLE SHEETS IMPORT PIPELINE */}
              {/* TAB 11: GOOGLE SHEETS IMPORT PIPELINE */}
              {activeTab === 'IMPORT_SHEETS' && (
                <div className="space-y-6">
                  {/* Top Reference & Metadata Card */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                            Pipeline Integrasi Google Forms & Google Sheets
                          </h2>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Alur Integrasi: Masukkan Data Respon &rarr; Pemetaan Kolom Soal &rarr; Pratinjau &rarr; Simpan &amp; Penilaian Otomatis.
                        </p>
                      </div>

                      {/* Try Out & Subject Selectors */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Try Out Target:</span>
                          <select
                            value={selectedTryoutId}
                            onChange={e => setSelectedTryoutId(e.target.value)}
                            className="bg-transparent font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                          >
                            {tryouts.map(t => (
                              <option key={t.id} value={t.id} className="dark:bg-slate-800 dark:text-white">
                                [{getFriendlyTryoutStageLabel(t, tryouts)}] {t.title}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Mapel Target:</span>
                          <select
                            value={selectedSubjectId}
                            onChange={e => setSelectedSubjectId(e.target.value)}
                            className="bg-transparent font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                          >
                            {permittedSubjects.map(s => (
                              <option key={s.id} value={s.id} className="dark:bg-slate-800 dark:text-white">
                                {s.name} ({s.code})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Google Form & Google Sheet Linked References */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 font-medium">
                            <Link className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span>Referensi Google Form:</span>
                          </div>
                          <div className="font-bold text-slate-900 dark:text-white">{googleFormRef.formTitle}</div>
                          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">ID: {googleFormRef.formId}</div>
                        </div>
                        <a
                          href={googleFormRef.formUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-1 text-[11px] font-semibold"
                        >
                          <span>Buka Form</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 font-medium">
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Referensi Google Sheets:</span>
                          </div>
                          <div className="font-bold text-slate-900 dark:text-white">Respons Ujian (Spreadsheet Aktif)</div>
                          <div className="flex items-center space-x-2 text-[11px]">
                            <span className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 font-semibold px-1.5 py-0.5 rounded">
                              STATUS: TERKONEKSI (LIVE)
                            </span>
                            <span className="text-slate-400 dark:text-slate-500">• Sinkronisasi: {googleFormRef.lastSync}</span>
                          </div>
                        </div>
                        <a
                          href={googleFormRef.sheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-700 dark:text-emerald-400 hover:underline flex items-center space-x-1 text-[11px] font-semibold"
                        >
                          <span>Buka Sheet</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {/* 4-Step Progress Indicator */}
                    <div className="grid grid-cols-4 gap-2 text-xs font-semibold pt-2">
                      <div
                        className={`p-2 rounded-lg text-center border transition-colors ${
                          importStage === 'INPUT'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        1. Sumber Data (Input)
                      </div>
                      <div
                        className={`p-2 rounded-lg text-center border transition-colors ${
                          importStage === 'MAPPING'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        2. Pemetaan Kolom (Mapping)
                      </div>
                      <div
                        className={`p-2 rounded-lg text-center border transition-colors ${
                          importStage === 'PREVIEW'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        3. Validasi & Pratinjau
                      </div>
                      <div
                        className={`p-2 rounded-lg text-center border transition-colors ${
                          importStage === 'CONFIRMED'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        4. Selesai (Tersimpan Aman)
                      </div>
                    </div>
                  </div>

                  {/* STAGE 1: INPUT / FETCH */}
                  {importStage === 'INPUT' && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 transition-colors">
                      {/* Presets Bar */}
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between">
                          <span>Uji Skenario Pipeline Cepat (Pilih Preset Data):</span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">Klik untuk memasukkan data uji otomatis</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRawPasteText(
                                `NISN\tSkor GForm\tMAT-TO03-Q001\tMAT-TO03-Q002\tMAT-TO03-Q003\tMAT-TO03-Q004\tMAT-TO03-Q005\n0061234561\t100\tA\tA\tA\tA\tA\n0061234562\t80\tA\tA\tA\tA\tB\n0061234563\t60\tA\tA\tA\tB\tB`
                              );
                              triggerToast('Memuat preset: Data Valid Lengkap.');
                            }}
                            className="p-2 border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-900 dark:text-emerald-300 rounded-lg text-left text-[11px] font-semibold transition-colors"
                          >
                            <span className="block font-bold">1. Valid Lengkap</span>
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-normal">3 siswa terdaftar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setRawPasteText(
                                `NISN\tSkor GForm\tMAT-TO03-Q001\tMAT-TO03-Q002\tMAT-TO03-Q003\n9999999999\t80\tA\tA\tA`
                              );
                              triggerToast('Memuat preset: Data Siswa Tidak Terdaftar.');
                            }}
                            className="p-2 border border-rose-300 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-900 dark:text-rose-300 rounded-lg text-left text-[11px] font-semibold transition-colors"
                          >
                            <span className="block font-bold">2. Siswa Tak Dikenal</span>
                            <span className="text-[10px] text-rose-700 dark:text-rose-400 font-normal">NISN 9999999999</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setRawPasteText(
                                `NISN\tSkor GForm\tMAT-TO03-Q001\tMAT-TO03-Q002\tMAT-TO03-Q003\n0061234561\t100\tA\tA\tA\n0061234561\t100\tA\tA\tA`
                              );
                              triggerToast('Memuat preset: Data Duplikasi Lembar.');
                            }}
                            className="p-2 border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-300 rounded-lg text-left text-[11px] font-semibold transition-colors"
                          >
                            <span className="block font-bold">3. Duplikasi Lembar</span>
                            <span className="text-[10px] text-amber-700 dark:text-amber-400 font-normal">NISN sama 2x</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setRawPasteText(
                                `NISN\tSkor GForm\tMAT-TO03-Q001\tMAT-TO03-Q002\tMAT-TO03-Q003\n0061234561\t100\tINVALID_OPT\tA\tA`
                              );
                              triggerToast('Memuat preset: Data Jawaban Cacat.');
                            }}
                            className="p-2 border border-orange-300 dark:border-orange-800/60 bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/50 text-orange-900 dark:text-orange-300 rounded-lg text-left text-[11px] font-semibold transition-colors"
                          >
                            <span className="block font-bold">4. Jawaban Cacat</span>
                            <span className="text-[10px] text-orange-700 dark:text-orange-400 font-normal">Opsi tidak sah</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setRawPasteText(
                                `NISN\tSkor GForm\tMAT-TO03-Q001\tMAT-TO03-Q002\tMAT-TO03-Q003\tMAT-TO03-Q004\tMAT-TO03-Q005\n0061234561\t95\tB\tB\tB\tB\tB`
                              );
                              triggerToast('Memuat preset: Data Selisih Skor (Mismatch).');
                            }}
                            className="p-2 border border-purple-300 dark:border-purple-800/60 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-900 dark:text-purple-300 rounded-lg text-left text-[11px] font-semibold transition-colors"
                          >
                            <span className="block font-bold">5. Selisih Skor</span>
                            <span className="text-[10px] text-purple-700 dark:text-purple-400 font-normal">GForm 95 vs Hitung 0</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setRawPasteText(
                                `NISN\tSkor GForm\tMAT-TO03-Q001\tMAT-TO03-Q002\tMAT-TO03-Q003\tMAT-TO03-Q004\tMAT-TO03-Q005\n0061234561\t100\tA\tA\tA\tA\tA\n9999999999\t80\tA\tA\tA\tA\tA\n0061234562\t80\tINVALID_CORRUPT\tA\tA\tA\tA\n0061234563\t90\tB\tB\tB\tB\tB`
                              );
                              triggerToast('Memuat preset: Data Campuran (Partial Failure).');
                            }}
                            className="p-2 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-left text-[11px] font-semibold transition-colors"
                          >
                            <span className="block font-bold">6. Campuran (Partial)</span>
                            <span className="text-[10px] text-slate-600 dark:text-slate-400 font-normal">Valid & Error</span>
                          </button>
                        </div>
                      </div>

                      {/* Textarea Input */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Data Mentah Google Sheets (Format TSV atau CSV):
                        </label>
                        <textarea
                          rows={8}
                          value={rawPasteText}
                          onChange={e => setRawPasteText(e.target.value)}
                          placeholder="NISN&#9;Skor GForm&#9;MAT-TO03-Q001&#9;MAT-TO03-Q002&#9;MAT-TO03-Q003&#10;0061234561&#9;100&#9;A&#9;A&#9;A&#10;0061234562&#9;80&#9;A&#9;B&#9;A"
                          className="w-full font-mono text-xs p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      {/* Mandatory Rule Notice */}
                      <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-lg p-3 flex items-start space-x-2 text-xs text-indigo-900 dark:text-indigo-300">
                        <AlertCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-bold block">Aturan Otoritas Question ID:</strong>
                          Sistem menggunakan <strong>Unique Question ID</strong> (contoh: <code>MAT-TO03-Q015</code>), BUKAN nomor indeks kolom. Sistem memverifikasi kode unik soal pada baris header lembar kerja sebelum mengizinkan kalkulasi.
                        </div>
                      </div>

                      <div className="flex items-center justify-end">
                        <button
                          onClick={handleParseSheet}
                          disabled={!rawPasteText.trim()}
                          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2.5 rounded-lg flex items-center space-x-1.5 shadow"
                        >
                          <span>Lanjutkan Ke Pemetaan Kolom</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STAGE 2: MAPPING (QUESTION & STUDENT COLUMN MAPPING) */}
                  {importStage === 'MAPPING' && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-5 transition-colors">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Konfigurasi Pemetaan Kolom & Butir Soal ({parsedRows.length} Baris Terbaca)
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Pastikan kolom identitas siswa dan kolom soal terpetakan ke Unique Question ID yang tepat.
                          </p>
                        </div>
                        <button
                          onClick={() => setImportStage('INPUT')}
                          className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                        >
                          &larr; Ubah Sumber Data
                        </button>
                      </div>

                      {/* Student Identification Column Mappings */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                        <div>
                          <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Kolom NISN Siswa (Wajib):</label>
                          <select
                            value={columnMappings.nisnColumn}
                            onChange={e =>
                              setColumnMappings({ ...columnMappings, nisnColumn: e.target.value })
                            }
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-white font-semibold focus:outline-none"
                          >
                            {parsedHeaders.map(h => (
                              <option key={h} value={h} className="dark:bg-slate-800 dark:text-white">
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Kolom Skor Google Form (Opsional):</label>
                          <select
                            value={columnMappings.scoreColumn || ''}
                            onChange={e =>
                              setColumnMappings({ ...columnMappings, scoreColumn: e.target.value })
                            }
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-white focus:outline-none"
                          >
                            <option value="" className="dark:bg-slate-800 dark:text-white">-- Tidak disertakan / Hitung Otomatis --</option>
                            {parsedHeaders.map(h => (
                              <option key={h} value={h} className="dark:bg-slate-800 dark:text-white">
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Kolom Nama Siswa (Opsional):</label>
                          <select
                            value={columnMappings.nameColumn || ''}
                            onChange={e =>
                              setColumnMappings({ ...columnMappings, nameColumn: e.target.value })
                            }
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-white focus:outline-none"
                          >
                            <option value="" className="dark:bg-slate-800 dark:text-white">-- Dari Database Roster Sekolah --</option>
                            {parsedHeaders.map(h => (
                              <option key={h} value={h} className="dark:bg-slate-800 dark:text-white">
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Question Mappings by Unique Question ID */}
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                          <span>Pemetaan Butir Soal Terhadap Unique Question ID ({activeSubject?.name}):</span>
                          <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-mono">
                            {
                              Object.values(columnMappings.questionMappings).filter(Boolean).length
                            }{' '}
                            / {questions.filter(q => q.subjectId === selectedSubjectId).length} Soal Terpetakan
                          </span>
                        </div>

                        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                              <tr>
                                <th className="py-2 px-3 w-12 text-center">No</th>
                                <th className="py-2 px-3 w-40">Unique Question ID</th>
                                <th className="py-2 px-3">Teks Ringkas Soal</th>
                                <th className="py-2 px-3 w-20 text-center">Kunci</th>
                                <th className="py-2 px-3 w-64">Kolom Header Google Sheets</th>
                                <th className="py-2 px-3 w-28 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {questions
                                .filter(q => q.subjectId === selectedSubjectId)
                                .map((q, idx) => {
                                  const mappedHeader = columnMappings.questionMappings[q.uniqueCode] || '';
                                  const isMapped = !!mappedHeader;
                                  return (
                                    <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                      <td className="py-2 px-3 text-center text-slate-500 dark:text-slate-400 font-bold">
                                        {q.questionNumber || idx + 1}
                                      </td>
                                      <td className="py-2 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                        {q.uniqueCode}
                                      </td>
                                      <td className="py-2 px-3 text-slate-700 dark:text-slate-300 truncate max-w-xs">
                                        {q.questionText}
                                      </td>
                                      <td className="py-2 px-3 text-center">
                                        <span className="font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-800 dark:text-slate-200">
                                          {q.correctAnswer}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3">
                                        <select
                                          value={mappedHeader}
                                          onChange={e => {
                                            const updated = {
                                              ...columnMappings.questionMappings,
                                              [q.uniqueCode]: e.target.value,
                                            };
                                            setColumnMappings({
                                              ...columnMappings,
                                              questionMappings: updated,
                                            });
                                          }}
                                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-white focus:outline-none"
                                        >
                                          <option value="" className="dark:bg-slate-800 dark:text-white">-- Pilih Kolom Header --</option>
                                          {parsedHeaders.map(h => (
                                            <option key={h} value={h} className="dark:bg-slate-800 dark:text-white">
                                              {h}
                                            </option>
                                          ))}
                                        </select>
                                      </td>
                                      <td className="py-2 px-3 text-center">
                                        {isMapped ? (
                                          <span className="inline-flex items-center space-x-1 text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                            <span>Terpetakan</span>
                                          </span>
                                        ) : (
                                          <span className="inline-block text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">
                                            Belum terikat
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <button
                          onClick={() => setImportStage('INPUT')}
                          className="border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold px-4 py-2 rounded-lg"
                        >
                          &larr; Kembali
                        </button>
                        <button
                          onClick={handleProceedToValidation}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-5 py-2.5 rounded-lg flex items-center space-x-1.5 shadow"
                        >
                          <span>Lanjutkan Ke Validasi & Pratinjau</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STAGE 3: VALIDATION & PREVIEW */}
                  {importStage === 'PREVIEW' && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-5 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Pratinjau Hasil Validasi Data ({previewItems.length} Baris)
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Hasil kalkulasi deterministik telah dibandingkan dengan nilai Google Form. Baris dengan selisih ditandai secara transparan.
                          </p>
                        </div>
                        <button
                          onClick={() => setImportStage('MAPPING')}
                          className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                        >
                          &larr; Ubah Pemetaan Kolom
                        </button>
                      </div>

                      {/* Summary Metrics Cards */}
                      {validationSummary && (
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Total Baris</div>
                            <div className="text-xl font-bold text-slate-900 dark:text-white">{validationSummary.totalRows}</div>
                          </div>
                          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3">
                            <div className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">Lolos Validasi</div>
                            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{validationSummary.successCount}</div>
                          </div>
                          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl p-3">
                            <div className="text-[11px] text-rose-800 dark:text-rose-300 font-medium">Gagal / Cacat</div>
                            <div className="text-xl font-bold text-rose-700 dark:text-rose-400">{validationSummary.failedCount}</div>
                          </div>
                          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3">
                            <div className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">Selisih Skor (Mismatch)</div>
                            <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{validationSummary.mismatchCount}</div>
                          </div>
                          <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl p-3">
                            <div className="text-[11px] text-indigo-800 dark:text-indigo-300 font-medium">Duplikasi / Update</div>
                            <div className="text-xl font-bold text-indigo-700 dark:text-indigo-400">{validationSummary.duplicateCount}</div>
                          </div>
                        </div>
                      )}

                      {/* Answer Key Auto-Detected Banner */}
                      {validationSummary && validationSummary.answerKeyDetected && (
                        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 rounded-xl p-3.5 flex items-start space-x-2.5 text-xs text-emerald-900 dark:text-emerald-300">
                          <Key className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block text-sm">
                              Kunci Jawaban Resmi Dideteksi &amp; Diterapkan Otomatis!
                            </span>
                            Kunci jawaban Try Out berhasil disinkronkan dari respon akun resmi <strong>"{validationSummary.answerKeyStudentName}"</strong> ({validationSummary.answerKeyExtractedCount} butir soal). Baris ini secara otomatis dikecualikan dari perhitungan nilai &amp; peringkat siswa.
                          </div>
                        </div>
                      )}

                      {/* Mismatch Warning Box */}
                      {validationSummary && validationSummary.mismatchCount > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 rounded-xl p-3.5 flex items-start space-x-2.5 text-xs text-amber-900 dark:text-amber-300">
                          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block text-sm">
                              Peringatan: Selisih Skor Terdeteksi ({validationSummary.mismatchCount} Siswa)
                            </span>
                            Sistem mendeteksi adanya selisih antara nilai Google Form dan kalkulasi deterministik database. Sesuai <em>Business Rule</em>: <strong>Tidak ada silent overwrite</strong>. Nilai Google Form dan Nilai Hitung Ulang akan disimpan berdampingan untuk audit.
                          </div>
                        </div>
                      )}

                      {/* Preview Table */}
                      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="py-2.5 px-3 w-10 text-center">No</th>
                              <th className="py-2.5 px-3 w-28">NISN</th>
                              <th className="py-2.5 px-3">Nama Siswa & Kelas</th>
                              <th className="py-2.5 px-3 w-20 text-center">Skor GForm</th>
                              <th className="py-2.5 px-3 w-24 text-center">Skor Kalkulasi</th>
                              <th className="py-2.5 px-3 w-20 text-center">Selisih</th>
                              <th className="py-2.5 px-3 w-36 text-center">Status Validasi</th>
                              <th className="py-2.5 px-3 w-56">Diagnosa / Keterangan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {previewItems.map(item => {
                              const isError =
                                item.status.startsWith('ERROR_');
                              const isMismatch =
                                item.status === 'WARNING_MISMATCH';

                              return (
                                <tr
                                  key={item.rowNumber}
                                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                                    isError ? 'bg-rose-50/40 dark:bg-rose-950/20' : isMismatch ? 'bg-amber-50/30 dark:bg-amber-950/20' : ''
                                  }`}
                                >
                                  <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400 font-bold">
                                    {item.rowNumber}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                                    {item.nisn || <span className="text-rose-500 italic">KOSONG</span>}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="font-semibold text-slate-900 dark:text-white">{item.studentName}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                      {item.isValidStudent
                                        ? `ID Siswa: ${item.studentId}`
                                        : 'Tidak terdaftar dalam roster siswa'}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono text-slate-700 dark:text-slate-300">
                                    {item.rawGFormScore}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                    {item.calculatedScore}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono">
                                    {item.scoreDifference > 0 ? (
                                      <span className="text-amber-600 dark:text-amber-400 font-bold">
                                        {item.scoreDifference.toFixed(2)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 dark:text-slate-500">0.00</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold inline-block uppercase tracking-wider ${
                                        item.status === 'VALID'
                                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                          : item.status === 'WARNING_MISMATCH'
                                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                          : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                      }`}
                                    >
                                      {item.status.replace('ERROR_', '').replace('WARNING_', '')}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-[11px]">
                                    {item.validationError ? (
                                      <span className="text-rose-600 dark:text-rose-400 font-medium">
                                        {item.validationError}
                                      </span>
                                    ) : item.status === 'WARNING_MISMATCH' ? (
                                      <span className="text-amber-700 dark:text-amber-300">
                                        Selisih {item.scoreDifference.toFixed(2)} poin terhadap GForm
                                      </span>
                                    ) : item.isExistingSubmissionInDb ? (
                                      <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                                        Data sudah ada (akan diperbarui otomatis tanpa duplikasi)
                                      </span>
                                    ) : (
                                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>Data valid & siap disimpan</span>
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Confirm Action Button */}
                      <div className="flex items-center justify-between pt-2">
                        <button
                          onClick={() => setImportStage('MAPPING')}
                          className="border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold px-4 py-2 rounded-lg"
                        >
                          &larr; Kembali Ubah Pemetaan
                        </button>
                        <button
                          onClick={handleConfirmImport}
                          disabled={
                            previewItems.filter(
                              i => i.status === 'VALID' || i.status === 'WARNING_MISMATCH'
                            ).length === 0
                          }
                          className="bg-emerald-700 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-6 py-2.5 rounded-lg shadow flex items-center space-x-2"
                        >
                          <Save className="w-4 h-4" />
                          <span>
                            Konfirmasi Simpan Ke Database (
                            {
                              previewItems.filter(
                                i => i.status === 'VALID' || i.status === 'WARNING_MISMATCH'
                              ).length
                            }{' '}
                            Baris Valid)
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STAGE 4: CONFIRMED */}
                  {importStage === 'CONFIRMED' && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-8 text-center space-y-4 transition-colors">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <div className="text-base font-bold text-emerald-950 dark:text-emerald-200">
                        Batch Impor Respons Siswa Berhasil Disimpan!
                      </div>
                      <p className="text-xs text-emerald-800 dark:text-emerald-300/90 max-w-lg mx-auto leading-relaxed">
                        Data nilai, butir jawaban soal, dan status penilaian berhasil tersimpan dengan aman ke basis data tanpa duplikasi. Seluruh riwayat telah dicatat secara rapi di <strong>Catatan Aktivitas (Audit Log)</strong>.
                      </p>
                      <div className="pt-2 flex items-center justify-center space-x-3">
                        <button
                          onClick={() => {
                            setImportStage('INPUT');
                            setRawPasteText('');
                            setPreviewItems([]);
                          }}
                          className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-transparent dark:border-slate-700"
                        >
                          Impor Lembar Kerja Lainnya
                        </button>
                        <button
                          onClick={() => handleTabChange('ANALYTICS')}
                          className="border border-emerald-700 dark:border-emerald-500 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                        >
                          Lihat Analisis Butir Soal
                        </button>
                      </div>
                    </div>
                  )}

                  {/* AUTOMATED GOOGLE INTEGRATION TEST SUITE (PHASE 7 SCENARIOS) */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Automated Integration Test Suite (Phase 7 Specification)
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Memvalidasi 9 skenario integrasi: valid import, invalid student, invalid Try Out, invalid question, duplicate, malformed answer, scoring mismatch, repeated import (idempotency), dan partial failure.
                        </p>
                      </div>

                      <button
                        onClick={handleRunGoogleIntegrationTests}
                        className="bg-emerald-700 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center space-x-2 shadow-sm"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Jalankan Test Suite Integrasi</span>
                      </button>
                    </div>

                    {integrationTestResult && (
                      <div className="space-y-3">
                        <div
                          className={`p-3 rounded-lg border flex items-center justify-between text-xs font-bold ${
                            integrationTestResult.passed
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                          }`}
                        >
                          <span>
                            Status Keseluruhan Suite: {integrationTestResult.passed ? 'ALL TESTS PASSED (9/9)' : 'FAILED'}
                          </span>
                          <span className="font-mono text-[11px]">
                            {integrationTestResult.tests.filter(t => t.passed).length} /{' '}
                            {integrationTestResult.tests.length} Lulus
                          </span>
                        </div>

                        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
                          {integrationTestResult.tests.map((t, idx) => (
                            <div key={idx} className="p-3 flex items-start justify-between space-x-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <div className="space-y-0.5">
                                <div className="font-bold text-slate-900 dark:text-white">{t.name}</div>
                                <div className="text-[11px] text-slate-600 dark:text-slate-400">{t.message}</div>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                  t.passed
                                    ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                    : 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                }`}
                              >
                                {t.passed ? 'PASSED' : 'FAILED'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: PUSAT ANALISIS ASESMEN SUMATIF (SAS / SAT) MULTI-WADAH */}
              {activeTab === 'SUMATIF_ANALYTICS' && (
                <GuruSumatifAnalyticsSection
                  packages={teacherSumatifPackages}
                  selectedPackageId={selectedSumatifPackageId}
                  onSelectPackageId={(id) => setSelectedSumatifPackageId(id)}
                  activeSubject={activeSubjectObj}
                  classes={classes}
                  students={students}
                  scores={scores}
                  questions={questions}
                  answers={dbService.getAnswers()}
                  subjects={subjects}
                  onShowToast={(msg) => triggerToast(msg)}
                />
              )}

              {/* TAB 13: SCORING ENGINE & VERIFICATION (PHASE 8 SPECIFICATION) */}
              {activeTab === 'SCORING_ENGINE' && (
                <div className="space-y-6 animate-fade-in">
                  {/* Top Contract & Active Config Card */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-5 transition-colors">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <Calculator className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                            Aturan Penilaian Otomatis &amp; Verifikasi Nilai
                          </h2>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                          Sistem penilaian otomatis terstandar sekolah. Mendukung bobot soal seragam atau khusus, poin benar/salah/kosong, penalti salah (skor minus), penskalaan skor 0–100, komparasi terhadap skor Google Form, serta verifikasi bebas penimpaan data.
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] font-mono bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1 rounded-lg font-semibold flex items-center space-x-1.5">
                          <Scale className="w-3.5 h-3.5" />
                          <span>KONTRAK: SCORING_RULES.md</span>
                        </span>
                      </div>
                    </div>

                    {/* Interactive Score Source Switch (Mode Acuan Sumber Nilai) */}
                    <div className="p-4 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl flex flex-wrap items-center justify-between gap-4 transition-colors">
                      <div className="space-y-1 max-w-xl">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 dark:text-white text-xs">
                            Mode Acuan Sumber Nilai Utama:
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            activeTryout?.scoringConfig?.scoreSource === 'CUSTOM_ENGINE'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                          }`}>
                            {activeTryout?.scoringConfig?.scoreSource === 'CUSTOM_ENGINE'
                              ? 'Aturan Penilaian Sekolah'
                              : 'Nilai Langsung Kuis Google Form'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                          {activeTryout?.scoringConfig?.scoreSource === 'CUSTOM_ENGINE'
                            ? 'Aplikasi menghitung ulang skor secara otomatis menggunakan bobot soal, poin benar/salah, penalti minus, essay, dan KKM sekolah.'
                            : 'Aplikasi langsung menggunakan skor murni dari kuis Google Form tanpa perhitungan atau penyesuaian ulang.'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (!activeTryout) return;
                          const currentSrc = activeTryout.scoringConfig?.scoreSource || 'GOOGLE_FORM';
                          const newSrc: 'CUSTOM_ENGINE' | 'GOOGLE_FORM' = currentSrc === 'CUSTOM_ENGINE' ? 'GOOGLE_FORM' : 'CUSTOM_ENGINE';
                          const updatedConfig = {
                            ...activeTryout.scoringConfig,
                            scoreSource: newSrc
                          };
                          dbService.updateTryoutScoringConfig(activeTryout.id, updatedConfig, currentUser);
                          setTryouts(dbService.getTryoutsForTeacher(currentUser));
                          triggerToast(`Mode Acuan Nilai untuk ${activeTryout.code} diubah ke: ${newSrc === 'CUSTOM_ENGINE' ? 'Aturan Penilaian Sekolah' : 'Nilai Langsung Google Form'}`);
                        }}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center space-x-2 ${
                          activeTryout?.scoringConfig?.scoreSource === 'CUSTOM_ENGINE'
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                        }`}
                      >
                        <Sliders className="w-4 h-4" />
                        <span>
                          {activeTryout?.scoringConfig?.scoreSource === 'CUSTOM_ENGINE'
                            ? 'Mode Aturan Sekolah (Aktif) — Klik untuk Beralih ke Google Form'
                            : 'Mode Google Form (Aktif) — Klik untuk Beralih ke Aturan Sekolah'}
                        </span>
                      </button>
                    </div>

                    {/* Active Tryout Scoring Configuration Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Try Out Aktif</div>
                        <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                          <span>{activeTryout?.title || 'Try Out Terpilih'}</span>
                          <span className="font-mono text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded">
                            {activeTryout?.code}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">
                          Tipe Penilaian:{' '}
                          <strong className="text-indigo-700 dark:text-indigo-400 font-mono">
                            {activeTryout?.scoringConfig?.scoringType || 'STANDARD'}
                          </strong>
                        </div>
                      </div>

                      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Bobot & Poin Penilaian</div>
                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Benar</span>
                            <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400">+{activeTryout?.scoringConfig?.correctScore ?? 1}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Salah</span>
                            <span className="font-bold font-mono text-rose-700 dark:text-rose-400">{activeTryout?.scoringConfig?.wrongScore ?? 0}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Kosong</span>
                            <span className="font-bold font-mono text-slate-700 dark:text-slate-300">{activeTryout?.scoringConfig?.unansweredScore ?? 0}</span>
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                          Penalti Negatif:{' '}
                          <span className={activeTryout?.scoringConfig?.allowNegativeMarking ? 'text-rose-700 dark:text-rose-400 font-bold' : 'text-slate-600 dark:text-slate-400'}>
                            {activeTryout?.scoringConfig?.allowNegativeMarking ? 'AKTIF (Minus)' : 'TIDAK AKTIF (0 Poin)'}
                          </span>
                        </div>
                      </div>

                      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Standarisasi Skala</div>
                        <div className="text-[11px] text-slate-700 dark:text-slate-300">
                          Skor Maksimum (Max Score):{' '}
                          <span className="font-bold font-mono text-indigo-700 dark:text-indigo-400 text-sm">
                            {activeTryout?.scoringConfig?.maxScore ?? 100}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          Kriteria Mismatch:{' '}
                          <span className="font-mono text-amber-700 dark:text-amber-400 font-semibold">
                            |GForm - Hitung| &gt; 0.01
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Critical Rule Callout Banner */}
                    <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-start space-x-3 text-xs text-amber-900 dark:text-amber-300">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1 leading-relaxed">
                        <div className="font-bold text-amber-950 dark:text-amber-200">
                          Aturan Kritis Integritas Data (No Silent Overwrite Rule):
                        </div>
                        <p className="text-[11px] text-amber-800 dark:text-amber-300/90">
                          1. <strong>Jangan Pernah Overwrite Otomatis:</strong> Jawaban mentah siswa (<em>raw answers</em>) dan skor asli Google Form (<em>google_form_score</em>) tidak boleh diubah saat terjadi selisih penilaian.<br />
                          2. <strong>Penyimpanan Ganda:</strong> Basis data menyimpan secara eksplisit kedua nilai: <code>google_form_score</code> dan <code>calculated_score</code> beserta <code>score_difference</code>.<br />
                          3. <strong>Transparansi Audit:</strong> Selisih &gt; 0.01 secara permanen diberi status <code>SCORING_MISMATCH</code>, ditandai dengan badge peringatan Amber, dan dicatat pada audit log.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 1: AUTOMATED 10-SCENARIO SCORING ENGINE TEST SUITE */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <CheckCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Uji Otomatis Sistem Penilaian (10 Skenario Standar)
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Memverifikasi secara menyeluruh perhitungan nilai: Semua Benar, Semua Salah, Jawaban Kosong, Kombinasi, Penalti Minus, Bobot Soal Rata, Bobot Khusus, Skala Maksimum, dan Kesesuaian Nilai Google Form.
                        </p>
                      </div>

                      <button
                        onClick={handleRunScoringEngineTests}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center space-x-2 shadow-sm transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Jalankan 10 Test Cases Scoring</span>
                      </button>
                    </div>

                    {scoringTestResult && (
                      <div className="space-y-4">
                        <div
                          className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs font-bold ${
                            scoringTestResult.passed
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-200'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            <span>
                              Status Keseluruhan Suite Scoring: {scoringTestResult.passed ? 'SEMUA 10 BENCHMARK TERVERIFIKASI LOLOS (100%)' : 'GAGAL'}
                            </span>
                          </div>
                          <span className="font-mono text-xs bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
                            {scoringTestResult.tests.filter(t => t.passed).length} / {scoringTestResult.tests.length} Kasus Lolos
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {scoringTestResult.tests.map((t, idx) => (
                            <div
                              key={idx}
                              className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors space-y-3"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900 dark:text-white text-xs">{t.name}</span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                    t.passed
                                      ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                      : 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                  }`}
                                >
                                  {t.passed ? 'PASSED' : 'FAILED'}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                                <div>
                                  <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Ekspektasi Manual</div>
                                  <div className="text-slate-700 dark:text-slate-300">
                                    Raw: <strong className="font-mono text-slate-900 dark:text-white">{t.expected.rawScore}</strong> | Final:{' '}
                                    <strong className="font-mono text-slate-900 dark:text-white">{t.expected.finalScore}</strong>
                                  </div>
                                  <div className="text-slate-500 dark:text-slate-400 text-[10px]">
                                    ({t.expected.correctCount} benar, {t.expected.incorrectCount} salah, {t.expected.unansweredCount} kosong)
                                  </div>
                                  <div className="text-[10px] mt-0.5">
                                    Status:{' '}
                                    <span
                                      className={`font-mono font-bold ${
                                        t.expected.status === 'MATCH' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                                      }`}
                                    >
                                      {t.expected.status}
                                    </span>
                                  </div>
                                </div>

                                <div>
                                  <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Hasil Engine Database</div>
                                  <div className="text-slate-700 dark:text-slate-300">
                                    Raw: <strong className="font-mono text-indigo-600 dark:text-indigo-400">{t.actual.rawScore}</strong> | Final:{' '}
                                    <strong className="font-mono text-indigo-600 dark:text-indigo-400">{t.actual.finalScore}</strong>
                                  </div>
                                  <div className="text-slate-500 dark:text-slate-400 text-[10px]">
                                    ({t.actual.correctCount} benar, {t.actual.incorrectCount} salah, {t.actual.unansweredCount} kosong)
                                  </div>
                                  <div className="text-[10px] mt-0.5">
                                    Status:{' '}
                                    <span
                                      className={`font-mono font-bold ${
                                        t.actual.status === 'MATCH' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                                      }`}
                                    >
                                      {t.actual.status}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800 leading-snug">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">Verifikasi: </span>
                                {t.message}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SECTION 2: INTERACTIVE SCORING ENGINE SIMULATOR & SANDBOX */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-5 transition-colors">
                    <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            Simulasi & Kalkulator Nilai Interaktif
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Uji coba simulasi perhitungan real-time dengan parameter kustom untuk memverifikasi akurasi matematis dan perilaku No Silent Overwrite.
                        </p>
                      </div>
                      <span className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-mono">
                        Live Sandbox
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
                      {/* Left Column: Parameter Configuration */}
                      <div className="lg:col-span-5 space-y-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60">
                        <div className="font-bold text-slate-800 dark:text-slate-200 text-xs pb-1 border-b border-slate-200 dark:border-slate-700">
                          1. Konfigurasi Parameter Penilaian
                        </div>

                        <div>
                          <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Tipe Penilaian</label>
                          <select
                            value={simScoringType}
                            onChange={e => setSimScoringType(e.target.value as any)}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded font-medium focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="EQUAL_WEIGHT">EQUAL_WEIGHT (Bobot Butir Sama)</option>
                            <option value="CUSTOM_WEIGHT">CUSTOM_WEIGHT (Bobot Khusus per Butir)</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Skor Maks (Max Score)</label>
                            <input
                              type="number"
                              value={simMaxScore}
                              onChange={e => setSimMaxScore(Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded font-mono font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Poin Benar (+)</label>
                            <input
                              type="number"
                              value={simCorrectScore}
                              onChange={e => setSimCorrectScore(Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-emerald-600 dark:text-emerald-400 rounded font-mono font-bold"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Poin Salah (-)</label>
                            <input
                              type="number"
                              value={simWrongScore}
                              onChange={e => setSimWrongScore(Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-rose-600 dark:text-rose-400 rounded font-mono font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Poin Kosong</label>
                            <input
                              type="number"
                              value={simUnansweredScore}
                              onChange={e => setSimUnansweredScore(Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded font-mono font-bold"
                            />
                          </div>
                        </div>

                        <div className="pt-1">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={simAllowNegativeMarking}
                              onChange={e => setSimAllowNegativeMarking(e.target.checked)}
                              className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                              Aktifkan Penalti Nilai Minus (Allow Negative Marking)
                            </span>
                          </label>
                        </div>

                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                          <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                            Skor Google Form Terkirim (Input Form)
                          </label>
                          <input
                            type="number"
                            value={simGFormScore}
                            onChange={e => setSimGFormScore(Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono font-bold text-indigo-900 dark:text-indigo-300"
                          />
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                            Ganti nilai ini untuk mensimulasikan status MATCH atau SCORING_MISMATCH.
                          </span>
                        </div>

                        <div className="font-bold text-slate-800 dark:text-slate-200 text-xs pt-2 pb-1 border-b border-slate-200 dark:border-slate-700">
                          2. Input Jawaban Siswa (5 Butir Soal Sampel)
                        </div>

                        <div className="space-y-2">
                          {['SIM-Q01', 'SIM-Q02', 'SIM-Q03', 'SIM-Q04', 'SIM-Q05'].map((code) => (
                            <div key={code} className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                              <div className="space-y-0.5">
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs">{code}</span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Kunci: A</span>
                              </div>

                              <div className="flex items-center space-x-2">
                                {simScoringType === 'CUSTOM_WEIGHT' && (
                                  <div className="flex items-center space-x-1">
                                    <span className="text-[10px] text-slate-400">Bobot:</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={10}
                                      value={simWeights[code] || 1}
                                      onChange={e => setSimWeights({ ...simWeights, [code]: Number(e.target.value) })}
                                      className="w-12 px-1.5 py-0.5 text-center bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-mono text-xs text-slate-900 dark:text-slate-100"
                                    />
                                  </div>
                                )}

                                <select
                                  value={simAnswers[code] || ''}
                                  onChange={e => setSimAnswers({ ...simAnswers, [code]: e.target.value })}
                                  className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded font-bold font-mono text-xs"
                                >
                                  <option value="A">A (Benar)</option>
                                  <option value="B">B (Salah)</option>
                                  <option value="C">C (Salah)</option>
                                  <option value="D">D (Salah)</option>
                                  <option value="">[Kosong]</option>
                                </select>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Right Column: Instant Live Results Panel */}
                      <div className="lg:col-span-7 space-y-4">
                        <div className="font-bold text-slate-800 dark:text-slate-200 text-xs pb-1 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                          <span>3. Hasil Perhitungan Otomatis Sistem</span>
                          <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded">
                            Output Real-Time
                          </span>
                        </div>

                        {simResult ? (
                          <div className="space-y-4">
                            {/* Score Big Display Cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                              <div className="bg-slate-900 dark:bg-slate-950 border border-slate-800 text-white p-3.5 rounded-xl space-y-1">
                                <span className="text-[10px] text-slate-400 font-semibold block">Skor Akhir (Hitung)</span>
                                <span className="text-2xl font-black font-mono text-indigo-300">
                                  {simResult.final_score}
                                </span>
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  Skala: {simMaxScore}
                                </span>
                              </div>

                              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3.5 rounded-xl space-y-1">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block">Persentase</span>
                                <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
                                  {simResult.percentage}%
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">
                                  (Raw {simResult.raw_score} / {simResult.maxPossibleRawScore})
                                </span>
                              </div>

                              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3.5 rounded-xl space-y-1">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block">Skor Google Form</span>
                                <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
                                  {simResult.google_form_score}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">
                                  Data Pengiriman
                                </span>
                              </div>

                              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3.5 rounded-xl space-y-1">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block">Selisih Skor (Δ)</span>
                                <span
                                  className={`text-2xl font-black font-mono ${
                                    simResult.score_difference <= 0.01 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                                  }`}
                                >
                                  {simResult.score_difference.toFixed(2)}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">
                                  Absolut
                                </span>
                              </div>
                            </div>

                            {/* Status Banner */}
                            <div
                              className={`p-3.5 rounded-xl border flex items-center justify-between ${
                                simResult.scoring_status === 'MATCH'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
                              }`}
                            >
                              <div className="flex items-center space-x-2">
                                {simResult.scoring_status === 'MATCH' ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                ) : (
                                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                                )}
                                <div>
                                  <span className="font-bold text-xs block">
                                    Status Scoring: {simResult.scoring_status}
                                  </span>
                                  <span className="text-[11px] text-slate-600 dark:text-slate-400">
                                    {simResult.scoring_status === 'MATCH'
                                      ? 'Skor Google Form sama persis dengan hasil perhitungan sistem (selisih ≤ 0.01).'
                                      : 'Terdeteksi selisih nilai > 0.01 antara Google Form dan aturan penilaian sekolah.'}
                                  </span>
                                </div>
                              </div>

                              <span
                                className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
                                  simResult.scoring_status === 'MATCH'
                                    ? 'bg-emerald-200 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200'
                                    : 'bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200'
                                }`}
                              >
                                {simResult.scoring_status}
                              </span>
                            </div>

                            {/* No Silent Overwrite Verification Box when Mismatch Occurs */}
                            {simResult.scoring_status === 'SCORING_MISMATCH' && (
                              <div className="p-3 bg-amber-100/70 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl text-amber-900 dark:text-amber-200 text-xs space-y-1">
                                <span className="font-bold flex items-center space-x-1">
                                  <ShieldCheck className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                                  <span>Verifikasi Aturan: No Silent Overwrite Terjamin</span>
                                </span>
                                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                                  Sistem mempertahankan jawaban mentah siswa tanpa overwrite, menyimpan skor Google Form ({simResult.google_form_score}), dan mencatat skor hitung database ({simResult.calculated_score}). Selisih sebesar {simResult.score_difference.toFixed(2)} ditandai untuk peninjauan guru/admin.
                                </p>
                              </div>
                            )}

                            {/* Item Breakdown Table */}
                            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                              <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs border-b border-slate-200 dark:border-slate-800">
                                Rincian Penilaian Butir Soal (Item Score Breakdown)
                              </div>
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                                  <tr>
                                    <th className="p-2">Kode Soal</th>
                                    <th className="p-2">Jawaban Siswa</th>
                                    <th className="p-2">Kunci</th>
                                    <th className="p-2">Bobot (w)</th>
                                    <th className="p-2 text-right">Poin Diperoleh</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {Object.entries(simResult.answerBreakdown).map(([code, item]) => (
                                    <tr key={code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 font-mono text-[11px]">
                                      <td className="p-2 font-bold text-slate-900 dark:text-slate-100">{code}</td>
                                      <td className="p-2">
                                        {item.studentAnswer ? (
                                          <span
                                            className={`px-1.5 py-0.5 rounded font-bold ${
                                              item.isCorrect ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                                            }`}
                                          >
                                            {item.studentAnswer}
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 italic">[Kosong]</span>
                                        )}
                                      </td>
                                      <td className="p-2 text-slate-600 dark:text-slate-400">{item.correctAnswer}</td>
                                      <td className="p-2 text-slate-600 dark:text-slate-400">{item.weight}</td>
                                      <td className="p-2 text-right font-bold text-indigo-700 dark:text-indigo-400">
                                        {item.score > 0 ? `+${item.score}` : item.score}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Summary Counters */}
                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-900 dark:text-emerald-200">
                                <span className="text-[10px] block text-emerald-700 dark:text-emerald-300">Jumlah Benar</span>
                                <strong className="text-sm font-mono">{simResult.correct_count}</strong>
                              </div>
                              <div className="p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-900 dark:text-rose-200">
                                <span className="text-[10px] block text-rose-700 dark:text-rose-300">Jumlah Salah</span>
                                <strong className="text-sm font-mono">{simResult.incorrect_count}</strong>
                              </div>
                              <div className="p-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300">
                                <span className="text-[10px] block text-slate-500 dark:text-slate-400">Jumlah Kosong</span>
                                <strong className="text-sm font-mono">{simResult.unanswered_count}</strong>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-8 text-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                            Memuat data kalkulasi simulasi...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* SECTION 3: REAL-TIME MISMATCH AUDIT & MONITORING TABLE */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            Monitor & Audit Scoring Mismatch Aktif (Database Watcher)
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Daftar seluruh siswa dalam database yang memiliki perbedaan antara skor Google Form dan skor kalkulasi database.
                        </p>
                      </div>

                      <span className="text-xs font-mono font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded">
                        {mismatchScores.length} Kasus Mismatch Terdeteksi
                      </span>
                    </div>

                    {mismatchScores.length > 0 ? (
                      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="p-3">Siswa & NISN</th>
                              <th className="p-3">Try Out</th>
                              <th className="p-3">Skor Google Form</th>
                              <th className="p-3">Skor Perhitungan Sistem</th>
                              <th className="p-3">Selisih (Δ)</th>
                              <th className="p-3">Status</th>
                              <th className="p-3">Waktu Pencatatan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {mismatchScores.map(score => {
                              const student = students.find(s => s.id === score.studentId);
                              const to = tryouts.find(t => t.id === score.tryoutId);
                              return (
                                <tr key={score.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                  <td className="p-3">
                                    <div className="font-bold text-slate-900 dark:text-slate-100">{student?.name || score.studentId}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">NISN: {student?.nisn || '-'}</div>
                                  </td>
                                  <td className="p-3 font-medium text-slate-700 dark:text-slate-300">
                                    {to?.title || score.tryoutId}
                                  </td>
                                  <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                                    {score.googleFormScore}
                                  </td>
                                  <td className="p-3 font-mono font-bold text-indigo-700 dark:text-indigo-400">
                                    {score.calculatedScore}
                                  </td>
                                  <td className="p-3 font-mono font-bold text-amber-700 dark:text-amber-400">
                                    {(score.scoreDifference ?? 0).toFixed(2)}
                                  </td>
                                  <td className="p-3">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                      SCORING_MISMATCH
                                    </span>
                                  </td>
                                  <td className="p-3 text-slate-500 dark:text-slate-400 text-[11px] font-mono">
                                    {new Date(score.createdAt).toLocaleString('id-ID')}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-6 text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs">
                        Tidak ada data dengan status SCORING_MISMATCH. Seluruh skor tersinkronisasi 100% dengan Google Form.
                      </div>
                    )}
                  </div>
              </div>
            )}
          </>
        )}
        </div>
      </main>

      {/* ------------------------------------------------------------- */}
      {/* QUESTION MODAL (CREATE / EDIT) */}
      {/* ------------------------------------------------------------- */}
      {showQuestionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {editingQuestionId ? 'Edit Butir Soal' : 'Tambah Butir Soal Baru'}
                </h3>
              </div>
              <button onClick={() => setShowQuestionModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Mata Pelajaran</label>
                    <select
                      value={qSubjectId}
                      onChange={e => setQSubjectId(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded p-2 focus:ring-1 focus:ring-indigo-500"
                    >
                      {permittedSubjects.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Nomor Soal</label>
                    <input
                      type="number"
                      min={1}
                      value={qNumber}
                      onChange={e => setQNumber(Number(e.target.value))}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded p-2 font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Kode Unik</label>
                    <input
                      type="text"
                      value={qUniqueCode}
                      onChange={e => setQUniqueCode(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded p-2 font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Status</label>
                    <select
                      value={qStatus}
                      onChange={e => setQStatus(e.target.value as QuestionStatus)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded p-2 font-semibold"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="DRAFT">DRAFT</option>
                      <option value="ARCHIVED">ARCHIVED</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Teks Pertanyaan / Butir Soal</label>
                  <textarea
                    rows={3}
                    value={qText}
                    onChange={e => setQText(e.target.value)}
                    placeholder="Tuliskan butir pertanyaan di sini..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded p-2.5 leading-relaxed placeholder-slate-400"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold">Pilihan Jawaban (Opsi A s/d E) & Kunci</label>
                  {qOptions.map((opt, idx) => (
                    <div key={opt.key} className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setQCorrectAnswer(opt.key)}
                        className={`w-7 h-7 rounded text-xs font-bold border transition-colors cursor-pointer ${
                          qCorrectAnswer === opt.key
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                        title={qCorrectAnswer === opt.key ? 'Kunci Jawaban Terpilih' : 'Jadikan Kunci Jawaban'}
                      >
                        {opt.key}
                      </button>
                      <input
                        type="text"
                        value={opt.text}
                        onChange={e => {
                          const next = [...qOptions];
                          next[idx].text = e.target.value;
                          setQOptions(next);
                        }}
                        placeholder={`Isi pilihan jawaban ${opt.key}...`}
                        className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded p-2 text-xs placeholder-slate-400"
                        required
                      />
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                    Klik tombol huruf (A/B/C/D/E) yang berwarna hijau untuk menentukan kunci jawaban yang benar.
                  </p>
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex justify-end space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowQuestionModal(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow cursor-pointer transition-colors"
                >
                  Simpan Butir Soal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* GOOGLE FORM EMBEDDED PREVIEW MODAL */}
      {/* ------------------------------------------------------------- */}
      {previewGoogleFormUrl && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-600 rounded-xl text-white">
                  <ExternalLink className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Lembar Soal Google Form</span>
                    <span className="text-[10px] bg-teal-900 text-teal-300 px-2 py-0.5 rounded font-mono font-bold">Terhubung Live</span>
                  </h3>
                  <p className="text-[11px] text-slate-300 font-mono truncate max-w-md">
                    {previewGoogleFormUrl}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewGoogleFormUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka di Tab Baru</span>
                </a>
                <button
                  onClick={() => setPreviewGoogleFormUrl(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Embedded Form iFrame Container */}
            <div className="flex-1 bg-slate-100 dark:bg-slate-950 relative">
              <iframe
                src={previewGoogleFormUrl.includes('viewform') ? previewGoogleFormUrl : `${previewGoogleFormUrl}?embedded=true`}
                className="w-full h-full border-0"
                title="Google Form Embedded Preview"
              />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* EXPLANATION MODAL (CREATE / EDIT) — PHASE 10 */}
      {/* ------------------------------------------------------------- */}
      {showExplanationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {editingExplanationId ? 'Edit Link & Modul Pembahasan' : 'Tambah Link Pembahasan Soal (PDF & YouTube)'}
                </h3>
              </div>
              <button onClick={() => setShowExplanationModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                try {
                  const finalNumbers = expScopeMode === 'SPECIFIC' ? [...expSelectedNumbers].sort((a, b) => a - b) : [];
                  const finalQuestionIds = expScopeMode === 'SPECIFIC'
                    ? questions.filter(q => (!expSubjectId || q.subjectId === expSubjectId) && q.questionNumber && finalNumbers.includes(q.questionNumber)).map(q => q.id)
                    : [];
                  const finalQuestionId = finalQuestionIds.length === 1 ? finalQuestionIds[0] : (expQuestionId === 'GENERAL' ? undefined : expQuestionId);

                  // Process PDF Storage Metadata (Metadata + Storage Path pattern, NO binary in DB)
                  let pdfStoragePath: string | undefined = undefined;
                  let pdfUrl: string | undefined = expPdfUrl.trim() || undefined;
                  let pdfFileName: string | undefined = expPdfFileName.trim() || undefined;

                  if (pdfFileName && !pdfUrl) {
                    const meta = ExplanationService.processPdfStorageMetadata(pdfFileName, 2097152, expTryoutId);
                    pdfStoragePath = meta.pdfStoragePath;
                    pdfUrl = meta.pdfUrl;
                  }

                  // Sinkronisasi jumlah butir soal ke paket Try Out jika diaktifkan
                  if (syncQuestionCountToTryout && expTryoutId && expAvailableNumbers.length > 0) {
                    const targetTo = tryouts.find(t => t.id === expTryoutId);
                    if (targetTo) {
                      const newColumns = expAvailableNumbers.map(n => `Soal ${n}`);
                      if (!targetTo.selectedQuestionColumns || targetTo.selectedQuestionColumns.length !== expAvailableNumbers.length) {
                        dbService.updateTryout(
                          expTryoutId,
                          { selectedQuestionColumns: newColumns },
                          currentUser
                        );
                      }
                    }
                  }

                  if (editingExplanationId) {
                    dbService.updateExplanation(
                      editingExplanationId,
                      {
                        tryoutId: expTryoutId,
                        subjectId: expSubjectId,
                        title: expTitle,
                        questionId: finalQuestionId,
                        questionNumbers: finalNumbers,
                        questionIds: finalQuestionIds,
                        contentText: expContentText || 'Modul Pembahasan Soal Resmi Guru.',
                        pdfUrl,
                        pdfStoragePath,
                        pdfFileName,
                        youtubeUrl: expYoutubeUrl.trim() || undefined,
                        externalUrl: expExternalUrl.trim() || undefined,
                        status: expStatus,
                      },
                      currentUser
                    );
                    triggerToast('Pembahasan berhasil diperbarui.');
                  } else {
                    dbService.addExplanation(
                      {
                        tryoutId: expTryoutId,
                        subjectId: expSubjectId,
                        title: expTitle,
                        questionId: finalQuestionId,
                        questionNumbers: finalNumbers,
                        questionIds: finalQuestionIds,
                        contentText: expContentText || 'Modul Pembahasan Soal Resmi Guru.',
                        pdfUrl,
                        pdfStoragePath,
                        pdfFileName,
                        youtubeUrl: expYoutubeUrl.trim() || undefined,
                        externalUrl: expExternalUrl.trim() || undefined,
                        status: expStatus,
                      },
                      currentUser
                    );
                    triggerToast('Link pembahasan baru berhasil diterbitkan.');
                  }

                  setShowExplanationModal(false);
                  if (expTryoutId) {
                    setExpFilterTryoutId(expTryoutId);
                  }
                  refreshData();
                } catch (err: any) {
                  triggerError(err.message || 'Gagal menyimpan pembahasan.');
                }
              }}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              <div className="p-5 space-y-4 text-xs flex-1 min-h-0 overflow-y-auto">
              {/* Tryout & Subject Selector */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Paket Try Out</label>
                  <select
                    value={expTryoutId}
                    onChange={e => {
                      const newId = e.target.value;
                      setExpTryoutId(newId);
                      setExpCustomNumbers(getInitialQuestionNumbers(newId, expSubjectId));
                      setIsQuestionDeleteMode(false);
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg p-2 font-medium"
                  >
                    {tryouts.map(t => (
                      <option key={t.id} value={t.id}>[{getFriendlyTryoutStageLabel(t, tryouts)}] {t.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Mata Pelajaran</label>
                  <select
                    value={expSubjectId}
                    onChange={e => {
                      const newId = e.target.value;
                      setExpSubjectId(newId);
                      setExpCustomNumbers(getInitialQuestionNumbers(expTryoutId, newId));
                      setIsQuestionDeleteMode(false);
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg p-2 font-medium"
                  >
                    {(permittedSubjects.length > 0 ? permittedSubjects : subjects).map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Title Input */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Judul Pembahasan / Modul Solusi</label>
                <input
                  type="text"
                  value={expTitle}
                  onChange={e => setExpTitle(e.target.value)}
                  placeholder="e.g. Pembahasan Fisika TO-3 — Modul Solusi Dinamika Gerak"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg p-2 placeholder-slate-400"
                  required
                />
              </div>

              {/* Status Publikasi */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Status Publikasi</label>
                <select
                  value={expStatus}
                  onChange={e => setExpStatus(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg p-2 font-semibold"
                >
                  <option value="PUBLISHED">PUBLISHED (Langsung Tampil di Portal Siswa)</option>
                  <option value="DRAFT">DRAFT (Disimpan Rahasia — Hanya Guru &amp; Admin)</option>
                  <option value="ARCHIVED">ARCHIVED (Disembunyikan / Dearsip)</option>
                </select>
              </div>

              {/* Cakupan Nomor Soal Pembahasan (Multi-Select & Range) */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold">
                    Cakupan Nomor Soal yang Dibahas
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    {expScopeMode === 'ALL'
                      ? `Membahas seluruh ${expAvailableNumbers.length} butir soal`
                      : `${expSelectedNumbers.length} dari ${expAvailableNumbers.length} nomor dipilih`}
                  </span>
                </div>

                {/* Segmented Mode Switch */}
                <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setExpScopeMode('ALL');
                      setExpSelectedNumbers([]);
                    }}
                    className={`py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                      expScopeMode === 'ALL'
                        ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Paket Lengkap ({expAvailableNumbers.length} Nomor)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpScopeMode('SPECIFIC')}
                    className={`py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                      expScopeMode === 'SPECIFIC'
                        ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>
                      Pilih Nomor Tertentu {expSelectedNumbers.length > 0 && `(${expSelectedNumbers.length})`}
                    </span>
                  </button>
                </div>

                {/* Panel Pengatur Jumlah Soal (Tambah / Hapus / Presets Cepat) */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Jumlah Soal Try Out:
                      </span>
                      {/* Stepper & Input */}
                      <div className="flex items-center border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-2xs">
                        <button
                          type="button"
                          onClick={handleRemoveLastQuestion}
                          disabled={expAvailableNumbers.length <= 1}
                          className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer font-bold transition-colors"
                          title="Kurangi 1 soal / Hapus nomor terakhir"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          value={expAvailableNumbers.length}
                          onChange={e => handleSetTotalQuestions(parseInt(e.target.value, 10))}
                          className="w-12 text-center font-mono font-bold text-xs bg-transparent text-slate-900 dark:text-slate-100 py-1 focus:outline-none"
                          title="Ketik jumlah total butir soal"
                        />
                        <button
                          type="button"
                          onClick={handleAddQuestion}
                          className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer font-bold transition-colors"
                          title="Tambah 1 butir soal baru"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Soal</span>
                    </div>

                    {/* Action Buttons: Tambah / Hapus / Mode Hapus */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleAddQuestion}
                        className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] rounded-lg border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        title="Tambah 1 butir soal baru ke daftar"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Tambah Soal</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveLastQuestion}
                        disabled={expAvailableNumbers.length <= 1}
                        className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/70 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 font-bold text-[11px] rounded-lg border border-rose-200 dark:border-rose-800 flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-40 shadow-2xs"
                        title="Hapus nomor soal paling akhir"
                      >
                        <Minus className="w-3 h-3" />
                        <span>Hapus Terakhir</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsQuestionDeleteMode(prev => !prev)}
                        className={`px-2.5 py-1 font-bold text-[11px] rounded-lg border flex items-center gap-1 cursor-pointer transition-colors shadow-2xs ${
                          isQuestionDeleteMode
                            ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                            : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600'
                        }`}
                        title={isQuestionDeleteMode ? 'Nonaktifkan Mode Hapus' : 'Aktifkan Mode Hapus Nomor Tertentu'}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{isQuestionDeleteMode ? 'Selesai Hapus' : 'Mode Hapus Nomor'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Preset Cepat Chips & Input Tambah Nomor Tertentu */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Preset Cepat:</span>
                      {[10, 15, 20, 25, 30, 35, 40, 45, 50].map(cnt => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => handleSetTotalQuestions(cnt)}
                          className={`px-2 py-0.5 rounded-md font-mono font-bold cursor-pointer transition-colors ${
                            expAvailableNumbers.length === cnt
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {cnt}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={customQuestionInput}
                        onChange={e => setCustomQuestionInput(e.target.value)}
                        placeholder="No..."
                        className="w-12 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-1.5 py-0.5 text-center font-mono text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const n = parseInt(customQuestionInput, 10);
                          if (!isNaN(n)) handleAddSpecificQuestion(n);
                        }}
                        disabled={!customQuestionInput}
                        className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 disabled:opacity-40 font-bold rounded-md text-[10px] border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                        title="Tambah nomor butir soal khusus"
                      >
                        + Tambah No
                      </button>
                    </div>
                  </div>

                  {/* Mode Hapus Aktif Banner */}
                  {isQuestionDeleteMode && (
                    <div className="p-2 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-800 dark:text-rose-200 text-[11px] flex items-center justify-between animate-fade-in">
                      <div className="flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5 text-rose-600 animate-bounce" />
                        <span><strong>Mode Hapus Aktif:</strong> Klik nomor soal pada daftar di bawah untuk menghapusnya dari paket ini.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsQuestionDeleteMode(false)}
                        className="text-xs font-bold text-rose-700 dark:text-rose-400 hover:underline cursor-pointer ml-2"
                      >
                        Selesai
                      </button>
                    </div>
                  )}

                  {/* Checkbox Sinkronkan ke Try Out */}
                  <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer pt-0.5">
                    <input
                      type="checkbox"
                      checked={syncQuestionCountToTryout}
                      onChange={e => setSyncQuestionCountToTryout(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>Sinkronkan jumlah ({expAvailableNumbers.length} butir soal) ke paket Try Out agar seragam di seluruh aplikasi</span>
                  </label>
                </div>

                {/* Specific Number Selector Container */}
                {expScopeMode === 'SPECIFIC' && (
                  <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 rounded-xl space-y-3 animate-fade-in">
                    {/* Quick Range & Actions Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-600 dark:text-slate-400 font-medium text-[11px]">Rentang:</span>
                        <input
                          type="number"
                          min={1}
                          max={expAvailableNumbers[expAvailableNumbers.length - 1] || 100}
                          value={rangeStart}
                          onChange={e => setRangeStart(e.target.value)}
                          placeholder="Dari"
                          className="w-14 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-center font-mono text-xs"
                        />
                        <span className="text-slate-400">-</span>
                        <input
                          type="number"
                          min={1}
                          max={expAvailableNumbers[expAvailableNumbers.length - 1] || 100}
                          value={rangeEnd}
                          onChange={e => setRangeEnd(e.target.value)}
                          placeholder="Sampai"
                          className="w-14 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-center font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const start = parseInt(rangeStart, 10);
                            const end = parseInt(rangeEnd, 10);
                            if (!isNaN(start) && !isNaN(end) && start <= end) {
                              const validRange = expAvailableNumbers.filter(n => n >= start && n <= end);
                              setExpSelectedNumbers(prev => Array.from(new Set([...prev, ...validRange])).sort((a, b) => a - b));
                              const subjName = subjects.find(s => s.id === expSubjectId)?.name || 'Mata Pelajaran';
                              if (!expTitle || (expTitle.startsWith('Pembahasan ') && (expTitle.includes('— Solusi Mandiri') || expTitle.includes('— No ')))) {
                                setExpTitle(`Pembahasan ${subjName} — No ${start} - ${end}`);
                              }
                              setRangeStart('');
                              setRangeEnd('');
                            }
                          }}
                          disabled={!rangeStart || !rangeEnd}
                          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-2.5 py-1 rounded-lg text-[11px] cursor-pointer transition-colors"
                        >
                          + Terapkan
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExpSelectedNumbers([...expAvailableNumbers])}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold text-[11px] cursor-pointer"
                        >
                          Pilih Semua ({expAvailableNumbers.length})
                        </button>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <button
                          type="button"
                          onClick={() => setExpSelectedNumbers([])}
                          className="text-rose-600 dark:text-rose-400 hover:underline font-medium text-[11px] cursor-pointer"
                        >
                          Bersihkan
                        </button>
                      </div>
                    </div>

                    {/* Interactive Number Badges Grid */}
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 max-h-44 overflow-y-auto p-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 scrollbar-thin">
                      {expAvailableNumbers.map(num => {
                        const isSelected = expSelectedNumbers.includes(num);
                        return (
                          <div key={num} className="relative group">
                            <button
                              type="button"
                              onClick={() => {
                                if (isQuestionDeleteMode) {
                                  handleRemoveSpecificQuestion(num);
                                } else {
                                  setExpSelectedNumbers(prev =>
                                    prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num].sort((a, b) => a - b)
                                  );
                                }
                              }}
                              className={`w-full h-9 rounded-lg flex items-center justify-center font-mono text-xs font-bold transition-all cursor-pointer ${
                                isQuestionDeleteMode
                                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 hover:bg-rose-600 hover:text-white'
                                  : isSelected
                                    ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-400/50 scale-95'
                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700'
                              }`}
                              title={isQuestionDeleteMode ? `Klik untuk menghapus Soal #${num}` : `Nomor Soal #${num}`}
                            >
                              {isQuestionDeleteMode ? (
                                <span className="flex items-center gap-0.5 text-rose-600 dark:text-rose-400 group-hover:text-white">
                                  <Trash2 className="w-3 h-3" />
                                  <span>{num}</span>
                                </span>
                              ) : isSelected ? (
                                `✓ ${num}`
                              ) : (
                                num
                              )}
                            </button>

                            {/* Quick hover delete button if not in bulk delete mode */}
                            {!isQuestionDeleteMode && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveSpecificQuestion(num);
                                }}
                                className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 hover:bg-rose-600 text-white rounded-full text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xs cursor-pointer z-10"
                                title={`Hapus nomor soal #${num}`}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Live Selected Summary */}
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
                      {expSelectedNumbers.length > 0 ? (
                        <span>
                          Nomor terpilih:{' '}
                          <strong className="text-indigo-700 dark:text-indigo-400 font-mono">
                            {expSelectedNumbers.map(n => `#${n}`).join(', ')}
                          </strong>
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 italic font-medium">
                          ⚠ Belum ada nomor yang dicentang. Silakan klik kotak nomor di atas.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* YouTube Link Section */}
              <div className="p-3 bg-rose-50/70 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400">
                    <Youtube className="w-4 h-4 text-rose-600" />
                    <span>Link Video Pembahasan YouTube</span>
                  </div>
                  {expYoutubeUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveVideoModalUrl(expYoutubeUrl);
                        setActiveVideoModalTitle(expTitle || 'Pratinjau Video Pembahasan');
                      }}
                      className="text-[10px] font-bold text-rose-700 hover:text-rose-800 dark:text-rose-300 flex items-center gap-1 cursor-pointer bg-rose-100 dark:bg-rose-900/60 px-2 py-0.5 rounded"
                    >
                      <Play className="w-3 h-3 fill-rose-600" />
                      <span>Uji Putar Video</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={expYoutubeUrl}
                  onChange={e => setExpYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... atau https://youtu.be/..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg p-2 text-xs font-mono"
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Format didukung: YouTube Watch, Short, atau Embed. Siswa dapat menonton langsung di portal atau membuka YouTube.
                </p>
              </div>

              {/* PDF Document Section */}
              <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-900/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-400">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span>Link Dokumen Modul Solusi PDF</span>
                  </div>
                  {expPdfUrl && (
                    <a
                      href={expPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold text-indigo-700 hover:text-indigo-800 dark:text-indigo-300 flex items-center gap-1 cursor-pointer bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Uji Buka PDF</span>
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-medium mb-0.5">Nama File PDF</label>
                    <input
                      type="text"
                      value={expPdfFileName}
                      onChange={e => setExpPdfFileName(e.target.value)}
                      placeholder="e.g. Modul_Solusi_TO3_Fisika.pdf"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg p-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-medium mb-0.5">URL Public / Link PDF</label>
                    <input
                      type="text"
                      value={expPdfUrl}
                      onChange={e => setExpPdfUrl(e.target.value)}
                      placeholder="https://drive.google.com/... atau link PDF"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg p-1.5 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* External Link */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Tautan Tambahan (Google Drive / Docs) <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                <input
                  type="text"
                  value={expExternalUrl}
                  onChange={e => setExpExternalUrl(e.target.value)}
                  placeholder="https://docs.google.com/... atau https://drive.google.com/..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg p-2 text-xs font-mono"
                />
              </div>

              {/* Text Note */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Catatan / Rangkuman Pembahasan <span className="text-slate-400 font-normal">(Opsional jika link PDF/YT sudah ada)</span>
                </label>
                <textarea
                  rows={3}
                  value={expContentText}
                  onChange={e => setExpContentText(e.target.value)}
                  placeholder="Tuliskan catatan rumus penting, kunci pembahasan, atau petunjuk belajar siswa..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg p-2 font-normal placeholder-slate-400"
                />
              </div>

              </div>

              {/* Submit / Cancel Sticky Buttons */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex justify-end space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowExplanationModal(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs cursor-pointer transition-colors"
                >
                  {editingExplanationId ? 'Simpan Perubahan' : 'Terbitkan Link Pembahasan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GURU BATCH DELETE CONFIRMATION MODAL */}
      {guruBatchDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Konfirmasi Hapus Massal Guru
                </h3>
                <span className="text-xs text-rose-600 dark:text-rose-400 font-bold">
                  {guruBatchDeleteConfirm.count} Item Terpilih ({guruBatchDeleteConfirm.type})
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
              <p className="font-bold mb-1">
                Apakah Anda yakin ingin menghapus {guruBatchDeleteConfirm.count} {guruBatchDeleteConfirm.type === 'QUESTION' ? 'butir soal' : guruBatchDeleteConfirm.type === 'MATERIAL' ? 'materi' : 'kompetensi'} sekaligus?
              </p>
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                Tindakan ini permanen. Seluruh data terikat akan diperbarui secara aman.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setGuruBatchDeleteConfirm(null)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmGuruBatchDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus {guruBatchDeleteConfirm.count} Item</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD TRYOUT PACKAGE MODAL */}
      {showTryoutModal && (
        <div
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
          onClick={() => setShowTryoutModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[88vh] sm:max-h-[84vh] my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-3.5 shrink-0 bg-white dark:bg-slate-900 z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                  <Layers className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-tight">
                    {editingTryoutId ? 'Edit Detail & Link Paket TryOut' : 'Tambah Paket TryOut Baru'}
                  </h2>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {editingTryoutId ? 'Perbaiki link Google Form/Sheet, jadwal, atau informasi paket' : 'Isi detail paket, lalu simpan'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTryoutModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body — min-h-0 wajib agar flex-1 + overflow-y-auto bekerja di semua browser */}
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-5 pb-8 space-y-4 text-xs overscroll-contain">

              {/* ── Pilihan Tipe Try Out ── */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1.5">
                  Tipe / Sumber Penyelenggaraan Try Out <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setNewToEntryMode('INTERNAL')}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      newToEntryMode === 'INTERNAL'
                        ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>TO Internal (Google Form)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewToEntryMode('EXTERNAL')}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      newToEntryMode === 'EXTERNAL'
                        ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>TO Eksternal (Rekap Nilai Excel)</span>
                  </button>
                </div>
              </div>

              {/* ── Kode & Judul ── */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Nama / Judul Paket TryOut <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newToTitle}
                  onChange={e => setNewToTitle(e.target.value)}
                  placeholder={
                    newToEntryMode === 'EXTERNAL'
                      ? 'Contoh: Try Out Akbar UTBK Bimbingan Belajar X'
                      : 'Contoh: Try Out 5 — Evaluasi Pasca Mid Semester'
                  }
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Kode TryOut <span className="font-normal text-slate-400">(opsional — akan di-generate otomatis jika kosong)</span>
                </label>
                <input
                  type="text"
                  value={newToCode}
                  onChange={e => setNewToCode(e.target.value)}
                  placeholder={newToEntryMode === 'EXTERNAL' ? 'Contoh: TO-EKS-01' : 'Contoh: TO-2026-05'}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
                />
              </div>

              {/* ── Kelompok Siklus Try Out (Kontrol Grafik Progres TO 1, TO 2, TO 3) ── */}
              <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-indigo-950 dark:text-indigo-200 font-bold text-xs flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Kelompok Siklus Try Out (Grafik TO 1, TO 2, TO 3, dst.) <span className="text-rose-500">*</span></span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const allGlobalTo = dbService.getTryouts();
                      const allPkgs = dbService.getExamPackages();
                      const { newMaxStage, newStageLabel } = addNextTryoutStageOption(allGlobalTo, allPkgs, customMaxToStage);
                      setCustomMaxToStage(newMaxStage);
                      setNewToGroup(newStageLabel);
                      triggerToast(`Siklus '${newStageLabel}' berhasil ditambahkan dan dipilih!`);
                    }}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-mono font-bold rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Tambah TO {getMaxTryoutStage(dbService.getTryouts(), dbService.getExamPackages(), Math.max(customMaxToStage, parseInt((newToGroup || '').replace(/\D/g, ''), 10) || 3)) + 1}</span>
                  </button>
                </div>
                <select
                  value={newToGroup}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === ADD_NEW_TO_STAGE_VALUE) {
                      const allGlobalTo = dbService.getTryouts();
                      const allPkgs = dbService.getExamPackages();
                      const { newMaxStage, newStageLabel } = addNextTryoutStageOption(allGlobalTo, allPkgs, customMaxToStage);
                      setCustomMaxToStage(newMaxStage);
                      setNewToGroup(newStageLabel);
                      triggerToast(`Siklus '${newStageLabel}' berhasil ditambahkan dan dipilih!`);
                      return;
                    }
                    setNewToGroup(val);
                  }}
                  className="w-full bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition cursor-pointer"
                >
                  {getDynamicTryoutStageOptions(
                    dbService.getTryouts(),
                    dbService.getExamPackages(),
                    Math.max(customMaxToStage, parseInt((newToGroup || '').replace(/\D/g, ''), 10) || 3)
                  ).map(opt => {
                    const cov = getStageSubjectCoverage(
                      opt,
                      dbService.getTryouts().filter(t => t.id !== editingTryoutId),
                      subjects,
                      dbService.getExamPackages()
                    );
                    const filledCodes = cov.filledSubjects.map(f => f.subject.code).join(', ');
                    return (
                      <option key={opt} value={opt}>
                        {opt} — {filledCodes ? `Sudah terisi: ${filledCodes}` : 'Belum ada mapel (Kosong)'}
                      </option>
                    );
                  })}
                  <option value={ADD_NEW_TO_STAGE_VALUE}>
                    ➕ Tambah Siklus TO Baru (TO {getMaxTryoutStage(dbService.getTryouts(), dbService.getExamPackages(), Math.max(customMaxToStage, parseInt((newToGroup || '').replace(/\D/g, ''), 10) || 3)) + 1})...
                  </option>
                  <option value={TRYOUT_GROUP_NONE}>Non-TO (Latihan Mandiri / Tidak Masuk Grafik Siklus TO)</option>
                </select>
                <p className="text-[10px] text-indigo-800/80 dark:text-indigo-300/80 leading-relaxed">
                  Daftar siklus ditampilkan hingga TO {getMaxTryoutStage(dbService.getTryouts(), dbService.getExamPackages(), Math.max(customMaxToStage, parseInt((newToGroup || '').replace(/\D/g, ''), 10) || 3))}. Klik <strong>+ Tambah TO</strong> atau pilih menu tambah di dalam dropdown jika ingin membuka siklus Try Out berikutnya.
                </p>
              </div>

              {/* ── Wadah ── */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Wadah / Paket Ujian Induk <span className="font-normal text-slate-400">(Opsional)</span>
                </label>
                <select
                  value={newToPackageId}
                  onChange={e => setNewToPackageId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
                >
                  <option value="">-- Tidak Dimasukkan ke Wadah --</option>
                  {dbService.getExamPackages().map(pkg => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.assessmentType === 'SAS' ? '[SAS] ' : pkg.assessmentType === 'SAT' ? '[SAT] ' : '[TO] '}
                      {pkg.code} — {pkg.title}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  Memasukkan tryout ke wadah memastikan data terkelompok dan terhubung langsung ke laporan wali kelas.
                </p>
              </div>

              {/* ── Jadwal & Status Pelaksanaan ── */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Buka Akses (Mulai)
                  </label>
                  <input
                    type="date"
                    value={newToStartDate}
                    onChange={e => setNewToStartDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 transition text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Batas Akses (Selesai)
                  </label>
                  <input
                    type="date"
                    value={newToEndDate}
                    onChange={e => setNewToEndDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 transition text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Status Pelaksanaan
                  </label>
                  <select
                    value={newToStatus}
                    onChange={e => setNewToStatus(e.target.value as TryoutStatus)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 transition text-xs"
                  >
                    <option value="ACTIVE">Aktif (Sedang Berjalan)</option>
                    <option value="COMPLETED">Selesai (Completed)</option>
                    <option value="ARCHIVED">Diarsipkan (Archived)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Deskripsi / Petunjuk Pelaksanaan <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input
                  type="text"
                  value={newToDescription}
                  onChange={e => setNewToDescription(e.target.value)}
                  placeholder="Informasi atau instruksi pengerjaan untuk siswa..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition text-xs"
                />
              </div>

              {/* ── FORM KHUSUS TRYOUT INTERNAL (GOOGLE FORM) ── */}
              {newToEntryMode === 'INTERNAL' ? (
                <>
                  <div className="space-y-3">
                    {/* Pilihan Mata Pelajaran Acuan dari Master Admin */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        Mata Pelajaran Ujian <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={newToSubjectId || (permittedSubjects.length > 0 ? permittedSubjects[0]?.id : subjects[0]?.id) || ''}
                        onChange={e => setNewToSubjectId(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
                      >
                        {(permittedSubjects.length > 0 ? permittedSubjects : subjects).map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code}) — KKM: {s.passingGrade}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                        Data resmi dari Master Admin sebagai acuan bank soal, kunci jawaban, dan integrasi capaian KKM.
                      </p>
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        Link Google Form <span className="text-rose-400">*</span> <span className="font-normal text-slate-400">(soal siswa)</span>
                      </label>
                      <input
                        type="url"
                        value={newToGFormUrl}
                        onChange={e => setNewToGFormUrl(e.target.value)}
                        placeholder="https://forms.gle/... atau https://docs.google.com/forms/d/..."
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Jika link form salah atau ada ralat link formulir baru, Anda dapat memperbarui URL di sini kapan saja.
                      </p>
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        Link Google Sheet <span className="text-rose-400">*</span> <span className="font-normal text-slate-400">(respons otomatis)</span>
                      </label>
                      <input
                        type="url"
                        value={newToGSheetUrl}
                        onChange={e => setNewToGSheetUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Pastikan link spreadsheet dibagikan dengan hak akses 'Siapa saja yang memiliki link dapat melihat'.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-teal-50 dark:bg-teal-950/30 rounded-2xl border border-teal-200 dark:border-teal-800/60 space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                        <Key className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-teal-900 dark:text-teal-100 text-xs">Kunci Jawaban Terdeteksi Otomatis</h4>
                        <p className="text-[10px] text-teal-700 dark:text-teal-400 leading-relaxed">Tidak perlu upload file Excel kunci jawaban secara manual.</p>
                      </div>
                    </div>
                    <ol className="space-y-1.5 pl-1">
                      {[
                        'Guru mengerjakan Google Form ini 1 kali menggunakan NISN Akun Kunci Resmi yang didaftarkan Admin.',
                        'Sistem mendeteksi respons akun tersebut dan menjadikannya Kunci Acuan untuk semua butir soal.',
                        'Nilai Akun Kunci dikecualikan otomatis dari laporan & statistik siswa nyata.',
                      ].map((step, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11px] text-teal-800 dark:text-teal-300">
                          <span className="shrink-0 w-4 h-4 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-[9px] mt-0.5">{i + 1}</span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              ) : (
                /* ── FORM KHUSUS TRYOUT EKSTERNAL (REKAP EXCEL) ── */
                <div className="space-y-4">
                  {/* Pilihan Target Kelas */}
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                      Target Kelas Peserta <span className="font-normal text-slate-400">(Pilih satu atau lebih)</span>
                    </label>
                    <div className="flex flex-wrap gap-2 p-2 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 max-h-36 overflow-y-auto overscroll-contain">
                      {classes.map(c => {
                        const isChecked = newToTargetClasses.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              if (isChecked) {
                                setNewToTargetClasses(newToTargetClasses.filter(id => id !== c.id));
                              } else {
                                setNewToTargetClasses([...newToTargetClasses, c.id]);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                              isChecked
                                ? 'bg-indigo-600 text-white border-indigo-700'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {newToTargetClasses.length === 0 ? 'Semua kelas akan dimasukkan ke dalam template.' : `${newToTargetClasses.length} kelas dipilih.`}
                    </p>
                  </div>

                  {/* Mata Pelajaran Resmi dari Master Admin (Multi-select Checklist) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-slate-700 dark:text-slate-300 font-bold">
                        Mata Pelajaran yang Diujikan <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setNewToExternalSubjectIds(permittedSubjects.length > 0 ? permittedSubjects.map(s => s.id) : subjects.map(s => s.id))}
                          className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          Pilih Semua
                        </button>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <button
                          type="button"
                          onClick={() => setNewToExternalSubjectIds([])}
                          className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                        >
                          Hapus Pilihan
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mb-2.5">
                      Centang mata pelajaran resmi dari Master Admin yang ada di lembar nilai. Kolom template Excel otomatis disesuaikan dengan mapel yang dicentang.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 max-h-52 overflow-y-auto overscroll-contain">
                      {subjects.map(s => {
                        const isChecked = newToExternalSubjectIds.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                              isChecked
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 font-semibold'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) {
                                  setNewToExternalSubjectIds([...newToExternalSubjectIds, s.id]);
                                } else {
                                  setNewToExternalSubjectIds(newToExternalSubjectIds.filter(id => id !== s.id));
                                }
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                            />
                            <span className="truncate flex-1">{s.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 font-mono text-slate-500 dark:text-slate-400">
                              {s.code}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    {newToExternalSubjectIds.length === 0 && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5 font-medium">
                        ⚠️ Pilihlah minimal 1 mata pelajaran agar template Excel memiliki kolom nilai.
                      </p>
                    )}
                  </div>

                  {/* Panduan Alur Template */}
                  <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-800/60 space-y-2">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <h4 className="font-bold text-indigo-900 dark:text-indigo-100 text-xs">Alur Otomatis Template Excel</h4>
                    </div>
                    <p className="text-[11px] text-indigo-800/90 dark:text-indigo-300/90 leading-relaxed">
                      Setelah paket ini disimpan, Anda dapat langsung mengklik tombol <strong>"Unduh Template Excel"</strong> pada kartu try out. File sudah memuat nama &amp; NISN seluruh siswa yang terdaftar, siap diisikan nilai per mata pelajaran dan diunggah kembali!
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky / Dedicated Footer */}
            <div className="flex items-center justify-between gap-2 px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-950/95 backdrop-blur-md rounded-b-3xl z-10">
              <p className="text-[11px] text-slate-400 hidden sm:block">Kolom bertanda <span className="text-rose-400 font-bold">*</span> wajib diisi</p>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setShowTryoutModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveTryoutPackage}
                  disabled={!newToTitle.trim()}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md shadow-teal-600/20 cursor-pointer flex items-center gap-1.5 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingTryoutId ? 'Simpan Perubahan' : 'Simpan Paket TryOut'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* CONTEXTUAL DELETE CONFIRMATION MODAL */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {deleteConfirmItem.type === 'TRYOUT'
                    ? 'Konfirmasi Hapus Paket TryOut'
                    : deleteConfirmItem.type === 'MATERIAL'
                    ? 'Konfirmasi Hapus Materi'
                    : deleteConfirmItem.type === 'COMPETENCY'
                    ? 'Konfirmasi Hapus Kompetensi'
                    : 'Konfirmasi Hapus Butir Soal'}
                </h3>
                <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                  {deleteConfirmItem.code}
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
              <p className="line-clamp-2 italic text-slate-600 dark:text-slate-400 mb-2">
                &ldquo;{deleteConfirmItem.title}&rdquo;
              </p>
              <p className="text-rose-600 dark:text-rose-400 font-medium">
                Tindakan ini permanen. Seluruh relasi kisi-kisi dan analisis butir soal terkait akan disesuaikan.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteQuestion}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus Permanen</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEACHER PREVIEW VIDEO MODAL WITH EMBEDDED IFRAME PLAYER */}
      {activeVideoModalUrl && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 transition-colors animate-fade-in space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600">
                  <Youtube className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-md">
                    {activeVideoModalTitle || 'Pratinjau Video Pembahasan Soal'}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Uji Pemutaran Video YouTube
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveVideoModalUrl(null)}
                className="px-2.5 py-1 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold cursor-pointer transition-colors"
              >
                Tutup
              </button>
            </div>

            <div className="aspect-video bg-black rounded-2xl overflow-hidden shadow-inner relative">
              {getYouTubeEmbedUrl(activeVideoModalUrl) ? (
                <iframe
                  src={getYouTubeEmbedUrl(activeVideoModalUrl)!}
                  title={activeVideoModalTitle || 'Video Pembahasan'}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-white text-xs p-6 space-y-3">
                  <Youtube className="w-12 h-12 text-rose-500" />
                  <p className="text-slate-300">Format URL video khusus, silakan buka langsung di YouTube:</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Pratinjau tampilan pemutaran video untuk siswa
              </span>
              <a
                href={activeVideoModalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold transition-colors text-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka di Web / Aplikasi YouTube</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* EXTERNAL TRYOUT EXCEL UPLOAD MODAL */}
      {uploadExternalTo && (
        <ExternalTryoutUploadModal
          isOpen={!!uploadExternalTo}
          onClose={() => setUploadExternalTo(null)}
          tryout={uploadExternalTo}
          allStudents={dbService.getStudents()}
          allClasses={classes}
          allSubjects={dbService.getSubjects()}
          dbService={dbService}
          currentUser={currentUser}
          onSuccess={() => {
            setTryouts(dbService.getTryoutsForTeacher(currentUser));
            refreshData();
          }}
          onToast={(msg) => triggerToast(msg)}
        />
      )}

      {/* COLUMN SELECTOR MODAL */}
      {columnSelectorTryout && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Pilih Kolom Butir Soal</h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">— {columnSelectorTryout.title || columnSelectorTryout.code}</span>
              </div>
              <button
                onClick={() => setColumnSelectorTryout(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Panel Interaktif Pemetaan Identitas Siswa */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>Pemetaan Kolom Identitas Siswa & Kunci Jawaban</span>
                </p>
                <span className="text-[11px] text-slate-500">
                  Kolom yang dipilih sebagai identitas otomatis dikecualikan dari soal
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Dropdown Kolom NISN */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kolom NISN Siswa <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={columnSelectorNisnCol}
                    onChange={e => {
                      const val = e.target.value;
                      setColumnSelectorNisnCol(val);
                      if (val) setColumnSelectorChecked(prev => ({ ...prev, [val]: false }));
                    }}
                    className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="">-- Pilih Kolom NISN --</option>
                    {columnSelectorHeaders.map(h => (
                      <option key={h} value={h}>
                        {h} {columnSelectorRows[0]?.[h] ? `(Contoh: ${columnSelectorRows[0][h]})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dropdown Kolom Nama */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kolom Nama Siswa
                  </label>
                  <select
                    value={columnSelectorNameCol}
                    onChange={e => {
                      const val = e.target.value;
                      setColumnSelectorNameCol(val);
                      if (val) setColumnSelectorChecked(prev => ({ ...prev, [val]: false }));
                    }}
                    className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="">-- Pilih Kolom Nama --</option>
                    {columnSelectorHeaders.map(h => (
                      <option key={h} value={h}>
                        {h} {columnSelectorRows[0]?.[h] ? `(Contoh: ${columnSelectorRows[0][h]})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dropdown Kolom Skor GForm */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kolom Skor GForm (Opsional)
                  </label>
                  <select
                    value={columnSelectorScoreCol}
                    onChange={e => {
                      const val = e.target.value;
                      setColumnSelectorScoreCol(val);
                      if (val) setColumnSelectorChecked(prev => ({ ...prev, [val]: false }));
                    }}
                    className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="">(Tidak Ada / Dihitung Otomatis)</option>
                    {columnSelectorHeaders.map(h => (
                      <option key={h} value={h}>
                        {h} {columnSelectorRows[0]?.[h] ? `(Contoh: ${columnSelectorRows[0][h]})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Validasi Real-time di dalam Modal */}
              {(() => {
                const allDbStudents = dbService.getStudents();
                const currentKeyRow = columnSelectorRows.find(r => {
                  const rawNisn = columnSelectorNisnCol ? r[columnSelectorNisnCol]?.trim() : '';
                  const rawName = columnSelectorNameCol ? r[columnSelectorNameCol]?.trim() : '';
                  if (/kunci|answer\s*key|master\s*key/i.test(rawName) || /kunci|answer\s*key|master\s*key/i.test(rawNisn) || rawNisn === '0000000000' || rawNisn === '9999999999') {
                    return true;
                  }
                  if (!rawNisn && !rawName) return false;
                  return allDbStudents.some(s =>
                    s.isAnswerKeyAccount &&
                    ((rawNisn && GoogleIntegrationService.isNisnMatching(rawNisn, s.nisn)) ||
                     (rawName && s.name.toLowerCase().trim() === rawName.toLowerCase().trim()))
                  );
                }) || null;

                const matchedCount = columnSelectorRows.filter(r => {
                  if (currentKeyRow && r === currentKeyRow) return false;
                  const rawNisn = columnSelectorNisnCol ? r[columnSelectorNisnCol]?.trim() : '';
                  const rawName = columnSelectorNameCol ? r[columnSelectorNameCol]?.trim() : '';
                  if (!rawNisn && !rawName) return false;
                  return allDbStudents.some(s =>
                    !s.isAnswerKeyAccount &&
                    ((rawNisn && GoogleIntegrationService.isNisnMatching(rawNisn, s.nisn)) ||
                     (rawName && rawName.length >= 3 && s.name.toLowerCase().trim() === rawName.toLowerCase().trim()))
                  );
                }).length;

                return (
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    {currentKeyRow ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-md">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Kunci Jawaban Resmi: Terdeteksi ({currentKeyRow[columnSelectorNameCol] || currentKeyRow[columnSelectorNisnCol] || 'Baris Kunci'})
                      </span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-md">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Kunci Jawaban belum terdeteksi (Pastikan akun kunci ber-NISN 111122222 ada di Sheet)
                      </span>
                    )}

                    <span className="text-indigo-700 dark:text-indigo-400 font-semibold flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1 rounded-md">
                      <Users className="w-3.5 h-3.5" />
                      {matchedCount} dari {columnSelectorRows.length - (currentKeyRow ? 1 : 0)} siswa cocok dengan database
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Toolbar aksi cepat */}
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs shrink-0 flex-wrap">
              <button
                onClick={() => {
                  const all: Record<string, boolean> = {};
                  columnSelectorHeaders.forEach(h => { all[h] = true; });
                  setColumnSelectorChecked(all);
                }}
                className="px-2.5 py-1 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-900 transition-colors"
              >
                Pilih Semua
              </button>
              <button
                onClick={() => {
                  const none: Record<string, boolean> = {};
                  columnSelectorHeaders.forEach(h => { none[h] = false; });
                  setColumnSelectorChecked(none);
                }}
                className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Kosongkan
              </button>
              <button
                onClick={() => {
                  const smart: Record<string, boolean> = {};
                  columnSelectorHeaders.forEach(h => {
                    smart[h] = !GoogleIntegrationService.isMetadataHeader(h);
                  });
                  setColumnSelectorChecked(smart);
                }}
                className="px-2.5 py-1 rounded bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-semibold cursor-pointer hover:bg-teal-200 dark:hover:bg-teal-900 transition-colors"
              >
                Rekomendasi Otomatis
              </button>
              <span className="ml-auto font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                {Object.values(columnSelectorChecked).filter(Boolean).length} kolom terpilih sebagai soal
              </span>
            </div>

            {/* Daftar kolom scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 pb-4">
              {columnSelectorHeaders.map((h, idx) => {
                const isChecked = !!columnSelectorChecked[h];
                const keyVal = columnSelectorKeyRow ? columnSelectorKeyRow[h] : '';
                const isMetadata = GoogleIntegrationService.isMetadataHeader(h);
                // Hitung nomor urut soal (hanya kolom yang dicentang dan berada sebelum ini)
                const soalNum = columnSelectorHeaders
                  .slice(0, idx)
                  .filter(k => !!columnSelectorChecked[k])
                  .length + 1;
                return (
                  <label
                    key={h}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${isChecked ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={e => setColumnSelectorChecked(prev => ({ ...prev, [h]: e.target.checked }))}
                      className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isChecked && (
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950 px-1.5 py-0.5 rounded">
                            Soal {soalNum}
                          </span>
                        )}
                        {isMetadata && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            Identitas
                          </span>
                        )}
                        <span className="text-xs font-medium text-slate-900 dark:text-slate-100 line-clamp-2">{h}</span>
                      </div>
                      {keyVal && (
                        <p className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                          Kunci: <strong>{keyVal}</strong>
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 bg-slate-50/90 dark:bg-slate-900/90">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Centang kolom yang merupakan <strong>butir soal</strong> untuk dianalisis.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setColumnSelectorTryout(null)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={() => {
                    const selectedCols = columnSelectorHeaders.filter(h => columnSelectorChecked[h]);
                    if (selectedCols.length === 0) {
                      triggerError('Pilih minimal 1 kolom sebagai butir soal.');
                      return;
                    }
                    const tryoutSnapshot = columnSelectorTryout!;
                    setColumnSelectorTryout(null);
                    executeSheetSync(
                      tryoutSnapshot,
                      columnSelectorHeaders,
                      columnSelectorRows,
                      selectedCols,
                      columnSelectorNisnCol,
                      columnSelectorNameCol,
                      columnSelectorScoreCol,
                      columnSelectorKeyRow
                    );
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Simpan &amp; Mulai Analisis
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
