import { Question, ScoringConfig, ScoringStatus } from '../types/database';

export interface CalculationResult {
  // Counts
  totalCorrect: number;
  totalIncorrect: number;
  totalUnanswered: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;

  // Scores
  raw_score: number;
  rawScoreSum: number;
  maxPossibleRawScore: number;
  final_score: number;
  calculatedScore: number;
  percentage: number; // 0.00 to 100.00%

  // Google Form Comparison
  google_form_score: number;
  rawGFormScore: number;
  calculated_score: number;
  score_difference: number;
  scoreDifference: number;
  scoring_status: ScoringStatus;
  scoringStatus: ScoringStatus;

  // Detailed per-question item breakdown
  answerBreakdown: Record<
    string,
    {
      studentAnswer: string;
      correctAnswer: string;
      isCorrect: boolean;
      weight: number;
      score: number;
    }
  >;
}

export interface ScoringTestCaseResult {
  name: string;
  passed: boolean;
  expected: {
    rawScore: number;
    finalScore: number;
    percentage: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    status: ScoringStatus;
  };
  actual: {
    rawScore: number;
    finalScore: number;
    percentage: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    status: ScoringStatus;
  };
  message: string;
}

export class ScoringService {
  /**
   * Universal answer matching:
   * 1. Exact match (case-insensitive, trimmed)
   * 2. Complex Multiple Choice / Checkbox: comma-separated items sorted (e.g. "A, C" === "C, A")
   * 3. True / False normalization (e.g. "BENAR" === "TRUE" === "B", "SALAH" === "FALSE" === "S")
   */
  public static isAnswerMatching(studentAns: string, correctAns: string): boolean {
    const s = (studentAns || '').trim();
    const c = (correctAns || '').trim();
    if (!s || !c) return false;

    // Exact string match (case-insensitive)
    if (s.toUpperCase() === c.toUpperCase()) return true;

    // Checkbox / Complex multiple-choice (comma-separated options)
    if (s.includes(',') || c.includes(',')) {
      const sParts = s.split(',').map(p => p.trim().toUpperCase()).filter(Boolean).sort();
      const cParts = c.split(',').map(p => p.trim().toUpperCase()).filter(Boolean).sort();
      if (sParts.length === cParts.length && sParts.every((val, idx) => val === cParts[idx])) {
        return true;
      }
    }

    // True/False or Benar/Salah mapping
    const boolMap: Record<string, string> = {
      B: 'BENAR', TRUE: 'BENAR', T: 'BENAR', '1': 'BENAR', YA: 'BENAR',
      S: 'SALAH', FALSE: 'SALAH', F: 'SALAH', '0': 'SALAH', TIDAK: 'SALAH',
    };
    const sNorm = boolMap[s.toUpperCase()] || s.toUpperCase();
    const cNorm = boolMap[c.toUpperCase()] || c.toUpperCase();
    if (sNorm === cNorm) return true;

    // Multiple Choice Option Prefix matching (e.g. "A" matches "A. Pilihan", "(A) Pilihan", "[A] Pilihan", "A - Pilihan")
    const extractOptionLetter = (val: string): string | null => {
      const clean = val.trim();
      if (!clean) return null;
      if (['A', 'B', 'C', 'D', 'E'].includes(clean.toUpperCase())) return clean.toUpperCase();
      const prefix = clean.match(/^\s*(?:\[([A-Ea-e])\]|\(([A-Ea-e])\)|(?:opsi|pilihan)\s+([A-Ea-e])(?:[\.\)\:\-\s]|$)|([A-Ea-e])[\.\)\:\-\s])/i);
      if (prefix) return (prefix[1] || prefix[2] || prefix[3] || prefix[4]).toUpperCase();
      return null;
    };

    const sLet = extractOptionLetter(s);
    const cLet = extractOptionLetter(c);
    if (sLet && cLet && sLet === cLet) {
      return true;
    }

    return false;
  }

  /**
   * Deterministic Score Calculation Engine adhering strictly to /docs/SCORING_RULES.md
   * Supports:
   * - Equal weighting vs Custom weighting
   * - Points for correct, wrong, and unanswered answers
   * - Negative marking toggle
   * - Standardized Max Score scaling
   * - Per-question weight
   * - Google Form score comparison without silent overwrite
   */
  public static calculateStudentScore(
    studentAnswers: Record<string, string>, // questionUniqueCode -> studentAnswer 'A'..'E' or ''
    questions: Question[],
    config: ScoringConfig,
    rawGFormScore: number
  ): CalculationResult {
    let totalCorrect = 0;
    let totalIncorrect = 0;
    let totalUnanswered = 0;
    let rawScoreSum = 0;
    let maxPossibleRawScore = 0;

    const answerBreakdown: CalculationResult['answerBreakdown'] = {};

    questions.forEach(q => {
      let studentAns = (studentAnswers[q.uniqueCode] || '').trim().toUpperCase();
      let correctAns = q.correctAnswer.trim().toUpperCase();
      const questionWeight = config.scoringType === 'CUSTOM_WEIGHT' ? (q.weight || 1) : 1;

      // Maximum possible raw points accumulates positive marks for correct responses
      maxPossibleRawScore += config.correctScore * questionWeight;

      // Resolusi opsi jika siswa atau kunci berupa teks penuh yang sesuai dengan teks di q.options
      if (Array.isArray(q.options) && q.options.length > 0) {
        const cleanS = studentAns.replace(/\s+/g, ' ').trim();
        const cleanC = correctAns.replace(/\s+/g, ' ').trim();
        const strippedS = cleanS.replace(/^[A-E][\.\)\:\-\s]+\s*/, '').trim();
        const strippedC = cleanC.replace(/^[A-E][\.\)\:\-\s]+\s*/, '').trim();

        q.options.forEach(opt => {
          const optK = (opt.key || '').trim().toUpperCase();
          const optT = (opt.text || '').replace(/\s+/g, ' ').trim().toUpperCase();
          const strippedOptT = optT.replace(/^[A-E][\.\)\:\-\s]+\s*/, '').trim();

          if (optK && optT && !optT.startsWith('PILIHAN ') && !optT.startsWith('OPSI ')) {
            if (cleanS && (cleanS === optT || (strippedS && strippedS === strippedOptT))) {
              studentAns = optK;
            }
            if (cleanC && (cleanC === optT || (strippedC && strippedC === strippedOptT))) {
              correctAns = optK;
            }
          }
        });
      }

      const isCorrect = this.isAnswerMatching(studentAns, correctAns);

      if (!studentAns) {
        totalUnanswered++;
        const itemScore = config.unansweredScore * questionWeight;
        rawScoreSum += itemScore;
        answerBreakdown[q.uniqueCode] = {
          studentAnswer: '',
          correctAnswer: correctAns,
          isCorrect: false,
          weight: questionWeight,
          score: itemScore,
        };
      } else if (isCorrect) {
        totalCorrect++;
        const itemScore = config.correctScore * questionWeight;
        rawScoreSum += itemScore;
        answerBreakdown[q.uniqueCode] = {
          studentAnswer: studentAns,
          correctAnswer: correctAns,
          isCorrect: true,
          weight: questionWeight,
          score: itemScore,
        };
      } else {
        totalIncorrect++;
        const itemScore = (config.allowNegativeMarking ? config.wrongScore : 0) * questionWeight;
        rawScoreSum += itemScore;
        answerBreakdown[q.uniqueCode] = {
          studentAnswer: studentAns,
          correctAnswer: correctAns,
          isCorrect: false,
          weight: questionWeight,
          score: itemScore,
        };
      }
    });

    // Normalization to standardized maxScore
    let calculatedScore = 0;
    let percentage = 0;
    if (maxPossibleRawScore > 0) {
      calculatedScore = Math.min(
        config.maxScore,
        Math.max(0, (rawScoreSum / maxPossibleRawScore) * config.maxScore)
      );
      percentage = Math.min(
        100,
        Math.max(0, (rawScoreSum / maxPossibleRawScore) * 100)
      );
    }

    // Precise 2-decimal rounding
    calculatedScore = Math.round(calculatedScore * 100) / 100;
    rawScoreSum = Math.round(rawScoreSum * 100) / 100;
    maxPossibleRawScore = Math.round(maxPossibleRawScore * 100) / 100;
    percentage = Math.round(percentage * 100) / 100;

    // Google Form Comparison
    const scoreDifference = Math.round(Math.abs(rawGFormScore - calculatedScore) * 100) / 100;
    const scoringStatus: ScoringStatus = scoreDifference <= 0.01 ? 'MATCH' : 'SCORING_MISMATCH';

    return {
      totalCorrect,
      totalIncorrect,
      totalUnanswered,
      correct_count: totalCorrect,
      incorrect_count: totalIncorrect,
      unanswered_count: totalUnanswered,

      raw_score: rawScoreSum,
      rawScoreSum,
      maxPossibleRawScore,
      final_score: calculatedScore,
      calculatedScore,
      percentage,

      google_form_score: rawGFormScore,
      rawGFormScore,
      calculated_score: calculatedScore,
      score_difference: scoreDifference,
      scoreDifference,
      scoring_status: scoringStatus,
      scoringStatus,

      answerBreakdown,
    };
  }

  /**
   * AUTOMATED TEST SUITE: Complete Verification with Manual Calculation Benchmarks
   * 10 Critical Test Cases required by Prompt 08:
   * 1. Semua Benar (All Correct)
   * 2. Semua Salah (All Incorrect)
   * 3. Semua Kosong (All Unanswered)
   * 4. Kombinasi Benar/Salah/Kosong
   * 5. Negative Marking (Penalti Salah)
   * 6. Equal Weight
   * 7. Custom Weight
   * 8. Max Score Kustom
   * 9. Google Form Match
   * 10. Google Form Mismatch (No Silent Overwrite)
   */
  public static runScoringTestSuite(): {
    passed: boolean;
    tests: ScoringTestCaseResult[];
  } {
    const tests: ScoringTestCaseResult[] = [];

    // Helper sample questions generator
    const makeQuestions = (weights: number[] = [1, 1, 1, 1, 1]): Question[] =>
      weights.map((w, idx) => ({
        id: `test-q-${idx + 1}`,
        uniqueCode: `TEST-Q00${idx + 1}`,
        questionNumber: idx + 1,
        subjectId: 'subj-mat',
        materialId: 'm-mat-1',
        competencyId: 'comp-mat-1',
        questionText: `Pertanyaan uji ${idx + 1}`,
        options: [
          { key: 'A', text: 'Opsi A' },
          { key: 'B', text: 'Opsi B' },
          { key: 'C', text: 'Opsi C' },
          { key: 'D', text: 'Opsi D' },
        ],
        correctAnswer: 'A',
        weight: w,
      }));

    // -------------------------------------------------------------
    // TEST 1: Semua Benar (All Correct)
    // 5 Soal, Bobot 1, Benar: +4, Salah: 0, Kosong: 0, MaxScore: 100
    // Manual: rawScore = 5 * 4 = 20, maxPossible = 20, finalScore = 100, pct = 100%
    // -------------------------------------------------------------
    {
      const qList = makeQuestions([1, 1, 1, 1, 1]);
      const answers = {
        'TEST-Q001': 'A',
        'TEST-Q002': 'A',
        'TEST-Q003': 'A',
        'TEST-Q004': 'A',
        'TEST-Q005': 'A',
      };
      const config: ScoringConfig = {
        scoringType: 'EQUAL_WEIGHT',
        maxScore: 100,
        correctScore: 4,
        wrongScore: 0,
        unansweredScore: 0,
        allowNegativeMarking: false,
      };
      const res = this.calculateStudentScore(answers, qList, config, 100);

      const passed =
        res.raw_score === 20 &&
        res.final_score === 100 &&
        res.percentage === 100 &&
        res.correct_count === 5 &&
        res.incorrect_count === 0 &&
        res.unanswered_count === 0 &&
        res.scoring_status === 'MATCH';

      tests.push({
        name: '1. Semua Benar (All Correct)',
        passed,
        expected: {
          rawScore: 20,
          finalScore: 100,
          percentage: 100,
          correctCount: 5,
          incorrectCount: 0,
          unansweredCount: 0,
          status: 'MATCH',
        },
        actual: {
          rawScore: res.raw_score,
          finalScore: res.final_score,
          percentage: res.percentage,
          correctCount: res.correct_count,
          incorrectCount: res.incorrect_count,
          unansweredCount: res.unanswered_count,
          status: res.scoring_status,
        },
        message: passed
          ? 'Perhitungan manual dan engine identik: Raw 20/20, Final 100.0, 100% (5 benar, 0 salah, 0 kosong)'
          : 'Ketidaksesuaian nilai pada tes Semua Benar',
      });
    }

    // -------------------------------------------------------------
    // TEST 2: Semua Salah (All Incorrect, No Negative Marking)
    // 5 Soal, Bobot 1, Benar: +4, Salah: 0, Kosong: 0, MaxScore: 100
    // Manual: rawScore = 0, finalScore = 0, pct = 0%
    // -------------------------------------------------------------
    {
      const qList = makeQuestions([1, 1, 1, 1, 1]);
      const answers = {
        'TEST-Q001': 'B',
        'TEST-Q002': 'C',
        'TEST-Q003': 'D',
        'TEST-Q004': 'B',
        'TEST-Q005': 'C',
      };
      const config: ScoringConfig = {
        scoringType: 'EQUAL_WEIGHT',
        maxScore: 100,
        correctScore: 4,
        wrongScore: 0,
        unansweredScore: 0,
        allowNegativeMarking: false,
      };
      const res = this.calculateStudentScore(answers, qList, config, 0);

      const passed =
        res.raw_score === 0 &&
        res.final_score === 0 &&
        res.percentage === 0 &&
        res.correct_count === 0 &&
        res.incorrect_count === 5 &&
        res.unanswered_count === 0 &&
        res.scoring_status === 'MATCH';

      tests.push({
        name: '2. Semua Salah (All Incorrect)',
        passed,
        expected: {
          rawScore: 0,
          finalScore: 0,
          percentage: 0,
          correctCount: 0,
          incorrectCount: 5,
          unansweredCount: 0,
          status: 'MATCH',
        },
        actual: {
          rawScore: res.raw_score,
          finalScore: res.final_score,
          percentage: res.percentage,
          correctCount: res.correct_count,
          incorrectCount: res.incorrect_count,
          unansweredCount: res.unanswered_count,
          status: res.scoring_status,
        },
        message: passed
          ? 'Perhitungan manual dan engine identik: Raw 0/20, Final 0.0, 0% (0 benar, 5 salah, 0 kosong)'
          : 'Ketidaksesuaian nilai pada tes Semua Salah',
      });
    }

    // -------------------------------------------------------------
    // TEST 3: Semua Kosong (All Unanswered)
    // 5 Soal, Bobot 1, Benar: +4, Salah: 0, Kosong: 0, MaxScore: 100
    // Manual: rawScore = 0, finalScore = 0, pct = 0%, 5 kosong
    // -------------------------------------------------------------
    {
      const qList = makeQuestions([1, 1, 1, 1, 1]);
      const answers = {
        'TEST-Q001': '',
        'TEST-Q002': '',
        'TEST-Q003': '',
        'TEST-Q004': '',
        'TEST-Q005': '',
      };
      const config: ScoringConfig = {
        scoringType: 'EQUAL_WEIGHT',
        maxScore: 100,
        correctScore: 4,
        wrongScore: 0,
        unansweredScore: 0,
        allowNegativeMarking: false,
      };
      const res = this.calculateStudentScore(answers, qList, config, 0);

      const passed =
        res.raw_score === 0 &&
        res.final_score === 0 &&
        res.percentage === 0 &&
        res.correct_count === 0 &&
        res.incorrect_count === 0 &&
        res.unanswered_count === 5 &&
        res.scoring_status === 'MATCH';

      tests.push({
        name: '3. Semua Kosong (All Unanswered)',
        passed,
        expected: {
          rawScore: 0,
          finalScore: 0,
          percentage: 0,
          correctCount: 0,
          incorrectCount: 0,
          unansweredCount: 5,
          status: 'MATCH',
        },
        actual: {
          rawScore: res.raw_score,
          finalScore: res.final_score,
          percentage: res.percentage,
          correctCount: res.correct_count,
          incorrectCount: res.incorrect_count,
          unansweredCount: res.unanswered_count,
          status: res.scoring_status,
        },
        message: passed
          ? 'Perhitungan manual dan engine identik: Raw 0/20, Final 0.0 (0 benar, 0 salah, 5 kosong)'
          : 'Ketidaksesuaian nilai pada tes Semua Kosong',
      });
    }

    // -------------------------------------------------------------
    // TEST 4: Kombinasi Benar, Salah, Kosong
    // 5 Soal, Bobot 1, Benar: +4, Salah: 0, Kosong: 0, MaxScore: 100
    // Jawaban: 3 Benar, 1 Salah, 1 Kosong
    // Manual: rawScore = 3 * 4 = 12, max = 20, finalScore = (12/20)*100 = 60.0, pct = 60.0%
    // -------------------------------------------------------------
    {
      const qList = makeQuestions([1, 1, 1, 1, 1]);
      const answers = {
        'TEST-Q001': 'A', // Benar (+4)
        'TEST-Q002': 'A', // Benar (+4)
        'TEST-Q003': 'A', // Benar (+4)
        'TEST-Q004': 'B', // Salah (0)
        'TEST-Q005': '',  // Kosong (0)
      };
      const config: ScoringConfig = {
        scoringType: 'EQUAL_WEIGHT',
        maxScore: 100,
        correctScore: 4,
        wrongScore: 0,
        unansweredScore: 0,
        allowNegativeMarking: false,
      };
      const res = this.calculateStudentScore(answers, qList, config, 60);

      const passed =
        res.raw_score === 12 &&
        res.final_score === 60 &&
        res.percentage === 60 &&
        res.correct_count === 3 &&
        res.incorrect_count === 1 &&
        res.unanswered_count === 1 &&
        res.scoring_status === 'MATCH';

      tests.push({
        name: '4. Kombinasi Benar/Salah/Kosong',
        passed,
        expected: {
          rawScore: 12,
          finalScore: 60,
          percentage: 60,
          correctCount: 3,
          incorrectCount: 1,
          unansweredCount: 1,
          status: 'MATCH',
        },
        actual: {
          rawScore: res.raw_score,
          finalScore: res.final_score,
          percentage: res.percentage,
          correctCount: res.correct_count,
          incorrectCount: res.incorrect_count,
          unansweredCount: res.unanswered_count,
          status: res.scoring_status,
        },
        message: passed
          ? 'Perhitungan manual dan engine identik: Raw 12/20, Final 60.0, 60% (3 benar, 1 salah, 1 kosong)'
          : 'Ketidaksesuaian nilai pada tes Kombinasi',
      });
    }

    // -------------------------------------------------------------
    // TEST 5: Negative Marking (Penalti Jawaban Salah)
    // 5 Soal, Bobot 1, Benar: +4, Salah: -1, Kosong: 0, MaxScore: 100
    // allowNegativeMarking = true
    // Jawaban: 3 Benar, 2 Salah
    // Manual: rawScore = (3 * 4) + (2 * -1) = 12 - 2 = 10
    // maxPossible = 5 * 4 = 20
    // finalScore = (10 / 20) * 100 = 50.0, pct = 50.0%
    // -------------------------------------------------------------
    {
      const qList = makeQuestions([1, 1, 1, 1, 1]);
      const answers = {
        'TEST-Q001': 'A', // Benar (+4)
        'TEST-Q002': 'A', // Benar (+4)
        'TEST-Q003': 'A', // Benar (+4)
        'TEST-Q004': 'C', // Salah (-1)
        'TEST-Q005': 'D', // Salah (-1)
      };
      const config: ScoringConfig = {
        scoringType: 'EQUAL_WEIGHT',
        maxScore: 100,
        correctScore: 4,
        wrongScore: -1,
        unansweredScore: 0,
        allowNegativeMarking: true,
      };
      const res = this.calculateStudentScore(answers, qList, config, 50);

      const passed =
        res.raw_score === 10 &&
        res.final_score === 50 &&
        res.percentage === 50 &&
        res.correct_count === 3 &&
        res.incorrect_count === 2 &&
        res.unanswered_count === 0 &&
        res.scoring_status === 'MATCH';

      tests.push({
        name: '5. Negative Marking (Penalti Salah)',
        passed,
        expected: {
          rawScore: 10,
          finalScore: 50,
          percentage: 50,
          correctCount: 3,
          incorrectCount: 2,
          unansweredCount: 0,
          status: 'MATCH',
        },
        actual: {
          rawScore: res.raw_score,
          finalScore: res.final_score,
          percentage: res.percentage,
          correctCount: res.correct_count,
          incorrectCount: res.incorrect_count,
          unansweredCount: res.unanswered_count,
          status: res.scoring_status,
        },
        message: passed
          ? 'Perhitungan manual dan engine identik: Penalti -1 terhitung tepat -> Raw 10/20, Final 50.0, 50%'
          : 'Ketidaksesuaian nilai pada tes Negative Marking',
      });
    }

    // -------------------------------------------------------------
    // TEST 6: Equal Weighting
    // 4 Soal, Semua Bobot 1, Benar: +2.5, Salah: 0, Kosong: 0, MaxScore: 10
    // Jawaban: 2 Benar, 2 Salah
    // Manual: rawScore = 2 * 2.5 = 5.0, maxPossible = 4 * 2.5 = 10.0, finalScore = 5.0, pct = 50.0%
    // -------------------------------------------------------------
    {
      const qList = makeQuestions([1, 1, 1, 1]);
      const answers = {
        'TEST-Q001': 'A', // Benar
        'TEST-Q002': 'A', // Benar
        'TEST-Q003': 'B', // Salah
        'TEST-Q004': 'C', // Salah
      };
      const config: ScoringConfig = {
        scoringType: 'EQUAL_WEIGHT',
        maxScore: 10,
        correctScore: 2.5,
        wrongScore: 0,
        unansweredScore: 0,
        allowNegativeMarking: false,
      };
      const res = this.calculateStudentScore(answers, qList, config, 5.0);

      const passed =
        res.raw_score === 5 &&
        res.final_score === 5 &&
        res.percentage === 50 &&
        res.correct_count === 2 &&
        res.incorrect_count === 2;

      tests.push({
        name: '6. Equal Weighting (Bobot Sama)',
        passed,
        expected: {
          rawScore: 5,
          finalScore: 5,
          percentage: 50,
          correctCount: 2,
          incorrectCount: 2,
          unansweredCount: 0,
          status: 'MATCH',
        },
        actual: {
          rawScore: res.raw_score,
          finalScore: res.final_score,
          percentage: res.percentage,
          correctCount: res.correct_count,
          incorrectCount: res.incorrect_count,
          unansweredCount: res.unanswered_count,
          status: res.scoring_status,
        },
        message: passed
          ? 'Perhitungan manual dan engine identik: Raw 5.0/10.0, Final 5.0 (Skala 10)'
          : 'Ketidaksesuaian nilai pada tes Equal Weighting',
      });
    }

    // -------------------------------------------------------------
    // TEST 7: Custom Weighting (Bobot Berbeda Per Soal)
    // 3 Soal: Q1 bobot 1, Q2 bobot 2, Q3 bobot 3
    // scoringType = 'CUSTOM_WEIGHT', correctScore = 1, maxScore = 100
    // maxPossible = (1*1) + (2*1) + (3*1) = 6
    // Jawaban: Q1 Benar (+1), Q2 Salah (0), Q3 Benar (+3)
    // Manual: rawScore = 1 + 3 = 4. finalScore = (4 / 6) * 100 = 66.67, pct = 66.67%
    // -------------------------------------------------------------
    {
      const qList = makeQuestions([1, 2, 3]);
      const answers = {
        'TEST-Q001': 'A', // Benar (bobot 1 -> +1)
        'TEST-Q002': 'B', // Salah (bobot 2 -> 0)
        'TEST-Q003': 'A', // Benar (bobot 3 -> +3)
      };
      const config: ScoringConfig = {
        scoringType: 'CUSTOM_WEIGHT',
        maxScore: 100,
        correctScore: 1,
        wrongScore: 0,
        unansweredScore: 0,
        allowNegativeMarking: false,
      };
      const res = this.calculateStudentScore(answers, qList, config, 66.67);

      const passed =
        res.raw_score === 4 &&
        res.maxPossibleRawScore === 6 &&
        res.final_score === 66.67 &&
        res.percentage === 66.67 &&
        res.correct_count === 2 &&
        res.incorrect_count === 1;

      tests.push({
        name: '7. Custom Weighting (Bobot Kustom Per Soal)',
        passed,
        expected: {
          rawScore: 4,
          finalScore: 66.67,
          percentage: 66.67,
          correctCount: 2,
          incorrectCount: 1,
          unansweredCount: 0,
          status: 'MATCH',
        },
        actual: {
          rawScore: res.raw_score,
          finalScore: res.final_score,
          percentage: res.percentage,
          correctCount: res.correct_count,
          incorrectCount: res.incorrect_count,
          unansweredCount: res.unanswered_count,
          status: res.scoring_status,
        },
        message: passed
          ? 'Perhitungan manual dan engine identik: Bobot [1, 2, 3] -> Raw 4/6, Final 66.67, 66.67%'
          : 'Ketidaksesuaian nilai pada tes Custom Weighting',
      });
    }

    // -------------------------------------------------------------
    // TEST 8: Max Score Kustom (Standar Skala Fleksibel misal 500)
    // 4 Soal, Bobot 1, Benar: +25, MaxScore: 500
    // maxPossible = 4 * 25 = 100
    // Jawaban: 3 Benar (raw = 75)
    // Manual: finalScore = (75 / 100) * 500 = 375.0, pct = 75.0%
    // -------------------------------------------------------------
    {
      const qList = makeQuestions([1, 1, 1, 1]);
      const answers = {
        'TEST-Q001': 'A',
        'TEST-Q002': 'A',
        'TEST-Q003': 'A',
        'TEST-Q004': 'B',
      };
      const config: ScoringConfig = {
        scoringType: 'EQUAL_WEIGHT',
        maxScore: 500,
        correctScore: 25,
        wrongScore: 0,
        unansweredScore: 0,
        allowNegativeMarking: false,
      };
      const res = this.calculateStudentScore(answers, qList, config, 375.0);

      const passed =
        res.raw_score === 75 &&
        res.maxPossibleRawScore === 100 &&
        res.final_score === 375 &&
        res.percentage === 75;

      tests.push({
        name: '8. Max Score Kustom (Skala Standar 500)',
        passed,
        expected: {
          rawScore: 75,
          finalScore: 375,
          percentage: 75,
          correctCount: 3,
          incorrectCount: 1,
          unansweredCount: 0,
          status: 'MATCH',
        },
        actual: {
          rawScore: res.raw_score,
          finalScore: res.final_score,
          percentage: res.percentage,
          correctCount: res.correct_count,
          incorrectCount: res.incorrect_count,
          unansweredCount: res.unanswered_count,
          status: res.scoring_status,
        },
        message: passed
          ? 'Perhitungan manual dan engine identik: Skala MaxScore 500 -> Raw 75/100, Final 375.0, 75.0%'
          : 'Ketidaksesuaian nilai pada tes Max Score Kustom',
      });
    }

    // -------------------------------------------------------------
    // TEST 9: Google Form Match (Selisih <= 0.01)
    // Skor hitung: 80.00, Skor GForm: 80.00 -> Selisih 0.00 -> MATCH
    // -------------------------------------------------------------
    {
      const qList = makeQuestions([1, 1, 1, 1, 1]);
      const answers = {
        'TEST-Q001': 'A',
        'TEST-Q002': 'A',
        'TEST-Q003': 'A',
        'TEST-Q004': 'A',
        'TEST-Q005': 'B',
      };
      const config: ScoringConfig = {
        scoringType: 'EQUAL_WEIGHT',
        maxScore: 100,
        correctScore: 4,
        wrongScore: 0,
        unansweredScore: 0,
        allowNegativeMarking: false,
      };
      const res = this.calculateStudentScore(answers, qList, config, 80.0);

      const passed =
        res.final_score === 80 &&
        res.google_form_score === 80 &&
        res.score_difference === 0 &&
        res.scoring_status === 'MATCH';

      tests.push({
        name: '9. Google Form Match (Selisih <= 0.01)',
        passed,
        expected: {
          rawScore: 16,
          finalScore: 80,
          percentage: 80,
          correctCount: 4,
          incorrectCount: 1,
          unansweredCount: 0,
          status: 'MATCH',
        },
        actual: {
          rawScore: res.raw_score,
          finalScore: res.final_score,
          percentage: res.percentage,
          correctCount: res.correct_count,
          incorrectCount: res.incorrect_count,
          unansweredCount: res.unanswered_count,
          status: res.scoring_status,
        },
        message: passed
          ? 'Perhitungan manual dan engine identik: GForm 80.0 vs Hitung 80.0 -> Selisih 0.00 -> MATCH'
          : 'Ketidaksesuaian status pada tes Google Form Match',
      });
    }

    // -------------------------------------------------------------
    // TEST 10: Google Form Mismatch (Selisih > 0.01 - No Silent Overwrite)
    // Skor hitung: 60.00, Skor GForm: 85.00 -> Selisih 25.00 -> SCORING_MISMATCH
    // CRITICAL: Raw answer tidak diubah, GForm score tidak diubah, status SCORING_MISMATCH ditandai
    // -------------------------------------------------------------
    {
      const qList = makeQuestions([1, 1, 1, 1, 1]);
      const answers = {
        'TEST-Q001': 'A',
        'TEST-Q002': 'A',
        'TEST-Q003': 'A',
        'TEST-Q004': 'B',
        'TEST-Q005': 'B',
      };
      const config: ScoringConfig = {
        scoringType: 'EQUAL_WEIGHT',
        maxScore: 100,
        correctScore: 4,
        wrongScore: 0,
        unansweredScore: 0,
        allowNegativeMarking: false,
      };
      // GForm claims 85.00, but student actually scored 60.00
      const res = this.calculateStudentScore(answers, qList, config, 85.0);

      const passed =
        res.final_score === 60 &&
        res.google_form_score === 85 &&
        res.score_difference === 25 &&
        res.scoring_status === 'SCORING_MISMATCH' &&
        answers['TEST-Q001'] === 'A' && // Raw answer untouched
        answers['TEST-Q004'] === 'B';   // Raw answer untouched

      tests.push({
        name: '10. Google Form Mismatch (No Silent Overwrite)',
        passed,
        expected: {
          rawScore: 12,
          finalScore: 60,
          percentage: 60,
          correctCount: 3,
          incorrectCount: 2,
          unansweredCount: 0,
          status: 'SCORING_MISMATCH',
        },
        actual: {
          rawScore: res.raw_score,
          finalScore: res.final_score,
          percentage: res.percentage,
          correctCount: res.correct_count,
          incorrectCount: res.incorrect_count,
          unansweredCount: res.unanswered_count,
          status: res.scoring_status,
        },
        message: passed
          ? 'Perhitungan manual dan engine identik: GForm 85.0 vs Hitung 60.0 -> Selisih 25.00 -> SCORING_MISMATCH terverifikasi tanpa overwrite'
          : 'Ketidaksesuaian status pada tes Google Form Mismatch',
      });
    }

    return {
      passed: tests.every(t => t.passed),
      tests,
    };
  }
}
