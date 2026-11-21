import React from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import { Award, AlertTriangle, CheckCircle2, XCircle, TrendingUp, BookOpen, ShieldAlert, Info, Compass } from 'lucide-react';
import { StudentSumatifProfile } from '../../services/sumatifAnalytics';

interface StudentSumatifViewProps {
  profile: StudentSumatifProfile;
}

export const StudentSumatifView: React.FC<StudentSumatifViewProps> = ({ profile }) => {
  const isSAT = profile.packageType === 'SAT';

  // Analisis diagnosis kompetensi untuk keterangan grafik radar
  const sortedByScore = [...profile.subjectScores].filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  const highestSubj = sortedByScore[0];
  const remedialSubjs = profile.subjectScores.filter(s => !s.isPassed);
  const lowestSubj = remedialSubjs.length > 0
    ? [...remedialSubjs].sort((a, b) => a.score - b.score)[0]
    : sortedByScore[sortedByScore.length - 1];

  const scoreSpread = (highestSubj?.score || 0) - (lowestSubj?.score || 0);
  const isWellBalanced = profile.passedCount === profile.subjectScores.length && scoreSpread <= 20;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── BANNER PERINGATAN EVALUASI KENAIKAN KELAS JIKA AT-RISK PADA SAT ── */}
      {profile.isAtRisk && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
              Perhatian: Terdapat {profile.remedialCount} Mata Pelajaran di Bawah KKTP
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              {isSAT
                ? 'Pada evaluasi Sumatif Akhir Tahun (SAT), siswa dengan 3 atau lebih mata pelajaran belum tuntas memerlukan pertimbangan khusus dalam rapat pleno kenaikan kelas. Segera hubungi guru mata pelajaran terkait untuk mengikuti program remedial.'
                : 'Segera lakukan konsultasi dan ikuti program remedial bersama guru mata pelajaran sebelum pencetakan rapor akhir semester.'}
            </p>
          </div>
        </div>
      )}

      {/* ── STATS SUMMARY CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Rata-rata Semester
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {profile.averageScore}
            </span>
            <span className="text-xs text-slate-400">/ 100</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Mapel Tuntas (≥ KKTP)
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {profile.passedCount}
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Perlu Remedial (&lt; KKTP)
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-2xl font-black ${profile.remedialCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
              {profile.remedialCount}
            </span>
            {profile.remedialCount > 0 && <AlertTriangle className="w-4 h-4 text-rose-500" />}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Nilai Tertinggi
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
              {profile.highestScore}
            </span>
            <Award className="w-4 h-4 text-teal-500" />
          </div>
        </div>
      </div>

      {/* ── GRAFIK: RADAR CHART & BAR KKTP THRESHOLD ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Visual 1: Radar Chart Jaring Laba-laba */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Profil Keseimbangan Kompetensi Siswa
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Peta penguasaan lintas mata pelajaran pada {isSAT ? 'Sumatif Akhir Tahun (SAT)' : 'Sumatif Akhir Semester (SAS)'}.
            </p>
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={profile.radarData} outerRadius="75%">
                <defs>
                  {/* Gradien arsir poligon radar ala Excel spider chart */}
                  <radialGradient id="spiderRadialGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#6366f1" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#4338ca" stopOpacity="0.35" />
                  </radialGradient>
                </defs>
                <PolarGrid stroke="#cbd5e1" strokeDasharray="3 3" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                
                {/* Spider Boundary KKTP: Garis rujukan batas tuntas minimal sekolah */}
                <Radar
                  name="Standar KKTP"
                  dataKey="kktp"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fill="#fef3c7"
                  fillOpacity={0.12}
                />

                {/* Radar Capaian Siswa: Area Bidang Terarsir & Titik Simpul (Spider Polygon Area) */}
                <Radar
                  name="Nilai Siswa"
                  dataKey="score"
                  stroke="#4338ca"
                  strokeWidth={2.5}
                  fill="url(#spiderRadialGrad)"
                  fillOpacity={0.65}
                  dot={{ r: 4.5, fill: '#4338ca', stroke: '#ffffff', strokeWidth: 2 }}
                  activeDot={{ r: 7, fill: '#312e81', stroke: '#ffffff', strokeWidth: 2 }}
                />
                <Tooltip
                  formatter={(value: any, name: any, props: any) => [
                    `${value} (KKTP: ${props.payload.kktp})`,
                    props.payload.subjectName
                  ]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* ── KETERANGAN & PANDUAN INTERPRETASI GRAFIK RADAR ── */}
          <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Panduan Membaca Profil Keseimbangan Kompetensi</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Jaring radar menggambarkan peta penguasaan materi antarmata pelajaran. Bentuk bidang yang semakin melebar ke luar mendekati skala 100 mencerminkan ketuntasan materi yang prima, sedangkan lekukan ke arah dalam menandakan mata pelajaran prioritas pendampingan/remedial.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                    Kekuatan Utama (Top Mastery)
                  </span>
                  <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {highestSubj ? `${highestSubj.subjectName} (${highestSubj.score})` : 'Belum Terdata'}
                  </div>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                    {highestSubj ? 'Penguasaan materi sangat prima' : '-'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
                    Fokus Pendampingan (Prioritas)
                  </span>
                  <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {lowestSubj ? `${lowestSubj.subjectName} (${lowestSubj.score})` : 'Semua Mapel Tuntas'}
                  </div>
                  <span className="text-[10px] text-amber-700 dark:text-amber-400">
                    {remedialSubjs.length > 0 ? `${remedialSubjs.length} mapel di bawah KKTP` : 'Seluruh mapel memenuhi KKTP'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 px-1 pt-1 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                  <span>Area Terarsir: Capaian Nilai Siswa</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 border-t border-dashed border-amber-500 inline-block" />
                  <span>Garis Kuning: Ambang KKTP (75)</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <Compass className="w-3.5 h-3.5 text-indigo-500" />
                <span>Status Keseimbangan: <strong className="text-slate-700 dark:text-slate-300">{isWellBalanced ? 'Kompetensi Sangat Seimbang' : 'Perlu Penguatan Sebagian Mapel'}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Visual 2: Bar Chart dengan Garis KKTP */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Capaian Nilai vs. Batas KKTP
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Garis merah putus-putus menunjukkan ambang batas kelulusan KKTP (75).
            </p>
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profile.subjectScores} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                <XAxis
                  dataKey="subjectCode"
                  tick={{ fontSize: 11, fontWeight: 600 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: any, _name: any, props: any) => [
                    `${value} (${props.payload.status})`,
                    props.payload.subjectName
                  ]}
                />
                <ReferenceLine
                  y={75}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{ value: 'KKTP 75', position: 'top', fill: '#ef4444', fontSize: 10, fontWeight: 700 }}
                />
                <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                  {profile.subjectScores.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isPassed ? '#10b981' : '#f43f5e'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── TABEL RINCIAN NILAI TIAP MAPEL ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
          Rincian Nilai Mata Pelajaran ({profile.packageTitle})
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Kode</th>
                <th className="py-2.5 px-3">Mata Pelajaran</th>
                <th className="py-2.5 px-3 text-center">Batas KKTP</th>
                <th className="py-2.5 px-3 text-center">Nilai Ujian</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {profile.subjectScores.map(sub => (
                <tr key={sub.subjectId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-2.5 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    {sub.subjectCode}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                    {sub.subjectName}
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-500 font-mono">
                    {sub.passingGrade}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-sm">
                    <span className={sub.isPassed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                      {sub.score}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        sub.isPassed
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {sub.isPassed ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          Tuntas
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" />
                          Remedial
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
