/**
 * Sumatif Analytics Service — School Assessment Analytics System (SAS & SAT)
 * 
 * Khusus menangani analitik asesmen Sumatif Akhir Semester (SAS) dan Sumatif Akhir Tahun (SAT).
 * Terisolasi 100% dari progress.ts (Try Out) untuk menjaga Zero-Regression.
 * 
 * Fitur:
 * - Cross-Subject Composite & Radar Data untuk Siswa
 * - Item Psychometrics murni per nomor soal (P-value & D-value) untuk Guru tanpa tagging TP
 * - Leger Rapor Kelas & Deteksi Siswa Berisiko (At-Risk >= 3 remedial) untuk Wali Kelas
 */

import { Student, Score, Subject, Question, Answer, ClassRoom, ExamPackage, Tryout } from '../types/database';

export interface StudentSubjectScoreItem {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  score: number;
  passingGrade: number;
  isPassed: boolean;
  status: 'TUNTAS' | 'REMEDIAL';
}

export interface StudentSumatifProfile {
  studentId: string;
  studentName: string;
  nisn: string;
  className: string;
  packageId: string;
  packageTitle: string;
  packageType: 'SAS' | 'SAT';
  subjectScores: StudentSubjectScoreItem[];
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passedCount: number;
  remedialCount: number;
  isAtRisk: boolean; // remedialCount >= 3
  radarData: {
    subject: string;
    subjectName: string;
    score: number;
    kktp: number;
    fullMark: number;
  }[];
}

export interface QuestionItemStat {
  questionNumber: number;
  questionText?: string;
  totalResponses: number;
  correctCount: number;
  wrongCount: number;
  facilityValue: number; // p-value (0.00 - 1.00)
  difficultyLabel: 'Sangat Mudah' | 'Mudah' | 'Sedang' | 'Sukar' | 'Sangat Sukar';
  discriminationIndex: number; // D-value (-1.00 - 1.00)
  discriminationLabel: 'Sangat Baik' | 'Baik' | 'Cukup' | 'Buruk / Perlu Ditinjau';
  isReviewRecommended: boolean;
}

export interface TeacherSumatifAnalytics {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  packageId: string;
  packageTitle: string;
  passingGrade: number;
  studentCount: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passingCount: number;
  remedialCount: number;
  passingRatePct: number;
  questionStats: QuestionItemStat[];
  studentRankings: {
    studentId: string;
    studentName: string;
    nisn: string;
    className: string;
    score: number;
    isPassed: boolean;
    rank: number;
  }[];
}

export interface LegerStudentRow {
  studentId: string;
  studentName: string;
  nisn: string;
  scoresBySubjectId: Record<string, number>;
  scoresBySubjectCode: Record<string, number>;
  totalScore: number;
  averageScore: number;
  rank: number;
  remedialSubjectCodes: string[];
  remedialCount: number;
  isAtRisk: boolean;
}

export interface WaliKelasLegerResult {
  classId: string;
  className: string;
  packageId: string;
  packageTitle: string;
  packageType: 'SAS' | 'SAT';
  subjects: {
    id: string;
    code: string;
    name: string;
    passingGrade: number;
  }[];
  rows: LegerStudentRow[];
  totalStudents: number;
  atRiskStudentsCount: number;
  atRiskStudents: LegerStudentRow[];
  subjectAverages: Record<string, number>; // subjectId -> avg
  overallClassAverage: number;
}

export class SumatifAnalyticsService {
  /**
   * Helper ekstraksi nilai mapel dari record Score secara ketat (scoping tryout & subject)
   */
  public static extractScoreForSubject(
    scoreRecord: Score | undefined,
    subjectId: string,
    validTryoutIds?: Set<string>
  ): number | null {
    if (!scoreRecord) return null;
    if (validTryoutIds && validTryoutIds.size > 0 && !validTryoutIds.has(scoreRecord.tryoutId)) {
      return null;
    }
    if (scoreRecord.subjectScores && typeof scoreRecord.subjectScores[subjectId] === 'number') {
      return scoreRecord.subjectScores[subjectId];
    }
    // Jika tryoutId cocok dengan tryout wadah/mapel ini, ambil calculatedScore/googleFormScore
    if (validTryoutIds && validTryoutIds.has(scoreRecord.tryoutId)) {
      return scoreRecord.calculatedScore ?? scoreRecord.googleFormScore ?? 0;
    }
    return null;
  }

