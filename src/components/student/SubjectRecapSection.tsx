import React, { useState } from 'react';
import {
  BookOpen, BarChart3, Layers, Search, Download, CheckCircle2, XCircle,
  ArrowUpRight, ArrowDownRight, LayoutGrid, Table, Video, Sparkles, ArrowLeftRight
} from 'lucide-react';
import { Subject, Student } from '../../types/database';

export interface SubjectRecapRow {
  subject: Subject;
  passingGrade: number;
  toScores: Record<string, number>;
  avgScore: number;
  isPassing: boolean;
  trend: number;
}

interface SubjectRecapSectionProps {
  student: Student;
  subjects: Subject[];
  progressHistory: Array<{
    code: string;
    title: string;
    date: string;
    score: number;
    classAverage?: number;
    subjectClassAverages?: Record<string, number>;
    subjectBreakdownLabel?: string;
  }>;
  subjectRecapRows: SubjectRecapRow[];
  onOpenSubjectExplanations: (subjectId: string) => void;
  onExportCSV: () => void;
}

export const SubjectRecapSection: React.FC<SubjectRecapSectionProps> = ({
  student,
  subjects,
  progressHistory,
  subjectRecapRows,
  onOpenSubjectExplanations,
  onExportCSV,
}) => {
  const [selectedSubjectChartId, setSelectedSubjectChartId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'WAJIB' | 'PEMINATAN'>('ALL');
  const [displayMode, setDisplayMode] = useState<'TABLE' | 'CARDS'>('TABLE');

  const tryoutCodes = progressHistory.map(p => p.code);

  // Filtered rows
  const filteredRows = subjectRecapRows.filter(r => {
    const matchSearch =
      r.subject.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.subject.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory =
      categoryFilter === 'ALL' || r.subject.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  // Composite column averages (hanya dari mata pelajaran yang memiliki nilai > 0 pada TO tersebut)
  const compositeToAverages: Record<string, number> = {};
  tryoutCodes.forEach(code => {
    const vals = subjectRecapRows.map(r => r.toScores[code] || 0).filter(v => v > 0);
    const avg = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
    compositeToAverages[code] = avg;
  });

  const overallAvg = subjectRecapRows.length > 0
    ? Math.round((subjectRecapRows.reduce((acc, r) => acc + (r.avgScore || 0), 0) / subjectRecapRows.length) * 10) / 10
    : 0;

  const totalPassed = subjectRecapRows.filter(r => r.isPassing).length;

  // Chart datasets
  const activeSubjectObj = subjects.find(s => s.id === selectedSubjectChartId);
  const activeRow = subjectRecapRows.find(r => r.subject.id === selectedSubjectChartId);
  const currentPassingGrade = activeSubjectObj?.passingGrade ?? 75.0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. GRAFIK PERKEMBANGAN PER-MATA PELAJARAN */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 sm:space-y-6 transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 text-xs font-bold uppercase tracking-wider font-mono">
              <BookOpen className="w-4 h-4" />
              <span>Grafik Try Out Per-Mata Pelajaran</span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
              {selectedSubjectChartId === 'ALL'
                ? 'Perkembangan Seluruh Mata Pelajaran'
                : `Perkembangan Nilai ${activeSubjectObj?.name}`}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Visualisasi dinamika pertumbuhan belajar siswa dari Try Out awal hingga akhir.
            </p>
          </div>

          {/* Subject Filter Pills */}
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-semibold overflow-x-auto flex-nowrap sm:flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedSubjectChartId('ALL')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer shrink-0 ${
                selectedSubjectChartId === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Semua Mapel
            </button>
            {subjects.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSubjectChartId(s.id)}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  selectedSubjectChartId === s.id
                    ? 'bg-teal-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="font-mono text-[10px] px-1 rounded bg-black/10 dark:bg-white/10 font-bold">{s.code}</span>
                <span className="whitespace-nowrap">{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Chart Viewport */}
        <div className="p-3.5 sm:p-6 bg-slate-50/70 dark:bg-slate-950/80 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>
                {selectedSubjectChartId === 'ALL'
                  ? 'Grafik Komposit Lintas Mata Pelajaran'
                  : `Pencapaian Mapel ${activeSubjectObj?.name}`}
              </span>
            </div>
            {selectedSubjectChartId !== 'ALL' && (
              <span className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800 self-start sm:self-auto">
                Batas KKM Target: {currentPassingGrade.toFixed(1)} Poin
              </span>
            )}
          </div>

          {/* Petunjuk Geser di Layar HP */}
          <div className="flex sm:hidden items-center justify-between text-[11px] font-medium text-teal-700 dark:text-teal-300 bg-teal-50/80 dark:bg-teal-950/50 border border-teal-200/70 dark:border-teal-800/70 px-3 py-1.5 rounded-xl">
            <span>Geser grafik ke samping untuk melihat detail tiap TO</span>
            <span className="font-mono font-bold flex items-center gap-1">
              <ArrowLeftRight className="w-3 h-3 text-teal-600 dark:text-teal-400" />
              <span>Geser</span>
            </span>
          </div>

          <div className="relative w-full mobile-chart-scroll bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs">
            <svg
              className="min-w-[600px] sm:min-w-0 w-full h-auto min-h-[215px] sm:min-h-[250px] overflow-visible"
              viewBox="0 0 1000 315"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient id="subjChartGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d9488" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#0d9488" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines */}
              <line x1="60" y1="40" x2="940" y2="40" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
              <text x="46" y="45" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-bold">100</text>

              <line x1="60" y1="95" x2="940" y2="95" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" strokeDasharray="4 4" />
              <text x="46" y="100" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-bold">75</text>

              <line x1="60" y1="150" x2="940" y2="150" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" strokeDasharray="4 4" />
              <text x="46" y="155" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-bold">50</text>

              <line x1="60" y1="205" x2="940" y2="205" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" strokeDasharray="4 4" />
              <text x="46" y="210" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-bold">25</text>

              <line x1="60" y1="260" x2="940" y2="260" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="1.5" />
              <text x="46" y="265" textAnchor="end" className="text-[13px] fill-slate-400 font-mono font-bold">0</text>

              {/* SINGLE SUBJECT VIEW */}
              {selectedSubjectChartId !== 'ALL' && activeRow && (() => {
                const relevantHistory = progressHistory.filter(item => {
                  const score = activeRow.toScores[item.code];
                  return score !== undefined && score > 0;
                });
                const displayHistory = relevantHistory.length > 0 ? relevantHistory : progressHistory;
                const points = displayHistory.map((item, idx, arr) => {
                  const score = activeRow.toScores[item.code] ?? 0;
                  const classAvg = item.subjectClassAverages?.[selectedSubjectChartId] ?? item.classAverage ?? 75.0;
                  return {
                    code: item.code,
                    date: item.date,
                    score,
                    classAvg,
                    x: arr.length === 1 ? 500 : 80 + (idx / Math.max(1, arr.length - 1)) * 840,
                    y: 260 - (Math.min(100, Math.max(0, score)) / 100) * 220,
                    classAvgY: 260 - (Math.min(100, Math.max(0, classAvg)) / 100) * 220,
                  };
                });

                const polyStr = points.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
                const classAvgStr = points.map(c => `${c.x.toFixed(1)},${c.classAvgY.toFixed(1)}`).join(' ');
                const firstX = points[0]?.x || 80;
                const lastX = points[points.length - 1]?.x || 920;
                const polyGonStr = `${firstX},260 ${polyStr} ${lastX},260`;
                const targetY = 260 - (currentPassingGrade / 100) * 220;

                return (
                  <g>
                    {/* KKM Target Line */}
                    <line x1="60" y1={targetY} x2="940" y2={targetY} stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="6 4" />
                    <rect x="765" y={targetY - 13} width="165" height="24" rx="7" fill="#f59e0b" />
                    <text x="847" y={targetY + 3} textAnchor="middle" className="text-[11.5px] font-mono font-extrabold fill-slate-950">
                      KKM Target ({currentPassingGrade.toFixed(0)} Poin)
                    </text>

                    {/* Gradient Fill */}
                    {points.length > 1 && <polygon points={polyGonStr} fill="url(#subjChartGrad2)" />}

                    {/* Class Avg */}
                    {points.length > 1 ? (
                      <polyline fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray="6 5" opacity="0.85" points={classAvgStr} />
                    ) : points.length === 1 ? (
                      <line x1="60" y1={points[0].classAvgY} x2="940" y2={points[0].classAvgY} stroke="#6366f1" strokeWidth="3" strokeDasharray="6 5" opacity="0.85" />
                    ) : null}

                    {/* Student Score Line */}
                    {points.length > 1 ? (
                      <polyline fill="none" stroke="#0d9488" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" points={polyStr} />
                    ) : points.length === 1 ? (
                      <line x1="60" y1={points[0].y} x2="940" y2={points[0].y} stroke="#0d9488" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
                    ) : null}

                    {/* Nodes */}
                    {points.map((c, i) => (
                      <g key={i}>
                        <line x1={c.x} y1="40" x2={c.x} y2="260" stroke="currentColor" className="text-slate-100 dark:text-slate-800/60" strokeDasharray="3 3" />
                        <circle cx={c.x} cy={c.classAvgY} r="5" fill="#6366f1" stroke="#ffffff" strokeWidth="2" />
                        <circle cx={c.x} cy={c.y} r="11" fill="#0d9488" opacity="0.22" />
                        <circle cx={c.x} cy={c.y} r="6.5" fill="#0d9488" stroke="#ffffff" strokeWidth="2.5" />

                        <g transform={`translate(${c.x - 44}, ${c.y - 36})`}>
                          <rect width="88" height="26" rx="8" className="fill-slate-900 dark:fill-slate-100 shadow-sm" />
                          <text x="44" y="17" textAnchor="middle" className="text-[12.5px] font-mono font-extrabold fill-teal-300 dark:fill-teal-700">
                            {c.score.toFixed(1)} Poin
                          </text>
                        </g>

                        <text x={c.x} y="284" textAnchor="middle" className="text-[14px] font-mono font-extrabold fill-slate-800 dark:fill-slate-200">
                          {c.code}
                        </text>
                        <text x={c.x} y="302" textAnchor="middle" className="text-[11.5px] font-sans fill-slate-400">
                          {c.date}
                        </text>
                      </g>
                    ))}
                  </g>
                );
              })()}

              {/* ALL SUBJECTS COMPOSITE VIEW */}
              {selectedSubjectChartId === 'ALL' && (() => {
                const colors = ['#6366f1', '#0d9488', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];
                const xAxisItems = progressHistory.map((item, idx, arr) => ({
                  ...item,
                  x: arr.length === 1 ? 500 : 80 + (idx / Math.max(1, arr.length - 1)) * 840,
                }));

                return (
                  <g>
                    {/* X-Axis Stage Guides & Labels (TO 1, TO 2, TO 3, ...) */}
                    {xAxisItems.map((axisItem, idx) => (
                      <g key={axisItem.code || idx}>
                        <line
                          x1={axisItem.x}
                          y1="40"
                          x2={axisItem.x}
                          y2="260"
                          stroke="currentColor"
                          className="text-slate-100 dark:text-slate-800/60"
                          strokeDasharray="3 3"
                        />
                        <text
                          x={axisItem.x}
                          y="284"
                          textAnchor="middle"
                          className="text-[14px] font-mono font-extrabold fill-slate-800 dark:fill-slate-200"
                        >
                          {axisItem.code}
                        </text>
                        <text
                          x={axisItem.x}
                          y="302"
                          textAnchor="middle"
                          className="text-[11.5px] font-sans fill-slate-400"
                        >
                          {axisItem.date}
                        </text>
                      </g>
                    ))}

                    {/* Subject Lines (only connecting valid non-zero scores per TO stage so lines never falsely drop to 0) */}
                    {subjectRecapRows.map((row, sIdx) => {
                      const strokeColor = colors[sIdx % colors.length];
                      const validPoints = xAxisItems
                        .map(axisItem => {
                          const score = row.toScores[axisItem.code];
                          if (score === undefined || score <= 0) return null;
                          return {
                            code: axisItem.code,
                            score,
                            x: axisItem.x,
                            y: 260 - (Math.min(100, Math.max(0, score)) / 100) * 220,
                          };
                        })
                        .filter((pt): pt is NonNullable<typeof pt> => pt !== null);

                      const polyStr = validPoints.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

                      return (
                        <g key={row.subject.id}>
                          {validPoints.length > 1 ? (
                            <polyline
                              fill="none"
                              stroke={strokeColor}
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points={polyStr}
                            />
                          ) : validPoints.length === 1 ? (
                            <line
                              x1="60"
                              y1={validPoints[0].y}
                              x2="940"
                              y2={validPoints[0].y}
                              stroke={strokeColor}
                              strokeWidth="3.5"
                              strokeLinecap="round"
                              opacity="0.9"
                            />
                          ) : null}
                          {validPoints.map((c, i) => {
                            const labelOffsetY = sIdx % 2 === 0 ? -32 : 14;
                            return (
                              <g key={i}>
                                <circle cx={c.x} cy={c.y} r="10" fill={strokeColor} opacity="0.2" />
                                <circle cx={c.x} cy={c.y} r="6" fill={strokeColor} stroke="#ffffff" strokeWidth="2" />
                                <g transform={`translate(${c.x - 42}, ${c.y + labelOffsetY})`}>
                                  <rect width="84" height="22" rx="6" fill={strokeColor} opacity="0.94" />
                                  <text x="42" y="15" textAnchor="middle" className="text-[11.5px] font-mono font-extrabold fill-white">
                                    {row.subject.code}: {c.score.toFixed(1)}
                                  </text>
                                </g>
                              </g>
                            );
                          })}
                        </g>
                      );
                    })}
                  </g>
                );
              })()}
            </svg>
          </div>

          {/* Chart Legend */}
          {selectedSubjectChartId === 'ALL' ? (
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              {subjectRecapRows.map((row, sIdx) => {
                const colors = ['#6366f1', '#0d9488', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];
                return (
                  <div key={row.subject.id} className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full inline-block" style={{ backgroundColor: colors[sIdx % colors.length] }} />
                    <span>{row.subject.name} (Rata: {row.avgScore.toFixed(1)})</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-6 pt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <span className="w-5 h-1 bg-teal-600 rounded-full inline-block" />
                <span>Skor Siswa ({activeSubjectObj?.name})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-0.5 border-t-2 border-dashed border-indigo-500 inline-block" />
                <span>Rata-Rata Kelas</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-0.5 border-t-2 border-dashed border-amber-500 inline-block" />
                <span>KKM Target ({currentPassingGrade.toFixed(0)} Poin)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. TABEL / KARTU REKAPITULASI NILAI LINTAS TRY OUT */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
        {/* Header & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider font-mono">
              <Layers className="w-4 h-4" />
              <span>Transkrip Akademik</span>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
              Matriks Nilai Seluruh Mata Pelajaran
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Perbandingan capaian nilai dan perkembangan ketuntasan KKM siswa dari Try Out 1 hingga Try Out 4.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari mapel..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  categoryFilter === 'ALL'
                    ? 'bg-slate-900 dark:bg-slate-800 text-white font-bold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('WAJIB')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  categoryFilter === 'WAJIB'
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Wajib
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('PEMINATAN')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  categoryFilter === 'PEMINATAN'
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Peminatan
              </button>
            </div>

            {/* Display Mode Toggle (Table vs Cards) */}
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDisplayMode('TABLE')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  displayMode === 'TABLE'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
                title="Tampilan Tabel"
              >
                <Table className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tabel</span>
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('CARDS')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  displayMode === 'CARDS'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
                title="Tampilan Kartu Ringkas (Mobile Friendly)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kartu</span>
              </button>
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={onExportCSV}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
              title="Unduh Rekapitulasi Nilai ke format CSV/Excel"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Unduh CSV</span>
            </button>
          </div>
        </div>

        {/* 3 Summary Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">Total Mata Pelajaran</span>
              <strong className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono">{subjectRecapRows.length} Mapel</strong>
            </div>
            <span className="text-xs bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold px-2 py-1 rounded-lg">
              Wajib &amp; Peminatan
            </span>
          </div>

          <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium block">Tuntas KKM Target</span>
              <strong className="text-lg font-bold text-emerald-900 dark:text-emerald-100 font-mono">
                {totalPassed} / {subjectRecapRows.length} Mapel
              </strong>
            </div>
            <span className="text-xs bg-emerald-600 text-white font-bold px-2 py-1 rounded-lg">
              {Math.round((totalPassed / Math.max(1, subjectRecapRows.length)) * 100)}% Tuntas
            </span>
          </div>

          <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-indigo-800 dark:text-indigo-300 font-medium block">Rata-Rata Komposit Multimapel</span>
              <strong className="text-lg font-bold text-indigo-900 dark:text-indigo-100 font-mono">
                {overallAvg.toFixed(1)} Poin
              </strong>
            </div>
            <span className="text-xs bg-indigo-600 text-white font-bold px-2 py-1 rounded-lg">
              Skala 0-100
            </span>
          </div>
        </div>

        {/* MODE A: TABLE VIEW */}
        {displayMode === 'TABLE' && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-950/90 text-slate-700 dark:text-slate-300 font-bold font-mono border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider">
                  <th className="py-3 px-3.5 w-12 text-center">No</th>
                  <th className="py-3 px-3.5 min-w-[180px]">Mata Pelajaran</th>
                  <th className="py-3 px-2.5 text-center">Kategori</th>
                  <th className="py-3 px-2.5 text-center">KKM</th>
                  {tryoutCodes.map(code => (
                    <th key={code} className="py-3 px-3.5 text-center min-w-[80px]">
                      {code}
                    </th>
                  ))}
                  <th className="py-3 px-3.5 text-center min-w-[100px] bg-slate-200/60 dark:bg-slate-800/60">
                    Rata-Rata TO
                  </th>
                  <th className="py-3 px-3.5 text-center min-w-[110px]">Status KKM</th>
                  <th className="py-3 px-3.5 text-center min-w-[90px]">Tren</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-slate-900">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6 + tryoutCodes.length} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      Tidak ada data mata pelajaran yang cocok dengan pencarian '{searchQuery}'.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr
                      key={row.subject.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-3 px-3.5 text-center font-mono font-medium text-slate-400">
                        {idx + 1}
                      </td>

                      <td className="py-3 px-3.5 font-semibold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono font-bold text-[10px] text-slate-700 dark:text-slate-300">
                            {row.subject.code}
                          </span>
                          <span>{row.subject.name}</span>
                        </div>
                      </td>

                      <td className="py-3 px-2.5 text-center">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase font-mono ${
                            row.subject.category === 'WAJIB'
                              ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                              : 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                          }`}
                        >
                          {row.subject.category}
                        </span>
                      </td>

                      <td className="py-3 px-2.5 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                        {row.passingGrade.toFixed(0)}
                      </td>

                      {tryoutCodes.map(code => {
                        const score = row.toScores[code];
                        const hasScore = typeof score === 'number' && score > 0;
                        const passed = hasScore && score >= row.passingGrade;
                        return (
                          <td key={code} className="py-3 px-3.5 text-center font-mono font-bold">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-lg text-xs ${
                                !hasScore
                                  ? 'text-slate-400 dark:text-slate-600 bg-slate-100/60 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 font-normal'
                                  : passed
                                  ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80'
                                  : 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80'
                              }`}
                            >
                              {hasScore ? score.toFixed(1) : '-'}
                            </span>
                          </td>
                        );
                      })}

                      <td className="py-3 px-3.5 text-center font-mono font-black text-indigo-700 dark:text-indigo-300 bg-slate-50 dark:bg-slate-950/60 text-sm">
                        {row.avgScore > 0 ? row.avgScore.toFixed(1) : '-'}
                      </td>

                      <td className="py-3 px-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full font-mono ${
                            row.avgScore === 0
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                              : row.isPassing
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {row.avgScore === 0 ? (
                            <span>BELUM ADA DATA</span>
                          ) : row.isPassing ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>TUNTAS KKM</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-rose-600" />
                              <span>BELUM TUNTAS</span>
                            </>
                          )}
                        </span>
                      </td>

                      <td className="py-3 px-3.5 text-center font-mono font-bold">
                        <span
                          className={`inline-flex items-center gap-0.5 text-xs ${
                            row.trend >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {row.trend >= 0 ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          <span>{row.trend >= 0 ? `+${row.trend.toFixed(1)}` : row.trend.toFixed(1)}</span>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-100 dark:bg-slate-950 font-bold border-t-2 border-slate-200 dark:border-slate-800">
                <tr>
                  <td colSpan={4} className="py-3.5 px-3.5 text-right uppercase tracking-wider font-mono text-slate-700 dark:text-slate-300">
                    Rata-Rata Komposit Seluruh Mapel:
                  </td>
                  {tryoutCodes.map(code => (
                    <td key={code} className="py-3.5 px-3.5 text-center font-mono text-indigo-700 dark:text-indigo-300 font-extrabold">
                      {compositeToAverages[code]?.toFixed(1) ?? '0.0'}
                    </td>
                  ))}
                  <td className="py-3.5 px-3.5 text-center font-mono text-emerald-600 dark:text-emerald-400 font-black text-sm bg-slate-200/80 dark:bg-slate-800/80">
                    {overallAvg.toFixed(1)}
                  </td>
                  <td colSpan={2} className="py-3.5 px-3.5 text-center">
                    <span className="text-[10px] bg-indigo-600 text-white font-mono font-bold px-2.5 py-1 rounded-lg">
                      {totalPassed === subjectRecapRows.length ? 'SELESAI TUNTAS' : 'PENGAYAAN BERJALAN'}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* MODE B: MOBILE RESPONSIVE CARDS VIEW */}
        {displayMode === 'CARDS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRows.map(row => (
              <div
                key={row.subject.id}
                className="bg-slate-50 dark:bg-slate-950 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4 transition-all hover:border-indigo-300 dark:hover:border-indigo-800 shadow-xs"
              >
                {/* Header Card */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono font-bold text-xs text-slate-700 dark:text-slate-300">
                        {row.subject.code}
                      </span>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {row.subject.name}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                      <span>Kategori: <strong>{row.subject.category}</strong></span>
                      <span>•</span>
                      <span>KKM Target: <strong className="text-amber-600">{row.passingGrade.toFixed(0)}</strong></span>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full font-mono ${
                      row.isPassing
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}
                  >
                    {row.isPassing ? 'TUNTAS KKM' : 'BELUM TUNTAS'}
                  </span>
                </div>

                {/* Score Pills Grid */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {tryoutCodes.map(code => {
                    const score = row.toScores[code];
                    const hasScore = typeof score === 'number' && score > 0;
                    const passed = hasScore && score >= row.passingGrade;
                    return (
                      <div
                        key={code}
                        className={`p-2 rounded-xl text-center border ${
                          !hasScore
                            ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                            : passed
                            ? 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-800'
                            : 'bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 font-mono block">{code}</span>
                        <strong className={`font-mono text-sm block mt-0.5 ${
                          !hasScore
                            ? 'text-slate-400 dark:text-slate-600 font-normal'
                            : passed
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}>
                          {hasScore ? score.toFixed(1) : '-'}
                        </strong>
                      </div>
                    );
                  })}
                </div>

                {/* Footer Metric & Action */}
                <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Rata-Rata</span>
                      <strong className="text-sm font-black font-mono text-indigo-700 dark:text-indigo-300">
                        {row.avgScore.toFixed(1)}
                      </strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block">Tren Nilai</span>
                      <span className={`font-mono font-bold flex items-center ${
                        row.trend >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {row.trend >= 0 ? `+${row.trend.toFixed(1)}` : row.trend.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg font-mono ${
                    row.isPassing
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                  }`}>
                    {row.isPassing ? 'MEMENUHI KKM' : 'DI BAWAH KKM'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Unified Callout to Explanations Tab */}
        <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-indigo-950 dark:text-indigo-200">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Ingin mempelajari modul solusi &amp; video pembahasan resmi dari guru? Buka tab <strong>Media Pembahasan</strong> atau tab <strong>Rekap Butir Soal</strong>.</span>
          </div>
          <button
            type="button"
            onClick={() => onOpenSubjectExplanations('ALL')}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shrink-0 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
          >
            <span>Buka Media Pembahasan</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
