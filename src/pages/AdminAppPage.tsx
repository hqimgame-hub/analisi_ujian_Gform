import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, UserCheck, School, Calendar, BookOpen, Settings, ShieldCheck,
  Plus, History, RefreshCw, Menu, X, CheckCircle2,
  AlertCircle, ShieldAlert, Search, Trash2, Edit3,
  Layers, ChevronLeft, ChevronRight, Check, AlertTriangle,
  FileSpreadsheet, Sparkles, Download, Upload, UserPlus,
  Award, FileText, ArrowRight, FolderKanban, ChevronDown, ChevronUp, Cloud, Key,
  Radio, EyeOff, ExternalLink, LogIn
} from 'lucide-react';
import { dbService } from '../services/database';
import { authService } from '../services/auth';
import {
  User, Teacher, Student, ClassRoom, AcademicYear, Subject,
  AuditLog, Role, ExamPackage, LiveMonitoringConfig
} from '../types/database';
import { getDynamicTryoutStageOptions } from '../utils/tryoutGroupUtils';
import { ExamPackagesSection } from '../components/admin/ExamPackagesSection';
import * as XLSX from 'xlsx';

interface AdminAppPageProps {
  currentUser: User;
  onNavigate?: (path: string) => void;
}

type AdminTab =
  | 'DASHBOARD'
  | 'PACKAGES'
  | 'USERS'
  | 'STUDENTS'
  | 'CLASSES'
  | 'SUBJECTS'
  | 'ACADEMIC_YEARS'
  | 'AUDIT_LOGS'
  | 'SETTINGS';

interface NavItem {
  key: AdminTab;
  label: string;
  icon: any;
  count?: number;
}

interface BulkStudentRow {
  rowNumber: number;
  nisn: string;
  nis: string;
  name: string;
  gender: 'L' | 'P';
  birthDate: string;
  classId: string;
  className: string;
  targetScore: number;
  email: string;
  phone: string;
  isValid: boolean;
  errorReason?: string;
}

