import React, { useState, useMemo } from 'react';
import {
  Award, BarChart3, CheckCircle2, AlertTriangle, FileSpreadsheet,
  Download, Filter, Search, School, BookOpen, Users, HelpCircle,
  TrendingUp, CheckSquare, Sparkles, ChevronRight
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import { ExamPackage, ClassRoom, Subject, Student, Score, Question, Answer } from '../../types/database';
import { SumatifAnalyticsService, TeacherSumatifAnalytics } from '../../services/sumatifAnalytics';

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
  onShowToast,
}) => {
  // Sub-tabs navigation inside Sumatif Analytics
  const [subTab, setSubTab] = useState<'KKTP_SUMMARY' | 'PSYCHOMETRICS' | 'REKAP_RAPOR'>('KKTP_SUMMARY');
  const [classFilter, setClassFilter] = useState('ALL');
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

  // Hitung Analytics Sumatif menggunakan SumatifAnalyticsService
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
      subjects
    );
  }, [activePackage, activeSubject, scores, students, targetClassesForPackage, questions, answers, subjects]);

  // Breakdown capaian per rombel target
  const classBreakdowns = useMemo(() => {
    if (!analytics) return [];
    return targetClassesForPackage.map(cls => {
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
  }, [analytics, targetClassesForPackage]);

  // Saring data siswa untuk Tab Rekap Rapor
  const filteredStudentRankings = useMemo(() => {
    if (!analytics) return [];
    return analytics.studentRankings.filter(s => {
      // 1. Filter rombel/kelas
      if (classFilter !== 'ALL') {
        const studentObj = students.find(st => st.id === s.studentId);
        if (studentObj && studentObj.classId !== classFilter) return false;
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
  }, [analytics, classFilter, kktpStatusFilter, searchStudent, students]);

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
          {analytics ? (
            <>
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Rata-rata Nilai
                  </span>
                  <div className="flex items-baseline gap-1 mt-1.5">
                    <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
                      {analytics.averageScore}
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
                      {analytics.passingRatePct}%
                    </span>
                    <span className="text-xs text-slate-400">({analytics.passingCount} siswa)</span>
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
                        analytics.remedialCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                      }`}
                    >
                      {analytics.remedialCount}
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
                      {analytics.highestScore}
                    </span>
                    <span className="text-xs text-slate-400">s/d</span>
                    <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                      {analytics.lowestScore}
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
              Belum ada data nilai respons yang disinkronkan untuk wadah ini.
            </div>
          )}
        </div>
      )}

      {/* ── KONTEN SUB-TAB 2: ANALISIS BUTIR SOAL & PSIKOMETRI ── */}
      {subTab === 'PSYCHOMETRICS' && (
        <div className="space-y-6">
          {analytics && analytics.questionStats.length > 0 ? (
            <>
              {/* Grafik Tingkat Ketercapaian per Butir Soal */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-600" />
                    <span>Distribusi Tingkat Kesukaran (P-Value) per Butir Soal</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Batang merah (&lt; 40% benar) menandakan soal yang sulit bagi mayoritas siswa. Batang hijau (&gt; 60% benar) menunjukkan soal mudah.
                  </p>
                </div>

                <div className="h-[280px] w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.questionStats} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                      <XAxis dataKey="questionNumber" tick={{ fontSize: 11, fontWeight: 600 }} />
                      <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v * 100)}%`} />
                      <Tooltip
                        formatter={(val: any, _name: any, props: any) => [
                          `${Math.round(Number(val) * 100)}% Benar (${props.payload.correctCount}/${props.payload.totalResponses} siswa)`,
                          `Soal No. ${props.payload.questionNumber} - ${props.payload.difficultyLabel}`,
                        ]}
                      />
                      <ReferenceLine
                        y={0.4}
                        stroke="#ef4444"
                        strokeDasharray="3 3"
                        label={{ value: 'Batas Sulit (40%)', position: 'top', fill: '#ef4444', fontSize: 10 }}
                      />
                      <Bar dataKey="facilityValue" radius={[4, 4, 0, 0]}>
                        {analytics.questionStats.map((entry, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={entry.facilityValue >= 0.6 ? '#10b981' : entry.facilityValue >= 0.4 ? '#f59e0b' : '#ef4444'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tabel Evaluasi Psikometri Butir Soal */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-indigo-600" />
                    <span>Audit Psikometri &amp; Rekomendasi Butir Soal</span>
                  </h3>
                  <span className="text-xs text-slate-400">
                    Total {analytics.questionStats.length} Butir Soal Dianalisis
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 rounded-l-xl">No. Soal</th>
                        <th className="px-4 py-3">Jumlah Respon</th>
                        <th className="px-4 py-3">Benar</th>
                        <th className="px-4 py-3">Tingkat Kesukaran</th>
                        <th className="px-4 py-3">Daya Pembeda</th>
                        <th className="px-4 py-3 rounded-r-xl">Rekomendasi Mutu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {analytics.questionStats.map(q => (
                        <tr key={q.questionNumber} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                            Soal #{q.questionNumber}
                          </td>
                          <td className="px-4 py-3">{q.totalResponses} Siswa</td>
                          <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                            {q.correctCount} ({Math.round(q.facilityValue * 100)}%)
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                                q.facilityValue >= 0.6
                                  ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                  : q.facilityValue >= 0.4
                                  ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                  : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                              }`}
                            >
                              {q.difficultyLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold">
                            {q.discriminationIndex !== undefined ? q.discriminationIndex.toFixed(2) : '-'}
                          </td>
                          <td className="px-4 py-3 font-bold">
                            {q.facilityValue >= 0.3 && q.facilityValue <= 0.85 ? (
                              <span className="text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Soal Baik (Layak Disimpan)</span>
                              </span>
                            ) : (
                              <span className="text-amber-600 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Perlu Direvisi</span>
                              </span>
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
              Belum ada data butir soal yang dianalisis untuk wadah ini.
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