  /**
   * Menghitung Profil Multidisipliner Siswa untuk SAS/SAT (Radar Chart & Kartu KKTP)
   */
  public static calculateStudentProfile(
    student: Student,
    studentClass: ClassRoom | undefined,
    pkg: ExamPackage,
    allScores: Score[],
    allSubjects: Subject[],
    allTryouts: Tryout[] = []
  ): StudentSumatifProfile {
    const pkgSubjects = pkg.subjects || [];

    const subjectScores: StudentSubjectScoreItem[] = [];
    const radarData: StudentSumatifProfile['radarData'] = [];

    let totalScore = 0;
    let gradedCount = 0;

    pkgSubjects.forEach(pkgSub => {
      const subInfo = allSubjects.find(s => s.id === pkgSub.subjectId);
      const subCode = subInfo?.code || 'MAPEL';
      const subName = subInfo?.name || 'Mata Pelajaran';
      // Prioritaskan KKM master dari Admin (subInfo.passingGrade)
      const passingGrade = subInfo?.passingGrade || pkgSub.passingGrade || 75;

      const pkgCode = (pkg.code || '').toLowerCase().trim();
      const pkgId = (pkg.id || '').toLowerCase().trim();
      const matchingTryoutIds = new Set(
        allTryouts
          .filter(t => {
            const tPkgId = (t.packageId || '').toLowerCase().trim();
            const tCode = (t.code || '').toLowerCase().trim();
            const isPkgMatch = tPkgId === pkgId || (pkgCode && tCode.startsWith(pkgCode)) || t.id === pkgId;
            const isSubMatch = !t.subjectId || t.subjectId === pkgSub.subjectId || (t.id && t.id.includes(pkgSub.subjectId));
            return isPkgMatch && isSubMatch;
          })
          .map(t => t.id)
      );
      matchingTryoutIds.add(pkg.id);

      // Cari skor siswa khusus untuk tryout wadah ini
      const studentScores = allScores.filter(s =>
        s.studentId === student.id && matchingTryoutIds.has(s.tryoutId)
      );

      let rawScore: number | null = null;
      for (const rec of studentScores) {
        const val = this.extractScoreForSubject(rec, pkgSub.subjectId, matchingTryoutIds);
        if (val !== null) {
          if (rawScore === null || val > rawScore) rawScore = val;
        }
      }

      const hasGrade = rawScore !== null;
      const roundedScore = hasGrade ? Math.round(rawScore! * 10) / 10 : 0;
      const isPassed = hasGrade && roundedScore >= passingGrade;

      if (hasGrade) {
        totalScore += roundedScore;
        gradedCount += 1;
      }

      subjectScores.push({
        subjectId: pkgSub.subjectId,
        subjectCode: subCode,
        subjectName: subName,
        score: roundedScore,
        passingGrade,
        isPassed,
        status: !hasGrade ? 'REMEDIAL' : (isPassed ? 'TUNTAS' : 'REMEDIAL'),
      });

      radarData.push({
        subject: subCode,
        subjectName: subName,
        score: roundedScore,
        kktp: passingGrade,
        fullMark: 100,
      });
    });

    const averageScore = gradedCount > 0 ? Math.round((totalScore / gradedCount) * 10) / 10 : 0;
    const scoresOnly = subjectScores.filter(s => s.score > 0).map(s => s.score);
    const highestScore = scoresOnly.length > 0 ? Math.max(...scoresOnly) : 0;
    const lowestScore = scoresOnly.length > 0 ? Math.min(...scoresOnly) : 0;
    const passedCount = subjectScores.filter(s => s.isPassed).length;
    const remedialCount = subjectScores.filter(s => !s.isPassed && s.score > 0).length;
    const isAtRisk = remedialCount >= 3;

    return {
      studentId: student.id,
      studentName: student.name,
      nisn: student.nisn,
      className: studentClass?.name || 'Kelas',
      packageId: pkg.id,
      packageTitle: pkg.title,
      packageType: pkg.assessmentType === 'SAT' ? 'SAT' : 'SAS',
      subjectScores,
      averageScore,
      highestScore,
      lowestScore,
      passedCount,
      remedialCount,
      isAtRisk,
      radarData,
    };
  }

