import React from 'react';
import { ShieldAlert, ArrowLeft, UserCheck } from 'lucide-react';
import { authService } from '../../services/auth';
import { User } from '../../types/database';

interface ImpersonationBannerProps {
  currentUser: User;
  onExit: () => void;
}

export const ImpersonationBanner: React.FC<ImpersonationBannerProps> = ({
  currentUser,
  onExit
}) => {
  const originalAdmin = authService.getOriginalAdmin();

  return (
    <aside
      aria-label="Mode Bantuan Admin"
      className="sticky top-0 z-50 w-full bg-amber-500 dark:bg-amber-600 text-slate-950 dark:text-slate-900 px-4 py-2.5 shadow-md border-b border-amber-600/60 transition-all"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2.5 font-medium">
          <span className="p-1 rounded-lg bg-amber-600/30 dark:bg-amber-700/40 text-slate-950 shrink-0">
            <ShieldAlert className="w-4 h-4" />
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold uppercase tracking-wider text-[10px] bg-slate-950 text-amber-300 px-2 py-0.5 rounded-md">
              Mode Bantuan Admin
            </span>
            <span>
              Anda sedang mengelola akun <strong className="font-bold underline underline-offset-2">{currentUser.name}</strong> ({currentUser.role === 'WALI_KELAS' ? 'Wali Kelas' : 'Guru Mapel'})
              {originalAdmin ? ` oleh Administrator ${originalAdmin.name}` : ''}.
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onExit}
          className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-900 text-amber-300 hover:text-amber-200 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all shrink-0"
          title="Keluar dari akun guru/walas dan kembali ke dashboard Administrator tanpa perlu login lagi"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Akun Admin</span>
        </button>
      </div>
    </aside>
  );
};
