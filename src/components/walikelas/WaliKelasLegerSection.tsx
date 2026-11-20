import React, { useState } from 'react';
import {
  FileSpreadsheet, Users, ShieldAlert, Award, Search, Filter, Download,
  CheckCircle2, AlertTriangle, BookOpen
} from 'lucide-react';
import { WaliKelasLegerResult } from '../../services/sumatifAnalytics';

interface WaliKelasLegerSectionProps {
  leger: WaliKelasLegerResult;
  onExportExcel?: () => void;
}

export const WaliKelasLegerSection: React.FC<WaliKelasLegerSectionProps> = ({ leger, onExportExcel }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAtRiskOnly, setFilterAtRiskOnly] = useState(false);

  const isSAT = leger.packageType === 'SAT';

  const filteredRows = leger.rows.filter(row => {
    const matchSearch = row.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.nisn.includes(searchQuery);
    if (!matchSearch) return false;
    if (filterAtRiskOnly) return row.isAtRisk;
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── BANNER EARLY WARNING JIKA ADA SISWA BERISIKO (KHUSUS SAT SANGAT KRUSIAL) ── */}
      {leger.atRiskStudentsCount > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Peringatan: {leger.atRiskStudentsCount} Siswa Berisiko (≥ 3 Mapel di Bawah KKTP)
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                {isSAT
                  ? 'Pada evaluasi Sumatif Akhir Tahun (SAT), siswa dengan 3 mata pelajaran atau lebih yang belum tuntas wajib menjadi agenda rapat pleno kenaikan kelas.'
                  : 'Siswa dengan ≥ 3 mata pelajaran di bawah KKTP memerlukan pendampingan intensif sebelum penulisan nilai rapor akhir semester.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setFilterAtRiskOnly(!filterAtRiskOnly)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              filterAtRiskOnly
                ? 'bg-amber-600 text-white'
                : 'bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100'
            }`}
          >
            {filterAtRiskOnly ? 'Tampilkan Semua Siswa' : 'Filter Siswa Berisiko Saja'}
          </button>
        </div>
      )}

      {/* ── SUMMARY STATS FOR HOMEROOM TEACHER ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Rata-rata Kelas
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {leger.overallClassAverage}
            </span>
            <span className="text-xs text-slate-400">/ 100</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            Rata-rata seluruh mapel
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Total Siswa
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
              {leger.totalStudents}
            </span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            Rombel {leger.className}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Siswa Berisiko (≥ 3 Mapel)
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-2xl font-black ${leger.atRiskStudentsCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'}`}>
              {leger.atRiskStudentsCount}
            </span>
            {leger.atRiskStudentsCount > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            Perlu intervensi wali kelas
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Mata Pelajaran Diuji
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-black text-purple-600 dark:text-purple-400">
              {leger.subjects.length}
            </span>
            <BookOpen className="w-4 h-4 text-purple-500" />
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            Dalam paket {leger.packageType}
          </span>
        </div>
      </div>

      {/* ── TABEL LEGER NILAI LENGKAP KELAS ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Buku Leger Nilai Rapor Kelas ({leger.className} - {leger.packageTitle})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Matriks kompilasi nilai seluruh mata pelajaran siswa siap salin ke e-Rapor atau arsip kurikulum.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama atau NISN..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs w-48"
              />
            </div>

            {onExportExcel && (
              <button
                onClick={onExportExcel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Excel</span>
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-[11px]">
                <th className="py-2.5 px-3 text-center w-12 font-bold">Rank</th>
                <th className="py-2.5 px-3 font-bold min-w-[160px]">Nama Siswa</th>
                <th className="py-2.5 px-3 font-bold w-24">NISN</th>
                {leger.subjects.map(sub => (
                  <th key={sub.id} className="py-2.5 px-2 text-center font-bold min-w-[70px]">
                    <div className="font-mono text-indigo-600 dark:text-indigo-400">{sub.code}</div>
                    <div className="text-[9px] text-slate-400 font-normal">KKTP: {sub.passingGrade}</div>
                  </th>
                ))}
                <th className="py-2.5 px-3 text-center font-bold bg-slate-100 dark:bg-slate-800 min-w-[70px]">
                  Total
                </th>
                <th className="py-2.5 px-3 text-center font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 min-w-[70px]">
                  Rata-rata
                </th>
                <th className="py-2.5 px-3 text-center font-bold min-w-[90px]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRows.map(row => (
                <tr
                  key={row.studentId}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                    row.isAtRisk ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                  }`}
                >
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-500">
                    #{row.rank}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                    {row.studentName}
                    {row.isAtRisk && (
                      <span className="ml-1.5 px-1.5 py-0.2 rounded-sm text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        At-Risk ({row.remedialCount})
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">
                    {row.nisn}
                  </td>

                  {/* Nilai per Mata Pelajaran */}
                  {leger.subjects.map(sub => {
                    const rawScore = row.scoresBySubjectId[sub.id];
                    const isNotEnrolled = rawScore === null;

                    if (isNotEnrolled) {
                      return (
                        <td
                          key={sub.id}
                          className="py-2.5 px-2 text-center font-mono font-medium text-slate-300 dark:text-slate-600 bg-slate-50/30 dark:bg-slate-800/20"
                          title="Bukan peserta mata pelajaran ini"
                        >
                          -
                        </td>
                      );
                    }

                    const score = rawScore ?? 0;
                    const isBelowKKTP = score < sub.passingGrade;
                    return (
                      <td
                        key={sub.id}
                        className={`py-2.5 px-2 text-center font-mono font-bold ${
                          isBelowKKTP
                            ? 'text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                        title={score === 0 ? 'Belum mengikuti ujian / tidak masuk' : undefined}
                      >
                        {score}
                      </td>
                    );
                  })}

                  <td className="py-2.5 px-3 text-center font-mono font-bold bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-200">
                    {row.totalScore}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-black bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300">
                    {row.averageScore}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {row.remedialCount === 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        Tuntas Semua
                      </span>
                    ) : (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          row.isAtRisk
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {row.remedialCount} Remedial
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {/* Baris Rata-rata Kelas per Mapel */}
              <tr className="bg-slate-100 dark:bg-slate-800/90 font-bold border-t-2 border-slate-300 dark:border-slate-700">
                <td colSpan={3} className="py-2.5 px-3 text-right uppercase tracking-wider text-[10px] text-slate-600 dark:text-slate-300">
                  Rata-rata Kelas :
                </td>
                {leger.subjects.map(sub => (
                  <td key={sub.id} className="py-2.5 px-2 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    {leger.subjectAverages[sub.id] || 0}
                  </td>
                ))}
                <td className="py-2.5 px-3 text-center font-mono text-slate-500">-</td>
                <td className="py-2.5 px-3 text-center font-mono font-black text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950">
                  {leger.overallClassAverage}
                </td>
                <td className="py-2.5 px-3 text-center font-mono text-slate-500">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
