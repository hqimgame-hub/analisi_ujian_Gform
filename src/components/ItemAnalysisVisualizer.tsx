import React, { useState, useMemo } from 'react';
import {
  BarChart3, AlertTriangle, CheckCircle2, HelpCircle,
  Filter, Search, ArrowUpRight, ShieldAlert,
  ChevronDown, ChevronUp, Sparkles, BookOpen, Layers,
  Lightbulb, SlidersHorizontal, Check, Compass
} from 'lucide-react';
import { QuestionAnalysisResult } from '../services/analytics';
import { Tryout, Subject, ClassRoom } from '../types/database';
import { getFriendlyTryoutStageLabel } from '../utils/tryoutGroupUtils';

interface ItemAnalysisVisualizerProps {
  items: QuestionAnalysisResult[];
  tryouts?: Tryout[];
  subjects?: Subject[];
  classes?: ClassRoom[];
  selectedTryoutId?: string;
  selectedSubjectId?: string;
  selectedClassId?: string;
  onTryoutChange?: (tryoutId: string) => void;
  onSubjectChange?: (subjectId: string) => void;
  onClassChange?: (classId: string) => void;
  onNavigateToQuestionBank?: () => void;
  onNavigateToExplanations?: (questionId?: string) => void;
}

export const ItemAnalysisVisualizer: React.FC<ItemAnalysisVisualizerProps> = ({
  items,
  tryouts = [],
  subjects = [],
  classes = [],
  selectedTryoutId,
  selectedSubjectId,
  selectedClassId = 'ALL',
  onTryoutChange,
  onSubjectChange,
  onClassChange,
  onNavigateToQuestionBank,
  onNavigateToExplanations,
}) => {
  // Local state for UI filter & view toggle
  const [activeFilterTab, setActiveFilterTab] = useState<'ALL' | 'NEEDS_REVIEW' | 'IDEAL' | 'DIFFICULT' | 'EASY'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [showPedagogicalGuide, setShowPedagogicalGuide] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // 1. Core Summary Metrics
  const totalQuestions = items.length;

  const stats = useMemo(() => {
    if (totalQuestions === 0) {
      return {
        avgDifficulty: 0,
        avgDiscrimination: 0,
        difficultyCategoryCounts: { MUDAH: 0, SEDANG: 0, SULIT: 0 },
        discriminationCategoryCounts: { SANGAT_BAIK: 0, BAIK: 0, CUKUP: 0, BURUK: 0 },
        idealQuestionsCount: 0,
        needsReviewCount: 0,
        quadrants: {
          q1_ideal: [],
          q2_hard_discriminating: [],
          q3_easy_discriminating: [],
          q4_problematic: [],
        },
      };
    }

    const sumDiff = items.reduce((acc, q) => acc + (q.difficultyIndex || 0), 0);
    const sumDisc = items.reduce((acc, q) => acc + (q.discriminationIndex || 0), 0);
    const avgDiff = Math.round((sumDiff / totalQuestions) * 100) / 100;
    const avgDisc = Math.round((sumDisc / totalQuestions) * 100) / 100;

    let mudahCount = 0;
    let sedangCount = 0;
    let sulitCount = 0;

    let sangatBaikDisc = 0;
    let baikDisc = 0;
    let cukupDisc = 0;
    let burukDisc = 0;

    let idealCount = 0;
    let reviewCount = 0;

    const q1: QuestionAnalysisResult[] = [];
    const q2: QuestionAnalysisResult[] = [];
    const q3: QuestionAnalysisResult[] = [];
    const q4: QuestionAnalysisResult[] = [];

    items.forEach(q => {
      const p = q.difficultyIndex;
      const d = q.discriminationIndex;

      // Difficulty distribution
      if (p > 0.70) mudahCount++;
      else if (p >= 0.30) sedangCount++;
      else sulitCount++;

      // Discrimination distribution
      if (d >= 0.40) sangatBaikDisc++;
      else if (d >= 0.30) baikDisc++;
      else if (d >= 0.20) cukupDisc++;
      else burukDisc++;

      // Review status
      if (q.reviewRecommendation === 'Needs Review' || d < 0.20 || p < 0.15 || p > 0.95) {
        reviewCount++;
      }

      // Ideal Question criteria (Sedang + Daya Beda Baik)
      if (p >= 0.30 && p <= 0.70 && d >= 0.30) {
        idealCount++;
      }

      // Quadrant allocation
      if (d >= 0.30 && p >= 0.30 && p <= 0.70) {
        q1.push(q); // Ideal / Gold Standard
      } else if (d >= 0.30 && p < 0.30) {
        q2.push(q); // Hard & High Discrimination (Challenger)
      } else if (d >= 0.20 && p > 0.70) {
        q3.push(q); // Easy & Decent Discrimination (Warmup)
      } else {
        q4.push(q); // Problematic / Defective (Needs Fix)
      }
    });

    return {
      avgDifficulty: avgDiff,
      avgDiscrimination: avgDisc,
      difficultyCategoryCounts: { MUDAH: mudahCount, SEDANG: sedangCount, SULIT: sulitCount },
      discriminationCategoryCounts: {
        SANGAT_BAIK: sangatBaikDisc,
        BAIK: baikDisc,
        CUKUP: cukupDisc,
        BURUK: burukDisc,
      },
      idealQuestionsCount: idealCount,
      needsReviewCount: reviewCount,
      quadrants: {
        q1_ideal: q1,
        q2_hard_discriminating: q2,
        q3_easy_discriminating: q3,
        q4_problematic: q4,
      },
    };
  }, [items, totalQuestions]);

  // 2. Filtered Items List
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Search text filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchCode = item.uniqueCode?.toLowerCase().includes(query);
        const matchText = item.questionText?.toLowerCase().includes(query);
        if (!matchCode && !matchText) return false;
      }

      // Tab filter
      if (activeFilterTab === 'NEEDS_REVIEW') {
        return item.reviewRecommendation === 'Needs Review' || item.discriminationIndex < 0.20;
      }
      if (activeFilterTab === 'IDEAL') {
        return item.difficultyIndex >= 0.30 && item.difficultyIndex <= 0.70 && item.discriminationIndex >= 0.30;
      }
      if (activeFilterTab === 'DIFFICULT') {
        return item.difficultyIndex < 0.30;
      }
      if (activeFilterTab === 'EASY') {
        return item.difficultyIndex > 0.70;
      }

      return true;
    });
  }, [items, searchQuery, activeFilterTab]);

  // Helper for difficulty badge styling
  const getDifficultyBadge = (p: number) => {
    if (p > 0.70) {
      return {
        label: 'Mudah',
        color: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
        barColor: 'bg-emerald-500',
        textColor: 'text-emerald-600 dark:text-emerald-400',
      };
    }
    if (p >= 0.30) {
      return {
        label: 'Sedang (Ideal)',
        color: 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
        barColor: 'bg-indigo-500',
        textColor: 'text-indigo-600 dark:text-indigo-400',
      };
    }
    return {
      label: 'Sulit',
      color: 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
      barColor: 'bg-rose-500',
      textColor: 'text-rose-600 dark:text-rose-400',
    };
  };

  // Helper for discrimination badge styling
  const getDiscriminationBadge = (d: number) => {
    if (d >= 0.40) {
      return {
        label: 'Sangat Baik',
        color: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
        barColor: 'bg-emerald-500',
        textColor: 'text-emerald-600 dark:text-emerald-400',
        desc: 'Sangat tajam membedakan kelompok atas & bawah',
      };
    }
    if (d >= 0.30) {
      return {
        label: 'Baik',
        color: 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
        barColor: 'bg-indigo-500',
        textColor: 'text-indigo-600 dark:text-indigo-400',
        desc: 'Berfungsi sangat baik',
      };
    }
    if (d >= 0.20) {
      return {
        label: 'Cukup',
        color: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
        barColor: 'bg-amber-500',
        textColor: 'text-amber-600 dark:text-amber-400',
        desc: 'Memadai, perbaiki pilihan pengecoh',
      };
    }
    return {
      label: d < 0 ? 'Negatif (Rusak)' : 'Buruk',
      color: 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
      barColor: 'bg-rose-600',
      textColor: 'text-rose-600 dark:text-rose-400',
      desc: 'Gagal membedakan / perlu revisi total',
    };
  };

  const activeTryoutObj = tryouts.find(t => t.id === selectedTryoutId);
  const activeSubjectObj = subjects.find(s => s.id === selectedSubjectId);
  const activeClassObj = classes.find(c => c.id === selectedClassId);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6 transition-colors">
      {/* ------------------------------------------------------------------ */}
      {/* HEADER SECTION & INTEGRATED FILTERS */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Analisis Butir Soal
                </h3>
                <span className="bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                  EVALUASI SOAL
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Evaluasi tingkat kesukaran (<span className="font-serif italic font-medium">p</span>), daya pembeda (<span className="font-serif italic font-medium">D</span>), dan efektivitas pilihan pengecoh opsi (A–E).
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Selectors */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Tryout Selector */}
          {tryouts.length > 0 && onTryoutChange && (
            <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
              <select
                value={selectedTryoutId || tryouts[0]?.id}
                onChange={e => onTryoutChange(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-200 font-bold focus:outline-none cursor-pointer"
              >
                {tryouts.map(t => (
                  <option key={t.id} value={t.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    [{getFriendlyTryoutStageLabel(t, tryouts)}] {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Subject Selector */}
          {subjects.length > 0 && onSubjectChange && (
            <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
              <BookOpen className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
              <select
                value={selectedSubjectId || subjects[0]?.id}
                onChange={e => onSubjectChange(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-200 font-bold focus:outline-none cursor-pointer"
              >
                {subjects.map(s => (
                  <option key={s.id} value={s.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Class Filter Selector */}
          {classes.length > 0 && onClassChange && (
            <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
              <select
                value={selectedClassId}
                onChange={e => onClassChange(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-200 font-bold focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Semua Kelas</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    Kelas {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Pedagogical Guide Toggle */}
          <button
            type="button"
            onClick={() => setShowPedagogicalGuide(!showPedagogicalGuide)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
            <span>Panduan Analisis Soal</span>
            {showPedagogicalGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* PEDAGOGICAL CHEAT SHEET & RULES BANNER */}
      {/* ------------------------------------------------------------------ */}
      {showPedagogicalGuide && (
        <div className="p-4 bg-gradient-to-r from-indigo-50/70 to-slate-50 dark:from-indigo-950/40 dark:to-slate-950/60 border border-indigo-100 dark:border-indigo-900/60 rounded-2xl space-y-3 text-xs animate-fade-in">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span>Pedoman Analisis Butir Soal (Suharsimi Arikunto)</span>
            </h4>
            <span className="text-[10px] text-slate-500 font-mono">Batas Layak: Daya Beda ≥ 0.20 &amp; Kesukaran 0.20 s.d. 0.80</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Tingkat Kesukaran Info */}
            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-500 dark:bg-slate-400" />
                <span>Indeks Kesukaran (p-value = B / N)</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
                Menghitung rasio siswa yang menjawab benar terhadap total peserta:
              </p>
              <ul className="text-[11px] space-y-1 text-slate-600 dark:text-slate-400">
                <li>• <strong className="text-slate-900 dark:text-slate-100 font-semibold">p &gt; 0.70</strong>: Soal Mudah (perlu pengayaan / pemantik)</li>
                <li>• <strong className="text-slate-900 dark:text-slate-100 font-semibold">0.30 ≤ p ≤ 0.70</strong>: Soal Sedang (Ideal untuk bank soal)</li>
                <li>• <strong className="text-slate-900 dark:text-slate-100 font-semibold">p &lt; 0.30</strong>: Soal Sulit (memerlukan analisis materi prasyarat)</li>
              </ul>
            </div>

            {/* Daya Pembeda Info */}
            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-500 dark:bg-slate-400" />
                <span>Indeks Daya Pembeda (D = p_atas - p_bawah)</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
                Kemampuan soal membedakan siswa kelompok atas (unggul) dan kelompok bawah:
              </p>
              <ul className="text-[11px] space-y-1 text-slate-600 dark:text-slate-400">
                <li>• <strong className="text-slate-900 dark:text-slate-100 font-semibold">D ≥ 0.40</strong>: Sangat Baik (Pertahankan)</li>
                <li>• <strong className="text-slate-900 dark:text-slate-100 font-semibold">0.30 ≤ D &lt; 0.40</strong>: Baik (Gunakan)</li>
                <li>• <strong className="text-slate-900 dark:text-slate-100 font-semibold">0.20 ≤ D &lt; 0.30</strong>: Cukup (Revisi pilihan pengecoh)</li>
                <li>• <strong className="text-rose-600">D &lt; 0.20 / Negatif</strong>: Buruk (Buang / Revisi kunci)</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4 CORE PSYCHOMETRIC KPI METRIC CARDS */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Rata-Rata Tingkat Kesukaran */}
        <div className="bg-gradient-to-br from-indigo-50/50 to-white dark:from-slate-800/80 dark:to-slate-900 border border-indigo-100 dark:border-slate-800 rounded-2xl p-4.5 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-400">Rata-Rata Kesukaran (p)</span>
            <span className="p-1.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Compass className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
              {stats.avgDifficulty.toFixed(2)}
            </span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
              ({Math.round(stats.avgDifficulty * 100)}% Benar)
            </span>
          </div>

          {/* Visual Mini Progress Bar */}
          <div className="space-y-1">
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden flex">
              <div
                className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(Math.max(stats.avgDifficulty * 100, 5), 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>0.00 (Sangat Sulit)</span>
              <span>1.00 (Sangat Mudah)</span>
            </div>
          </div>

          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-400 flex items-center justify-between">
            <span>Status Paket:</span>
            <span className="font-bold text-indigo-700 dark:text-indigo-300">
              {stats.avgDifficulty >= 0.30 && stats.avgDifficulty <= 0.70 ? 'Ideal & Berimbang' : stats.avgDifficulty < 0.30 ? 'Cenderung Sulit' : 'Cenderung Mudah'}
            </span>
          </div>
        </div>

        {/* KPI 2: Rata-Rata Daya Pembeda */}
        <div className="bg-gradient-to-br from-emerald-50/50 to-white dark:from-slate-800/80 dark:to-slate-900 border border-emerald-100 dark:border-slate-800 rounded-2xl p-4.5 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-400">Rata-Rata Daya Beda (D)</span>
            <span className="p-1.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-emerald-700 dark:text-emerald-400">
              {stats.avgDiscrimination.toFixed(2)}
            </span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {stats.avgDiscrimination >= 0.35 ? 'Sangat Bagus' : stats.avgDiscrimination >= 0.20 ? 'Cukup Baik' : 'Lemah'}
            </span>
          </div>

          {/* Visual Mini Progress Bar */}
          <div className="space-y-1">
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(Math.max(stats.avgDiscrimination * 100, 10), 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>0.00 (Lemah)</span>
              <span>≥0.40 (Prima)</span>
            </div>
          </div>

          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-400 flex items-center justify-between">
            <span>Daya Diskriminasi:</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-300">
              {stats.avgDiscrimination >= 0.30 ? 'Membedakan Tajam' : 'Perlu Dipertajam'}
            </span>
          </div>
        </div>

        {/* KPI 3: Soal Berkualitas Ideal */}
        <div className="bg-gradient-to-br from-teal-50/50 to-white dark:from-slate-800/80 dark:to-slate-900 border border-teal-100 dark:border-slate-800 rounded-2xl p-4.5 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-400">Soal Standar Emas (Ideal)</span>
            <span className="p-1.5 bg-teal-100 dark:bg-teal-950 text-teal-600 dark:text-teal-400 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-teal-700 dark:text-teal-400">
              {stats.idealQuestionsCount}
            </span>
            <span className="text-xs font-normal text-slate-500">
              / {totalQuestions} Butir
            </span>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-teal-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${totalQuestions > 0 ? (stats.idealQuestionsCount / totalQuestions) * 100 : 0}%` }}
            />
          </div>

          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-400 flex items-center justify-between">
            <span>Proporsi Layak:</span>
            <span className="font-bold text-teal-700 dark:text-teal-300">
              {totalQuestions > 0 ? Math.round((stats.idealQuestionsCount / totalQuestions) * 100) : 0}% Bank Soal
            </span>
          </div>
        </div>

        {/* KPI 4: Butir Perlu Review */}
        <div className="bg-gradient-to-br from-rose-50/50 to-white dark:from-slate-800/80 dark:to-slate-900 border border-rose-100 dark:border-slate-800 rounded-2xl p-4.5 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-400">Perlu Peninjauan Guru</span>
            <span className="p-1.5 bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-rose-600 dark:text-rose-400">
              {stats.needsReviewCount}
            </span>
            <span className="text-xs font-normal text-slate-500">
              / {totalQuestions} Butir
            </span>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-rose-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${totalQuestions > 0 ? (stats.needsReviewCount / totalQuestions) * 100 : 0}%` }}
            />
          </div>

          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-400 flex items-center justify-between">
            <span>Rekomendasi Tindakan:</span>
            <span className={`font-bold ${stats.needsReviewCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {stats.needsReviewCount > 0 ? 'Periksa Kunci / Opsi' : 'Semua Soal Valid'}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* VISUAL SPECTRUMS & MATRIX ROW (DUAL GRAPHICAL BARS) */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribusi Tingkat Kesukaran Soal */}
        <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Grafik Distribusi Tingkat Kesukaran Soal
              </h4>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              Target Ideal: 20% - 60% - 20%
            </span>
          </div>

          {/* Stacked Visual Bar */}
          <div className="w-full h-6 rounded-xl overflow-hidden flex bg-slate-200 dark:bg-slate-800 p-0.5 shadow-inner">
            {totalQuestions > 0 ? (
              <>
                <div
                  title={`Mudah: ${stats.difficultyCategoryCounts.MUDAH} Soal (${Math.round((stats.difficultyCategoryCounts.MUDAH / totalQuestions) * 100)}%)`}
                  className="bg-emerald-500 h-full flex items-center justify-center text-[10px] font-bold text-white transition-all hover:opacity-90"
                  style={{ width: `${(stats.difficultyCategoryCounts.MUDAH / totalQuestions) * 100}%` }}
                >
                  {stats.difficultyCategoryCounts.MUDAH > 0 && `${Math.round((stats.difficultyCategoryCounts.MUDAH / totalQuestions) * 100)}%`}
                </div>
                <div
                  title={`Sedang: ${stats.difficultyCategoryCounts.SEDANG} Soal (${Math.round((stats.difficultyCategoryCounts.SEDANG / totalQuestions) * 100)}%)`}
                  className="bg-indigo-600 h-full flex items-center justify-center text-[10px] font-bold text-white transition-all hover:opacity-90"
                  style={{ width: `${(stats.difficultyCategoryCounts.SEDANG / totalQuestions) * 100}%` }}
                >
                  {stats.difficultyCategoryCounts.SEDANG > 0 && `${Math.round((stats.difficultyCategoryCounts.SEDANG / totalQuestions) * 100)}%`}
                </div>
                <div
                  title={`Sulit: ${stats.difficultyCategoryCounts.SULIT} Soal (${Math.round((stats.difficultyCategoryCounts.SULIT / totalQuestions) * 100)}%)`}
                  className="bg-rose-500 h-full flex items-center justify-center text-[10px] font-bold text-white transition-all hover:opacity-90"
                  style={{ width: `${(stats.difficultyCategoryCounts.SULIT / totalQuestions) * 100}%` }}
                >
                  {stats.difficultyCategoryCounts.SULIT > 0 && `${Math.round((stats.difficultyCategoryCounts.SULIT / totalQuestions) * 100)}%`}
                </div>
              </>
            ) : (
              <div className="w-full text-center text-xs text-slate-400">Tidak ada butir soal</div>
            )}
          </div>

          {/* Legend Details */}
          <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
            <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Mudah (p &gt; 0.70)</span>
              </div>
              <div className="text-base font-black font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                {stats.difficultyCategoryCounts.MUDAH} <span className="text-[10px] font-normal text-slate-400">Soal</span>
              </div>
            </div>

            <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                <span>Sedang (Ideal)</span>
              </div>
              <div className="text-base font-black font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                {stats.difficultyCategoryCounts.SEDANG} <span className="text-[10px] font-normal text-slate-400">Soal</span>
              </div>
            </div>

            <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-center gap-1.5 text-rose-600 dark:text-rose-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Sulit (p &lt; 0.30)</span>
              </div>
              <div className="text-base font-black font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                {stats.difficultyCategoryCounts.SULIT} <span className="text-[10px] font-normal text-slate-400">Soal</span>
              </div>
            </div>
          </div>
        </div>

        {/* Distribusi Daya Pembeda Soal */}
        <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Grafik Distribusi Daya Pembeda Soal
              </h4>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              Target Ideal: D ≥ 0.30
            </span>
          </div>

          {/* Stacked Visual Bar */}
          <div className="w-full h-6 rounded-xl overflow-hidden flex bg-slate-200 dark:bg-slate-800 p-0.5 shadow-inner">
            {totalQuestions > 0 ? (
              <>
                <div
                  title={`Sangat Baik: ${stats.discriminationCategoryCounts.SANGAT_BAIK} Soal`}
                  className="bg-emerald-600 h-full flex items-center justify-center text-[10px] font-bold text-white transition-all hover:opacity-90"
                  style={{ width: `${(stats.discriminationCategoryCounts.SANGAT_BAIK / totalQuestions) * 100}%` }}
                >
                  {stats.discriminationCategoryCounts.SANGAT_BAIK > 0 && `${Math.round((stats.discriminationCategoryCounts.SANGAT_BAIK / totalQuestions) * 100)}%`}
                </div>
                <div
                  title={`Baik: ${stats.discriminationCategoryCounts.BAIK} Soal`}
                  className="bg-indigo-500 h-full flex items-center justify-center text-[10px] font-bold text-white transition-all hover:opacity-90"
                  style={{ width: `${(stats.discriminationCategoryCounts.BAIK / totalQuestions) * 100}%` }}
                >
                  {stats.discriminationCategoryCounts.BAIK > 0 && `${Math.round((stats.discriminationCategoryCounts.BAIK / totalQuestions) * 100)}%`}
                </div>
                <div
                  title={`Cukup: ${stats.discriminationCategoryCounts.CUKUP} Soal`}
                  className="bg-amber-500 h-full flex items-center justify-center text-[10px] font-bold text-white transition-all hover:opacity-90"
                  style={{ width: `${(stats.discriminationCategoryCounts.CUKUP / totalQuestions) * 100}%` }}
                >
                  {stats.discriminationCategoryCounts.CUKUP > 0 && `${Math.round((stats.discriminationCategoryCounts.CUKUP / totalQuestions) * 100)}%`}
                </div>
                <div
                  title={`Buruk/Negatif: ${stats.discriminationCategoryCounts.BURUK} Soal`}
                  className="bg-rose-500 h-full flex items-center justify-center text-[10px] font-bold text-white transition-all hover:opacity-90"
                  style={{ width: `${(stats.discriminationCategoryCounts.BURUK / totalQuestions) * 100}%` }}
                >
                  {stats.discriminationCategoryCounts.BURUK > 0 && `${Math.round((stats.discriminationCategoryCounts.BURUK / totalQuestions) * 100)}%`}
                </div>
              </>
            ) : (
              <div className="w-full text-center text-xs text-slate-400">Tidak ada butir soal</div>
            )}
          </div>

          {/* Legend Details */}
          <div className="grid grid-cols-4 gap-1.5 pt-1 text-center text-xs">
            <div className="p-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">Sangat Baik</span>
              <span className="text-sm font-black font-mono text-slate-900 dark:text-slate-100">{stats.discriminationCategoryCounts.SANGAT_BAIK}</span>
            </div>
            <div className="p-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold block">Baik</span>
              <span className="text-sm font-black font-mono text-slate-900 dark:text-slate-100">{stats.discriminationCategoryCounts.BAIK}</span>
            </div>
            <div className="p-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block">Cukup</span>
              <span className="text-sm font-black font-mono text-slate-900 dark:text-slate-100">{stats.discriminationCategoryCounts.CUKUP}</span>
            </div>
            <div className="p-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold block">Buruk/Rev</span>
              <span className="text-sm font-black font-mono text-slate-900 dark:text-slate-100">{stats.discriminationCategoryCounts.BURUK}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4-QUADRANT PSYCHOMETRIC MATRIX (KUADRAN KUALITAS SOAL) */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
              <span>Matriks Kualitas Soal (Tingkat Kesukaran vs Daya Pembeda)</span>
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Pemetaan posisi setiap butir soal untuk menentukan kelayakan simpan di Bank Soal Sekolah.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Kuadran 1: Ideal / Prima */}
          <div className="bg-white dark:bg-slate-900 border-2 border-emerald-500/40 rounded-2xl p-4 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono">
                KUADRAN I
              </span>
              <span className="text-sm font-black font-mono text-emerald-600">
                {stats.quadrants.q1_ideal.length} Soal
              </span>
            </div>
            <div>
              <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Soal Prima (Ideal)
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Kesukaran Sedang + Daya Beda Tinggi. Kualitas emas bank soal.
              </p>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {stats.quadrants.q1_ideal.slice(0, 6).map(q => (
                <span
                  key={q.questionId}
                  onClick={() => setExpandedItemId(q.questionId)}
                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-pointer hover:scale-105 transition-transform"
                >
                  {q.uniqueCode || `No.${q.questionNumber}`}
                </span>
              ))}
              {stats.quadrants.q1_ideal.length > 6 && (
                <span className="text-[10px] font-mono text-slate-400 self-center">
                  +{stats.quadrants.q1_ideal.length - 6} lainnya
                </span>
              )}
            </div>
          </div>

          {/* Kuadran 2: Penantang / Pembeda Kuat */}
          <div className="bg-white dark:bg-slate-900 border-2 border-indigo-500/40 rounded-2xl p-4 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-mono">
                KUADRAN II
              </span>
              <span className="text-sm font-black font-mono text-indigo-600">
                {stats.quadrants.q2_hard_discriminating.length} Soal
              </span>
            </div>
            <div>
              <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Soal Penantang Seleksi
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Kesukaran Sulit + Daya Beda Tinggi. Bagus untuk memisahkan siswa jenius.
              </p>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {stats.quadrants.q2_hard_discriminating.slice(0, 6).map(q => (
                <span
                  key={q.questionId}
                  onClick={() => setExpandedItemId(q.questionId)}
                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer hover:scale-105 transition-transform"
                >
                  {q.uniqueCode || `No.${q.questionNumber}`}
                </span>
              ))}
              {stats.quadrants.q2_hard_discriminating.length > 6 && (
                <span className="text-[10px] font-mono text-slate-400 self-center">
                  +{stats.quadrants.q2_hard_discriminating.length - 6} lainnya
                </span>
              )}
            </div>
          </div>

          {/* Kuadran 3: Pemantik / Mudah */}
          <div className="bg-white dark:bg-slate-900 border-2 border-teal-500/40 rounded-2xl p-4 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 font-mono">
                KUADRAN III
              </span>
              <span className="text-sm font-black font-mono text-teal-600">
                {stats.quadrants.q3_easy_discriminating.length} Soal
              </span>
            </div>
            <div>
              <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Soal Apersepsi / Mudah
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Kesukaran Mudah + Daya Beda Cukup. Membangun kepercayaan diri peserta.
              </p>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {stats.quadrants.q3_easy_discriminating.slice(0, 6).map(q => (
                <span
                  key={q.questionId}
                  onClick={() => setExpandedItemId(q.questionId)}
                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 cursor-pointer hover:scale-105 transition-transform"
                >
                  {q.uniqueCode || `No.${q.questionNumber}`}
                </span>
              ))}
              {stats.quadrants.q3_easy_discriminating.length > 6 && (
                <span className="text-[10px] font-mono text-slate-400 self-center">
                  +{stats.quadrants.q3_easy_discriminating.length - 6} lainnya
                </span>
              )}
            </div>
          </div>

          {/* Kuadran 4: Cacat / Perlu Revisi */}
          <div className="bg-white dark:bg-slate-900 border-2 border-rose-500/40 rounded-2xl p-4 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-mono">
                KUADRAN IV
              </span>
              <span className="text-sm font-black font-mono text-rose-600">
                {stats.quadrants.q4_problematic.length} Soal
              </span>
            </div>
            <div>
              <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Perlu Koreksi / Revisi
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Daya beda rendah / negatif. Pilihan pengecoh tidak berfungsi efektif.
              </p>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {stats.quadrants.q4_problematic.slice(0, 6).map(q => (
                <span
                  key={q.questionId}
                  onClick={() => setExpandedItemId(q.questionId)}
                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 cursor-pointer hover:scale-105 transition-transform"
                >
                  {q.uniqueCode || `No.${q.questionNumber}`}
                </span>
              ))}
              {stats.quadrants.q4_problematic.length > 6 && (
                <span className="text-[10px] font-mono text-slate-400 self-center">
                  +{stats.quadrants.q4_problematic.length - 6} lainnya
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* INTERACTIVE QUESTION LIST & TABLE SECTION */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-4 pt-2">
        {/* Controls Toolbar: Tab Filters, Search, View Mode Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Quick Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveFilterTab('ALL')}
              className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
                activeFilterTab === 'ALL'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Semua ({totalQuestions})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilterTab('NEEDS_REVIEW')}
              className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all flex items-center gap-1 ${
                activeFilterTab === 'NEEDS_REVIEW'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Perlu Revisi ({stats.needsReviewCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFilterTab('IDEAL')}
              className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all flex items-center gap-1 ${
                activeFilterTab === 'IDEAL'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
              }`}
            >
              <Check className="w-3 h-3" />
              <span>Ideal ({stats.idealQuestionsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFilterTab('DIFFICULT')}
              className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
                activeFilterTab === 'DIFFICULT'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Tersulit ({stats.difficultyCategoryCounts.SULIT})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilterTab('EASY')}
              className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
                activeFilterTab === 'EASY'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Termudah ({stats.difficultyCategoryCounts.MUDAH})
            </button>
          </div>

          {/* Search Input & View Switcher */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari butir soal / kode..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44 sm:w-56"
              />
            </div>

            <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('CARDS')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  viewMode === 'CARDS' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
                }`}
                title="Tampilan Kartu Visual"
              >
                Kartu
              </button>
              <button
                type="button"
                onClick={() => setViewMode('TABLE')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  viewMode === 'TABLE' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
                }`}
                title="Tampilan Tabel Rinci"
              >
                Tabel
              </button>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* CARD VIEW MODE */}
        {/* ------------------------------------------------------------------ */}
        {viewMode === 'CARDS' && (
          <div className="space-y-3">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
                Tidak ada butir soal yang cocok dengan filter yang dipilih.
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const diffBadge = getDifficultyBadge(item.difficultyIndex);
                const discBadge = getDiscriminationBadge(item.discriminationIndex);
                const isExpanded = expandedItemId === item.questionId;
                const isProblematic = item.reviewRecommendation === 'Needs Review' || item.discriminationIndex < 0.20;

                return (
                  <div
                    key={item.questionId}
                    className={`p-4 rounded-2xl border transition-all ${
                      isProblematic
                        ? 'bg-rose-50/30 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      {/* Left: Code, Index, Question Text */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                            {item.uniqueCode || `Butir #${idx + 1}`}
                          </span>

                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            Kunci: <strong className="text-emerald-600 dark:text-emerald-400 font-mono text-xs">{item.correctAnswer}</strong>
                          </span>

                          {isProblematic && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Perlu Tinjauan Guru</span>
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed">
                          {item.questionText}
                        </p>
                      </div>

                      {/* Right: Difficulty & Discrimination Gauges */}
                      <div className="flex items-center gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                        {/* Difficulty Meter */}
                        <div className="w-32 space-y-1">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-slate-500 font-semibold">Kesukaran (p)</span>
                            <span className={`font-mono font-bold ${diffBadge.textColor}`}>
                              {item.difficultyIndex.toFixed(2)}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div
                              className={`${diffBadge.barColor} h-full rounded-full transition-all`}
                              style={{ width: `${Math.min(item.difficultyIndex * 100, 100)}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border block text-center ${diffBadge.color}`}>
                            {diffBadge.label}
                          </span>
                        </div>

                        {/* Discrimination Meter */}
                        <div className="w-32 space-y-1">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-slate-500 font-semibold">Daya Beda (D)</span>
                            <span className={`font-mono font-bold ${discBadge.textColor}`}>
                              {item.discriminationIndex.toFixed(2)}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div
                              className={`${discBadge.barColor} h-full rounded-full transition-all`}
                              style={{ width: `${Math.min(Math.max(item.discriminationIndex * 100, 5), 100)}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border block text-center ${discBadge.color}`}>
                            {discBadge.label}
                          </span>
                        </div>

                        {/* Toggle Details Button */}
                        <button
                          type="button"
                          onClick={() => setExpandedItemId(isExpanded ? null : item.questionId)}
                          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                          title="Lihat Sebaran Pilihan Jawaban (Pengecoh)"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* EXPANDED DISTRACTOR DIAGNOSTIC DRAWER */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-fade-in text-xs">
                        {/* Review Reasons Warning if problematic */}
                        {item.reviewReasons && item.reviewReasons.length > 0 && (
                          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl space-y-1">
                            <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                              <ShieldAlert className="w-4 h-4 text-amber-600" />
                              <span>Catatan Diagnosis Sistem:</span>
                            </span>
                            <ul className="text-[11px] text-amber-800 dark:text-amber-300 list-disc list-inside space-y-0.5">
                              {item.reviewReasons.map((reason, rIdx) => (
                                <li key={rIdx}>{reason}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Option Distractor Breakdown Grid */}
                        <div>
                          <span className="font-bold text-slate-700 dark:text-slate-300 block mb-2">
                            Analisis Sebaran Pilihan Jawaban Siswa (Efektivitas Pengecoh):
                          </span>
                          {(() => {
                            const validKeys = (Array.isArray(item.options) && item.options.length > 0)
                              ? item.options.map((o: any) => o.key.toUpperCase()).filter((k: string) => ['A', 'B', 'C', 'D', 'E'].includes(k))
                              : Object.keys(item.distractorStats || item.distractorCounts || {}).filter(k => ['A', 'B', 'C', 'D', 'E'].includes(k) && (k !== 'E' || (item.distractorStats?.[k]?.count || item.distractorCounts?.[k] || 0) > 0));
                            const renderKeys = validKeys.length > 0 ? validKeys : ['A', 'B', 'C', 'D'];
                            const colsClass = renderKeys.length <= 4 ? 'grid-cols-4' : 'grid-cols-5';

                            return (
                              <div className={`grid ${colsClass} gap-2`}>
                                {renderKeys.map((opt: string) => {
                                  const isCorrectKey = opt === item.correctAnswer;
                                  const stat = item.distractorStats?.[opt];
                                  const count = stat ? stat.count : (item.distractorCounts?.[opt] || 0);
                                  const totalResp = item.totalRespondents || 1;
                                  const pct = stat ? stat.percentage : Math.round((count / totalResp) * 100);
                                  const isDeadDistractor = !isCorrectKey && pct < 5; // Pengecoh mati (< 5%)

                                  return (
                                    <div
                                      key={opt}
                                      className={`p-2.5 rounded-xl border text-center transition-all ${
                                        isCorrectKey
                                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800'
                                          : isDeadDistractor
                                          ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 opacity-60'
                                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                                      }`}
                                    >
                                      <div className="flex items-center justify-center gap-1 font-mono font-bold text-xs">
                                        <span className={isCorrectKey ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}>
                                          Opsi {opt}
                                        </span>
                                        {isCorrectKey && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                                      </div>
                                      <div className="text-base font-black font-mono text-slate-900 dark:text-white mt-1">
                                        {count} <span className="text-[10px] font-normal text-slate-400">({pct}%)</span>
                                      </div>
                                      <span className={`text-[9px] font-bold mt-1 block truncate ${
                                        isCorrectKey
                                          ? 'text-emerald-700 dark:text-emerald-300'
                                          : isDeadDistractor
                                          ? 'text-slate-400'
                                          : 'text-indigo-600 dark:text-indigo-400'
                                      }`}>
                                        {isCorrectKey ? 'KUNCI BENAR' : isDeadDistractor ? 'Pengecoh Mati' : 'Berfungsi Baik'}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Quick Action Links */}
                        <div className="flex items-center justify-end gap-2 pt-2">
                          {onNavigateToQuestionBank && (
                            <button
                              type="button"
                              onClick={onNavigateToQuestionBank}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <span>Buka di Question Bank</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onNavigateToExplanations && (
                            <button
                              type="button"
                              onClick={() => onNavigateToExplanations(item.questionId)}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <span>Lihat Pembahasan</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TABLE VIEW MODE */}
        {/* ------------------------------------------------------------------ */}
        {viewMode === 'TABLE' && (
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-auto max-h-[460px] sm:max-h-[560px] scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold sticky top-0 z-20 shadow-xs">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">No</th>
                    <th className="py-2.5 px-3 w-32">Kode Soal</th>
                    <th className="py-2.5 px-3">Teks &amp; Kunci</th>
                    <th className="py-2.5 px-3 w-32 text-center">Kesukaran (p)</th>
                    <th className="py-2.5 px-3 w-36 text-center">Daya Beda (D)</th>
                    <th className="py-2.5 px-3 w-32 text-center">Status Butir</th>
                    <th className="py-2.5 px-3 w-28 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                        Tidak ada butir soal yang sesuai filter.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => {
                      const diffBadge = getDifficultyBadge(item.difficultyIndex);
                      const discBadge = getDiscriminationBadge(item.discriminationIndex);
                      const isProblematic = item.reviewRecommendation === 'Needs Review' || item.discriminationIndex < 0.20;

                      return (
                        <tr key={item.questionId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-400">
                            {item.uniqueCode}
                          </td>
                          <td className="py-3 px-3">
                            <div className="line-clamp-1 text-slate-900 dark:text-slate-100 font-medium">
                              {item.questionText}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              Kunci: <strong className="text-emerald-600">{item.correctAnswer}</strong> · Responden: {item.totalRespondents}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100 block">
                              {item.difficultyIndex.toFixed(2)}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border inline-block mt-0.5 ${diffBadge.color}`}>
                              {diffBadge.label}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`font-mono font-bold block ${discBadge.textColor}`}>
                              {item.discriminationIndex.toFixed(2)}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border inline-block mt-0.5 ${discBadge.color}`}>
                              {discBadge.label}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {isProblematic ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-rose-100 text-rose-700 border border-rose-300">
                                Perlu Revisi
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-300">
                                Layak (Valid)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setViewMode('CARDS');
                                setExpandedItemId(item.questionId);
                              }}
                              className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 font-semibold cursor-pointer underline"
                            >
                              Detail
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
        )}
      </div>
    </div>
  );
};
