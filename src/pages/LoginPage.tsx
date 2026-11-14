import React, { useState, useEffect } from 'react';
import {
  LogIn, Lock, ShieldAlert, GraduationCap,
  CheckCircle2, RefreshCw, Award, Search, Calendar, UserCheck,
  Eye, EyeOff, X, ArrowRight
} from 'lucide-react';
import { authService } from '../services/auth';
import { dbService } from '../services/database';
import { User } from '../types/database';

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
  onNavigate?: (path: string) => void;
  returnTo?: string;
  isStaffModalOpen?: boolean;
  setIsStaffModalOpen?: (open: boolean) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  onNavigate,
  returnTo,
  isStaffModalOpen: externalStaffModalOpen,
  setIsStaffModalOpen: externalSetIsStaffModalOpen,
}) => {
  const [schoolProfile, setSchoolProfile] = useState(() => dbService.getSchoolProfile());
  const [monitoringConfig, setMonitoringConfig] = useState(() => dbService.getLiveMonitoringConfig());
  useEffect(() => {
    return dbService.subscribe(() => {
      setSchoolProfile(dbService.getSchoolProfile());
      setMonitoringConfig(dbService.getLiveMonitoringConfig());
    });
  }, []);
  const [internalStaffModalOpen, setInternalStaffModalOpen] = useState(!!returnTo);

  const isStaffModalOpen = externalStaffModalOpen !== undefined ? externalStaffModalOpen : internalStaffModalOpen;
  const setStaffModalOpen = externalSetIsStaffModalOpen || setInternalStaffModalOpen;

  useEffect(() => {
    if (returnTo) {
      setStaffModalOpen(true);
    }
  }, [returnTo]);

  // Staff Login State
  const [nip, setNip] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successNotice, setSuccessNotice] = useState('');

  // Student Quick Lookup State (Tanggal Lahir + NISN Siswa)
  const [birthDate, setBirthDate] = useState('');
  const [nisn, setNisn] = useState('');
  const [studentError, setStudentError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessNotice('');
    setLoading(true);

    try {
      const session = await authService.login(nip, password);
      setSuccessNotice(`Autentikasi Berhasil! Mengalihkan ke panel ${session.user.role}...`);
      setTimeout(() => {
        setStaffModalOpen(false);
        onLoginSuccess(session.user);
      }, 350);
    } catch (err: any) {
      setError(err?.message || 'Gagal masuk. Periksa kembali NIP dan kata sandi Anda.');
    } finally {
      setLoading(false);
    }
  };

  const handleStudentLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setStudentError('');

    if (!birthDate.trim() || !nisn.trim()) {
      setStudentError('Harap lengkapi Tanggal Lahir dan NISN Siswa.');
      return;
    }

    const verifiedStudent = dbService.getStudentByBirthDateAndNisn(birthDate.trim(), nisn.trim());
    if (verifiedStudent) {
      sessionStorage.setItem('verified_student_id', verifiedStudent.id);
      if (onNavigate) {
        onNavigate('/hasil');
      } else {
        window.location.href = '/hasil';
      }
    } else {
      setStudentError('Kombinasi Tanggal Lahir dan NISN Siswa tidak ditemukan.');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 relative overflow-hidden flex items-center justify-center px-4 py-12 font-sans text-slate-900 dark:text-slate-100 transition-colors">
      {/* Ambient Background Glow Accent */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Student Card (100% Focused on Students) */}
      <div className="relative max-w-md w-full bg-white dark:bg-slate-900/90 backdrop-blur-xl rounded-3xl shadow-xl dark:shadow-2xl dark:shadow-indigo-950/50 overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors">
        
        {/* Header Portal */}
        <div className="bg-slate-50 dark:bg-slate-950 p-6 text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 text-center transition-colors">
          {schoolProfile.logoUrl ? (
            <div className="w-16 h-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl mx-auto flex items-center justify-center p-1.5 mb-3 shadow-md">
              <img
                src={schoolProfile.logoUrl}
                alt={schoolProfile.name}
                className="w-full h-full object-contain"
                loading="eager"
                decoding="sync"
              />
            </div>
          ) : (
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center text-white mb-3 shadow-md shadow-indigo-600/20">
              <GraduationCap className="w-7 h-7" />
            </div>
          )}
          <span className="text-sm sm:text-base font-extrabold tracking-widest text-slate-500 dark:text-slate-400 uppercase block">
            WIKAN
          </span>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white mt-1 leading-snug">
            {schoolProfile.name}
          </h2>
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-2">
            Ubah Data Menjadi Tindakan Nyata
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Wadah Informasi Kemampuan dan Analisis Nilai
          </p>

          <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 rounded-full text-xs font-bold text-amber-800 dark:text-amber-300">
            <Award className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Portal Mandiri Siswa</span>
          </div>
        </div>

        {/* Student Form Body */}
        <div className="p-6 space-y-5 bg-white dark:bg-slate-900">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed text-center">
            Masukkan Tanggal Lahir dan NISN Anda untuk memverifikasi identitas dan membuka Rapor Try Out Mandiri.
          </p>

          <form onSubmit={handleStudentLookup} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Tanggal Lahir Siswa
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={birthDate}
                  onChange={e => setBirthDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors scheme-dark"
                  required
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                NISN Siswa (Nomor Induk Siswa Nasional)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={nisn}
                  onChange={e => setNisn(e.target.value)}
                  placeholder="10 digit NISN, contoh: 0061234561"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  required
                />
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            {studentError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs rounded-xl flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span>{studentError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer border border-indigo-400/30"
            >
              <Search className="w-4 h-4" />
              <span>Verifikasi &amp; Buka Hasil Siswa</span>
            </button>
          </form>

          {/* Tombol Akses Cepat Live Rekap Ujian (Hanya Muncul Jika Diaktifkan Admin) */}
          {monitoringConfig.isEnabled && (
            <div className="pt-2">
              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                <span className="flex-shrink mx-3 text-[10px] font-bold uppercase tracking-wider text-rose-500 dark:text-rose-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
                  Live Asesmen
                </span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (onNavigate) onNavigate('/rekap');
                  else window.location.href = '/rekap';
                }}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-indigo-500/10 hover:from-rose-500/20 hover:to-indigo-500/20 border border-rose-300 dark:border-rose-800/80 rounded-2xl transition-all cursor-pointer group flex items-center justify-between shadow-xs"
              >
                <div className="flex items-center gap-2.5 text-left">
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </span>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                      Pantau Live Rekap Ujian
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Cek kehadiran &amp; progres siswa real-time
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                  <span>Buka</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>
            </div>
          )}


        </div>
      </div>

      {/* Staff Login Modal (Pop-up Guru & Admin) */}
      {isStaffModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setStaffModalOpen(false)}
        >
          <div
            className="relative max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Akses Masuk Staf &amp; Guru
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Panel Guru Mata Pelajaran, Wali Kelas, &amp; Admin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStaffModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {returnTo && (
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 rounded-xl text-[11px] text-indigo-700 dark:text-indigo-300">
                  Akses tujuan: <span className="font-mono font-semibold">{returnTo}</span>. Silakan autentikasi staf terlebih dahulu.
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    NIP Kedinasan / Username
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={nip}
                      onChange={e => setNip(e.target.value)}
                      placeholder="Masukkan NIP kedinasan atau username..."
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                      required
                      autoFocus
                    />
                    <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Kata Sandi
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Masukkan kata sandi akun Anda..."
                      className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                      required
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                      title={showPassword ? 'Sembunyikan Kata Sandi' : 'Tampilkan Kata Sandi'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs rounded-xl flex items-start gap-2.5">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                    <span>{error}</span>
                  </div>
                )}

                {successNotice && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{successNotice}</span>
                  </div>
                )}

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStaffModalOpen(false)}
                    className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer border border-indigo-400/30"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Memproses...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        <span>Masuk Sistem</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
