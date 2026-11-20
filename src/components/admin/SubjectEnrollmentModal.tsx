import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Search, Users, CheckCircle2, UserCheck, Filter, AlertCircle,
  CheckSquare, Square, ArrowRight, ShieldCheck, Sparkles
} from 'lucide-react';
import { Student, ClassRoom } from '../../types/database';

interface SubjectEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  packageName: string;
  subjectName: string;
  subjectCode: string;
  targetClasses: ClassRoom[];
  allStudents: Student[];
  initialEnrolledStudentIds?: string[];
  onSave: (enrolledStudentIds: string[] | undefined) => void;
}

export const SubjectEnrollmentModal: React.FC<SubjectEnrollmentModalProps> = ({
  isOpen,
  onClose,
  packageName,
  subjectName,
  subjectCode,
  targetClasses,
  allStudents,
  initialEnrolledStudentIds,
  onSave,
}) => {
  // Mode: 'ALL' means all target students enroll. 'CUSTOM' means selective enrollment.
  const [enrollmentMode, setEnrollmentMode] = useState<'ALL' | 'CUSTOM'>('ALL');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');

  // Filter students to only those belonging to target classes and not answer keys
  const targetClassIdSet = useMemo(() => new Set(targetClasses.map(c => c.id)), [targetClasses]);
  const eligibleStudents = useMemo(() => {
    return allStudents.filter(
      s => (targetClassIdSet.size === 0 || targetClassIdSet.has(s.classId)) && !s.isAnswerKeyAccount
    );
  }, [allStudents, targetClassIdSet]);

  // Synchronize state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialEnrolledStudentIds && initialEnrolledStudentIds.length > 0) {
        setEnrollmentMode('CUSTOM');
        setSelectedStudentIds(new Set(initialEnrolledStudentIds));
      } else {
        setEnrollmentMode('ALL');
        setSelectedStudentIds(new Set());
      }
      setSearchQuery('');
      setSelectedClassFilter('ALL');
    }
  }, [isOpen, initialEnrolledStudentIds]);

  // Filtered students according to search query and class filter
  const displayedStudents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return eligibleStudents.filter(s => {
      const matchClass = selectedClassFilter === 'ALL' || s.classId === selectedClassFilter;
      if (!matchClass) return false;
      if (!q) return true;
      const matchName = s.name.toLowerCase().includes(q);
      const matchNisn = (s.nisn || '').toLowerCase().includes(q);
      const matchNis = (s.nis || '').toLowerCase().includes(q);
      return matchName || matchNisn || matchNis;
    });
  }, [eligibleStudents, searchQuery, selectedClassFilter]);

  if (!isOpen) return null;

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      displayedStudents.forEach(s => next.add(s.id));
      return next;
    });
  };

  const handleDeselectAllFiltered = () => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      displayedStudents.forEach(s => next.delete(s.id));
      return next;
    });
  };

  const handleSave = () => {
    if (enrollmentMode === 'ALL') {
      onSave(undefined); // Undefined represents all students enrolled
    } else {
      if (selectedStudentIds.size === 0) {
        if (!confirm('Anda memilih mode "Hanya Siswa Tertentu" tetapi belum memilih siswa sama sekali. Lanjutkan dengan peserta kosong?')) {
          return;
        }
      }
      onSave(Array.from(selectedStudentIds));
    }
    onClose();
  };

  const totalEligibleCount = eligibleStudents.length;
  const currentSelectedCount = enrollmentMode === 'ALL' ? totalEligibleCount : selectedStudentIds.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header Modal */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Atur Peserta Ujian Mata Pelajaran
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                  {subjectCode}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {subjectName} &bull; <span className="font-medium">{packageName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Modal */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          
          {/* Pilihan Mode Kepesertaan */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
              Mode Kepesertaan Siswa
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Semua Siswa */}
              <label
                className={`relative flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                  enrollmentMode === 'ALL'
                    ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30 dark:border-indigo-500 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="enrollmentMode"
                  value="ALL"
                  checked={enrollmentMode === 'ALL'}
                  onChange={() => setEnrollmentMode('ALL')}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Semua Siswa di Rombel
                    </span>
                    <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      Default
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Seluruh {totalEligibleCount} siswa rombel target otomatis menjadi peserta (Matematika, B. Indonesia, dll).
                  </p>
                </div>
              </label>

              {/* Option 2: Hanya Siswa Tertentu */}
              <label
                className={`relative flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                  enrollmentMode === 'CUSTOM'
                    ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30 dark:border-indigo-500 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="enrollmentMode"
                  value="CUSTOM"
                  checked={enrollmentMode === 'CUSTOM'}
                  onChange={() => {
                    setEnrollmentMode('CUSTOM');
                    if (selectedStudentIds.size === 0 && initialEnrolledStudentIds?.length) {
                      setSelectedStudentIds(new Set(initialEnrolledStudentIds));
                    }
                  }}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Hanya Siswa Tertentu
                    </span>
                    <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                      Selektif
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Khusus Agama (Kristen, Katolik, dll), Peminatan, atau Muatan Lokal.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Panel Seleksi Siswa Khusus (Hanya muncul jika mode CUSTOM) */}
          {enrollmentMode === 'CUSTOM' && (
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-200">
              
              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Cari nama siswa atau NISN..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {targetClasses.length > 1 && (
                  <div className="sm:w-44">
                    <select
                      value={selectedClassFilter}
                      onChange={e => setSelectedClassFilter(e.target.value)}
                      className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="ALL">Semua Kelas ({targetClasses.length})</option>
                      {targetClasses.map(c => (
                        <option key={c.id} value={c.id}>
                          Kelas {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Status Bar & Quick Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 py-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Terpilih:
                  </span>
                  <span className={`px-2 py-0.5 rounded-full font-bold font-mono text-[11px] ${
                    selectedStudentIds.size > 0
                      ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                  }`}>
                    {selectedStudentIds.size} dari {totalEligibleCount} siswa
                  </span>
                  {selectedStudentIds.size === 0 && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Harap centang minimal 1 siswa
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <CheckSquare className="w-3.5 h-3.5" /> Pilih Hasil Filter ({displayedStudents.length})
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">&bull;</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllFiltered}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"
                  >
                    <Square className="w-3.5 h-3.5" /> Batal Pilih
                  </button>
                </div>
              </div>

              {/* Daftar Siswa */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {displayedStudents.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Tidak ada siswa yang sesuai dengan filter pencarian.
                  </div>
                ) : (
                  displayedStudents.map(student => {
                    const isSelected = selectedStudentIds.has(student.id);
                    const studentClass = targetClasses.find(c => c.id === student.classId);

                    return (
                      <div
                        key={student.id}
                        onClick={() => handleToggleStudent(student.id)}
                        className={`p-2.5 px-3.5 flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Controlled via row click
                            className="w-4 h-4 rounded-sm text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 pointer-events-none"
                          />
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                              <span>{student.name}</span>
                              <span className="px-1.5 py-0.2 rounded-sm text-[9px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                              <span>NISN: {student.nisn || '-'}</span>
                              <span>&bull;</span>
                              <span>Kelas: {studentClass?.name || student.classId}</span>
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Terdaftar
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Info Banner */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Dampak pada Analisis & Rapor:
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Siswa yang <strong>tidak terdaftar</strong> pada mapel ini akan ditandai dengan strip (<code>-</code>) di Leger Nilai, tidak dihitung remedial, dan tidak merusak rata-rata rapor kelas. Siswa terdaftar yang berhalangan hadir tetap terdata sebagai belum ujian.
            </p>
          </div>

        </div>

        {/* Footer Modal */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
          <div className="text-xs text-slate-500">
            {enrollmentMode === 'ALL' ? (
              <span>Semua {totalEligibleCount} siswa akan diikutsertakan</span>
            ) : (
              <span>{selectedStudentIds.size} siswa terpilih untuk mapel ini</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Simpan Peserta Mapel
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
