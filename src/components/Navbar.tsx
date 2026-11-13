import React, { useState, useEffect } from 'react';
import {
  GraduationCap, Sun, Moon, ShieldCheck, BookOpen, School, Menu, X,
  ChevronDown, Check, ArrowRightLeft, Sparkles, Lock, LogOut
} from 'lucide-react';
import { User } from '../types/database';
import { useTheme } from '../context/ThemeContext';
import { dbService } from '../services/database';

interface NavbarProps {
  currentUser: User | null;
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  onOpenStaffLogin?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  currentPath,
  onNavigate,
  onLogout,
  onOpenStaffLogin,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [schoolProfile, setSchoolProfile] = useState(() => dbService.getSchoolProfile());

  useEffect(() => {
    return dbService.subscribe(() => {
      setSchoolProfile(dbService.getSchoolProfile());
    });
  }, []);

  // Dynamic Theme Styling per Page Context
  const isPageAdmin = currentPath === '/admin';
  const isPageWaliKelas = currentPath === '/wali-kelas';
  const isPageGuru = currentPath === '/guru';
  const isPageStudent = currentPath === '/hasil';
  const isPageMonitoring = currentPath === '/rekap';
  const isPageLogin = currentPath === '/login' || currentPath === '/';

  let brandBgClass = 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20';
  let badgeLabel = 'Portal Terpadu';
  let badgeColorClass = 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-950/80 dark:border-indigo-800';

  if (isPageAdmin) {
    brandBgClass = 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20';
    badgeLabel = 'Panel Admin';
    badgeColorClass = 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/80 dark:border-emerald-800';
  } else if (isPageWaliKelas) {
    brandBgClass = 'bg-emerald-700 text-white shadow-md shadow-emerald-700/20';
    badgeLabel = 'Wali Kelas';
    badgeColorClass = 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/80 dark:border-emerald-800';
  } else if (isPageGuru) {
    brandBgClass = 'bg-teal-600 text-white shadow-md shadow-teal-600/20';
    badgeLabel = 'Aplikasi Guru';
    badgeColorClass = 'text-teal-700 bg-teal-50 border-teal-200 dark:text-teal-300 dark:bg-teal-950/80 dark:border-teal-800';
  } else if (isPageStudent) {
    brandBgClass = 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20';
    badgeLabel = 'Portal Siswa';
    badgeColorClass = 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-950/80 dark:border-indigo-800';
  } else if (isPageMonitoring) {
    brandBgClass = 'bg-rose-600 text-white shadow-md shadow-rose-600/20';
    badgeLabel = 'Live Monitoring';
    badgeColorClass = 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/80 dark:border-rose-800';
  } else if (isPageLogin) {
    brandBgClass = 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20';
    badgeLabel = 'Halaman Login';
    badgeColorClass = 'text-slate-700 bg-slate-100 border-slate-300 dark:text-slate-300 dark:bg-slate-800/80 dark:border-slate-700';
  }

  const teacherObj = currentUser ? dbService.getTeacherByUserId(currentUser) : undefined;
  const isWaliKelas = currentUser?.role === 'WALI_KELAS' || !!teacherObj?.isWaliKelas;
  const isAdmin = currentUser?.role === 'ADMIN';
  const isGuruOnly = currentUser?.role === 'GURU' && !isWaliKelas;

  // Cek apakah guru yang bersangkutan juga mengajar mapel (memiliki hak akses mapel)
  const teacherSubjects = teacherObj?.subjectPermissions || [];
  const isGuruMapelAlso = isAdmin || teacherSubjects.length > 0;
  // Dropdown ganti peran hanya tampil jika pengguna merangkap sebagai Wali Kelas DAN Guru Mapel
  const showRoleSwitcher = currentUser && isWaliKelas && isGuruMapelAlso;