  /**
   * Menghitung Analisis Butir Soal Murni (Psikometri) dan Capaian Kelas untuk Guru
   * Scoping ketat ke wadah paket SAT/SAS, rombel target, dan deduplikasi studentId.
   */
  public static calculateTeacherAnalytics(
    subjectId: string,
    pkg: ExamPackage,
    allScores: Score[],
    allStudents: Student[],
    allClasses: ClassRoom[],
    allQuestions: Question[],
    allAnswers: Answer[],
    allSubjects: Subject[],
    allTryouts: Tryout[] = []
  ): TeacherSumatifAnalytics {
    const subInfo = allSubjects.find(s => s.id === subjectId);
    const pkgSub = pkg.subjects?.find(s => s.subjectId === subjectId);
    // Prioritaskan KKM yang diinput Admin pada master data Mata Pelajaran
    const passingGrade = subInfo?.passingGrade || pkgSub?.passingGrade || 75;

    // 1. Tentukan Tryout yang terhubung dengan paket dan mapel ini
    const pkgCode = (pkg.code || '').toLowerCase().trim();
    const pkgId = (pkg.id || '').toLowerCase().trim();
    const matchingTryouts = allTryouts.filter(t => {
      const tPkgId = (t.packageId || '').toLowerCase().trim();
      const tCode = (t.code || '').toLowerCase().trim();
      const isPkgMatch = tPkgId === pkgId || (pkgCode && tCode.startsWith(pkgCode)) || t.id === pkgId;
      const isSubMatch = !t.subjectId || t.subjectId === subjectId || (t.id && t.id.includes(subjectId));
      return isPkgMatch && isSubMatch;
    });
    const matchingTryoutIds = new Set(matchingTryouts.map(t => t.id));
    // Wadah ID itu sendiri juga bisa tersimpan di tryoutId
    matchingTryoutIds.add(pkg.id);

    // 2. Tentukan target siswa berdasarkan targetClassIds paket ujian
    const targetClassIds = new Set(
      pkg.targetClassIds && pkg.targetClassIds.length > 0
        ? pkg.targetClassIds
        : allClasses.map(c => c.id)
    );
    const targetStudents = allStudents.filter(s =>
      targetClassIds.has(s.classId) && !s.isAnswerKeyAccount
    );
    const targetStudentIdSet = new Set(targetStudents.map(s => s.id));

    // 3. Ambil skor yang BENAR-BENAR milik tryout paket ini dan siswa kelas target
    // Lakukan deduplikasi per studentId (ambil skor tertinggi jika ada multiple submissions)
    const studentScoreMap = new Map<string, { scoreRecord: Score; studentId: string; scoreValue: number }>();

    allScores.forEach(s => {
      if (!targetStudentIdSet.has(s.studentId)) return;

      const scVal = this.extractScoreForSubject(s, subjectId, matchingTryoutIds);
      if (scVal === null) return; // Bukan skor untuk wadah/mapel ini

      const existing = studentScoreMap.get(s.studentId);
      if (!existing || scVal > existing.scoreValue) {
        studentScoreMap.set(s.studentId, {
          scoreRecord: s,
          studentId: s.studentId,
          scoreValue: scVal,
        });
      }
    });

    const scoresWithSub = Array.from(studentScoreMap.values());
    const studentCount = scoresWithSub.length;
    const scoreValues = scoresWithSub.map(s => s.scoreValue);
    const totalScore = scoreValues.reduce((a, b) => a + b, 0);
    const averageScore = studentCount > 0 ? Math.round((totalScore / studentCount) * 10) / 10 : 0;
    const highestScore = studentCount > 0 ? Math.max(...scoreValues) : 0;
    const lowestScore = studentCount > 0 ? Math.min(...scoreValues) : 0;
    const passingCount = scoreValues.filter(v => v >= passingGrade).length;
    const remedialCount = studentCount - passingCount;
    const passingRatePct = studentCount > 0 ? Math.round((passingCount / studentCount) * 100) : 0;

    // Hitung ranking siswa
    const studentRankings = scoresWithSub
      .map(item => {
        const st = allStudents.find(std => std.id === item.studentId);
        const cl = allClasses.find(c => c.id === st?.classId);
        const sc = item.scoreValue;
        return {
          studentId: item.studentId,
          studentName: st?.name || 'Siswa',
          nisn: st?.nisn || '-',
          className: cl?.name || '-',
          score: Math.round(sc * 10) / 10,
          isPassed: sc >= passingGrade,
          rank: 1,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

    // 4. Hitung Analisis Butir Soal Murni per Nomor Soal (hanya dari tryout wadah ini)
    const subjectQuestions = allQuestions
      .filter(q => {
        if (matchingTryoutIds.size > 0 && (q as any).tryoutId) {
          return matchingTryoutIds.has((q as any).tryoutId) && q.subjectId === subjectId;
        }
        return q.subjectId === subjectId;
      })
      .sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));

    // Jika belum ada siswa yang mengerjakan wadah ini, questionStats kosong
    let questionStats: QuestionItemStat[] = [];
    if (studentCount > 0 && subjectQuestions.length > 0) {
      const sortedScores = [...scoresWithSub].sort((a, b) => b.scoreValue - a.scoreValue);
      const groupSize = Math.max(1, Math.round(sortedScores.length * 0.27));
      const upperGroupStudentIds = new Set(sortedScores.slice(0, groupSize).map(s => s.studentId));
      const lowerGroupStudentIds = new Set(sortedScores.slice(-groupSize).map(s => s.studentId));

      const relevantAnswers = allAnswers.filter(a =>
        (matchingTryoutIds.has(a.tryoutId) || matchingTryoutIds.has(pkg.id)) &&
        targetStudentIdSet.has(a.studentId)
      );

      questionStats = subjectQuestions.map((q, idx) => {
        const qNum = q.questionNumber || idx + 1;
        const answersForQ = relevantAnswers.filter(a => a.questionId === q.id);
        const totalResp = answersForQ.length;
        if (totalResp === 0) {
          return {
            questionNumber: qNum,
            questionText: q.questionText,
            totalResponses: 0,
            correctCount: 0,
            wrongCount: 0,
            facilityValue: 0,
            difficultyLabel: 'Sedang' as const,
            discriminationIndex: 0,
            discriminationLabel: 'Cukup' as const,
            isReviewRecommended: false,
          };
        }

        const correctResp = answersForQ.filter(a => a.isCorrect).length;
        const wrongResp = totalResp - correctResp;
        const pVal = Math.round((correctResp / totalResp) * 100) / 100;

        let diffLabel: QuestionItemStat['difficultyLabel'] = 'Sedang';
        if (pVal > 0.80) diffLabel = 'Sangat Mudah';
        else if (pVal > 0.60) diffLabel = 'Mudah';
        else if (pVal > 0.40) diffLabel = 'Sedang';
        else if (pVal > 0.20) diffLabel = 'Sukar';
        else diffLabel = 'Sangat Sukar';

        const correctUpper = answersForQ.filter(a => a.isCorrect && upperGroupStudentIds.has(a.studentId)).length;
        const correctLower = answersForQ.filter(a => a.isCorrect && lowerGroupStudentIds.has(a.studentId)).length;
        const rawD = (correctUpper - correctLower) / (groupSize || 1);
        const dVal = Math.round(Math.max(-1, Math.min(1, rawD)) * 100) / 100;

        let discLabel: QuestionItemStat['discriminationLabel'] = 'Baik';
        let isReview = false;
        if (dVal >= 0.40) discLabel = 'Sangat Baik';
        else if (dVal >= 0.30) discLabel = 'Baik';
        else if (dVal >= 0.20) discLabel = 'Cukup';
        else {
          discLabel = 'Buruk / Perlu Ditinjau';
          isReview = true;
        }

        return {
          questionNumber: qNum,
          questionText: q.questionText,
          totalResponses: totalResp,
          correctCount: correctResp,
          wrongCount: wrongResp,
          facilityValue: pVal,
          difficultyLabel: diffLabel,
          discriminationIndex: dVal,
          discriminationLabel: discLabel,
          isReviewRecommended: isReview,
        };
      });
    }

    return {
      subjectId,
      subjectName: subInfo?.name || 'Mata Pelajaran',
      subjectCode: subInfo?.code || 'MAPEL',
      packageId: pkg.id,
      packageTitle: pkg.title,
      passingGrade,
      studentCount,
      averageScore,
      highestScore,
      lowestScore,
      passingCount,
      remedialCount,
      passingRatePct,
      questionStats,
      studentRankings,
    };
  }

  /**
   * Menghitung Leger Nilai Rapor Satu Rombel Kelas untuk Wali Kelas (SAS / SAT)
   * Scoping ketat per mapel wadah paket SAT/SAS, hanya menghitung nilai aktual.
   */
  public static calculateWaliKelasLeger(
    classId: string,
    pkg: ExamPackage,
    allStudents: Student[],
    allClasses: ClassRoom[],
    allScores: Score[],
    allSubjects: Subject[],
    allTryouts: Tryout[] = []
  ): WaliKelasLegerResult {
    const targetClass = allClasses.find(c => c.id === classId);
    const classStudents = allStudents.filter(s => s.classId === classId && !s.isAnswerKeyAccount);

    const subjects = (pkg.subjects || []).map(pkgSub => {
      const sub = allSubjects.find(s => s.id === pkgSub.subjectId);
      return {
        id: pkgSub.subjectId,
        code: sub?.code || 'MAPEL',
        name: sub?.name || 'Mata Pelajaran',
        // Prioritaskan KKM yang diinput Admin
        passingGrade: sub?.passingGrade || pkgSub.passingGrade || 75,
      };
    });

    // Map tryouts per mapel untuk paket ini
    const pkgCode = (pkg.code || '').toLowerCase().trim();
    const pkgId = (pkg.id || '').toLowerCase().trim();
    const subjectTryoutMap = new Map<string, Set<string>>();
    subjects.forEach(sub => {
      const tIds = new Set(
        allTryouts
          .filter(t => {
            const tPkgId = (t.packageId || '').toLowerCase().trim();
            const tCode = (t.code || '').toLowerCase().trim();
            const isPkgMatch = tPkgId === pkgId || (pkgCode && tCode.startsWith(pkgCode)) || t.id === pkgId;
            const isSubMatch = !t.subjectId || t.subjectId === sub.id || (t.id && t.id.includes(sub.id));
            return isPkgMatch && isSubMatch;
          })
          .map(t => t.id)
      );
      tIds.add(pkg.id);
      subjectTryoutMap.set(sub.id, tIds);
    });

    const rows: LegerStudentRow[] = classStudents.map(student => {
      const scoresBySubjectId: Record<string, number> = {};
      const scoresBySubjectCode: Record<string, number> = {};
      const remedialSubjectCodes: string[] = [];
      let totalScore = 0;
      let gradedSubjectsCount = 0;

      subjects.forEach(sub => {
        const validTryoutIds = subjectTryoutMap.get(sub.id);
        const studentScoreRecords = allScores.filter(s =>
          s.studentId === student.id && validTryoutIds && validTryoutIds.has(s.tryoutId)
        );

        let sc: number | null = null;
        if (studentScoreRecords.length > 0) {
          // Cari skor tertinggi jika ada lebih dari satu submisi
          for (const rec of studentScoreRecords) {
            const val = this.extractScoreForSubject(rec, sub.id, validTryoutIds);
            if (val !== null) {
              if (sc === null || val > sc) sc = val;
            }
          }
        }

        if (sc !== null) {
          const rounded = Math.round(sc * 10) / 10;
          scoresBySubjectId[sub.id] = rounded;
          scoresBySubjectCode[sub.code] = rounded;
          totalScore += rounded;
          gradedSubjectsCount += 1;

          if (rounded < sub.passingGrade) {
            remedialSubjectCodes.push(sub.code);
          }
        } else {
          // Belum ada nilai untuk mapel ini di wadah ini
          scoresBySubjectId[sub.id] = 0;
          scoresBySubjectCode[sub.code] = 0;
        }
      });

      const avg = gradedSubjectsCount > 0
        ? Math.round((totalScore / gradedSubjectsCount) * 10) / 10
        : 0;
      const remedialCount = remedialSubjectCodes.length;

      return {
        studentId: student.id,
        studentName: student.name,
        nisn: student.nisn,
        scoresBySubjectId,
        scoresBySubjectCode,
        totalScore: Math.round(totalScore * 10) / 10,
        averageScore: avg,
        rank: 1,
        remedialSubjectCodes,
        remedialCount,
        // Siswa hanya dianggap berisiko jika minimal 3 mapel yang SUDAH dinilai ternyata remedial
        isAtRisk: remedialCount >= 3,
      };
    });

    // Urutkan peringkat berdasarkan totalScore descending
    rows.sort((a, b) => b.totalScore - a.totalScore);
    rows.forEach((r, idx) => {
      r.rank = idx + 1;
    });

    // Hitung rata-rata tiap mata pelajaran di kelas (hanya dari siswa yang memiliki nilai riil)
    const subjectAverages: Record<string, number> = {};
    let totalAllScores = 0;
    let totalGradedEntries = 0;

    subjects.forEach(sub => {
      const validTryoutIds = subjectTryoutMap.get(sub.id);
      const scoresForSub: number[] = [];

      classStudents.forEach(st => {
        const studentScoreRecords = allScores.filter(s =>
          s.studentId === st.id && validTryoutIds && validTryoutIds.has(s.tryoutId)
        );
        for (const rec of studentScoreRecords) {
          const val = this.extractScoreForSubject(rec, sub.id, validTryoutIds);
          if (val !== null) {
            scoresForSub.push(val);
            break;
          }
        }
      });

      if (scoresForSub.length > 0) {
        const sum = scoresForSub.reduce((a, b) => a + b, 0);
        const avg = Math.round((sum / scoresForSub.length) * 10) / 10;
        subjectAverages[sub.id] = avg;
        totalAllScores += sum;
        totalGradedEntries += scoresForSub.length;
      } else {
        subjectAverages[sub.id] = 0;
      }
    });

    const overallClassAverage = totalGradedEntries > 0
      ? Math.round((totalAllScores / totalGradedEntries) * 10) / 10
      : 0;
    const atRiskStudents = rows.filter(r => r.isAtRisk);

    return {
      classId,
      className: targetClass?.name || 'Kelas',
      packageId: pkg.id,
      packageTitle: pkg.title,
      packageType: pkg.assessmentType === 'SAT' ? 'SAT' : 'SAS',
      subjects,
      rows,
      totalStudents: rows.length,
      atRiskStudentsCount: atRiskStudents.length,
      atRiskStudents,
      subjectAverages,
      overallClassAverage,
    };
  }
}
