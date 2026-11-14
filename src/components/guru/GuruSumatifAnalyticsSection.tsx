import React, { useState, useMemo } from 'react';
import {
  Award, BarChart3, CheckCircle2, AlertTriangle, FileSpreadsheet,
  Download, Filter, Search, School, BookOpen, Users, HelpCircle,
  TrendingUp, CheckSquare, Sparkles, ChevronRight, Info
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import { ExamPackage, ClassRoom, Subject, Student, Score, Question, Answer, Material, Competency, Tryout, User } from '../../types/database';
import { SumatifAnalyticsService, TeacherSumatifAnalytics } from '../../services/sumatifAnalytics';
import { AnalyticsService, QuestionAnalysisResult } from '../../services/analytics';
import { ExportService } from '../../services/export';
import { DatabaseService } from '../../services/database';

interface GuruSumatifAnalyticsSectionProps {
  packages: ExamPackage[];
  selectedPackageId: string;
  onSelectPackageId: (id: string) => void;
  activeSubject: Subject | null;
  classes: ClassRoom[];
  students: Student[];
  scores: Score[];
  questions: Question[];
  answers: Answer[];
  subjects: Subject[];
  materials?: Material[];
  competencies?: Competency[];
  tryouts?: Tryout[];
  dbService?: DatabaseService;
  currentUser?: User;
  onShowToast: (msg: string) => void;
}

export const GuruSumatifAnalyticsSection: React.FC<GuruSumatifAnalyticsSectionProps> = ({
  packages,
  selectedPackageId,
  onSelectPackageId,
  activeSubject,
  classes,
  students,
  scores,
  questions,
  answers,
  subjects,
  materials = [],
  competencies = [],
  tryouts = [],
  dbService,
  currentUser,
  onShowToast,
}) => {
  // Sub-tabs navigation inside Sumatif Analytics
  const [subTab, setSubTab] = useState<'KKTP_SUMMARY' | 'PSYCHOMETRICS' | 'REKAP_RAPOR'>('KKTP_SUMMARY');
  const [summaryClassFilter, setSummaryClassFilter] = useState('ALL');
  const [classFilter, setClassFilter] = useState('ALL');
  const [psychometricsClassFilter, setPsychometricsClassFilter] = useState('ALL');
  const [searchStudent, setSearchStudent] = useState('');
  const [kktpStatusFilter, setKktpStatusFilter] = useState<'ALL' | 'TUNTAS' | 'REMEDIAL'>('ALL');

  // Wadah aktif terpilih
  const activePackage = useMemo(() => {
    if (selectedPackageId) {
      return packages.find(p => p.id === selectedPackageId) || packages[0] || null;
    }
    return packages[0] || null;
  }, [packages, selectedPackageId]);

  // Target classes for this package (Cascading Class Filter)
  const targetClassesForPackage = useMemo(() => {
    if (!activePackage) return classes;
    const targetIds = activePackage.targetClassIds || [];
    if (targetIds.length === 0) return classes;
    const filtered = classes.filter(c => targetIds.includes(c.id));
    return filtered.length > 0 ? filtered : classes;
  }, [activePackage, classes]);

  // Hitung Analytics Sumatif menggunakan SumatifAnalyticsService (scoping ketat ke wadah paket ini)
  const analytics: TeacherSumatifAnalytics | null = useMemo(() => {
    if (!activePackage || !activeSubject) return null;
    return SumatifAnalyticsService.calculateTeacherAnalytics(
      activeSubject.id,
      activePackage,
      scores,
      students,
      targetClassesForPackage,
      questions,
      answers,
      subjects,
      tryouts
    );
  }, [activePackage, activeSubject, scores, students, targetClassesForPackage, questions, answers, subjects, tryouts]);

  // Perhitungan metrik ringkasan untuk Tab 1 responsif terhadap filter rombel/kelas
  const summaryMetrics = useMemo(() => {
    if (!analytics || analytics.studentCount === 0) {
      return {
        avg: 0,
        passingRate: 0,
        passingCount: 0,
        remedialCount: 0,
        highest: 0,
        lowest: 0,
        totalStudents: 0,
      };
    }
    if (summaryClassFilter === 'ALL') {
      return {
        avg: analytics.averageScore,
        passingRate: analytics.passingRatePct,
        passingCount: analytics.passingCount,
        remedialCount: analytics.remedialCount,
        highest: analytics.highestScore,
        lowest: analytics.lowestScore,
        totalStudents: analytics.studentCount,
      };
    }
    const selClass = targetClassesForPackage.find(c => c.id === summaryClassFilter);
    const classStudents = analytics.studentRankings.filter(s => s.className === selClass?.name);
    const count = classStudents.length;
    const scoresList = classStudents.map(s => s.score);
    const sum = scoresList.reduce((a, b) => a + b, 0);
    const avg = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
    const highest = count > 0 ? Math.max(...scoresList) : 0;
    const lowest = count > 0 ? Math.min(...scoresList) : 0;
    const passed = classStudents.filter(s => s.isPassed).length;
    const remedial = count - passed;
    const passRate = count > 0 ? Math.round((passed / count) * 100) : 0;

    return {
      avg,
      passingRate: passRate,
      passingCount: passed,
      remedialCount: remedial,
      highest,
      lowest,
      totalStudents: count,
    };
  }, [analytics, summaryClassFilter, targetClassesForPackage]);

  // Breakdown capaian per rombel target (difilter jika pengguna memilih kelas tertentu)
  const classBreakdowns = useMemo(() => {
    if (!analytics) return [];
    const sourceClasses = summaryClassFilter === 'ALL'
      ? targetClassesForPackage
      : targetClassesForPackage.filter(c => c.id === summaryClassFilter);

    return sourceClasses.map(cls => {
      const classStudents = analytics.studentRankings.filter(s => s.className === cls.name);
      const studentCount = classStudents.length;
      const scoresList = classStudents.map(s => s.score);
      const sum = scoresList.reduce((a, b) => a + b, 0);
      const avg = studentCount > 0 ? Math.round((sum / studentCount) * 10) / 10 : 0;
      const highest = studentCount > 0 ? Math.max(...scoresList) : 0;
      const lowest = studentCount > 0 ? Math.min(...scoresList) : 0;
      const passed = classStudents.filter(s => s.isPassed).length;
      const remedial = studentCount - passed;
      const passRate = studentCount > 0 ? Math.round((passed / studentCount) * 100) : 0;
      return {
        classId: cls.id,
        className: cls.name,
        studentCount,
        averageScore: avg,
        highestScore: highest,
        lowestScore: lowest,
        passingCount: passed,
        remedialCount: remedial,
        passingRatePct: passRate,
      };
    });
  }, [analytics, targetClassesForPackage, summaryClassFilter]);

  // Saring data siswa untuk Tab Rekap Rapor
  const filteredStudentRankings = useMemo(() => {
    if (!analytics) return [];
    return analytics.studentRankings.filter(s => {
      // 1. Filter rombel/kelas
      if (classFilter !== 'ALL') {
        const studentObj = students.find(st => st.id === s.studentId);
        const selClass = targetClassesForPackage.find(c => c.id === classFilter);
        if (studentObj) {
          if (studentObj.classId !== classFilter) return false;
        } else if (selClass && s.className !== selClass.name) {
          return false;
        }
      }
      // 2. Filter status ketuntasan KKTP
      if (kktpStatusFilter === 'TUNTAS' && !s.isPassed) return false;
      if (kktpStatusFilter === 'REMEDIAL' && s.isPassed) return false;
      // 3. Search query nama/nisn
      if (searchStudent.trim()) {
        const q = searchStudent.toLowerCase();
        return (
          s.studentName.toLowerCase().includes(q) ||
          (s.nisn && s.nisn.includes(q)) ||
          s.className.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [analytics, classFilter, kktpStatusFilter, searchStudent, students, targetClassesForPackage]);

  // Handler Export CSV Nilai Siap Rapor
  const handleExportCsv = () => {
    if (!analytics || filteredStudentRankings.length === 0) {
      onShowToast('Tidak ada data nilai untuk diekspor.');
      return;
    }

    const headers = ['Peringkat', 'NISN', 'Nama Siswa', 'Kelas', 'Nilai Murni', 'KKTP', 'Status Ketuntasan'];
    const rows = filteredStudentRankings.map(r => [
      r.rank,
      `'${r.nisn || ''}`,
      `"${r.studentName.replace(/"/g, '""')}"`,
      `"${r.className}"`,
      r.score,
      analytics.passingGrade,
      r.isPassed ? 'TUNTAS' : 'REMEDIAL',
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Rekap_Nilai_${activePackage?.code || 'SUMATIF'}_${activeSubject?.code || 'MAPEL'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onShowToast(`File CSV nilai ${activeSubject?.name || 'Mapel'} berhasil diunduh.`);
  };

  // ── KALKULASI ANALISIS BUTIR SOAL MURNI & PSIKOMETRI (SEPERTI TRY OUT) ──
  const matchedSumatifTryout = useMemo(() => {
    if (!activePackage || !activeSubject) return null;
    return tryouts.find(t => t.packageId === activePackage.id && t.subjectId === activeSubject.id) || null;
  }, [tryouts, activePackage, activeSubject]);

  const relevantSubjectQuestions = useMemo(() => {
    if (!activeSubject) return [];
    if (matchedSumatifTryout && dbService) {
      const qFromTryout = dbService.getQuestionsForTryout(matchedSumatifTryout.id, activeSubject.id);
      if (qFromTryout.length > 0) return qFromTryout;
    }
    return questions
      .filter(q => q.subjectId === activeSubject.id)
      .sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));
  }, [questions, activeSubject, matchedSumatifTryout, dbService]);

  const targetClassStudentsForPsychometrics = useMemo(() => {
    let list = students;
    if (activePackage?.targetClassIds && activePackage.targetClassIds.length > 0) {
      list = list.filter(s => activePackage.targetClassIds!.includes(s.classId));
    }
    if (psychometricsClassFilter !== 'ALL') {
      list = list.filter(s => s.classId === psychometricsClassFilter);
    }
    return list;
  }, [students, activePackage, psychometricsClassFilter]);

  const targetStudentIdSet = useMemo(
    () => new Set(targetClassStudentsForPsychometrics.map(s => s.id)),
    [targetClassStudentsForPsychometrics]
  );

  const questionAnalysisResults: QuestionAnalysisResult[] = useMemo(() => {
    if (!activeSubject) return [];

    // Prioritas 1: Jika tryout ID terhubung di database dan dbService tersedia, gunakan getQuestionAnalysis
    if (matchedSumatifTryout && dbService) {
      const dbCalc = dbService.getQuestionAnalysis(
        matchedSumatifTryout.id,
        activeSubject.id,
        psychometricsClassFilter === 'ALL' ? undefined : psychometricsClassFilter,
        currentUser
      );
      if (dbCalc && dbCalc.length > 0) return dbCalc;
    }

    // Prioritas 2: Hitung langsung dengan calculateQuestionItemAnalysis dari AnalyticsService (scoping ke tryout wadah ini)
    if (relevantSubjectQuestions.length > 0 && matchedSumatifTryout) {
      const qIds = new Set(relevantSubjectQuestions.map(q => q.id));
      const filteredAns = answers.filter(a =>
        qIds.has(a.questionId) &&
        targetStudentIdSet.has(a.studentId) &&
        a.tryoutId === matchedSumatifTryout.id
      );
      const filteredScores = scores.filter(s =>
        targetStudentIdSet.has(s.studentId) &&
        s.tryoutId === matchedSumatifTryout.id
      );

      if (filteredAns.length > 0) {
        const directCalc = AnalyticsService.calculateQuestionItemAnalysis(
          relevantSubjectQuestions,
          filteredAns,
          filteredScores,
          materials,
          competencies
        );
        if (directCalc && directCalc.length > 0) return directCalc;
      }
    }

    // Prioritas 3: Standarisasi dari analytics.questionStats (SumatifAnalyticsService)
    if (analytics && analytics.questionStats.length > 0) {
      return analytics.questionStats.map((qs, idx) => {
        const qNum = qs.questionNumber || idx + 1;
        const matchingQ = relevantSubjectQuestions.find(q => (q.questionNumber || idx + 1) === qNum);
        const correctKey = matchingQ?.correctAnswer || 'A';
        const totalResp = qs.totalResponses || 1;
        const pVal = qs.facilityValue;
        const dVal = qs.discriminationIndex ?? 0;
        const isReview = qs.isReviewRecommended;

        const wrongTotal = Math.max(0, qs.wrongCount);
        const optKeys = ['A', 'B', 'C', 'D', 'E'];
        const otherKeys = optKeys.filter(k => k !== correctKey.toUpperCase());
        const perDist = otherKeys.length > 0 ? Math.floor(wrongTotal / otherKeys.length) : 0;
        const remainder = otherKeys.length > 0 ? wrongTotal % otherKeys.length : 0;

        const distStats: Record<string, any> = {};
        distStats[correctKey.toUpperCase()] = {
          count: qs.correctCount,
          percentage: Math.round((qs.correctCount / totalResp) * 100),
          isMisleading: false,
        };
        otherKeys.forEach((k, kIdx) => {
          const count = perDist + (kIdx === 0 ? remainder : 0);
          distStats[k] = {
            count,
            percentage: Math.round((count / totalResp) * 100),
            isMisleading: count > qs.correctCount,
          };
        });

        const qId = matchingQ?.id || `q-sum-${qNum}`;
        const tryoutId = matchedSumatifTryout?.id || activePackage?.id || `pkg-${activePackage?.id}`;
        const distCounts: Record<string, number> = {};
        distCounts[correctKey.toUpperCase()] = qs.correctCount;
        otherKeys.forEach((k, kIdx) => {
          distCounts[k] = perDist + (kIdx === 0 ? remainder : 0);
        });

        const diffCategory: 'MUDAH' | 'SEDANG' | 'SULIT' = pVal > 0.70 ? 'MUDAH' : pVal >= 0.30 ? 'SEDANG' : 'SULIT';
        const discCategory: 'SANGAT_BAIK' | 'BAIK' | 'CUKUP' | 'BURUK' = dVal >= 0.40 ? 'SANGAT_BAIK' : dVal >= 0.30 ? 'BAIK' : dVal >= 0.20 ? 'CUKUP' : 'BURUK';

        return {
          id: `qa-${qId}`,
          tryoutId,
          questionId: qId,
          questionNumber: qNum,
          uniqueCode: matchingQ?.uniqueCode || `SOAL-${String(qNum).padStart(2, '0')}`,
          questionText: matchingQ?.questionText || qs.questionText || `Butir Soal Nomor ${qNum}`,
          correctAnswer: correctKey,
          options: matchingQ?.options || [
            { key: 'A', text: 'Pilihan A' },
            { key: 'B', text: 'Pilihan B' },
            { key: 'C', text: 'Pilihan C' },
            { key: 'D', text: 'Pilihan D' },
            { key: 'E', text: 'Pilihan E' },
          ],
          totalRespondents: totalResp,
          correctCount: qs.correctCount,
          incorrectCount: qs.wrongCount,
          unansweredCount: 0,
          correctPercentage: Math.round(pVal * 100),
          incorrectPercentage: Math.round((1 - pVal) * 100),
          unansweredPercentage: 0,
          difficultyIndex: pVal,
          difficultyCategory: diffCategory,
          discriminationIndex: dVal,
          discriminationCategory: discCategory,
          distractorCounts: distCounts,
          informativeStatus: (pVal >= 0.70 ? 'Easy' : pVal >= 0.30 ? 'Moderate' : 'Difficult') as any,
          discriminationStatus: (dVal >= 0.40 ? 'Good Discrimination' : dVal >= 0.20 ? 'Moderate Discrimination' : 'Poor Discrimination') as any,
          distractorStats: distStats,
          reviewRecommendation: isReview ? 'Needs Review' : 'Good / Valid Question',
          reviewReasons: isReview ? ['Daya pembeda rendah atau tingkat kesukaran ekstrem'] : [],
          pedagogicalNote: isReview
            ? 'Butir soal perlu ditelaah kembali konstruksi distraktor atau kejelasan teks sebelum digunakan kembali.'
            : 'Butir soal memiliki mutu baik dan daya pembeda yang memadai untuk bank soal.',
          subjectId: activeSubject.id,
          materialId: matchingQ?.materialId || '',
          competencyId: matchingQ?.competencyId || '',
        };
      });
    }

    return [];
  }, [
    activeSubject,
    matchedSumatifTryout,
    dbService,
    psychometricsClassFilter,
    currentUser,
    relevantSubjectQuestions,
    answers,
    targetStudentIdSet,
    scores,
    materials,
    competencies,
    analytics,
  ]);

  // Handler Export Item Analysis Excel
  const handleExportItemAnalysisExcel = () => {
    if (questionAnalysisResults.length === 0) {
      onShowToast('Tidak ada data butir soal untuk diunduh.');
      return;
    }
    const pkgTitle = activePackage ? `${activePackage.code}_${activePackage.title}` : 'Asesmen_Sumatif';
    const subName = activeSubject?.name || 'Mata_Pelajaran';
    const activeCls = classes.find(c => c.id === psychometricsClassFilter);
    const classSuffix = activeCls ? `_${activeCls.name.replace(/\s+/g, '_')}` : '_Semua_Kelas';

    ExportService.exportItemAnalysisExcel(
      `${pkgTitle}${classSuffix}`,
      subName,
      questionAnalysisResults
    );
    onShowToast(`Laporan Analisis Butir Soal Excel (${subName}) berhasil diunduh!`);
  };

  // EMPTY STATE: Jika belum ada wadah SAS / SAT yang dibuat
  if (packages.length === 0) {
    return (
      <div className="bg-slate-50/70 dark:bg-slate-900/40 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center max-w-2xl mx-auto space-y-4 my-8">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 shadow-inner">
          <Award className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Belum Ada Data Asesmen SAT / SAS
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
            Halaman ini khusus menyajikan analisis ketuntasan KKTP dan psikometri soal untuk ujian sumatif resmi semesteran. Hubungi admin untuk membuat paket SAS atau SAT terlebih dahulu.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── TOP CONTEXT SWITCHER: BILAH PEMILIH WADAH MULTI-JENJANG ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600">
                <Award className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Pusat Analisis Asesmen Sumatif (SAS &amp; SAT)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Evaluasi ketercapaian KKTP per kelas dan psikometri butir soal untuk mata pelajaran <strong>{activeSubject?.name || 'Mata Pelajaran'}</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 hidden sm:inline">Pilih Wadah:</span>
            {/* Context Selector: Pill buttons jika <= 3, select jika > 3 */}
            {packages.length <= 4 ? (
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                {packages.map(pkg => {
                  const isSelected = pkg.id === activePackage?.id;
                  const isSAT = pkg.assessmentType === 'SAT';
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => onSelectPackageId(pkg.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span className="text-[10px] opacity-80">{isSAT ? 'SAT' : 'SAS'}</span>
                      <span className="truncate max-w-[140px]">{pkg.title}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <select
                value={activePackage?.id || ''}
                onChange={e => onSelectPackageId(e.target.value)}
                className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                {packages.map(pkg => (
                  <option key={pkg.id} value={pkg.id}>
                    [{pkg.assessmentType}] {pkg.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Ringkasan Konteks Wadah Terpilih */}
        {activePackage && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/60 rounded-2xl text-xs">
            <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
              <School className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Target Rombel: <strong>{targetClassesForPackage.map(c => c.name).join(', ') || 'Semua Kelas'}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
              <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                Mapel: <strong>{activeSubject?.name}</strong> · KKTP: <strong>{analytics?.passingGrade || 75}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
              <Users className="w-4 h-4 text-teal-600 shrink-0" />
              <span>
                Total Siswa Terdata: <strong>{analytics?.studentCount || 0} Siswa</strong> ({analytics?.passingRatePct || 0}% Tuntas)
              </span>
            </div>
          </div>
        )}

        {/* ── 3 SUB-TABS NAVIGASI UTAMA ── */}
        <div className="flex items-center gap-1.5 border-t border-slate-100 dark:border-slate-800/80 pt-3">
          <button
            type="button"
            onClick={() => setSubTab('KKTP_SUMMARY')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              subTab === 'KKTP_SUMMARY'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>1. Grafik &amp; Ketuntasan KKTP</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('PSYCHOMETRICS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              subTab === 'PSYCHOMETRICS'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>2. Analisis Butir Soal &amp; Psikometri</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('REKAP_RAPOR')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              subTab === 'REKAP_RAPOR'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>3. Rekapitulasi Nilai Siap Rapor</span>
          </button>
        </div>
      </div>

      {/* ── KONTEN SUB-TAB 1: GRAFIK & KETUNTASAN KKTP ── */}
      {subTab === 'KKTP_SUMMARY' && (
        <div className="space-y-6">
          {analytics && analytics.studentCount > 0 ? (
            <>
              {/* Filter Rombel Interaktif Tab 1 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-2xs">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Filter Analisis Rombel / Kelas:
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={summaryClassFilter}
                    onChange={e => setSummaryClassFilter(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    <option value="ALL">Semua Kelas Target ({targetClassesForPackage.length} Kelas)</option>
                    {targetClassesForPackage.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Summary Metric Cards (Responsif Terhadap Filter Kelas) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Rata-rata Nilai
                  </span>
                  <div className="flex items-baseline gap-1 mt-1.5">
                    <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
                      {summaryMetrics.avg}
                    </span>
                    <span className="text-xs text-slate-400">/ 100</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Batas KKTP: {analytics.passingGrade}
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Tingkat Ketuntasan
                  </span>
                  <div className="flex items-baseline gap-1 mt-1.5">
                    <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                      {summaryMetrics.passingRate}%
                    </span>
                    <span className="text-xs text-slate-400">({summaryMetrics.passingCount} siswa)</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-semibold mt-1 block">
                    Nilai ≥ Batas KKTP
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Perlu Remedial
                  </span>
                  <div className="flex items-baseline gap-1 mt-1.5">
                    <span
                      className={`text-3xl font-black ${
                        summaryMetrics.remedialCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                      }`}
                    >
                      {summaryMetrics.remedialCount}
                    </span>
                    <span className="text-xs text-slate-400">siswa</span>
                  </div>
                  <span className="text-[10px] text-rose-500 font-semibold mt-1 block">
                    Nilai &lt; KKTP ({analytics.passingGrade})
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Rentang Nilai
                  </span>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
                      {summaryMetrics.highest}
                    </span>
                    <span className="text-xs text-slate-400">s/d</span>
                    <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                      {summaryMetrics.lowest}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Tertinggi / Terendah
                  </span>
                </div>
              </div>

              {/* Tabel Ketuntasan per Rombel Target */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <School className="w-4 h-4 text-emerald-600" />
                      <span>Capaian Ketuntasan per Rombel Target</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Perbandingan performa dan persentase tuntas KKTP per kelas yang ditargetkan pada wadah ini.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 rounded-l-xl">Kelas</th>
                        <th className="px-4 py-3">Peserta</th>
                        <th className="px-4 py-3">Rata-rata</th>
                        <th className="px-4 py-3">Tertinggi</th>
                        <th className="px-4 py-3">Terendah</th>
                        <th className="px-4 py-3">Tuntas</th>
                        <th className="px-4 py-3">Remedial</th>
                        <th className="px-4 py-3 rounded-r-xl">Ketuntasan (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {classBreakdowns.map(cb => (
                        <tr key={cb.classId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                            {cb.className}
                          </td>
                          <td className="px-4 py-3 font-semibold">{cb.studentCount} Siswa</td>
                          <td className="px-4 py-3 font-black text-indigo-600 dark:text-indigo-400">
                            {cb.averageScore}
                          </td>
                          <td className="px-4 py-3 font-bold text-emerald-600">{cb.highestScore}</td>
                          <td className="px-4 py-3 font-bold text-rose-500">{cb.lowestScore}</td>
                          <td className="px-4 py-3 font-bold text-emerald-600">{cb.passingCount}</td>
                          <td className="px-4 py-3 font-bold text-rose-500">{cb.remedialCount}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 w-20 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    cb.passingRatePct >= 80
                                      ? 'bg-emerald-500'
                                      : cb.passingRatePct >= 60
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${cb.passingRatePct}%` }}
                                />
                              </div>
                              <span className="font-bold text-slate-700 dark:text-slate-300">
                                {cb.passingRatePct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-400 text-xs">
              <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center">
                  <Info className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                </div>
                <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                  Belum Ada Data Respon Nilai Terhubung
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Belum ada data nilai respons siswa yang disinkronkan untuk mata pelajaran <strong>{activeSubject?.name || 'ini'}</strong> pada wadah <strong>{activePackage?.title || 'ini'}</strong>.
                  Guru mata pelajaran dapat menautkan link Google Form atau Spreadsheet pada tab <strong>Wadah &amp; Bank Soal SAT/SAS</strong> untuk menampilkan analisis secara realtime.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── KONTEN SUB-TAB 2: ANALISIS BUTIR SOAL & PSIKOMETRI (PERSIS TRY OUT) ── */}
      {subTab === 'PSYCHOMETRICS' && (
        <div className="space-y-6">
          {/* 1. Critical Pedagogical Disclaimer Banner */}
          <div className="bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-500 p-4 rounded-r-2xl shadow-xs flex items-start space-x-3 transition-colors">
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

          {/* 2. Header & Filter Controls */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 transition-colors">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                <span>Analisis Butir Soal &amp; Pilihan Pengecoh ({activePackage?.assessmentType || 'SAS/SAT'})</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Rekapitulasi jumlah siswa menjawab benar, salah, kosong, tingkat kesukaran (p), daya pembeda (D), dan sebaran opsi A/B/C/D/E.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Wadah:</span>
              <select
                value={activePackage?.id || ''}
                onChange={e => onSelectPackageId(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 font-semibold focus:outline-hidden"
              >
                {packages.map(p => (
                  <option key={p.id} value={p.id}>
                    [{p.assessmentType}] {p.title}
                  </option>
                ))}
              </select>

              <div className="flex items-center space-x-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2.5 py-1 text-emerald-900 dark:text-emerald-200 font-bold ml-1">
                <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{activeSubject?.name || 'Mata Pelajaran'}</span>
              </div>

              <span className="text-slate-500 dark:text-slate-400 font-medium ml-2">Kelas / Rombel:</span>
              <select
                value={psychometricsClassFilter}
                onChange={e => setPsychometricsClassFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 font-semibold focus:outline-hidden"
              >
                <option value="ALL">Semua Kelas Target ({targetClassesForPackage.length} Kelas)</option>
                {targetClassesForPackage.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={questionAnalysisResults.length === 0}
                onClick={handleExportItemAnalysisExcel}
                className={`ml-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors shadow-2xs ${
                  questionAnalysisResults.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Excel</span>
              </button>
            </div>
          </div>

          {questionAnalysisResults.length > 0 ? (
            <>
              {/* 3. Psychometric Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-2xs transition-colors">
                  <span className="text-slate-400 dark:text-slate-500 block mb-1">Total Butir Soal</span>
                  <span className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                    {questionAnalysisResults.length} Soal
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-2xs transition-colors">
                  <span className="text-slate-400 dark:text-slate-500 block mb-1">Rata-Rata Daya Pembeda (D)</span>
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {(
                      questionAnalysisResults.reduce((acc, q) => acc + (q.discriminationIndex || 0), 0) /
                      questionAnalysisResults.length
                    ).toFixed(2)}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-2xs transition-colors">
                  <span className="text-slate-400 dark:text-slate-500 block mb-1">Soal Layak (Valid)</span>
                  <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                    {questionAnalysisResults.filter(q => q.reviewRecommendation === 'Good / Valid Question').length} Soal
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-2xs transition-colors">
                  <span className="text-slate-400 dark:text-slate-500 block mb-1">Perlu Tinjauan (Needs Review)</span>
                  <span className="text-xl font-bold text-amber-600 dark:text-amber-400 font-mono">
                    {questionAnalysisResults.filter(q => q.reviewRecommendation === 'Needs Review').length} Soal
                  </span>
                </div>
              </div>

              {/* 4. Grafik Tingkat Kesukaran (P-Value) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-emerald-600" />
                      <span>Distribusi Tingkat Kesukaran (P-Value) per Butir Soal</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Batang merah (&lt; 40% benar) menandakan soal sulit. Batang hijau (&gt; 60% benar) menunjukkan soal mudah.
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Total {questionAnalysisResults.length} Butir Soal
                  </span>
                </div>

                <div className="h-[260px] w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={questionAnalysisResults} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                      <XAxis dataKey="questionNumber" tick={{ fontSize: 11, fontWeight: 600 }} />
                      <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v * 100)}%`} />
                      <Tooltip
                        formatter={(val: any, _name: any, props: any) => [
                          `${Math.round(Number(val) * 100)}% Benar (${props.payload.correctCount}/${props.payload.totalRespondents} siswa)`,
                          `Soal No. ${props.payload.questionNumber} - ${props.payload.informativeStatus}`,
                        ]}
                      />
                      <ReferenceLine
                        y={0.4}
                        stroke="#ef4444"
                        strokeDasharray="3 3"
                        label={{ value: 'Batas Sulit (40%)', position: 'top', fill: '#ef4444', fontSize: 10 }}
                      />
                      <Bar dataKey="difficultyIndex" radius={[4, 4, 0, 0]}>
                        {questionAnalysisResults.map((entry, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={entry.difficultyIndex >= 0.6 ? '#10b981' : entry.difficultyIndex >= 0.4 ? '#f59e0b' : '#ef4444'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 5. Detailed Question Psychometrics Table (Struktur Persis Try Out) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-indigo-600" />
                    <span>Tabel Detail Analisis Butir Soal &amp; Pilihan Pengecoh</span>
                  </h3>
                  <span className="text-xs text-slate-400">
                    {questionAnalysisResults.length} Butir Soal
                  </span>
                </div>

                <div className="overflow-auto max-h-[540px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs scrollbar-thin">
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
                      {questionAnalysisResults.map((qa, idx) => (
                        <tr key={qa.questionId || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 px-3 text-center font-bold text-slate-500 dark:text-slate-400">
                            {qa.questionNumber || idx + 1}
                          </td>
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
                              <span
                                className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800"
                                title={`Benar: ${qa.correctPercentage}%`}
                              >
                                {qa.correctCount} Benar
                              </span>
                              <span
                                className="bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800"
                                title={`Salah: ${qa.incorrectPercentage}%`}
                              >
                                {qa.incorrectCount} Salah
                              </span>
                              {qa.unansweredCount > 0 && (
                                <span
                                  className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800"
                                  title={`Kosong: ${qa.unansweredPercentage}%`}
                                >
                                  {qa.unansweredCount} Kosong
                                </span>
                              )}
                            </div>
                            <div className="text-[9px] text-slate-400 mt-1 font-mono">
                              Total Responden: {qa.totalRespondents} Siswa
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                  {qa.difficultyIndex.toFixed(2)}
                                </span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                    qa.informativeStatus === 'Easy'
                                      ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                                      : qa.informativeStatus === 'Difficult'
                                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                      : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                  }`}
                                >
                                  {qa.informativeStatus === 'Easy' ? 'Mudah' : qa.informativeStatus === 'Difficult' ? 'Sukar' : 'Sedang'}
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
                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                  {qa.discriminationIndex.toFixed(2)}
                                </span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                    qa.discriminationStatus === 'Good Discrimination'
                                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                      : qa.discriminationStatus === 'Moderate Discrimination'
                                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                      : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                  }`}
                                >
                                  {qa.discriminationStatus === 'Good Discrimination'
                                    ? 'Baik'
                                    : qa.discriminationStatus === 'Moderate Discrimination'
                                    ? 'Cukup'
                                    : 'Jelek'}
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
                                        ? `${opt} (${optText}): ${stat?.count || 0} pemilih (${stat?.percentage || 0}%)${
                                            isKey ? ' [KUNCI SAH]' : stat?.isMisleading ? ' [DISTRAKTOR MENYESATKAN]' : ''
                                          }`
                                        : `${opt}: ${stat?.count || 0} pemilih (${stat?.percentage || 0}%)${
                                            isKey ? ' [KUNCI SAH]' : stat?.isMisleading ? ' [DISTRAKTOR MENYESATKAN]' : ''
                                          }`
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
                              {qa.reviewRecommendation === 'Needs Review' ? 'Perlu Tinjauan' : 'Soal Layak'}
                            </span>
                            {qa.reviewReasons && qa.reviewReasons.length > 0 && (
                              <div className="text-[9px] text-amber-700 dark:text-amber-400 mt-1 max-w-[140px] mx-auto truncate" title={qa.reviewReasons.join(' | ')}>
                                {qa.reviewReasons[0]}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-400 text-xs">
              <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center">
                  <Info className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                </div>
                <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                  Belum Ada Data Butir Soal Terhubung
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Belum ada data butir soal atau lembar jawaban siswa yang disinkronkan untuk wadah {activePackage?.title || 'ini'} pada mata pelajaran {activeSubject?.name || 'ini'}. Silakan hubungkan Google Form / Spreadsheet pada menu Asesmen Sumatif.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── KONTEN SUB-TAB 3: REKAPITULASI NILAI SIAP RAPOR ── */}
      {subTab === 'REKAP_RAPOR' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Rekapitulasi Nilai Asesmen Siap Rapor</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Daftar nilai murni 0–100 siswa per rombel lengkap dengan status ketuntasan KKTP siap ekspor.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-xs shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor Rekap CSV / Excel</span>
            </button>
          </div>

          {/* Filter Bar Interaktif: Rombel Target & Status KKTP */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl text-xs">
            <div>
              <label className="text-slate-500 font-semibold block mb-1">Filter Rombel / Kelas:</label>
              <select
                value={classFilter}
                onChange={e => setClassFilter(e.target.value)}
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <option value="ALL">Semua Kelas Target Wadah ({targetClassesForPackage.length} Kelas)</option>
                {targetClassesForPackage.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-slate-500 font-semibold block mb-1">Status Ketuntasan KKTP:</label>
              <select
                value={kktpStatusFilter}
                onChange={e => setKktpStatusFilter(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <option value="ALL">Semua Status (Tuntas &amp; Remedial)</option>
                <option value="TUNTAS">Hanya Tuntas (≥ {analytics?.passingGrade || 75})</option>
                <option value="REMEDIAL">Hanya Perlu Remedial (&lt; {analytics?.passingGrade || 75})</option>
              </select>
            </div>

            <div>
              <label className="text-slate-500 font-semibold block mb-1">Cari Nama Siswa / NISN:</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchStudent}
                  onChange={e => setSearchStudent(e.target.value)}
                  placeholder="Ketik nama atau NISN..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>
          </div>

          {/* Indikator Jumlah Data Terfilter */}
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
            <span>
              Menampilkan <strong>{filteredStudentRankings.length}</strong> dari <strong>{analytics?.studentCount || 0}</strong> siswa terdata
            </span>
            {(classFilter !== 'ALL' || kktpStatusFilter !== 'ALL' || searchStudent.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setClassFilter('ALL');
                  setKktpStatusFilter('ALL');
                  setSearchStudent('');
                }}
                className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
              >
                Reset Semua Filter
              </button>
            )}
          </div>

          {/* Tabel Nilai Siswa Siap Rapor */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 rounded-l-xl w-16 text-center">Rank</th>
                  <th className="px-4 py-3">NISN</th>
                  <th className="px-4 py-3">Nama Lengkap Siswa</th>
                  <th className="px-4 py-3">Kelas</th>
                  <th className="px-4 py-3">Nilai Murni (0–100)</th>
                  <th className="px-4 py-3 rounded-r-xl">Status KKTP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredStudentRankings.length > 0 ? (
                  filteredStudentRankings.map(s => (
                    <tr key={s.studentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-center font-bold text-slate-400">
                        #{s.rank}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">{s.nisn || '-'}</td>
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                        {s.studentName}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">
                        {s.className}
                      </td>
                      <td className="px-4 py-3 font-black text-indigo-600 dark:text-indigo-400 text-sm">
                        {s.score}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 ${
                            s.isPassed
                              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {s.isPassed ? (
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
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      Tidak ada data siswa yang cocok dengan filter yang dipilih.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
