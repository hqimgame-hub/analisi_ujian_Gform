import React, { useState, useMemo } from 'react';
import {
  CheckCircle2, XCircle, HelpCircle, BookOpen, Play, FileText, Search,
  Filter, Check, AlertCircle, ArrowUpRight, Sparkles, ExternalLink, RefreshCw
} from 'lucide-react';
import { Question, Subject, Explanation, Tryout } from '../../types/database';
import { QuestionPerformanceDetail } from '../../services/analytics';
import { getFriendlyTryoutStageLabel } from '../../utils/tryoutGroupUtils';

interface StudentQuestionSheetProps {
  questions: Question[];
  questionPerformance: QuestionPerformanceDetail[];
  subjects: Subject[];
  explanations: Explanation[];
  onWatchVideo: (url: string, title: string) => void;
  activeTryoutCode: string;
  tryouts?: Tryout[];
  selectedTryoutId?: string;
  onSelectTryout?: (tryoutId: string) => void;
  hideSubjectFilter?: boolean;
  onSyncMyAnswers?: () => Promise<void>;
  isSyncingMyAnswers?: boolean;
}

export const StudentQuestionSheet: React.FC<StudentQuestionSheetProps> = ({
  questions,
  questionPerformance,
  subjects,
  explanations,
  onWatchVideo,
  activeTryoutCode,
  tryouts,
  selectedTryoutId,
  onSelectTryout,
  hideSubjectFilter = false,
  onSyncMyAnswers,
  isSyncingMyAnswers = false,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CORRECT' | 'INCORRECT' | 'UNANSWERED'>('ALL');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedQuestionNumber, setSelectedQuestionNumber] = useState<number | null>(null);

  // Stats calculation
  const totalQuestions = questionPerformance.length;
  const correctCount = questionPerformance.filter(qp => qp.isCorrect).length;
  const unansweredCount = questionPerformance.filter(qp => !qp.studentAnswer || qp.studentAnswer === 'KOSONG' || qp.studentAnswer === 'Kosong').length;
  const incorrectCount = questionPerformance.filter(qp => !qp.isCorrect && qp.studentAnswer && qp.studentAnswer !== 'KOSONG' && qp.studentAnswer !== 'Kosong').length;
  const accuracyPct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  // Filtered Questions
  const filteredList = useMemo(() => {
    return questionPerformance.filter(qp => {
      // Status filter
      const isUnanswered = !qp.studentAnswer || qp.studentAnswer === 'KOSONG' || qp.studentAnswer === 'Kosong';
      if (statusFilter === 'CORRECT' && !qp.isCorrect) return false;
      if (statusFilter === 'INCORRECT' && (qp.isCorrect || isUnanswered)) return false;
      if (statusFilter === 'UNANSWERED' && !isUnanswered) return false;

      // Subject filter
      if (selectedSubjectId !== 'ALL') {
        const qObj = questions.find(q => q.id === qp.questionId);
        if (qObj && qObj.subjectId !== selectedSubjectId) return false;
      }

      // Quick jump filter
      if (selectedQuestionNumber !== null && qp.questionNumber !== selectedQuestionNumber) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchCode = qp.uniqueCode.toLowerCase().includes(query);
        const matchText = qp.questionText.toLowerCase().includes(query);
        if (!matchCode && !matchText) return false;
      }

      return true;
    });
  }, [questionPerformance, questions, statusFilter, selectedSubjectId, searchQuery, selectedQuestionNumber]);

  // Group matrix items by subject
  const groupedMatrixBySubject = useMemo(() => {
    const groupMap = new Map<string, {
      subjectId: string;
      subjectName: string;
      subjectCode: string;
      items: typeof questionPerformance;
    }>();

    questionPerformance.forEach(qp => {
      const qObj = questions.find(q => q.id === qp.questionId);
      const subObj = qObj ? subjects.find(s => s.id === qObj.subjectId) : null;
      const subId = subObj?.id || 'DEFAULT_MAPEL';
      const subCode = subObj?.code || 'MAPEL';
      const subName = subObj?.name || 'Mata Pelajaran';

      if (!groupMap.has(subId)) {
        groupMap.set(subId, {
          subjectId: subId,
          subjectName: subName,
          subjectCode: subCode,
          items: [],
        });
      }
      groupMap.get(subId)!.items.push(qp);
    });

    return Array.from(groupMap.values());
  }, [questionPerformance, questions, subjects]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header & Overall Performance Metric */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider font-mono">
              <BookOpen className="w-4 h-4" />
              <span>Lembar Rekap Butir Soal &amp; Jawaban</span>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
              Rekapitulasi Soal yang Telah Dikerjakan
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Evaluasi butir soal, kunci jawaban resmi, dan pembahasan untuk paket{' '}
              <strong className="text-indigo-600 dark:text-indigo-400 font-mono">{activeTryoutCode}</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Tryout Selector in Header */}
            {tryouts && tryouts.length > 0 && onSelectTryout && (
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Paket:</span>
                <select
                  value={selectedTryoutId}
                  onChange={e => onSelectTryout(e.target.value)}
                  className="bg-transparent text-xs font-bold font-mono text-indigo-600 dark:text-indigo-400 focus:outline-none cursor-pointer"
                >
                  {tryouts.map(t => (
                    <option key={t.id} value={t.id} className="text-slate-900 dark:text-slate-100">
                      [{getFriendlyTryoutStageLabel(t, tryouts)}] {t.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <span className="text-xs font-mono font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800">
              Akurasi: {accuracyPct}% ({correctCount}/{totalQuestions})
            </span>

            {onSyncMyAnswers && (
              <button
                type="button"
                onClick={onSyncMyAnswers}
                disabled={isSyncingMyAnswers}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors shadow-2xs cursor-pointer disabled:opacity-60"
                title="Tarik atau perbarui respon pengerjaan Google Form Anda berdasarkan NISN"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingMyAnswers ? 'animate-spin' : ''}`} />
                <span>{isSyncingMyAnswers ? 'Memetakan...' : 'Sinkronkan Form'}</span>
              </button>
            )}
          </div>
        </div>

        {/* 4 Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Total Butir Soal</div>
            <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">{totalQuestions} Soal</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Dikerjakan Siswa</div>
          </div>

          <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800">
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Jawaban Benar</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-0.5">{correctCount} Soal</div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
              {totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0}% Capaian
            </div>
          </div>

          <div className="p-3.5 bg-rose-50/60 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-800">
            <div className="text-[11px] text-rose-700 dark:text-rose-400 font-medium flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" />
              <span>Jawaban Salah</span>
            </div>
            <div className="text-2xl font-bold font-mono text-rose-700 dark:text-rose-300 mt-0.5">{incorrectCount} Soal</div>
            <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">Perlu Remedial</div>
          </div>

          <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800">
            <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Tidak Dijawab</span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-300 mt-0.5">{unansweredCount} Soal</div>
            <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">Opsi Kosong</div>
          </div>
        </div>

        {/* Quick Matrix Grid of Question Numbers Grouped By Subject */}
        <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Matriks Pengerjaan Cepat Per Mata Pelajaran:
              </span>
              <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                (Klik nomor untuk langsung meninjau soal)
              </span>
            </div>
            {selectedQuestionNumber !== null && (
              <button
                type="button"
                onClick={() => setSelectedQuestionNumber(null)}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer self-start sm:self-auto"
              >
                Reset Pilihan Nomor (#{selectedQuestionNumber})
              </button>
            )}
          </div>

          {/* Grouped by Subject Matrix */}
          <div className="space-y-3">
            {groupedMatrixBySubject.map((group) => {
              const groupTotal = group.items.length;
              const groupCorrect = group.items.filter(qp => qp.isCorrect).length;
              const groupUnanswered = group.items.filter(qp => !qp.studentAnswer || qp.studentAnswer === 'KOSONG' || qp.studentAnswer === 'Kosong').length;
              const groupIncorrect = groupTotal - groupCorrect - groupUnanswered;

              return (
                <div
                  key={group.subjectId}
                  className="p-3 bg-slate-50/80 dark:bg-slate-950/70 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-2 transition-colors"
                >
                  {/* Subject Row Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg font-mono font-bold text-xs bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        {group.subjectCode}
                      </span>
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                        {group.subjectName}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        ({groupTotal} Soal)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                        {groupCorrect} Benar
                      </span>
                      <span className="text-rose-700 dark:text-rose-400 bg-rose-100/70 dark:bg-rose-950/70 px-1.5 py-0.5 rounded border border-rose-300 dark:border-rose-800">
                        {groupIncorrect} Salah
                      </span>
                      {groupUnanswered > 0 && (
                        <span className="text-amber-700 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-950/70 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800">
                          {groupUnanswered} Kosong
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Grid Numbers for this Subject */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {group.items.map((qp, idx) => {
                      const qNum = qp.questionNumber || (idx + 1);
                      const isUnanswered = !qp.studentAnswer || qp.studentAnswer === 'KOSONG' || qp.studentAnswer === 'Kosong';
                      const isSelected = selectedQuestionNumber === qNum;

                      let colorClass = 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
                      if (qp.isCorrect) {
                        colorClass = 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700';
                      } else if (isUnanswered) {
                        colorClass = 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700';
                      } else {
                        colorClass = 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700';
                      }

                      return (
                        <button
                          key={qp.questionId}
                          type="button"
                          onClick={() => setSelectedQuestionNumber(isSelected ? null : qNum)}
                          className={`w-8 h-8 rounded-lg font-mono text-xs font-bold flex items-center justify-center border transition-all cursor-pointer ${colorClass} ${
                            isSelected ? 'ring-2 ring-indigo-600 scale-110 shadow-sm' : 'hover:scale-105'
                          }`}
                          title={`[${group.subjectCode}] Soal No. ${qNum}: ${qp.isCorrect ? 'Benar' : isUnanswered ? 'Tidak Dijawab' : 'Salah'}`}
                        >
                          {qNum}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Benar</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>Salah</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>Kosong</span>
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              *Tiap kotak nomor otomatis dikelompokkan berdasarkan mata pelajaran ujian.
            </span>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setStatusFilter('ALL'); setSelectedQuestionNumber(null); }}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Semua ({totalQuestions})
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter('CORRECT'); setSelectedQuestionNumber(null); }}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                statusFilter === 'CORRECT'
                  ? 'bg-emerald-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Benar</span>
              <span className="text-[10px] font-mono px-1 rounded bg-black/10 dark:bg-white/10">{correctCount}</span>
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter('INCORRECT'); setSelectedQuestionNumber(null); }}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                statusFilter === 'INCORRECT'
                  ? 'bg-rose-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Salah</span>
              <span className="text-[10px] font-mono px-1 rounded bg-black/10 dark:bg-white/10">{incorrectCount}</span>
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter('UNANSWERED'); setSelectedQuestionNumber(null); }}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                statusFilter === 'UNANSWERED'
                  ? 'bg-amber-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Kosong</span>
              <span className="text-[10px] font-mono px-1 rounded bg-black/10 dark:bg-white/10">{unansweredCount}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Subject Selector (Hanya muncul jika tidak disembunyikan/bukan mode mapel tunggal seperti SAT) */}
            {!hideSubjectFilter && (
              <select
                value={selectedSubjectId}
                onChange={e => { setSelectedSubjectId(e.target.value); setSelectedQuestionNumber(null); }}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Semua Mata Pelajaran</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari kode/teks soal..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {filteredList.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <BookOpen className="w-12 h-12 text-slate-400 mx-auto" />
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Tidak Ada Butir Soal Sesuai Kriteria
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Tidak ditemukan soal pada filter terpilih. Coba ubah filter status atau kata kunci pencarian.
            </p>
          </div>
        ) : (
          filteredList.map((qp, idx) => {
            const qObj = questions.find(q => q.id === qp.questionId);
            const qNum = qp.questionNumber || (idx + 1);
            const isUnanswered = !qp.studentAnswer || qp.studentAnswer === 'KOSONG' || qp.studentAnswer === 'Kosong';
            
            const isMatchSub = (id1?: string, id2?: string) => {
              if (!id1 || !id2) return true;
              if (id1 === id2) return true;
              const s1 = subjects.find(s => s.id === id1 || s.code === id1);
              const s2 = subjects.find(s => s.id === id2 || s.code === id2);
              if (s1 && s2) return s1.id === s2.id || s1.code.toLowerCase() === s2.code.toLowerCase();
              return false;
            };

            // Prioritaskan video/pembahasan yang secara spesifik mencakup nomor soal ini dan mata pelajaran yang cocok
            const matchedExp = explanations.find(e => {
              const matchSubject = isMatchSub(e.subjectId, qObj?.subjectId);
              if (!matchSubject) return false;

              if (Array.isArray(e.questionNumbers) && e.questionNumbers.length > 0) {
                return e.questionNumbers.includes(qNum);
              }
              if (Array.isArray(e.questionIds) && e.questionIds.length > 0) {
                return e.questionIds.includes(qp.questionId);
              }
              if (e.questionId && e.questionId !== 'GENERAL') {
                return e.questionId === qp.questionId;
              }
              return false;
            }) || explanations.find(e => (!e.questionNumbers || e.questionNumbers.length === 0) && (!e.questionId || e.questionId === 'GENERAL') && isMatchSub(e.subjectId, qObj?.subjectId));
            
            const subjectObj = qObj ? subjects.find(s => s.id === qObj.subjectId) : null;

            return (
              <div
                key={qp.questionId}
                className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-all hover:border-slate-300 dark:hover:border-slate-700"
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-mono font-bold text-xs flex items-center justify-center">
                      #{qNum}
                    </span>
                    <span className="font-mono font-bold text-xs text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 px-2.5 py-1 rounded-xl border border-indigo-200 dark:border-indigo-800">
                      {qp.uniqueCode}
                    </span>
                    {subjectObj && (
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {subjectObj.name} ({subjectObj.code})
                      </span>
                    )}
                  </div>

                  {/* Status Outcome Badge */}
                  <div>
                    {qp.isCorrect ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>BENAR (+{qp.weight || 1} Poin)</span>
                      </span>
                    ) : isUnanswered ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-mono text-xs font-bold border border-amber-200 dark:border-amber-800">
                        <HelpCircle className="w-4 h-4 text-amber-600" />
                        <span>TIDAK DIJAWAB (0 Poin)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-mono text-xs font-bold border border-rose-200 dark:border-rose-800">
                        <XCircle className="w-4 h-4 text-rose-600" />
                        <span>SALAH (0 Poin)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Question Body */}
                <div className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed font-medium">
                  {qp.questionText}
                </div>

                {/* Multiple Choice Options List */}
                {qp.options && qp.options.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 pt-2">
                    {qp.options.map(opt => {
                      const isStudentChoice = qp.studentAnswer === opt.key;
                      const isCorrectChoice = qp.correctAnswer === opt.key;

                      let optContainerClass = 'bg-slate-50 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300';
                      let badgeLetterClass = 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300';

                      if (isCorrectChoice) {
                        optContainerClass = 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100 ring-1 ring-emerald-400/40';
                        badgeLetterClass = 'bg-emerald-600 text-white font-bold';
                      } else if (isStudentChoice && !qp.isCorrect) {
                        optContainerClass = 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-100';
                        badgeLetterClass = 'bg-rose-600 text-white font-bold';
                      }

                      return (
                        <div
                          key={opt.key}
                          className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-3 transition-colors ${optContainerClass}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-lg font-mono text-xs flex items-center justify-center shrink-0 ${badgeLetterClass}`}>
                              {opt.key}
                            </span>
                            <span className="font-medium leading-relaxed">{opt.text}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isCorrectChoice && (
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold font-mono text-[10px] border border-emerald-300 dark:border-emerald-800">
                                Kunci Benar
                              </span>
                            )}
                            {isStudentChoice && (
                              <span className={`px-2 py-0.5 rounded-lg font-bold font-mono text-[10px] border ${
                                qp.isCorrect
                                  ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200 border-emerald-400'
                                  : 'bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-200 border-rose-400'
                              }`}>
                                Jawaban Anda
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Explanation Banner & Actions */}
                {matchedExp && (
                  <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-bold">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>Pembahasan Resmi Guru: {matchedExp.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Disusun oleh: {matchedExp.authorName || 'Guru Mata Pelajaran'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {matchedExp.youtubeUrl && (
                        <button
                          type="button"
                          onClick={() => onWatchVideo(matchedExp.youtubeUrl!, matchedExp.title)}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Tonton Video</span>
                        </button>
                      )}

                      {matchedExp.pdfUrl && (
                        <a
                          href={matchedExp.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-xs"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Modul PDF</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