  const getRoleSubtitle = (user: User | null) => {
    if (!user) return 'Tamu';
    if (user.role === 'ADMIN') return 'Administrator';
    if (isPageGuru) return 'Guru Mata Pelajaran';
    const tObj = dbService.getTeacherByUserId(user);
    const isWali = user.role === 'WALI_KELAS' || !!tObj?.isWaliKelas;
    if (isPageWaliKelas && isWali) {
      if (tObj?.homeRoomClassId) {
        const cls = dbService.getClasses().find(c => c.id === tObj.homeRoomClassId);
        return `Wali Kelas ${cls?.name || tObj.homeRoomClassId.toUpperCase()}`;
      }
      return 'Wali Kelas';
    }
    if (user.role === 'GURU') return 'Guru Mata Pelajaran';
    if (isWali) {
      if (tObj?.homeRoomClassId) {
        const cls = dbService.getClasses().find(c => c.id === tObj.homeRoomClassId);
        return `Wali Kelas ${cls?.name || tObj.homeRoomClassId.toUpperCase()}`;
      }
      return 'Wali Kelas';
    }
    return 'Siswa';
  };

  return (
    <header className="bg-white/95 dark:bg-slate-950/90 text-slate-800 dark:text-white border-b border-slate-200 dark:border-slate-800/80 sticky top-0 z-50 transition-colors duration-200 backdrop-blur-md shadow-xs dark:shadow-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Zone 1: Brand Title Wordmark & Role Context */}
          <div
            onClick={() => onNavigate('/')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md transition-all overflow-hidden shrink-0 ${
              schoolProfile.logoUrl 
                ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1' 
                : brandBgClass
            }`}>
              {schoolProfile.logoUrl ? (
                <img
                  src={schoolProfile.logoUrl}
                  alt={schoolProfile.name}
                  className="w-full h-full object-contain"
                  loading="eager"
                  decoding="sync"
                />
              ) : isPageAdmin ? (
                <ShieldCheck className="w-5 h-5" />
              ) : isPageWaliKelas ? (
                <School className="w-5 h-5" />
              ) : isPageGuru ? (
                <BookOpen className="w-5 h-5" />
              ) : (
                <GraduationCap className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white block">
                  WIKAN
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${badgeColorClass}`}>
                  {badgeLabel}
                </span>
              </div>
              <span
                className="text-xs text-slate-500 dark:text-slate-400 block -mt-0.5 font-medium truncate max-w-[200px] sm:max-w-none"
                title={schoolProfile.name}
              >
                {schoolProfile.name}
              </span>
            </div>
          </div>

          {/* Zone 2: Theme Toggle, Role Switcher Dropdown & Profile Status */}
          <div className="hidden md:flex items-center gap-3">
            {/* Dark / Light Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              type="button"
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/90 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700/80 transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer shadow-xs"
              title={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span>Terang</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-600" />
                  <span>Gelap</span>
                </>
              )}
            </button>

            {/* Interactive Role Switcher Dropdown Menu for Dual-Role Users (Wali Kelas + Guru Mapel) */}
            {showRoleSwitcher && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                    isPageWaliKelas
                      ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100'
                      : 'bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-700 hover:bg-teal-100'
                  }`}
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>
                    {isPageWaliKelas ? 'Mode: Wali Kelas' : 'Mode: Guru Mapel'}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${roleDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu Popup */}
                {roleDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-2 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        Pindah Peran Instan
                      </span>
                      <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded font-mono font-bold">
                        GURU &amp; WALAS
                      </span>
                    </div>

                    {/* Option 1: Dashboard Wali Kelas */}
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('/wali-kelas');
                        setRoleDropdownOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-xl text-left transition-all flex items-start gap-3 cursor-pointer ${
                        isPageWaliKelas
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="p-2 bg-emerald-100 dark:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300 rounded-lg shrink-0 mt-0.5">
                        <School className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            Dashboard Wali Kelas
                          </span>
                          {isPageWaliKelas ? (
                            <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold">
                              AKTIF
                            </span>
                          ) : (
                            <Check className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                          Rombel bimbingan, rekapitulasi nilai rata-rata, &amp; leger multimapel.
                        </p>
                      </div>
                    </button>

                    {/* Option 2: Modul Guru Mapel */}
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('/guru');
                        setRoleDropdownOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-xl text-left transition-all flex items-start gap-3 cursor-pointer ${
                        isPageGuru
                          ? 'bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/80'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="p-2 bg-teal-100 dark:bg-teal-900/80 text-teal-700 dark:text-teal-300 rounded-lg shrink-0 mt-0.5">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            Modul Guru Mapel
                          </span>
                          {isPageGuru ? (
                            <span className="text-[10px] bg-teal-600 text-white px-1.5 py-0.5 rounded font-bold">
                              AKTIF
                            </span>
                          ) : (
                            <Check className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                          Bank soal, analisis butir distraktor, &amp; penilaian mata pelajaran.
                        </p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}

            {currentUser ? (
              <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-800">
                <div className="text-right">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">{currentUser.name}</div>
                  <div className="text-[10px] text-indigo-600 dark:text-indigo-400 uppercase tracking-wider font-mono font-bold">{getRoleSubtitle(currentUser)}</div>
                </div>
                <button
                  onClick={onLogout}
                  className="px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 rounded-lg transition-colors cursor-pointer"
                >
                  Keluar
                </button>
              </div>
            ) : isPageStudent ? (
              <div className="flex items-center gap-2.5">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 bg-slate-50 dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">Portal Siswa</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem('verified_student_id');
                    onNavigate('/login');
                  }}
                  className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  title="Keluar dari portal siswa dan kembali ke halaman login"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar ke Login</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 bg-slate-50 dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">Portal Aktif</span>
                </div>

                {onOpenStaffLogin && (
                  <button
                    type="button"
                    onClick={onOpenStaffLogin}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-sm shadow-indigo-600/20 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Akses Guru &amp; Admin</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mobile Right Bar (Theme Toggle & Menu Button) */}
          <div className="flex md:hidden items-center gap-2">
            {!currentUser && isPageStudent && (
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem('verified_student_id');
                  onNavigate('/login');
                }}
                className="px-2.5 py-1.5 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                title="Keluar ke Login"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar</span>
              </button>
            )}

            {!currentUser && !isPageStudent && onOpenStaffLogin && (
              <button
                type="button"
                onClick={onOpenStaffLogin}
                className="px-2.5 py-1.5 bg-indigo-600 active:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                title="Akses Masuk Guru & Admin"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Staf</span>
              </button>
            )}

            <button
              onClick={toggleTheme}
              type="button"
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 cursor-pointer"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>

            {currentUser && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && currentUser && (
        <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 pt-2 pb-4 space-y-2 text-sm shadow-lg">
          {isAdmin && (
            <button
              onClick={() => { onNavigate('/admin'); setMobileMenuOpen(false); }}
              className="block w-full text-left px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md font-medium cursor-pointer"
            >
              Panel Admin (/admin)
            </button>
          )}

          {isWaliKelas && (
            <>
              <button
                onClick={() => { onNavigate('/wali-kelas'); setMobileMenuOpen(false); }}
                className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-md font-medium cursor-pointer ${currentPath === '/wali-kelas' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <School className="w-4 h-4 shrink-0" />
                <span>Dashboard Wali Kelas (/wali-kelas)</span>
              </button>
              {isGuruMapelAlso && (
                <button
                  onClick={() => { onNavigate('/guru'); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-md font-medium cursor-pointer ${currentPath === '/guru' ? 'bg-teal-600 text-white font-bold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  <BookOpen className="w-4 h-4 shrink-0" />
                  <span>Modul Guru Mapel (/guru)</span>
                </button>
              )}
            </>
          )}

          {isGuruOnly && (
            <button
              onClick={() => { onNavigate('/guru'); setMobileMenuOpen(false); }}
              className="block w-full text-left px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md font-medium cursor-pointer"
            >
              Modul Guru Mapel (/guru)
            </button>
          )}

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">{currentUser.name} ({getRoleSubtitle(currentUser)})</span>
            <button
              onClick={() => { onLogout(); setMobileMenuOpen(false); }}
              className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer"
            >
              Keluar
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
