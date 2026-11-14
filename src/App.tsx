import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/ToastContainer';
import { StudentPortalPage } from './pages/StudentPortalPage';
import { LoginPage } from './pages/LoginPage';
import { GuruAppPage } from './pages/GuruAppPage';
import { WaliKelasAppPage } from './pages/WaliKelasAppPage';
import { AdminAppPage } from './pages/AdminAppPage';
import { PublicExamMonitoringPage } from './pages/PublicExamMonitoringPage';
import { ImpersonationBanner } from './components/common/ImpersonationBanner';
import { authService } from './services/auth';
import { dbService } from './services/database';
import { User } from './types/database';
import { isSupabaseConfigured } from './lib/supabase';

function AppContent() {
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname);
  const [currentUser, setCurrentUser] = useState<User | null>(authService.getCurrentUser());
  const [isStaffLoginOpen, setIsStaffLoginOpen] = useState<boolean>(false);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);

    const unsubscribe = authService.subscribe(user => {
      setCurrentUser(user);
    });

    // Mulai Realtime Sync Supabase global (aktif di semua halaman / device)
    const stopRealtimeSync = dbService.startRealtimeSync();

    return () => {
      window.removeEventListener('popstate', handlePopState);
      unsubscribe();
      stopRealtimeSync();
    };
  }, []);

  // Auto-redirect authenticated staff users from login/root to their primary dashboard
  useEffect(() => {
    if (currentUser && (currentPath === '/' || currentPath === '/login' || currentPath === '/index.html')) {
      const teacherObj = dbService.getTeacherByUserId(currentUser);
      const isWaliKelas = currentUser.role === 'WALI_KELAS' || !!teacherObj?.isWaliKelas;
      if (currentUser.role === 'ADMIN') {
        navigateTo('/admin');
      } else if (isWaliKelas) {
        navigateTo('/wali-kelas');
      } else if (currentUser.role === 'GURU') {
        navigateTo('/guru');
      }
    }
  }, [currentUser, currentPath]);

  const getNormalizedPath = (path: string) => {
    let clean = path.split('?')[0].split('#')[0];
    if (clean.endsWith('/') && clean.length > 1) {
      clean = clean.slice(0, -1);
    }
    if (clean === '' || clean === '/' || clean === '/index.html' || clean === '/login') {
      return '/login';
    }
    if (clean === '/hasil' || clean === '/guru' || clean === '/admin' || clean === '/wali-kelas' || clean === '/rekap') {
      return clean;
    }
    return '/login';
  };

  const activeRoute = getNormalizedPath(currentPath);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);

    const teacherObj = dbService.getTeacherByUserId(user);
    const isWaliKelas = user.role === 'WALI_KELAS' || !!teacherObj?.isWaliKelas;

    const urlParams = new URLSearchParams(window.location.search);
    const returnTo = urlParams.get('returnTo');

    if (returnTo && (returnTo === '/admin' || returnTo === '/guru' || returnTo === '/wali-kelas')) {
      if (returnTo === '/admin' && user.role === 'ADMIN') {
        navigateTo('/admin');
        return;
      }
      if (returnTo === '/wali-kelas' && (isWaliKelas || user.role === 'ADMIN')) {
        navigateTo('/wali-kelas');
        return;
      }
      if (returnTo === '/guru' && (user.role === 'GURU' || user.role === 'ADMIN' || isWaliKelas)) {
        navigateTo('/guru');
        return;
      }
    }

    if (user.role === 'ADMIN') {
      navigateTo('/admin');
    } else if (isWaliKelas) {
      navigateTo('/wali-kelas');
    } else {
      navigateTo('/guru');
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    navigateTo('/login');
  };

  const isImpersonating = authService.isImpersonating();

  const handleExitImpersonation = () => {
    const admin = authService.stopImpersonation();
    if (admin) {
      navigateTo('/admin');
    }
  };

  const urlParams = new URLSearchParams(window.location.search);
  const returnToQuery = urlParams.get('returnTo') || undefined;
  const isDashboardRoute = activeRoute === '/admin' || activeRoute === '/guru' || activeRoute === '/wali-kelas';

  return (
    <div className={`flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-500 selection:text-white transition-colors duration-200 ${
      isDashboardRoute ? 'h-screen overflow-hidden' : 'min-h-screen'
    }`}>
      {isImpersonating && currentUser && (
        <ImpersonationBanner currentUser={currentUser} onExit={handleExitImpersonation} />
      )}

      <Navbar
        currentUser={currentUser}
        currentPath={activeRoute}
        onNavigate={navigateTo}
        onLogout={handleLogout}
        onOpenStaffLogin={() => {
          if (activeRoute !== '/login') {
            navigateTo('/login');
          }
          setIsStaffLoginOpen(true);
        }}
      />

      {/* Mode indicator banner — tampil hanya di development */}
      {!isSupabaseConfigured() && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-center shrink-0">
          <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium inline-flex items-center gap-1.5 justify-center">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Mode Demo (localStorage) — Konfigurasi VITE_SUPABASE_URL di .env.local untuk beralih ke database produksi</span>
          </p>
        </div>
      )}

      {/* Wali Kelas, Guru & Admin Dashboard pages scroll internally */}
      <main className={activeRoute === '/admin' || activeRoute === '/guru' ? "flex-1 overflow-hidden flex flex-col min-h-0" : isDashboardRoute ? "flex-1 flex flex-col min-h-0 overflow-y-auto" : "flex-grow"}>
        {activeRoute === '/login' && (
          <ErrorBoundary>
            <LoginPage
              onLoginSuccess={handleLoginSuccess}
              onNavigate={navigateTo}
              returnTo={returnToQuery}
              isStaffModalOpen={isStaffLoginOpen}
              setIsStaffModalOpen={setIsStaffLoginOpen}
            />
          </ErrorBoundary>
        )}

        {activeRoute === '/hasil' && (
          <ErrorBoundary>
            <StudentPortalPage />
          </ErrorBoundary>
        )}

        {activeRoute === '/rekap' && (
          <ErrorBoundary>
            <PublicExamMonitoringPage onNavigate={navigateTo} />
          </ErrorBoundary>
        )}

        {activeRoute === '/guru' && (
          <ProtectedRoute
            currentUser={currentUser}
            targetPath="/guru"
            requiredRole={['GURU', 'ADMIN', 'WALI_KELAS']}
            onNavigate={navigateTo}
            onLogout={handleLogout}
          >
            <ErrorBoundary>
              <GuruAppPage key={currentUser?.id} currentUser={currentUser!} onNavigate={navigateTo} />
            </ErrorBoundary>
          </ProtectedRoute>
        )}

        {activeRoute === '/wali-kelas' && (
          <ProtectedRoute
            currentUser={currentUser}
            targetPath="/wali-kelas"
            requiredRole={['WALI_KELAS', 'GURU', 'ADMIN']}
            onNavigate={navigateTo}
            onLogout={handleLogout}
          >
            <ErrorBoundary>
              <WaliKelasAppPage key={currentUser?.id} currentUser={currentUser!} onNavigate={navigateTo} />
            </ErrorBoundary>
          </ProtectedRoute>
        )}

        {activeRoute === '/admin' && (
          <ProtectedRoute
            currentUser={currentUser}
            targetPath="/admin"
            requiredRole="ADMIN"
            onNavigate={navigateTo}
            onLogout={handleLogout}
          >
            <ErrorBoundary>
              <AdminAppPage key={currentUser?.id} currentUser={currentUser!} onNavigate={navigateTo} />
            </ErrorBoundary>
          </ProtectedRoute>
        )}
      </main>

      {!isDashboardRoute && <Footer />}

      {/* Toast notification system — render sekali di root */}
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