export const AdminAppPage: React.FC<AdminAppPageProps> = ({ currentUser, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('DASHBOARD');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'GURU' | 'WALI_KELAS' | 'ADMIN'>('ALL');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Feedback Toasts & Errors
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Database State
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [examPackages, setExamPackages] = useState<ExamPackage[]>(() => dbService.getExamPackages());
  const [monitoringConfig, setMonitoringConfig] = useState<LiveMonitoringConfig>(() => dbService.getLiveMonitoringConfig());

  // Modals State
  const [modalType, setModalType] = useState<
    | null
    | 'TEACHER_CREATE'
    | 'TEACHER_EDIT'
    | 'STUDENT_CREATE'
    | 'STUDENT_EDIT'
    | 'CLASS_CREATE'
    | 'SUBJECT_CREATE'
    | 'ACADEMIC_YEAR_CREATE'
    | 'ASSIGN_WALI_KELAS'
    | 'BULK_IMPORT_STUDENTS'
  >(null);

  // Form Fields State
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formNip, setFormNip] = useState('');
  const [formNisn, setFormNisn] = useState('');
  const [formNis, setFormNis] = useState('');
  const [formIsAnswerKeyAccount, setFormIsAnswerKeyAccount] = useState(false);
  const [formGender, setFormGender] = useState<'L' | 'P'>('L');
  const [formBirthDate, setFormBirthDate] = useState('2008-05-14');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('password123');
  const [formRole, setFormRole] = useState<Role>('GURU');
  const [formIsWaliKelas, setFormIsWaliKelas] = useState(false);
  const [formHomeRoomClassId, setFormHomeRoomClassId] = useState('');
  const [formSubjectPermissions, setFormSubjectPermissions] = useState<string[]>([]);
  const [formClassPermissions, setFormClassPermissions] = useState<string[]>([]);
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false);
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
  const [formTargetScore, setFormTargetScore] = useState(82.5);
  const [formSelectedClassId, setFormSelectedClassId] = useState('');
  const [formSelectedTeacherId, setFormSelectedTeacherId] = useState('');
  const [formSelectedYearId, setFormSelectedYearId] = useState('');
  const [formGradeLevel, setFormGradeLevel] = useState<string>('7');
  const [formSubjectCategory, setFormSubjectCategory] = useState<'WAJIB' | 'PEMINATAN' | 'VOKASI'>('PEMINATAN');
  const [formPassingGrade, setFormPassingGrade] = useState<number>(75.0);
  const [formSemester, setFormSemester] = useState<'ODD' | 'EVEN'>('EVEN');

  // School Profile Settings State
  const initialSchoolProfile = dbService.getSchoolProfile();
  const [schoolName, setSchoolName] = useState(initialSchoolProfile.name);
  const [schoolSubHeader, setSchoolSubHeader] = useState(initialSchoolProfile.subHeader);
  const [schoolAddress, setSchoolAddress] = useState(initialSchoolProfile.address);
  const [schoolPrincipalName, setSchoolPrincipalName] = useState(initialSchoolProfile.principalName);
  const [schoolPrincipalNip, setSchoolPrincipalNip] = useState(initialSchoolProfile.principalNip);
  const [schoolAcademicYear, setSchoolAcademicYear] = useState(initialSchoolProfile.academicYear);
  const [schoolLogoUrl, setSchoolLogoUrl] = useState(initialSchoolProfile.logoUrl || '');
  const logoFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      triggerToast('Harap pilih file gambar (PNG, JPG, SVG, WebP).', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      triggerToast('Ukuran gambar terlalu besar. Maksimal 5 MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 320;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/png');
          setSchoolLogoUrl(compressed);
          triggerToast('Logo berhasil dipilih. Klik "Simpan Perubahan Informasi Sekolah" untuk menerapkan.');
        }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Cloud Sync State
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudSyncResult, setCloudSyncResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // Assign Wali Kelas State
  const [assigningClass, setAssigningClass] = useState<ClassRoom | null>(null);
  const [selectedWaliTeacherId, setSelectedWaliTeacherId] = useState('');

  // Bulk Excel Import State
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [bulkImportFileName, setBulkImportFileName] = useState('');
  const [bulkParsedPreview, setBulkParsedPreview] = useState<BulkStudentRow[]>([]);

  // Contextual Admin Delete Confirm Modal State
  const [adminDeleteConfirm, setAdminDeleteConfirm] = useState<{
    id: string;
    title: string;
    type: 'GURU' | 'SISWA' | 'KELAS' | 'MAPEL' | 'RESET_DB';
  } | null>(null);

  // Modal State untuk Impersonasi (Admin Masuk ke Akun Guru/Walas)
  const [impersonateConfirm, setImpersonateConfirm] = useState<{
    teacher: Teacher;
    targetUser: User;
    isWali: boolean;
  } | null>(null);

  const handleStartImpersonate = (teacher: Teacher, existingUser?: User) => {
    const isWali = teacher.isWaliKelas || classes.some(c => c.homeRoomTeacherId === teacher.id || c.id === teacher.homeRoomClassId);
    const targetUser: User = existingUser || {
      id: teacher.userId || `u-${teacher.id}`,
      email: teacher.email || `${teacher.nip}@sekolah.id`,
      role: isWali ? 'WALI_KELAS' : 'GURU',
      name: teacher.name,
      createdAt: new Date().toISOString(),
    };
    setImpersonateConfirm({ teacher, targetUser, isWali });
  };

  const handleConfirmImpersonate = () => {
    if (!impersonateConfirm) return;
    const { targetUser, isWali } = impersonateConfirm;
    authService.impersonateUser(targetUser);
    triggerToast(`Berhasil masuk sebagai ${targetUser.name} (${isWali ? 'Wali Kelas' : 'Guru Mapel'}).`, 'success');
    setImpersonateConfirm(null);
    if (onNavigate) {
      onNavigate(isWali ? '/wali-kelas' : '/guru');
    } else {
      window.location.href = isWali ? '/wali-kelas' : '/guru';
    }
  };

  // Checkbox Bulk Delete States
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);

  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<{
    type: 'SISWA' | 'GURU' | 'KELAS' | 'MAPEL';
    count: number;
  } | null>(null);

  const handleConfirmBatchDelete = () => {
    if (!batchDeleteConfirm) return;
    try {
      if (batchDeleteConfirm.type === 'SISWA') {
        dbService.deleteStudentsBatch(selectedStudentIds, currentUser);
        triggerToast(`Berhasil menghapus massal ${selectedStudentIds.length} data siswa.`);
        setSelectedStudentIds([]);
      } else if (batchDeleteConfirm.type === 'GURU') {
        dbService.deleteTeachersBatch(selectedTeacherIds, currentUser);
        triggerToast(`Berhasil menghapus massal ${selectedTeacherIds.length} data guru/staf.`);
        setSelectedTeacherIds([]);
      } else if (batchDeleteConfirm.type === 'KELAS') {
        dbService.deleteClassesBatch(selectedClassIds, currentUser);
        triggerToast(`Berhasil menghapus massal ${selectedClassIds.length} data kelas.`);
        setSelectedClassIds([]);
      } else if (batchDeleteConfirm.type === 'MAPEL') {
        dbService.deleteSubjectsBatch(selectedSubjectIds, currentUser);
        triggerToast(`Berhasil menghapus massal ${selectedSubjectIds.length} data mata pelajaran.`);
        setSelectedSubjectIds([]);
      }
      setBatchDeleteConfirm(null);
      refreshData();
    } catch (err: any) {
      triggerToast(err.message || 'Gagal menghapus data massal.', 'error');
      setBatchDeleteConfirm(null);
    }
  };

  const triggerToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const refreshData = () => {
    const state = dbService.getState();
    setTeachers(state.teachers);
    setStudents(state.students);
    setClasses(state.classes);
    setAcademicYears(state.academicYears);
    setSubjects(state.subjects);
    setAuditLogs(state.auditLogs);
    setExamPackages(dbService.getExamPackages());

    // Perbarui field profil sekolah jika ada perubahan dari cloud/perangkat lain
    const sp = dbService.getSchoolProfile();
    setSchoolName(sp.name);
    setSchoolSubHeader(sp.subHeader);
    setSchoolAddress(sp.address);
    setSchoolPrincipalName(sp.principalName);
    setSchoolPrincipalNip(sp.principalNip);
    setSchoolAcademicYear(sp.academicYear);
    setSchoolLogoUrl(sp.logoUrl || '');
    setMonitoringConfig(dbService.getLiveMonitoringConfig());
  };

  useEffect(() => {
    refreshData();
    const unsubscribeLocal = dbService.subscribe(refreshData);

    // Mulai sync otomatis dua arah (Realtime + polling 30s)
    const stopRealtimeSync = dbService.startRealtimeSync();
    // Tandai status koneksi cloud (cek setelah 2 detik)
    const timer = setTimeout(() => setRealtimeConnected(true), 2000);

    return () => {
      unsubscribeLocal();
      stopRealtimeSync();
      clearTimeout(timer);
    };
  }, []);

  const handleConfirmAdminDelete = () => {
    if (!adminDeleteConfirm) return;
    try {
      const { id, title, type } = adminDeleteConfirm;
      if (type === 'RESET_DB') {
        dbService.resetToDefault(currentUser);
        triggerToast('Database berhasil dikembalikan ke status awal pabrik.');
      } else if (type === 'GURU') {
        dbService.deleteTeacher(id, currentUser);
        triggerToast(`Data guru '${title}' berhasil dihapus.`);
      } else if (type === 'SISWA') {
        dbService.deleteStudent(id, currentUser);
        triggerToast(`Data siswa '${title}' berhasil dihapus.`);
      } else if (type === 'KELAS') {
        dbService.deleteClass(id, currentUser);
        triggerToast(`Kelas '${title}' berhasil dihapus.`);
      } else if (type === 'MAPEL') {
        dbService.deleteSubject(id, currentUser);
        triggerToast(`Mata pelajaran '${title}' berhasil dihapus.`);
      }
      setAdminDeleteConfirm(null);
      refreshData();
    } catch (err: any) {
      triggerToast(err.message || 'Gagal menghapus data.', 'error');
      setAdminDeleteConfirm(null);
    }
  };

  const handleTabChange = (tab: AdminTab) => {
    setIsLoading(true);
    setActiveTab(tab);
    setSearchQuery('');
    setCurrentPage(1);
    setSidebarOpen(false);
    setTimeout(() => setIsLoading(false), 150);
  };

  // Close modals & reset form
  const closeModal = () => {
    setModalType(null);
    setEditingTeacherId(null);
    setEditingStudentId(null);
    setFormName('');
    setFormCode('');
    setFormNip('');
    setFormNisn('');
    setFormNis('');
    setFormEmail('');
    setFormPhone('');
    setFormRole('GURU');
    setFormIsWaliKelas(false);
    setFormHomeRoomClassId('');
    setFormSubjectPermissions([]);
    setFormClassPermissions([]);
    setIsSubjectDropdownOpen(false);
    setIsClassDropdownOpen(false);
    setAssigningClass(null);
    setSelectedWaliTeacherId('');
    setBulkCsvText('');
    setBulkImportFileName('');
    setBulkParsedPreview([]);
  };

  // -------------------------------------------------------------
  // USER / TEACHER / WALI KELAS HANDLERS
  // -------------------------------------------------------------
  const handleOpenCreateTeacher = () => {
    closeModal();
    setFormNip(`198${Math.floor(1000000000 + Math.random() * 9000000000)}`);
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormPassword('password123');
    setFormRole('GURU');
    setFormIsWaliKelas(false);
    setFormHomeRoomClassId('');
    setFormSubjectPermissions(subjects[0]?.id ? [subjects[0].id] : []);
    setFormClassPermissions(classes.map(c => c.id));
    setModalType('TEACHER_CREATE');
  };

  const handleOpenEditTeacher = (t: Teacher) => {
    closeModal();
    setEditingTeacherId(t.id);
    setFormNip(t.nip);
    setFormName(t.name);
    setFormEmail(t.email || '');
    setFormPhone(t.phone || '');

    // Find user record for password & role
    const users = dbService.getState().users;
    const matchedUser = users.find(u => (t.email && u.email.toLowerCase() === t.email.toLowerCase()) || u.id === t.userId);
    setFormPassword(matchedUser?.password || t.password || 'password123');
    const matchedRole = matchedUser?.role || (t.isWaliKelas ? 'WALI_KELAS' : 'GURU');
    setFormRole(matchedRole);
    setFormIsWaliKelas(matchedRole === 'WALI_KELAS' || !!t.isWaliKelas);
    setFormHomeRoomClassId(t.homeRoomClassId || '');
    setFormSubjectPermissions(t.subjectPermissions || []);
    setFormClassPermissions(t.classPermissions || []);
    setModalType('TEACHER_EDIT');
  };

  const handleSaveTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!formName.trim() || !formNip.trim()) {
        triggerToast('Harap lengkapi NIP dan Nama Lengkap staf.', 'error');
        return;
      }

      const isWali = formRole === 'WALI_KELAS' || formIsWaliKelas;
      const roleToSave: Role = formRole === 'ADMIN' ? 'ADMIN' : (isWali ? 'WALI_KELAS' : 'GURU');
      const passwordToSave = formPassword.trim() || 'password123';
      const cleanEmail = formEmail.trim() || (roleToSave === 'ADMIN' ? `${formNip.trim().toLowerCase()}@admin.sekolah.id` : `${formNip.trim()}@guru.sekolah.id`);

      if (editingTeacherId) {
        const existingTeacher = teachers.find(t => t.id === editingTeacherId);
        // Update Teacher and User synchronously
        dbService.updateTeacher(
          editingTeacherId,
          {
            nip: formNip.trim(),
            name: formName.trim(),
            email: formEmail.trim() || existingTeacher?.email || cleanEmail,
            phone: formPhone.trim() || existingTeacher?.phone || '',
            password: passwordToSave,
            subjectPermissions: roleToSave === 'ADMIN' ? [] : formSubjectPermissions,
            classPermissions: roleToSave === 'ADMIN' ? [] : formClassPermissions,
            isWaliKelas: roleToSave === 'ADMIN' ? false : isWali,
            homeRoomClassId: roleToSave === 'ADMIN' ? undefined : (isWali ? (formHomeRoomClassId || undefined) : undefined)
          },
          currentUser,
          roleToSave,
          passwordToSave
        );

        triggerToast(`Data staf/guru '${formName}' (${roleToSave}) berhasil diperbarui.`);
      } else {
        // Create Teacher and User synchronously with auto-generated system email
        dbService.addTeacher(
          {
            userId: `u-${Date.now()}`,
            nip: formNip.trim(),
            name: formName.trim(),
            email: cleanEmail,
            phone: formPhone.trim() || '',
            password: passwordToSave,
            subjectPermissions: roleToSave === 'ADMIN' ? [] : formSubjectPermissions,
            classPermissions: roleToSave === 'ADMIN' ? [] : formClassPermissions,
            isWaliKelas: roleToSave === 'ADMIN' ? false : isWali,
            homeRoomClassId: roleToSave === 'ADMIN' ? undefined : (isWali ? (formHomeRoomClassId || undefined) : undefined)
          },
          currentUser,
          roleToSave,
          passwordToSave
        );

        triggerToast(`Staf/Guru baru '${formName}' (${roleToSave}) berhasil ditambahkan.`);
      }

      closeModal();
      refreshData();
    } catch (err: any) {
      triggerToast(err?.message || 'Gagal menyimpan data staf.', 'error');
    }
  };

  // -------------------------------------------------------------
  // STUDENT MANUAL HANDLERS
  // -------------------------------------------------------------
  const handleOpenCreateStudent = () => {
    closeModal();
    setEditingStudentId(null);
    setFormNisn(`006${Math.floor(1000000 + Math.random() * 9000000)}`);
    setFormNis('');
    setFormName('');
    setFormGender('L');
    setFormBirthDate('2008-05-14');
    setFormSelectedClassId(classes[0]?.id || '');
    setFormTargetScore(85);
    setFormEmail('');
    setFormPhone('');
    setFormIsAnswerKeyAccount(false);
    setModalType('STUDENT_CREATE');
  };

  const handleOpenEditStudent = (s: Student) => {
    closeModal();
    setEditingStudentId(s.id);
    setFormNisn(s.nisn);
    setFormNis(s.nis || '');
    setFormName(s.name);
    setFormGender(s.gender);
    setFormBirthDate(s.birthDate || '2008-05-14');
    setFormSelectedClassId(s.classId);
    setFormTargetScore(s.targetScore || 80);
    setFormEmail(s.email || '');
    setFormPhone(s.phone || '');
    setFormIsAnswerKeyAccount(Boolean(s.isAnswerKeyAccount));
    setModalType('STUDENT_EDIT');
  };

  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!formName.trim() || !formNisn.trim()) {
        triggerToast('Lengkapi Nama dan NISN Siswa.', 'error');
        return;
      }

      let classIdToUse = formSelectedClassId;

      // Jika akun kunci jawaban dan belum memilih kelas atau belum ada kelas sama sekali
      if (formIsAnswerKeyAccount && (!classIdToUse || classes.length === 0)) {
        let keyClass = classes.find(c => c.name.toLowerCase().includes('kunci') || c.name.toLowerCase().includes('master'));
        if (!keyClass) {
          const defaultAy = academicYears.find(ay => ay.isActive) || academicYears[0];
          keyClass = dbService.addClass({
            name: 'Kunci Jawaban',
            gradeLevel: 'XII',
            academicYearId: defaultAy?.id || '0ffe2ac4-48bd-400b-ae8c-05ecff36e4a1'
          }, currentUser);
        }
        classIdToUse = keyClass.id;
      } else if (!classIdToUse) {
        triggerToast('Pilih Kelas untuk Siswa.', 'error');
        return;
      }

      const studentPayload = {
        nisn: formNisn.trim(),
        nis: formNis.trim(),
        name: formName.trim(),
        gender: formGender,
        classId: classIdToUse,
        birthDate: formBirthDate,
        email: formEmail.trim() || `${formNisn.trim()}@siswa.sch.id`,
        phone: formPhone.trim(),
        targetScore: Number(formTargetScore) || 80,
        isAnswerKeyAccount: formIsAnswerKeyAccount
      };

      if (modalType === 'STUDENT_EDIT' && editingStudentId) {
        dbService.updateStudent(editingStudentId, studentPayload, currentUser);
        triggerToast(`Data ${formIsAnswerKeyAccount ? 'akun kunci' : 'siswa'} '${formName}' berhasil diperbarui.`);
      } else {
        dbService.addStudent(studentPayload, currentUser);
        triggerToast(`${formIsAnswerKeyAccount ? 'Akun kunci jawaban' : 'Siswa'} '${formName}' berhasil ditambahkan.`);
      }

      closeModal();
      refreshData();
    } catch (err: any) {
      triggerToast(err.message || 'Gagal menyimpan data siswa.', 'error');
    }
  };

  // -------------------------------------------------------------
  // BULK EXCEL STUDENT UPLOAD PIPELINE (5 COLUMNS: NISN, Nama, JK, Tgl Lahir, Kelas)
  // -------------------------------------------------------------
  const formatExcelDate = (val: any): string => {
    if (!val) return '2008-05-14';
    if (val instanceof Date) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const ddmmyyyy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (ddmmyyyy) {
      const [, d, m, y] = ddmmyyyy;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const num = Number(val);
    if (!isNaN(num) && num > 10000 && num < 60000) {
      // Excel serial date format
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const jsDate = new Date(excelEpoch.getTime() + num * 86400000);
      const y = jsDate.getUTCFullYear();
      const m = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(jsDate.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return str || '2008-05-14';
  };

  const handleDownloadStudentTemplate = () => {
    const sampleData = [
      {
        'NISN': '0061234590',
        'Nama Lengkap': 'Ahmad Fauzi',
        'Jenis Kelamin (L/P)': 'L',
        'Tanggal Lahir (YYYY-MM-DD)': '2008-04-12',
        'Kelas': classes[0]?.name || 'XII IPA 1'
      },
      {
        'NISN': '0061234591',
        'Nama Lengkap': 'Siti Rahmawati',
        'Jenis Kelamin (L/P)': 'P',
        'Tanggal Lahir (YYYY-MM-DD)': '2008-08-20',
        'Kelas': classes[0]?.name || 'XII IPA 1'
      },
      {
        'NISN': '0061234592',
        'Nama Lengkap': 'Deni Kurniawan',
        'Jenis Kelamin (L/P)': 'L',
        'Tanggal Lahir (YYYY-MM-DD)': '2008-01-15',
        'Kelas': classes[1]?.name || classes[0]?.name || 'XII IPA 2'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    worksheet['!cols'] = [
      { wch: 16 }, // NISN
      { wch: 28 }, // Nama Lengkap
      { wch: 22 }, // Jenis Kelamin (L/P)
      { wch: 26 }, // Tanggal Lahir (YYYY-MM-DD)
      { wch: 18 }  // Kelas
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Siswa');
    XLSX.writeFile(workbook, 'Template_Import_Siswa.xlsx');
    triggerToast('Template Excel (.xlsx) berhasil diunduh. Silakan isi 5 kolom data dan unggah kembali.');
  };

  const parseAndValidateRows = (rawRows: any[][]) => {
    if (!rawRows || rawRows.length <= 1) {
      setBulkParsedPreview([]);
      return;
    }

    const existingNisns = new Set(students.map(s => s.nisn.trim()));
    const validClassIds = new Map(classes.map(c => [c.id, c.name]));

    // Check header row for dynamic column mapping
    const headerRow = (rawRows[0] || []).map((h: any) =>
      String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    );

    let nisnIdx = -1;
    let nameIdx = -1;
    let genderIdx = -1;
    let birthDateIdx = -1;
    let classIdx = -1;
    let nisIdx = -1;

    headerRow.forEach((col: string, idx: number) => {
      if (col.includes('nisn')) nisnIdx = idx;
      else if (col === 'nis') nisIdx = idx;
      else if (col.includes('nama')) nameIdx = idx;
      else if (col.includes('kelamin') || col === 'jk' || col === 'gender') genderIdx = idx;
      else if (col.includes('lahir') || col.includes('birth') || col.includes('tgl')) birthDateIdx = idx;
      else if (col.includes('kelas') || col.includes('class') || col.includes('rombel')) classIdx = idx;
    });

    // Standard column position fallbacks
    if (nisnIdx === -1) nisnIdx = 0;
    if (nameIdx === -1) nameIdx = headerRow.length >= 5 ? 1 : 1;
    if (genderIdx === -1) genderIdx = headerRow.length >= 5 ? 2 : 2;
    if (birthDateIdx === -1) birthDateIdx = headerRow.length >= 5 ? 3 : 3;
    if (classIdx === -1) classIdx = headerRow.length >= 5 ? 4 : 4;

    const parsedRows: BulkStudentRow[] = [];
    const seenFileNisns = new Set<string>();

    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.every((c: any) => String(c || '').trim() === '')) continue;

      const nisn = String(row[nisnIdx] || '').trim();
      const name = String(row[nameIdx] || '').trim();
      const rawGender = String(row[genderIdx] || 'L').trim().toUpperCase();
      const gender: 'L' | 'P' = rawGender === 'P' || rawGender === 'PEREMPUAN' || rawGender === 'WANITA' ? 'P' : 'L';
      const birthDate = formatExcelDate(row[birthDateIdx]);
      const rawClass = String(row[classIdx] || '').trim();
      const nis = nisIdx !== -1 && row[nisIdx] ? String(row[nisIdx]).trim() : '';

      // Match class by ID or Name
      let matchedClassId = '';
      let matchedClassName = 'Kelas Tidak Ditemukan';
      if (validClassIds.has(rawClass)) {
        matchedClassId = rawClass;
        matchedClassName = validClassIds.get(rawClass)!;
      } else {
        const found = classes.find(c =>
          c.name.trim().toLowerCase() === rawClass.toLowerCase() ||
          c.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === rawClass.toLowerCase().replace(/[^a-z0-9]/g, '') ||
          c.id.toLowerCase() === rawClass.toLowerCase()
        );
        if (found) {
          matchedClassId = found.id;
          matchedClassName = found.name;
        } else if (classes.length > 0 && !rawClass) {
          matchedClassId = classes[0].id;
          matchedClassName = classes[0].name;
        }
      }

      let isValid = true;
      let errorReason = '';

      if (!nisn) {
        isValid = false;
        errorReason = 'NISN Wajib Diisi';
      } else if (!name) {
        isValid = false;
        errorReason = 'Nama Lengkap Kosong';
      } else if (!matchedClassId) {
        isValid = false;
        errorReason = `Kelas '${rawClass}' tidak ditemukan`;
      } else if (existingNisns.has(nisn)) {
        isValid = false;
        errorReason = 'NISN sudah ada di Database';
      } else if (seenFileNisns.has(nisn)) {
        isValid = false;
        errorReason = 'Duplikat NISN dalam File';
      }

      if (nisn) seenFileNisns.add(nisn);

      parsedRows.push({
        rowNumber: i,
        nisn,
        nis,
        name,
        gender,
        birthDate,
        classId: matchedClassId,
        className: matchedClassName,
        targetScore: 80,
        email: `${nisn}@siswa.sch.id`,
        phone: '',
        isValid,
        errorReason
      });
    }

    setBulkParsedPreview(parsedRows);
  };

  const parseAndValidateStudentCsv = (rawText: string) => {
    setBulkCsvText(rawText);
    const lines = rawText.split(/\r?\n/).filter(line => line.trim().length > 0);
    const rows = lines.map(line => {
      const delimiter = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : ',');
      return line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
    });
    parseAndValidateRows(rows);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkImportFileName(file.name);
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const buffer = event.target?.result as ArrayBuffer;
          const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          parseAndValidateRows(rawRows);
        } catch (err: any) {
          triggerToast('Gagal membaca file Excel. Pastikan file valid.', 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          parseAndValidateStudentCsv(content);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleExecuteBulkImport = () => {
    const validRows = bulkParsedPreview.filter(r => r.isValid);
    if (validRows.length === 0) {
      triggerToast('Tidak ada data siswa yang valid untuk diimpor.', 'error');
      return;
    }

    try {
      let importedCount = 0;
      validRows.forEach(row => {
        dbService.addStudent(
          {
            nisn: row.nisn,
            nis: row.nis || '',
            name: row.name,
            gender: row.gender,
            classId: row.classId,
            birthDate: row.birthDate,
            email: row.email,
            phone: row.phone,
            targetScore: row.targetScore
          },
          currentUser
        );
        importedCount++;
      });

      dbService.logAudit(
        currentUser,
        'BULK_IMPORT_STUDENTS',
        'STUDENT',
        `Berhasil mengimpor ${importedCount} data siswa massal via Excel (${bulkImportFileName || 'Manual Upload'})`
      );

      triggerToast(`Berhasil mengimpor ${importedCount} siswa baru secara massal!`);
      closeModal();
      refreshData();
    } catch (err: any) {
      triggerToast(err.message || 'Gagal memproses impor massal siswa.', 'error');
    }
  };

  // -------------------------------------------------------------
  // CLASS & WALI KELAS PAIRING HANDLERS
  // -------------------------------------------------------------
  const handleOpenAssignWaliKelas = (c: ClassRoom) => {
    closeModal();
    setAssigningClass(c);
    setSelectedWaliTeacherId(c.homeRoomTeacherId || teachers[0]?.id || '');
    setModalType('ASSIGN_WALI_KELAS');
  };

  const handleSaveAssignWaliKelas = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningClass || !selectedWaliTeacherId) return;

    try {
      // Lepas status wali kelas dari guru lain yang sebelumnya mengampu kelas ini (jika ada)
      const prevWali = teachers.find(t => t.homeRoomClassId === assigningClass.id && t.id !== selectedWaliTeacherId);
      if (prevWali) {
        dbService.updateTeacher(prevWali.id, { isWaliKelas: false, homeRoomClassId: undefined }, currentUser);
      }

      // Set class homeroom teacher
      dbService.updateClass(assigningClass.id, { homeRoomTeacherId: selectedWaliTeacherId }, currentUser);

      // Set teacher isWaliKelas and homeRoomClassId
      const teacherObj = teachers.find(t => t.id === selectedWaliTeacherId);
      if (teacherObj) {
        dbService.updateTeacher(
          selectedWaliTeacherId,
          { isWaliKelas: true, homeRoomClassId: assigningClass.id },
          currentUser
        );

        // Update user role to WALI_KELAS
        const users = dbService.getState().users;
        const matchedUser = users.find(u => u.id === teacherObj.userId || (teacherObj.email && u.email.toLowerCase() === teacherObj.email.toLowerCase()));
        if (matchedUser && matchedUser.role !== 'ADMIN') {
          matchedUser.role = 'WALI_KELAS';
        }
      }

      triggerToast(`Wali Kelas untuk ${assigningClass.name} berhasil ditetapkan.`);
      closeModal();
      refreshData();
    } catch (err: any) {
      triggerToast(err.message || 'Gagal menetapkan wali kelas.', 'error');
    }
  };

  const handleOpenCreateClass = () => {
    closeModal();
    setFormName('');
    setFormGradeLevel('7');
    setFormSelectedYearId(academicYears.find(a => a.isActive)?.id || academicYears[0]?.id || '');
    setFormSelectedTeacherId(''); // Wali kelas bersifat opsional
    setModalType('CLASS_CREATE');
  };

  const handleSaveClass = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!formName.trim()) {
        triggerToast('Nama kelas harus diisi.', 'error');
        return;
      }

      dbService.addClass(
        {
          name: formName.trim(),
          gradeLevel: formGradeLevel,
          academicYearId: formSelectedYearId || academicYears[0]?.id || '0ffe2ac4-48bd-400b-ae8c-05ecff36e4a1',
          homeRoomTeacherId: formSelectedTeacherId || undefined
        },
        currentUser
      );

      triggerToast(`Kelas '${formName}' berhasil ditambahkan.`);
      closeModal();
      refreshData();
    } catch (err: any) {
      triggerToast(err.message || 'Gagal menambahkan kelas.', 'error');
    }
  };

  // -------------------------------------------------------------
  // SUBJECTS & ACADEMIC YEAR HANDLERS
  // -------------------------------------------------------------
  const handleOpenCreateSubject = () => {
    closeModal();
    setFormCode('');
    setFormName('');
    setFormSubjectCategory('PEMINATAN');
    setFormPassingGrade(75.0);
    setModalType('SUBJECT_CREATE');
  };

  const handleSaveSubject = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!formName.trim() || !formCode.trim()) {
        triggerToast('Kode dan Nama Mata Pelajaran harus diisi.', 'error');
        return;
      }

      dbService.addSubject(
        {
          code: formCode.trim().toUpperCase(),
          name: formName.trim(),
          category: formSubjectCategory,
          passingGrade: Number(formPassingGrade) || 75.0,
        },
        currentUser
      );

      triggerToast(`Mata pelajaran '${formName}' berhasil ditambahkan.`);
      closeModal();
      refreshData();
    } catch (err: any) {
      triggerToast(err.message || 'Gagal menambahkan mata pelajaran.', 'error');
    }
  };

  const handleOpenCreateAcademicYear = () => {
    closeModal();
    setFormName('2026/2027');
    setFormSemester('ODD');
    setModalType('ACADEMIC_YEAR_CREATE');
  };

  const handleSaveAcademicYear = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      dbService.addAcademicYear(
        {
          yearLabel: formName.trim(),
          semester: formSemester,
          isActive: true
        },
        currentUser
      );

      triggerToast(`Tahun akademik '${formName}' berhasil ditambahkan.`);
      closeModal();
      refreshData();
    } catch (err: any) {
      triggerToast(err.message || 'Gagal menambahkan tahun akademik.', 'error');
    }
  };

  // -------------------------------------------------------------
  // FILTERED DATA COMPUTATION
  // -------------------------------------------------------------
  const filteredTeachers = teachers.filter(t => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.nip.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.email ? t.email.toLowerCase().includes(searchQuery.toLowerCase()) : false);

    const users = dbService.getState().users;
    const userObj = users.find(u => u.id === t.userId || (t.email && u.email.toLowerCase() === t.email.toLowerCase()));
    const role = userObj?.role || (t.isWaliKelas ? 'WALI_KELAS' : 'GURU');

    if (roleFilter === 'GURU') return matchesSearch && role === 'GURU';
    if (roleFilter === 'WALI_KELAS') return matchesSearch && (role === 'WALI_KELAS' || t.isWaliKelas);
    if (roleFilter === 'ADMIN') return matchesSearch && role === 'ADMIN';

    return matchesSearch;
  });

  const filteredStudents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const targetClass = classes.find(c => c.id === classFilter);

    return students.filter(s => {
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.nisn.toLowerCase().includes(q) ||
        (s.nis && s.nis.toLowerCase().includes(q));

      const matchesClass =
        classFilter === 'ALL' ||
        s.classId === classFilter ||
        (targetClass && (
          s.classId === targetClass.name ||
          s.classId?.toLowerCase() === targetClass.name.toLowerCase()
        ));

      return matchesSearch && matchesClass;
    });
  }, [students, searchQuery, classFilter, classes]);

  // Pagination Helper
  const totalCount =
    activeTab === 'USERS'
      ? filteredTeachers.length
      : activeTab === 'STUDENTS'
      ? filteredStudents.length
      : 0;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedTeachers = filteredTeachers.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
  const paginatedStudents = filteredStudents.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);

  // Navigation Items Sidebar
  const navItems: NavItem[] = [
    { key: 'DASHBOARD', label: 'Ringkasan Master Data', icon: Layers },
    { key: 'PACKAGES', label: 'Paket Ujian (Wadah)', icon: FolderKanban, count: (examPackages || []).length },
    { key: 'USERS', label: 'Pengguna & Wali Kelas', icon: Users, count: teachers.length },
    { key: 'STUDENTS', label: 'Data Siswa', icon: UserCheck, count: students.length },
    { key: 'CLASSES', label: 'Kelas & Roster Sekolah', icon: School, count: classes.length },
    { key: 'SUBJECTS', label: 'Mata Pelajaran', icon: BookOpen, count: subjects.length },
    { key: 'ACADEMIC_YEARS', label: 'Tahun Akademik', icon: Calendar, count: academicYears.length },
    { key: 'AUDIT_LOGS', label: 'Audit Log & Keamanan', icon: History, count: auditLogs.length },
    { key: 'SETTINGS', label: 'Pengaturan Sistem', icon: Settings },
  ];

  const activeYear = academicYears.find(a => a.isActive) || academicYears[0];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold flex items-center gap-2.5 backdrop-blur-md ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-800 text-emerald-100'
                : 'bg-rose-950/90 border-rose-800 text-rose-100'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Admin Workspace Container */}
      <div className="flex-1 flex h-full overflow-hidden min-h-0">
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar Navigation - Always Stretches to Bottom */}
        <aside
          className={`fixed lg:static lg:h-full inset-y-0 left-0 z-30 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between overflow-hidden transition-transform duration-300 ease-in-out shrink-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Admin Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                  AD
                </div>
                <div>
                  <h1 className="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                    Panel Administrasi
                  </h1>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold block">
                    Pengguna & Master Data
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active Academic Year Pill */}
            <div className="p-3 mx-3 my-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 rounded-xl text-xs shrink-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-300">
                  Tahun Ajaran Aktif
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                {activeYear ? `${activeYear.yearLabel} (${activeYear.semester === 'ODD' ? 'Ganjil' : 'Genap'})` : '2025/2026 (Genap)'}
              </div>
            </div>

            {/* Nav Menu */}
            <nav className="px-2 space-y-1 flex-1 overflow-y-auto pb-2">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => handleTabChange(item.key)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </div>
                    {item.count !== undefined && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                          isActive
                            ? 'bg-indigo-700 text-white'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer User Info */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center shrink-0">
                {currentUser.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  {currentUser.role} · Administrator
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Workspace Content Area */}
        <main className="flex-1 overflow-y-auto min-w-0 bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8">
          {/* Mobile Menu Toggle Bar */}
          <div className="lg:hidden mb-4 flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-200 flex items-center gap-2 text-xs font-semibold"
            >
              <Menu className="w-4 h-4" />
              <span>Menu Navigasi Admin</span>
            </button>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
              {navItems.find(i => i.key === activeTab)?.label}
            </span>
          </div>

          {/* TAB 1: DASHBOARD OVERVIEW */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-6">
              {/* Top Banner */}
              <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
                <div className="relative z-10 max-w-2xl">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 block mb-1">
                    Panel Master Administrasi Sekolah
                  </span>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
                    Selamat Datang, {currentUser.name}!
                  </h2>
                  <p className="text-xs sm:text-sm text-indigo-100/90 leading-relaxed mb-6">
                    Sistem difokuskan khusus untuk pengelolaan <strong className="text-white font-semibold">Pengguna</strong>, <strong className="text-white font-semibold">Staf Pengajar &amp; Wali Kelas</strong>, <strong className="text-white font-semibold">Data Siswa (Bulk Import Excel)</strong>, <strong className="text-white font-semibold">Manajemen Kelas</strong>, dan <strong className="text-white font-semibold">Kurikulum Mata Pelajaran</strong>.
                  </p>

                  <div className="flex flex-wrap gap-2.5">
                    <button
                      onClick={() => handleTabChange('PACKAGES')}
                      className="px-4 py-2.5 bg-white text-indigo-950 hover:bg-indigo-50 font-bold text-xs rounded-xl transition-colors shadow-sm cursor-pointer flex items-center gap-2"
                    >
                      <FolderKanban className="w-4 h-4 text-indigo-600" />
                      <span>Kelola Paket Ujian (Wadah)</span>
                    </button>

                    <button
                      onClick={() => handleTabChange('USERS')}
                      className="px-4 py-2.5 bg-indigo-700/80 hover:bg-indigo-600 text-white font-bold text-xs rounded-xl border border-indigo-500/40 transition-colors shadow-sm cursor-pointer flex items-center gap-2"
                    >
                      <Users className="w-4 h-4 text-indigo-200" />
                      <span>Kelola Pengguna</span>
                    </button>

                    <button
                      onClick={() => {
                        handleTabChange('STUDENTS');
                        setTimeout(() => {
                          setModalType('BULK_IMPORT_STUDENTS');
                        }, 200);
                      }}
                      className="px-4 py-2.5 bg-indigo-700/80 hover:bg-indigo-600 text-white font-bold text-xs rounded-xl border border-indigo-500/40 transition-colors shadow-sm cursor-pointer flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-amber-300" />
                      <span>Import Siswa via Excel</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Metric Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                      Staf & Wali Kelas
                    </span>
                    <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {teachers.length} <span className="text-xs font-normal text-slate-500">Orang</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                      Total Siswa Terdaftar
                    </span>
                    <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {students.length} <span className="text-xs font-normal text-slate-500">Siswa</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <School className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                      Roster Kelas
                    </span>
                    <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {classes.length} <span className="text-xs font-normal text-slate-500">Rombel</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                      Mata Pelajaran
                    </span>
                    <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {subjects.length} <span className="text-xs font-normal text-slate-500">Mapel</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Roster Wali Kelas Overview */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Penetapan Wali Kelas & Rombel Sekolah
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Daftar kelas aktif beserta Wali Kelas penanggung jawab academic progress.
                    </p>
                  </div>
                  <button
                    onClick={() => handleTabChange('CLASSES')}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Kelola Kelas</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {classes.map(c => {
                    const waliTeacher = teachers.find(t => t.id === c.homeRoomTeacherId);
                    const studentCount = students.filter(s => s.classId === c.id).length;
                    return (
                      <div
                        key={c.id}
                        className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                              {c.name}
                            </span>
                            <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold px-2 py-0.5 rounded">
                              {studentCount} Siswa
                            </span>
                          </div>

                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1">
                            {waliTeacher ? waliTeacher.name : 'Belum Ditentukan'}
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                            {waliTeacher ? `NIP: ${waliTeacher.nip}` : 'Wali Kelas belum ditetapkan'}
                          </span>
                        </div>

                        <button
                          onClick={() => handleOpenAssignWaliKelas(c)}
                          className="mt-3 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline text-left cursor-pointer"
                        >
                          {waliTeacher ? 'Ganti Wali Kelas' : '+ Tetapkan Wali Kelas'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB: PAKET UJIAN (WADAH) */}
          {!isLoading && activeTab === 'PACKAGES' && (
            <ExamPackagesSection
              dbService={dbService}
              classes={classes}
              subjects={subjects}
              academicYears={academicYears}
              currentUser={currentUser}
              onNavigate={onNavigate}
              onShowToast={(msg) => triggerToast(msg, 'success')}
            />
          )}

          {/* TAB 2: USERS & WALI KELAS */}
          {!isLoading && activeTab === 'USERS' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Pengguna, Staf Pengajar, & Wali Kelas
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Kelola akun pengajar, penetapan Wali Kelas, serta mata pelajaran yang diampu.
                  </p>
                </div>

                <button
                  onClick={handleOpenCreateTeacher}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm cursor-pointer transition-colors shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Tambah Staf / Guru Baru</span>
                </button>
              </div>

              {/* Filters & Search Bar */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Cari NIP, nama, atau email..."
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl text-xs font-semibold w-full sm:w-auto">
                  {(['ALL', 'GURU', 'WALI_KELAS', 'ADMIN'] as const).map(role => (
                    <button
                      key={role}
                      onClick={() => {
                        setRoleFilter(role);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-xs ${
                        roleFilter === role
                          ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      {role === 'ALL' ? 'Semua' : role === 'WALI_KELAS' ? 'Wali Kelas' : role === 'GURU' ? 'Guru Pengampu' : 'Administrator'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Users Table */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">NIP</th>
                        <th className="px-4 py-3">Nama Lengkap & Kontak</th>
                        <th className="px-4 py-3 text-center">Peran Akun</th>
                        <th className="px-4 py-3">Wali Kelas</th>
                        <th className="px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {paginatedTeachers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-400 italic">
                            Tidak ada data staf/guru yang sesuai kriteria pencarian.
                          </td>
                        </tr>
                      ) : (
                        paginatedTeachers.map(t => {
                          const users = dbService.getState().users;
                          const userObj = users.find(u => u.id === t.userId || (t.email && u.email.toLowerCase() === t.email.toLowerCase()));
                          const role = userObj?.role || (t.isWaliKelas ? 'WALI_KELAS' : 'GURU');
                          const homeRoomClass = classes.find(c => c.id === t.homeRoomClassId || c.homeRoomTeacherId === t.id);

                          return (
                            <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                              <td className="px-4 py-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                                {t.nip}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-bold text-slate-900 dark:text-slate-100">{t.name}</div>
                                <div className="text-[10px]">
                                  {role === 'ADMIN' ? (
                                    <span className="text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1">
                                      <ShieldCheck className="w-3 h-3 shrink-0" />
                                      Administrator Sistem {t.email ? `• ${t.email}` : ''}
                                    </span>
                                  ) : t.subjectPermissions?.length ? (
                                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                                      Mapel: {t.subjectPermissions.map(id => subjects.find(s => s.id === id)?.name || id).join(', ')}
                                    </span>
                                  ) : role === 'WALI_KELAS' || t.isWaliKelas ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                      Wali Kelas {homeRoomClass ? homeRoomClass.name : ''}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 dark:text-slate-500">Guru Pengampu</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                                    role === 'ADMIN'
                                      ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                                      : role === 'WALI_KELAS' || t.isWaliKelas
                                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  {role === 'WALI_KELAS' || t.isWaliKelas ? 'WALI KELAS' : role}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                                {homeRoomClass ? (
                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                    {homeRoomClass.name}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">Bukan Wali Kelas</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right space-x-2">
                                {role !== 'ADMIN' && t.id !== 't-admin-custom' && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartImpersonate(t, userObj)}
                                    className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-semibold cursor-pointer inline-flex items-center gap-1 hover:underline mr-1"
                                    title={`Masuk sebagai ${t.name} untuk membantu input data atau melihat dashboard`}
                                  >
                                    <LogIn className="w-3.5 h-3.5" />
                                    <span>Masuk Akun</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleOpenEditTeacher(t)}
                                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                                >
                                  Edit
                                </button>
                                {t.id === 't-admin-custom' || (currentUser && (t.userId === currentUser.id || (t.email && currentUser.email && t.email.toLowerCase() === currentUser.email.toLowerCase()))) ? (
                                  <span className="text-slate-400 dark:text-slate-600 text-[10px] italic px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                                    Terkunci
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setAdminDeleteConfirm({ id: t.id, title: t.name, type: 'GURU' });
                                    }}
                                    className="text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer"
                                  >
                                    Hapus
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                {totalPages > 1 && (
                  <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <span>Menampilkan Halaman {currentPage} dari {totalPages}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded disabled:opacity-50"
                      >
                        Sblm
                      </button>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded disabled:opacity-50"
                      >
                        Slanjut
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DATA SISWA */}
          {!isLoading && activeTab === 'STUDENTS' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Data Siswa
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Kelola data identitas siswa, NISN, NIS, dan rombongan belajar kelas. Gunakan Impor Excel/CSV untuk entri massal cepat.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      closeModal();
                      setModalType('BULK_IMPORT_STUDENTS');
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm cursor-pointer transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-amber-200" />
                    <span>Import Siswa via Excel</span>
                  </button>

                  <button
                    onClick={handleOpenCreateStudent}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Siswa Manual</span>
                  </button>
                </div>
              </div>

              {/* Filters Bar */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Cari NISN, NIS, atau Nama Siswa..."
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs font-semibold text-slate-500">Filter Kelas:</span>
                  <select
                    value={classFilter}
                    onChange={e => {
                      setClassFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ALL">Semua Kelas</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Student Table */}
              {selectedStudentIds.length > 0 && (
                <div className="bg-indigo-600 text-white p-3 rounded-2xl flex items-center justify-between shadow-md text-xs font-semibold mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Terpilih <strong>{selectedStudentIds.length}</strong> data siswa</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedStudentIds([])}
                      className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs cursor-pointer"
                    >
                      Batalkan Pilihan
                    </button>
                    <button
                      onClick={() => setBatchDeleteConfirm({ type: 'SISWA', count: selectedStudentIds.length })}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Terpilih ({selectedStudentIds.length})</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={paginatedStudents.length > 0 && paginatedStudents.every(s => selectedStudentIds.includes(s.id))}
                            onChange={e => {
                              if (e.target.checked) {
                                const allFilteredIds = Array.from(new Set([...selectedStudentIds, ...paginatedStudents.map(s => s.id)]));
                                setSelectedStudentIds(allFilteredIds);
                              } else {
                                const paginatedSet = new Set(paginatedStudents.map(s => s.id));
                                setSelectedStudentIds(selectedStudentIds.filter(id => !paginatedSet.has(id)));
                              }
                            }}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </th>
                        <th className="px-4 py-3">NISN / NIS</th>
                        <th className="px-4 py-3">Nama Lengkap</th>
                        <th className="px-4 py-3 text-center">JK</th>
                        <th className="px-4 py-3">Kelas Roster</th>
                        <th className="px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {paginatedStudents.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                            Tidak ada siswa yang sesuai kriteria.
                          </td>
                        </tr>
                      ) : (
                        paginatedStudents.map(s => {
                          const cls = classes.find(c => c.id === s.classId || c.name.toLowerCase() === s.classId?.toLowerCase());
                          const isChecked = selectedStudentIds.includes(s.id);
                          return (
                            <tr key={s.id} className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/50 ${isChecked ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`}>
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setSelectedStudentIds([...selectedStudentIds, s.id]);
                                    } else {
                                      setSelectedStudentIds(selectedStudentIds.filter(id => id !== s.id));
                                    }
                                  }}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                              </td>
                              <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                {s.nisn} <span className="text-slate-400 font-normal">({s.nis || 'NIS belum diset'})</span>
                              </td>
                              <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                                <div className="flex items-center gap-2">
                                  <span>{s.name}</span>
                                  {s.isAnswerKeyAccount && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0">
                                      <Key className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                      <span>Akun Kunci</span>
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center font-bold">
                                {s.gender}
                              </td>
                              <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">
                                {cls?.name || s.classId}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleOpenEditStudent(s)}
                                    className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 font-semibold cursor-pointer flex items-center gap-1"
                                    title="Edit NIS & Data Siswa"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setAdminDeleteConfirm({ id: s.id, title: s.name, type: 'SISWA' });
                                    }}
                                    className="text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <span>Menampilkan Halaman {currentPage} dari {totalPages}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded disabled:opacity-50"
                      >
                        Sblm
                      </button>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded disabled:opacity-50"
                      >
                        Slanjut
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: CLASSES & WALI KELAS PAIRING */}
          {!isLoading && activeTab === 'CLASSES' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Roster Kelas & Penetapan Wali Kelas
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Kelola rombel kelas aktif dan tetapkan guru penanggung jawab Wali Kelas untuk pendampingan akademik.
                  </p>
                </div>

                <button
                  onClick={handleOpenCreateClass}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Kelas Baru</span>
                </button>
              </div>

              {/* Class Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {classes.map(c => {
                  const waliTeacher = teachers.find(t => t.id === c.homeRoomTeacherId);
                  const studentCount = students.filter(s => s.classId === c.id).length;

                  return (
                    <div
                      key={c.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                            Kelas {c.gradeLevel}
                          </span>
                          <span className="text-[11px] font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                            {studentCount} Siswa
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">
                          {c.name}
                        </h3>

                        <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800/80 text-xs">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                            Wali Kelas Penanggung Jawab
                          </span>
                          {waliTeacher ? (
                            <div>
                              <div className="font-bold text-slate-900 dark:text-slate-100">
                                {waliTeacher.name}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                NIP: {waliTeacher.nip}
                              </div>
                            </div>
                          ) : (
                            <span className="text-rose-500 font-semibold italic block">
                              Belum Ditetapkan
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <button
                          onClick={() => handleOpenAssignWaliKelas(c)}
                          className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                        >
                          {waliTeacher ? 'Ganti Wali Kelas' : '+ Tetapkan Wali Kelas'}
                        </button>

                        <button
                          onClick={() => {
                            setAdminDeleteConfirm({ id: c.id, title: c.name, type: 'KELAS' });
                          }}
                          className="text-rose-600 dark:text-rose-400 hover:underline text-xs font-semibold cursor-pointer"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 5: SUBJECTS */}
          {!isLoading && activeTab === 'SUBJECTS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Mata Pelajaran & Kurikulum
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Daftar mata pelajaran aktif (Kategori Wajib, Peminatan, & Vokasi).
                  </p>
                </div>

                <button
                  onClick={handleOpenCreateSubject}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Mapel Baru</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {subjects.map(s => (
                  <div
                    key={s.id}
                    className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 block mb-1">
                        KODE: {s.code} · {s.category}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {s.name}
                      </h3>
                      <div className="mt-2.5 flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500 font-medium">KKM Target:</span>
                        <div className="flex items-center gap-1.5 font-mono font-bold text-amber-600 dark:text-amber-400">
                          <span>{(s.passingGrade ?? 75.0).toFixed(1)} Poin</span>
                          <button
                            type="button"
                            onClick={() => {
                              const input = prompt(`Masukkan nilai KKM baru untuk ${s.name} (50.0 - 100.0 Poin):`, String(s.passingGrade ?? 75.0));
                              if (input !== null) {
                                const val = Number(input);
                                if (!isNaN(val) && val >= 50 && val <= 100) {
                                  dbService.updateSubjectKKM(s.id, val, currentUser);
                                  refreshData();
                                  triggerToast(`KKM '${s.name}' berhasil diperbarui menjadi ${val.toFixed(1)} Poin.`);
                                } else {
                                  triggerToast('Nilai KKM harus di rentang 50.0 - 100.0 Poin.', 'error');
                                }
                              }
                            }}
                            className="px-2 py-0.5 text-[10px] bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/80 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-300 rounded-md font-semibold transition-colors cursor-pointer"
                          >
                            Ubah
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                      <button
                        onClick={() => {
                          setAdminDeleteConfirm({ id: s.id, title: s.name, type: 'MAPEL' });
                        }}
                        className="text-rose-600 dark:text-rose-400 hover:underline text-xs font-semibold cursor-pointer"
                      >
                        Hapus Mapel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: ACADEMIC YEARS */}
          {!isLoading && activeTab === 'ACADEMIC_YEARS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Tahun Akademik & Semester Active
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Pengaturan periode akademik aktif sekolah.
                  </p>
                </div>

                <button
                  onClick={handleOpenCreateAcademicYear}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Periode Baru</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {academicYears.map(ay => (
                  <div
                    key={ay.id}
                    className={`bg-white dark:bg-slate-900 p-5 rounded-2xl border ${
                      ay.isActive ? 'border-emerald-500 dark:border-emerald-600 ring-1 ring-emerald-500/30' : 'border-slate-200 dark:border-slate-800'
                    } shadow-xs flex items-center justify-between`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {ay.yearLabel}
                        </span>
                        {ay.isActive && (
                          <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded">
                            AKTIF
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        Semester: {ay.semester === 'ODD' ? 'Ganjil' : 'Genap'}
                      </span>
                    </div>

                    {!ay.isActive && (
                      <button
                        onClick={() => {
                          dbService.toggleAcademicYear(ay.id, currentUser);
                          triggerToast(`Tahun Akademik ${ay.yearLabel} diaktifkan.`);
                          refreshData();
                        }}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Set Aktif
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: AUDIT LOGS */}
          {!isLoading && activeTab === 'AUDIT_LOGS' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Audit Log & Keamanan Sistem
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Rekam jejak aktivitas pengguna, impor massal, autentikasi, dan mutasi data master.
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Waktu</th>
                        <th className="px-4 py-3">Pengguna</th>
                        <th className="px-4 py-3">Aksi</th>
                        <th className="px-4 py-3">Rincian Peristiwa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {auditLogs.slice(0, 15).map(log => (
                        <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3 font-mono text-[10px] text-slate-500">
                            {new Date(log.timestamp).toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                            {log.userName} <span className="text-[10px] text-indigo-600 font-mono">({log.role})</span>
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {log.action}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 leading-relaxed">
                            {log.details}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: SETTINGS */}
          {!isLoading && activeTab === 'SETTINGS' && (
            <div className="space-y-6 max-w-3xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Pengaturan Sistem &amp; Database
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Konfigurasi informasi institusi sekolah dan status sinkronisasi cloud.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {realtimeConnected ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 rounded-xl">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse inline-block" />
                      Cloud Realtime Aktif
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
                      Menghubungkan Cloud...
                    </span>
                  )}
                </div>
              </div>

              {/* Form Profil Sekolah & Header Dokumen PDF */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
                <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <School className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Informasi Umum Sekolah &amp; Header Dokumen PDF
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Data ini otomatis digunakan pada Kop Surat, Header, dan Kolom Tanda Tangan seluruh Rapor PDF Siswa.
                    </p>
                  </div>
                </div>
                {/* Komponen Upload Logo Sekolah */}
                <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-24 h-24 rounded-2xl bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs group relative">
                    {schoolLogoUrl ? (
                      <img src={schoolLogoUrl} alt="Logo Sekolah" className="w-full h-full object-contain p-1.5" />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                        <School className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                        <span className="text-[9px] mt-1 font-medium">Belum Ada Logo</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 text-center sm:text-left flex-1 min-w-0">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center justify-center sm:justify-start gap-1.5">
                        <span>Logo Resmi Sekolah / Lambang Lembaga</span>
                        {schoolLogoUrl && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 font-mono font-bold px-1.5 py-0.5 rounded">
                            Aktif
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        Logo ini otomatis ditampilkan pada <strong>Navbar Utama</strong>, <strong>Halaman Login Portal</strong>, <strong>Rapor Siswa</strong>, dan <strong>Kop Surat Dokumen PDF</strong> resmi.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                      <input
                        ref={logoFileInputRef}
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp"
                        onChange={handleLogoFileChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => logoFileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{schoolLogoUrl ? 'Ganti Logo' : 'Unggah Logo'}</span>
                      </button>

                      {schoolLogoUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setSchoolLogoUrl('');
                            triggerToast('Logo sekolah telah dihapus (kembali ke ikon default).');
                          }}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 dark:text-rose-300 font-bold text-xs rounded-xl border border-rose-200 dark:border-rose-900 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus Logo</span>
                        </button>
                      )}

                      <span className="text-[10px] text-slate-400 font-mono">
                        Disarankan PNG transparan, rasio 1:1, maks 2 MB.
                      </span>
                    </div>
                  </div>
                </div>


                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Nama Resmi Sekolah / Institusi
                    </label>
                    <input
                      type="text"
                      value={schoolName}
                      onChange={e => setSchoolName(e.target.value)}
                      placeholder="Contoh: SMA NEGERI 1 UTAMA"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Sub-Header / Keterangan Lembaga
                    </label>
                    <input
                      type="text"
                      value={schoolSubHeader}
                      onChange={e => setSchoolSubHeader(e.target.value)}
                      placeholder="Contoh: SISTEM ASESMEN & ANALISIS TRY OUT TERPADU"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Alamat, Akreditasi, dan NPSN
                    </label>
                    <input
                      type="text"
                      value={schoolAddress}
                      onChange={e => setSchoolAddress(e.target.value)}
                      placeholder="Contoh: Jl. Pendidikan No. 45, Jakarta · Akreditasi A · NPSN: 20103450"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Nama Kepala Sekolah (Beserta Gelar)
                    </label>
                    <input
                      type="text"
                      value={schoolPrincipalName}
                      onChange={e => setSchoolPrincipalName(e.target.value)}
                      placeholder="Contoh: Drs. Supriyadi, M.Pd."
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      NIP Kepala Sekolah
                    </label>
                    <input
                      type="text"
                      value={schoolPrincipalNip}
                      onChange={e => setSchoolPrincipalNip(e.target.value)}
                      placeholder="Contoh: 196803121994031002"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Tahun Ajaran / Periode Semester
                    </label>
                    <input
                      type="text"
                      value={schoolAcademicYear}
                      onChange={e => setSchoolAcademicYear(e.target.value)}
                      placeholder="Contoh: 2025/2026 (Semester Genap)"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        dbService.updateSchoolProfile({
                          name: schoolName,
                          subHeader: schoolSubHeader,
                          address: schoolAddress,
                          principalName: schoolPrincipalName,
                          principalNip: schoolPrincipalNip,
                          academicYear: schoolAcademicYear,
                          logoUrl: schoolLogoUrl || undefined,
                        }, currentUser);
                        triggerToast('Profil sekolah & informasi header PDF berhasil disimpan.');
                      } catch (err: any) {
                        triggerToast(err.message || 'Gagal menyimpan profil sekolah.', 'error');
                      }
                    }}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
                  >
                    Simpan Perubahan Informasi Sekolah
                  </button>
                </div>
              </div>

              {/* Integrasi Cloud Database & Sinkronisasi Cadangan */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <Cloud className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Sinkronisasi Cloud Terpusat (Supabase)
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Data ujian, master data, dan informasi sekolah otomatis realtime disinkronkan antar-perangkat di latar belakang.
                      </p>
                    </div>
                  </div>

                  <button
                    disabled={cloudSyncing}
                    onClick={async () => {
                      setCloudSyncing(true);
                      setCloudSyncResult(null);
                      try {
                        const result = await dbService.exportToSupabase();
                        setCloudSyncResult({ ok: result.ok, message: result.message });
                      } catch (err: any) {
                        setCloudSyncResult({ ok: false, message: err.message || 'Sinkronisasi gagal.' });
                      } finally {
                        setCloudSyncing(false);
                      }
                    }}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {cloudSyncing ? (
                      <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Menyinkronkan...</>
                    ) : (
                      <><Upload className="w-3.5 h-3.5" />Unggah Salinan Manual</>
                    )}
                  </button>
                </div>

                {cloudSyncResult && (
                  <div className={`flex items-center gap-2 text-xs font-medium px-3.5 py-2.5 rounded-xl border ${cloudSyncResult.ok ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'}`}>
                    {cloudSyncResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />}
                    <span>{cloudSyncResult.message}</span>
                  </div>
                )}
              </div>

              {/* ========================================================= */}
              {/* KARTU PENGATURAN: LIVE MONITORING & REKAP NILAI PUBLIK (/rekap) */}
              {/* ========================================================= */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-xs">
                      <Radio className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          Portal Live Rekap &amp; Monitoring Ujian Publik
                        </h3>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                          /rekap
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Memungkinkan pengawas ruangan, guru, dan siswa mengecek kelengkapan ujian secara real-time dari halaman login tanpa perlu autentikasi staf.
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    {monitoringConfig.isEnabled ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-full text-xs font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Portal Publik Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full text-xs font-medium">
                        Portal Nonaktif
                      </span>
                    )}
                  </div>
                </div>

                {/* Saklar 1: Toggle Aktifkan Portal */}
                <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Akses Halaman Publik Tanpa Login
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Bila diaktifkan, tombol pintas <strong>"Pantau Live Ujian"</strong> akan muncul di halaman Login portal siswa.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={monitoringConfig.isEnabled}
                      onChange={e => {
                        const updated = dbService.updateLiveMonitoringConfig({ isEnabled: e.target.checked }, currentUser);
                        setMonitoringConfig(updated);
                        triggerToast(e.target.checked ? 'Portal Live Rekap (/rekap) AKTIF!' : 'Portal Live Rekap dinonaktifkan.');
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {/* Target Asesmen yang Dipantau */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Pilih Target Asesmen / Sesi yang Dipantau Hari Ini:
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Mode 1: Paket SAT / SAS */}
                    <div
                      onClick={() => {
                        const defaultPkg = examPackages[0]?.id || '';
                        const updated = dbService.updateLiveMonitoringConfig({
                          targetType: 'EXAM_PACKAGE',
                          targetId: defaultPkg
                        }, currentUser);
                        setMonitoringConfig(updated);
                      }}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${monitoringConfig.targetType === 'EXAM_PACKAGE' ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/20' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300'}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <FolderKanban className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          Paket Ujian (SAT / SAS)
                        </span>
                        {monitoringConfig.targetType === 'EXAM_PACKAGE' && (
                          <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2.5">
                        Memantau wadah paket semesteran terpadu yang membawahi banyak mata pelajaran sekaligus.
                      </p>

                      {monitoringConfig.targetType === 'EXAM_PACKAGE' && (
                        <div onClick={e => e.stopPropagation()}>
                          <select
                            value={monitoringConfig.targetId}
                            onChange={e => {
                              const updated = dbService.updateLiveMonitoringConfig({ targetId: e.target.value }, currentUser);
                              setMonitoringConfig(updated);
                              triggerToast('Target paket ujian diperbarui.');
                            }}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100"
                          >
                            {examPackages.length === 0 ? (
                              <option value="">(Belum ada Paket Ujian dibuat)</option>
                            ) : (
                              examPackages.map(pkg => (
                                <option key={pkg.id} value={pkg.id}>
                                  {pkg.title} ({pkg.assessmentType}) — {pkg.subjects?.length || 0} Mapel
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Mode 2: Siklus Try Out (TO 1, TO 2, TO 3) */}
                    <div
                      onClick={() => {
                        const updated = dbService.updateLiveMonitoringConfig({
                          targetType: 'TRYOUT_STAGE',
                          targetId: 'TO 1'
                        }, currentUser);
                        setMonitoringConfig(updated);
                      }}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${monitoringConfig.targetType === 'TRYOUT_STAGE' ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/20' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300'}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          Siklus Try Out (TO)
                        </span>
                        {monitoringConfig.targetType === 'TRYOUT_STAGE' && (
                          <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2.5">
                        Memantau pelaksanaan Try Out berkala per siklus (TO 1, TO 2, TO 3, dst.) lintas guru mapel.
                      </p>

                      {monitoringConfig.targetType === 'TRYOUT_STAGE' && (
                        <div onClick={e => e.stopPropagation()}>
                          <select
                            value={monitoringConfig.targetId}
                            onChange={e => {
                              const updated = dbService.updateLiveMonitoringConfig({ targetId: e.target.value }, currentUser);
                              setMonitoringConfig(updated);
                              triggerToast(`Target siklus Try Out diatur ke ${e.target.value}`);
                            }}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100"
                          >
                            {getDynamicTryoutStageOptions(dbService.getTryouts(), examPackages).map(opt => (
                              <option key={opt} value={opt}>
                                Siklus {opt} (Semua Mapel)
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Saklar 2: Sensor Nilai Siswa */}
                <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <EyeOff className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Mode Sensor Nilai Siswa (Sembunyikan Angka Nilai)
                      </h4>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {monitoringConfig.hideScores ? (
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span><strong>AKTIF:</strong> Hanya menampilkan status pengerjaan (Sudah Selesai / Belum Mengerjakan). Angka nilai dirahasiakan.</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span><strong>TERBUKA:</strong> Angka nilai siswa (0–100) dapat dilihat oleh siapa saja di halaman publik.</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={monitoringConfig.hideScores}
                      onChange={e => {
                        const updated = dbService.updateLiveMonitoringConfig({ hideScores: e.target.checked }, currentUser);
                        setMonitoringConfig(updated);
                        triggerToast(e.target.checked ? 'Mode sensor nilai DIAKTIFKAN (Hanya status)' : 'Mode sensor nilai DINONAKTIFKAN (Nilai terbuka)');
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-amber-600"></div>
                  </label>
                </div>

                {/* Direct Link Preview */}
                <div className="flex items-center justify-between pt-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    Tautan publik:{' '}
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                      /rekap
                    </span>
                  </span>
                  <a
                    href="/rekap"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Buka Halaman Rekap</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <div className="bg-rose-50 dark:bg-rose-950/40 p-6 rounded-2xl border border-rose-200 dark:border-rose-900 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                      Reset Database ke Pengaturan Awal Pabrik
                    </h3>
                    <p className="text-xs text-rose-700 dark:text-rose-300">
                      Mengembalikan seluruh data guru, siswa, kelas, mapel, dan nilai ke status default sekolah.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setAdminDeleteConfirm({
                      id: 'RESET',
                      title: 'Seluruh Database Sekolah (Pengaturan Awal Pabrik)',
                      type: 'RESET_DB'
                    });
                  }}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
                >
                  Reset Seluruh Database Sekolah
                </button>
              </div>

              {/* Footer Copyright Mini di dalam Panel Konten */}
              <div className="pt-6 pb-2 border-t border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 dark:text-slate-500 gap-2">
                <span>{schoolName || 'Sistem Asesmen Sekolah'} · Panel Administrasi</span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Cloud Database Aktif
                </span>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* =================================----------------------------- */}
      {/* MODAL 1: CREATE / EDIT TEACHER & WALI KELAS */}
      {/* =================================----------------------------- */}
      {(modalType === 'TEACHER_CREATE' || modalType === 'TEACHER_EDIT') && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full max-h-[90vh] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 shrink-0 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {modalType === 'TEACHER_EDIT' ? 'Edit Data Staf / Guru' : 'Tambah Staf / Guru Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Lengkapi data akun dan penugasan mengajar guru
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveTeacher} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-xs">
                {/* ROW 1: NIP & Nama Lengkap */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      NIP Staf / NIK
                    </label>
                    <input
                      type="text"
                      value={formNip}
                      onChange={e => setFormNip(e.target.value)}
                      placeholder="19821104..."
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nama Lengkap & Gelar
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      placeholder="Drs. Supriyadi, M.Pd"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-medium"
                      required
                    />
                  </div>
                </div>

                {/* ROW 2: Peran Utama Akun & Kata Sandi */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Peran Utama Akun
                    </label>
                    <select
                      value={formRole}
                      onChange={e => {
                        const r = e.target.value as Role;
                        setFormRole(r);
                        if (r === 'WALI_KELAS') {
                          setFormIsWaliKelas(true);
                          if (!formHomeRoomClassId) setFormHomeRoomClassId(classes[0]?.id || '');
                        } else if (r === 'GURU') {
                          setFormIsWaliKelas(false);
                        } else if (r === 'ADMIN') {
                          setFormIsWaliKelas(false);
                          setFormHomeRoomClassId('');
                          setFormSubjectPermissions([]);
                          setFormClassPermissions([]);
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-semibold"
                    >
                      <option value="GURU">GURU PENGAMPU</option>
                      <option value="WALI_KELAS">WALI KELAS</option>
                      <option value="ADMIN">ADMINISTRATOR</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Kata Sandi Login
                    </label>
                    <input
                      type="text"
                      value={formPassword}
                      onChange={e => setFormPassword(e.target.value)}
                      placeholder="password123"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-mono"
                      required
                    />
                  </div>
                </div>

                {formRole === 'ADMIN' ? (
                  <div className="p-4 bg-indigo-50/80 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200 dark:border-indigo-800 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-indigo-950 dark:text-indigo-100 text-xs block">
                        Hak Akses Administrator Penuh
                      </span>
                      <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-1 leading-relaxed">
                        Akun Administrator memiliki wewenang penuh untuk mengelola seluruh master data, pengaturan sistem, paket ujian, dan audit log sekolah. Akun ini tidak memerlukan penugasan khusus mata pelajaran pengajaran atau rombel wali kelas.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* SECTION 1: Status Wali Kelas */}
                <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-indigo-900 dark:text-indigo-200 block">
                        Status Wali Kelas
                      </span>
                      <span className="text-[10px] text-indigo-700 dark:text-indigo-300">
                        Aktifkan jika guru bertindak sebagai Wali Kelas Rombel.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formIsWaliKelas}
                      onChange={e => {
                        const isChecked = e.target.checked;
                        setFormIsWaliKelas(isChecked);
                        if (isChecked) {
                          setFormRole('WALI_KELAS');
                          if (!formHomeRoomClassId) setFormHomeRoomClassId(classes[0]?.id || '');
                        } else if (formRole === 'WALI_KELAS') {
                          setFormRole('GURU');
                        }
                      }}
                      className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                    />
                  </div>

                  {formIsWaliKelas && (
                    <div className="pt-2 border-t border-indigo-200/60 dark:border-indigo-900/60">
                      <label className="block font-bold text-indigo-950 dark:text-indigo-100 mb-1">
                        Pilih Rombel Wali Kelas
                      </label>
                      <select
                        value={formHomeRoomClassId}
                        onChange={e => setFormHomeRoomClassId(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-800 rounded-xl font-bold text-indigo-900 dark:text-indigo-200"
                      >
                        <option value="">-- Tanpa Rombel Wali Kelas --</option>
                        {classes.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.gradeLevel})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* SECTION 2: Mata Pelajaran yang Diampu (Interactive Multi-Select Dropdown) */}
                <div className="rounded-2xl border border-blue-200 dark:border-blue-900/80 bg-blue-50/50 dark:bg-blue-950/30 overflow-hidden transition-all">
                  {/* Dropdown Trigger */}
                  <div
                    onClick={() => setIsSubjectDropdownOpen(prev => !prev)}
                    className="p-3.5 flex items-center justify-between cursor-pointer select-none hover:bg-blue-100/50 dark:hover:bg-blue-900/40 transition-colors"
                  >
                    <div className="space-y-1 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-950 dark:text-blue-100 text-xs">
                          Mata Pelajaran yang Diampu
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                          {formSubjectPermissions.length} / {subjects.length} Mapel
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-md">
                        {formSubjectPermissions.length === 0 ? (
                          <span className="text-slate-400 italic">Belum ada mata pelajaran dipilih (klik untuk memilih)</span>
                        ) : (
                          <span className="font-medium text-blue-700 dark:text-blue-300">
                            {formSubjectPermissions
                              .map(id => subjects.find(s => s.id === id)?.name || id)
                              .join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 shrink-0">
                      <span className="text-[10px] font-semibold">{isSubjectDropdownOpen ? 'Tutup' : 'Pilih'}</span>
                      {isSubjectDropdownOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>

                  {/* Expandable Dropdown Content */}
                  {isSubjectDropdownOpen && (
                    <div className="p-3.5 border-t border-blue-200/80 dark:border-blue-900/80 bg-white/70 dark:bg-slate-900/70 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">Centang mata pelajaran yang diajar guru:</span>
                        {subjects.length > 0 && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setFormSubjectPermissions(subjects.map(s => s.id))}
                              className="text-[10px] text-blue-600 font-bold hover:underline cursor-pointer"
                            >
                              Pilih Semua
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => setFormSubjectPermissions([])}
                              className="text-[10px] text-slate-500 hover:text-slate-700 font-bold hover:underline cursor-pointer"
                            >
                              Batal Semua
                            </button>
                          </div>
                        )}
                      </div>

                      {subjects.length === 0 ? (
                        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300">
                          Belum ada mata pelajaran terdaftar di sistem.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                          {subjects.map(s => {
                            const isChecked = formSubjectPermissions.includes(s.id);
                            return (
                              <label
                                key={s.id}
                                className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                                  isChecked
                                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-950 dark:text-blue-100 font-semibold'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setFormSubjectPermissions([...formSubjectPermissions, s.id]);
                                    } else {
                                      setFormSubjectPermissions(formSubjectPermissions.filter(id => id !== s.id));
                                    }
                                  }}
                                  className="w-4 h-4 text-blue-600 rounded cursor-pointer shrink-0"
                                />
                                <div className="truncate flex-1">
                                  <span className="block truncate">{s.name}</span>
                                  <span className="text-[10px] text-slate-400 font-mono font-normal">
                                    {s.code} • {s.category}
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* SECTION 3: Pilihan Kelas yang Diajar (Interactive Multi-Select Dropdown) */}
                <div className="rounded-2xl border border-teal-200 dark:border-teal-900/80 bg-teal-50/50 dark:bg-teal-950/30 overflow-hidden transition-all">
                  {/* Dropdown Trigger */}
                  <div
                    onClick={() => setIsClassDropdownOpen(prev => !prev)}
                    className="p-3.5 flex items-center justify-between cursor-pointer select-none hover:bg-teal-100/50 dark:hover:bg-teal-900/40 transition-colors"
                  >
                    <div className="space-y-1 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-teal-950 dark:text-teal-100 text-xs">
                          Pilihan Kelas yang Diajar
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300">
                          {formClassPermissions.length === classes.length && classes.length > 0
                            ? 'Semua Kelas'
                            : `${formClassPermissions.length} / ${classes.length} Kelas`}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-md">
                        {formClassPermissions.length === 0 ? (
                          <span className="text-slate-400 italic">Belum ada kelas dipilih (klik untuk memilih)</span>
                        ) : formClassPermissions.length === classes.length ? (
                          <span className="font-medium text-teal-700 dark:text-teal-300">Semua kelas ({classes.length} rombel) dapat diakses</span>
                        ) : (
                          <span className="font-medium text-teal-700 dark:text-teal-300">
                            {formClassPermissions
                              .map(id => classes.find(c => c.id === id)?.name || id)
                              .join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-teal-700 dark:text-teal-300 shrink-0">
                      <span className="text-[10px] font-semibold">{isClassDropdownOpen ? 'Tutup' : 'Pilih'}</span>
                      {isClassDropdownOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>

                  {/* Expandable Dropdown Content */}
                  {isClassDropdownOpen && (
                    <div className="p-3.5 border-t border-teal-200/80 dark:border-teal-900/80 bg-white/70 dark:bg-slate-900/70 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">Pilih kelas yang diampu oleh guru:</span>
                        {classes.length > 0 && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setFormClassPermissions(classes.map(c => c.id))}
                              className="text-[10px] text-teal-600 font-bold hover:underline cursor-pointer"
                            >
                              Pilih Semua
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => setFormClassPermissions([])}
                              className="text-[10px] text-slate-500 hover:text-slate-700 font-bold hover:underline cursor-pointer"
                            >
                              Batal Semua
                            </button>
                          </div>
                        )}
                      </div>

                      {classes.length === 0 ? (
                        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300">
                          Belum ada rombel kelas terdaftar di sistem.
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                          {classes.map(c => {
                            const isChecked = formClassPermissions.includes(c.id);
                            return (
                              <label
                                key={c.id}
                                className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                                  isChecked
                                    ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-300 dark:border-teal-700 text-teal-900 dark:text-teal-100 font-semibold'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setFormClassPermissions([...formClassPermissions, c.id]);
                                    } else {
                                      setFormClassPermissions(formClassPermissions.filter(id => id !== c.id));
                                    }
                                  }}
                                  className="w-4 h-4 text-teal-600 rounded cursor-pointer shrink-0"
                                />
                                <span className="truncate">{c.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

              {/* Sticky Bottom Actions Footer */}
              <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5 shrink-0 bg-slate-50 dark:bg-slate-950/60">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer transition-colors shadow-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold cursor-pointer transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Simpan Staf</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================----------------------------- */}
      {/* MODAL 2: BULK EXCEL / CSV STUDENT UPLOADER */}
      {/* =================================----------------------------- */}
      {modalType === 'BULK_IMPORT_STUDENTS' && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Impor Data Siswa Massal via Excel (.xlsx)
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Unduh format Excel 5 kolom, lengkapi data, lalu unggah untuk impor langsung.
                  </span>
                </div>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Download Template */}
            <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-emerald-900 dark:text-emerald-200 block mb-0.5">
                  1. Unduh Format Template Excel (.xlsx)
                </span>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                  Hanya 5 kolom ringkas: <strong>NISN</strong>, <strong>Nama Lengkap</strong>, <strong>Jenis Kelamin (L/P)</strong>, <strong>Tanggal Lahir (YYYY-MM-DD)</strong>, dan <strong>Kelas</strong>. NIS lokal dapat dimasukkan oleh admin nanti.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadStudentTemplate}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xs shrink-0 cursor-pointer flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Template Excel (.xlsx)</span>
              </button>
            </div>

            {/* Step 2: Upload or Paste CSV */}
            <div className="space-y-2 text-xs">
              <label className="block font-bold text-slate-800 dark:text-slate-200">
                2. Unggah File Excel (.xlsx / .xls) atau CSV
              </label>

              <div className="flex items-center gap-3">
                <label className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-950 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-2xl cursor-pointer text-center transition-colors">
                  <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    {bulkImportFileName ? `File Terpilih: ${bulkImportFileName}` : 'Klik untuk Pilih File Excel (.xlsx / .xls) atau CSV'}
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt,.tsv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block mb-1">
                  Atau Tempel Raw Teks Excel/CSV Langsung (5 Kolom):
                </span>
                <textarea
                  rows={3}
                  value={bulkCsvText}
                  onChange={e => parseAndValidateStudentCsv(e.target.value)}
                  placeholder={`NISN,Nama Lengkap,Jenis Kelamin,Tanggal Lahir,Kelas\n0061234599,Budi Raharjo,L,2008-03-12,${classes[0]?.name || 'XII IPA 1'}`}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-[11px]"
                ></textarea>
              </div>
            </div>

            {/* Step 3: Realtime Validation Preview Table */}
            {bulkParsedPreview.length > 0 && (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    3. Pratinjau & Validasi Data ({bulkParsedPreview.filter(r => r.isValid).length} Valid dari {bulkParsedPreview.length} Baris)
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 dark:bg-slate-900 font-bold text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="p-2">#</th>
                        <th className="p-2">NISN</th>
                        <th className="p-2">Nama</th>
                        <th className="p-2 text-center">JK</th>
                        <th className="p-2">Tgl Lahir</th>
                        <th className="p-2">Kelas</th>
                        <th className="p-2 text-center">Status Validasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                      {bulkParsedPreview.map(r => (
                        <tr key={r.rowNumber} className={r.isValid ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : 'bg-rose-50/40 dark:bg-rose-950/30'}>
                          <td className="p-2 font-mono text-slate-400">{r.rowNumber}</td>
                          <td className="p-2 font-mono font-bold">{r.nisn || '-'}</td>
                          <td className="p-2 font-bold">{r.name || '-'}</td>
                          <td className="p-2 text-center">{r.gender}</td>
                          <td className="p-2 font-mono">{r.birthDate}</td>
                          <td className="p-2">{r.className}</td>
                          <td className="p-2 text-center">
                            {r.isValid ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                                SIAP IMPORT
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-bold text-[10px]">
                                {r.errorReason}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={bulkParsedPreview.filter(r => r.isValid).length === 0}
                onClick={handleExecuteBulkImport}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Proses Import {bulkParsedPreview.filter(r => r.isValid).length} Siswa Valid</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================----------------------------- */}
      {/* MODAL 3: ASSIGN WALI KELAS */}
      {/* =================================----------------------------- */}
      {modalType === 'ASSIGN_WALI_KELAS' && assigningClass && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Tetapkan Wali Kelas Rombel
                </h3>
                <span className="text-xs text-indigo-600 font-bold font-mono">
                  {assigningClass.name}
                </span>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAssignWaliKelas} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Pilih Guru Penanggung Jawab Wali Kelas:
                </label>
                <select
                  value={selectedWaliTeacherId}
                  onChange={e => setSelectedWaliTeacherId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-slate-100"
                  required
                >
                  <option value="">-- Pilih Staf Guru --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} (NIP: {t.nip})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-200">
                Guru yang dipilih akan ditugaskan sebagai Wali Kelas untuk memantau nilai dan perkembangan siswa kelas {assigningClass.name}.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold cursor-pointer"
                >
                  Simpan Wali Kelas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================----------------------------- */}
      {/* MODAL 4: CREATE / EDIT SINGLE STUDENT */}
      {/* =================================----------------------------- */}
      {(modalType === 'STUDENT_CREATE' || modalType === 'STUDENT_EDIT') && (
        <div
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col"
            style={{ maxHeight: 'calc(100vh - 2rem)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {modalType === 'STUDENT_EDIT' ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Kolom bertanda <span className="text-rose-500 font-bold">*</span> wajib diisi</p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <form onSubmit={handleSaveStudent} className="overflow-y-auto flex-1 min-h-0 px-6 py-5 space-y-4 text-xs">

              {/* NISN & NIS */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    NISN <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formNisn}
                    onChange={e => setFormNisn(e.target.value)}
                    placeholder="0061234561"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    NIS Lokal <span className="font-normal text-slate-400">(opsional)</span>
                  </label>
                  <input
                    type="text"
                    value={formNis}
                    onChange={e => setFormNis(e.target.value)}
                    placeholder="Contoh: 1090"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Nama */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Lengkap <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Ahmad Fauzi"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  required
                />
              </div>

              {/* JK & Tgl Lahir */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Jenis Kelamin</label>
                  <select
                    value={formGender}
                    onChange={e => setFormGender(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  >
                    <option value="L">Laki-Laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Lahir <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formBirthDate}
                    onChange={e => setFormBirthDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    required
                  />
                </div>
              </div>

              {/* Akun Kunci Jawaban (Diletakkan sebelum kelas agar interaksi dinamis) */}
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/70 rounded-2xl space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsAnswerKeyAccount}
                    onChange={e => {
                      const checked = e.target.checked;
                      setFormIsAnswerKeyAccount(checked);
                      if (checked && (!formName || formName === 'Ahmad Fauzi')) {
                        setFormName('Akun Kunci Jawaban');
                      }
                    }}
                    className="w-4 h-4 mt-0.5 text-amber-600 rounded focus:ring-amber-500 cursor-pointer shrink-0"
                  />
                  <div>
                    <span className="font-bold text-amber-900 dark:text-amber-200 text-xs flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      Tetapkan sebagai Akun Kunci Jawaban Resmi
                    </span>
                    <p className="text-[10px] text-amber-800 dark:text-amber-300/80 leading-relaxed mt-1">
                      Centang ini jika akun dibuat untuk Guru mengisi 1 kali Google Form sebagai respon Kunci Acuan. Akun ini otomatis dikecualikan dari rapor dan statistik siswa nyata.
                    </p>
                  </div>
                </label>
              </div>

              {/* Kelas */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Kelas Roster {formIsAnswerKeyAccount ? <span className="font-normal text-amber-600 dark:text-amber-400">(Opsional untuk Akun Kunci — otomatis ke kelas 'Kunci Jawaban')</span> : <span className="text-rose-500">*</span>}
                </label>
                {classes.length === 0 ? (
                  formIsAnswerKeyAccount ? (
                    <div className="w-full px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-emerald-700 dark:text-emerald-300 text-[11px] flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span>Sistem otomatis membuat kelas penampung <strong>'Kunci Jawaban'</strong> saat disimpan.</span>
                    </div>
                  ) : (
                    <div className="w-full px-3 py-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-700 dark:text-rose-300 text-[11px] leading-relaxed flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>Belum ada kelas yang terdaftar. Tambahkan kelas terlebih dahulu di tab <strong>Kelas</strong>.</span>
                    </div>
                  )
                ) : (
                  <select
                    value={formSelectedClassId}
                    onChange={e => setFormSelectedClassId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    required={!formIsAnswerKeyAccount}
                  >
                    <option value="">{formIsAnswerKeyAccount ? '-- Otomatis Kelas Kunci Jawaban --' : '-- Pilih Kelas --'}</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-800 gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!formIsAnswerKeyAccount && (classes.length === 0 || !formSelectedClassId)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold cursor-pointer flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  <span>{modalType === 'STUDENT_EDIT' ? 'Simpan Perubahan' : (formIsAnswerKeyAccount ? 'Simpan Akun Kunci' : 'Simpan Siswa')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================----------------------------- */}
      {/* MODAL 5: CREATE CLASS */}
      {/* =================================----------------------------- */}
      {modalType === 'CLASS_CREATE' && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Tambah Rombel Kelas Baru
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Rombel Kelas</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="XII IPA 3"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-slate-100"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Tingkatan Kelas</label>
                  <select
                    value={formGradeLevel}
                    onChange={e => setFormGradeLevel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                  >
                    <optgroup label="— SD —">
                      <option value="1">Kelas 1 (SD)</option>
                      <option value="2">Kelas 2 (SD)</option>
                      <option value="3">Kelas 3 (SD)</option>
                      <option value="4">Kelas 4 (SD)</option>
                      <option value="5">Kelas 5 (SD)</option>
                      <option value="6">Kelas 6 (SD)</option>
                    </optgroup>
                    <optgroup label="— SMP —">
                      <option value="7">Kelas 7 (SMP)</option>
                      <option value="8">Kelas 8 (SMP)</option>
                      <option value="9">Kelas 9 (SMP)</option>
                    </optgroup>
                    <optgroup label="— SMA / SMK —">
                      <option value="10">Kelas 10 / X (SMA)</option>
                      <option value="11">Kelas 11 / XI (SMA)</option>
                      <option value="12">Kelas 12 / XII (SMA)</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Wali Kelas <span className="font-normal text-slate-400">(opsional)</span>
                  </label>
                  <select
                    value={formSelectedTeacherId}
                    onChange={e => setFormSelectedTeacherId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                  >
                    <option value="">-- Belum Ditentukan --</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    Bisa ditetapkan nanti via tombol Assign Wali Kelas.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold cursor-pointer"
                >
                  Simpan Kelas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================----------------------------- */}
      {/* MODAL 6: CREATE SUBJECT */}
      {/* =================================----------------------------- */}
      {modalType === 'SUBJECT_CREATE' && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Tambah Mata Pelajaran Baru
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubject} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Kode Singkat</label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={e => setFormCode(e.target.value)}
                    placeholder="KIM"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-mono uppercase text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Kategori</label>
                  <select
                    value={formSubjectCategory}
                    onChange={e => setFormSubjectCategory(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                  >
                    <option value="WAJIB">WAJIB</option>
                    <option value="PEMINATAN">PEMINATAN</option>
                    <option value="VOKASI">VOKASI</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Mata Pelajaran</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="Kimia SMA"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">KKM Target (Passing Grade)</label>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    step="0.5"
                    value={formPassingGrade}
                    onChange={e => setFormPassingGrade(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold cursor-pointer"
                >
                  Simpan Mapel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================----------------------------- */}
      {/* MODAL 7: CREATE ACADEMIC YEAR */}
      {/* =================================----------------------------- */}
      {modalType === 'ACADEMIC_YEAR_CREATE' && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Tambah Periode Akademik Baru
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAcademicYear} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Label Tahun Ajaran</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="2026/2027"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Semester</label>
                  <select
                    value={formSemester}
                    onChange={e => setFormSemester(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                  >
                    <option value="ODD">Ganjil (ODD)</option>
                    <option value="EVEN">Genap (EVEN)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold cursor-pointer"
                >
                  Simpan Periode
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BATCH DELETE CONFIRMATION MODAL */}
      {batchDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Konfirmasi Hapus Massal Data
                </h3>
                <span className="text-xs text-rose-600 dark:text-rose-400 font-bold">
                  {batchDeleteConfirm.count} Item Terpilih ({batchDeleteConfirm.type})
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
              <p className="font-bold mb-1">
                Apakah Anda yakin ingin menghapus {batchDeleteConfirm.count} data {batchDeleteConfirm.type.toLowerCase()} sekaligus?
              </p>
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                Tindakan hapus massal (*bulk delete*) ini permanen dan akan mencatat log audit pada sistem.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setBatchDeleteConfirm(null)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus {batchDeleteConfirm.count} Data</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTEXTUAL ADMIN DELETE CONFIRMATION MODAL */}
      {adminDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {adminDeleteConfirm.type === 'RESET_DB' ? 'Konfirmasi Reset Database' : 'Konfirmasi Hapus Data'}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono font-semibold">
                  Tipe Entity: {adminDeleteConfirm.type}
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
              <p className="font-bold text-slate-900 dark:text-slate-100 mb-1">
                &ldquo;{adminDeleteConfirm.title}&rdquo;
              </p>
              <p className="text-rose-600 dark:text-rose-400 font-medium">
                {adminDeleteConfirm.type === 'RESET_DB'
                  ? 'PERINGATAN: Seluruh data sekolah, nilai, materi, dan log akan dikembalikan ke status awal pabrik.'
                  : 'Tindakan ini tidak dapat dibatalkan. Data terkait item ini akan disesuaikan.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setAdminDeleteConfirm(null)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmAdminDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus Permanen</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI MASUK KE AKUN GURU/WALAS (IMPERSONASI) */}
      {impersonateConfirm && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <LogIn className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Konfirmasi Mode Bantuan Akun
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Masuk sebagai {impersonateConfirm.isWali ? 'Wali Kelas' : 'Guru Mapel'}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Nama Pengguna:</span>
                <strong className="text-slate-900 dark:text-slate-100 font-bold">{impersonateConfirm.teacher.name}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">NIP:</span>
                <span className="font-mono font-semibold">{impersonateConfirm.teacher.nip || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Dashboard Tujuan:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {impersonateConfirm.isWali ? '/wali-kelas (Wali Kelas)' : '/guru (Aplikasi Guru)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800 leading-relaxed">
                Anda dapat membantu menginput link Google Form/Sheet, memeriksa analisis nilai, atau meninjau tampilan. Tombol <strong>&quot;Kembali ke Akun Admin&quot;</strong> akan selalu tersedia di bilah atas layar.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setImpersonateConfirm(null)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmImpersonate}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Masuk Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
