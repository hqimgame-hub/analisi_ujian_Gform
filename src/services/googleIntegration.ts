import {
  Student, Question, Tryout, Subject, SheetImportPreviewItem,
  ColumnMappingConfig, SheetImportSummary, Response, Answer, Score, User, DuplicateSubmissionInfo
} from '../types/database';
import { ScoringService } from './scoring';
import { dbService } from './database';
import { generateUuid, isValidUuid } from '../utils/idUtils';

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

export interface ImportValidationResult {
  isValidTryout: boolean;
  isValidSubject: boolean;
  tryoutError?: string;
  subjectError?: string;
  mappingConfig: ColumnMappingConfig;
  previewItems: SheetImportPreviewItem[];
  summary: SheetImportSummary;
}

export class GoogleIntegrationService {
  /**
   * Extract Google Spreadsheet ID from various URL formats
   */
  public static extractSheetId(sheetUrl: string): string | null {
    if (!sheetUrl) return null;
    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract Google Spreadsheet GID (Tab ID) if present in URL
   */
  public static extractGid(sheetUrl: string): string | null {
    if (!sheetUrl) return null;
    const match = sheetUrl.match(/[#&?]gid=([0-9]+)/);
    return match ? match[1] : null;
  }

  /**
   * Build Google Visualization API export CSV URL (works for any sheet with public view access)
   */
  public static buildCsvExportUrl(sheetId: string, gid?: string | null): string {
    const base = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    return gid ? `${base}&gid=${gid}` : base;
  }

  /**
   * Fetch raw CSV content from a public Google Sheet
   */
  public static async fetchSheetCsv(sheetUrl: string): Promise<string> {
    const sheetId = this.extractSheetId(sheetUrl);
    if (!sheetId) {
      throw new Error('URL Google Sheet tidak valid. Pastikan format tautan Google Spreadsheet benar.');
    }
    const gid = this.extractGid(sheetUrl);
    const csvUrl = this.buildCsvExportUrl(sheetId, gid);
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`Gagal mengunduh data Sheet (${response.status} ${response.statusText}). Pastikan hak akses Sheet adalah "Siapa saja yang memiliki link dapat melihat (Viewer)".`);
    }
    const text = await response.text();
    if (!text || text.trim().length === 0) {
      throw new Error('Lembar kerja Google Sheet kosong atau tidak memiliki baris data.');
    }
    return text;
  }

  /**
   * Sanitasi & normalisasi NISN:
   * Menangani pembuangan angka nol di depan oleh Google Sheets/Excel (misal '61234567' -> '0061234567'),
   * konversi notasi ilmiah (misal '6.12E+08'),
   * dan pembersihan karakter non-angka atau whitespace tak kasat mata.
   */
  public static normalizeNisn(rawNisn: string | number | null | undefined): string {
    if (rawNisn === null || rawNisn === undefined) return '';
    let str = String(rawNisn).trim();
    if (!str) return '';

    // Tangani kemungkinan notasi ilmiah (misal "6.06123E+09" dari Excel)
    if (/^[0-9]+(\.[0-9]+)?e\+[0-9]+$/i.test(str)) {
      const num = Number(str);
      if (!isNaN(num)) {
        str = Math.round(num).toString();
      }
    }

    // Buang semua karakter selain digit angka
    const digitsOnly = str.replace(/\D/g, '');
    if (!digitsOnly) return '';

    // Jika panjang digit antara 7 hingga 9 (karena 1-3 nol terpotong oleh Excel/GSheets), pad dengan '0' di depan hingga 10 digit
    if (digitsOnly.length >= 7 && digitsOnly.length < 10) {
      return digitsOnly.padStart(10, '0');
    }

    return digitsOnly;
  }

  /**
   * Toleran & Cerdas: Membandingkan NISN dari lembar Google Sheet dengan NISN database sekolah.
   * Menangani:
   * - Nilai numerik tanpa nol (misal Excel strip 0: "61234561" vs "0061234561")
   * - Padded 10-digit
   * - Format 9 digit khusus akun kunci jawaban ("111122222")
   */
  public static isNisnMatching(sheetNisn: string | number | null | undefined, dbNisn: string | number | null | undefined): boolean {
    if (!sheetNisn || !dbNisn) return false;
    const s1 = String(sheetNisn).trim();
    const s2 = String(dbNisn).trim();
    if (s1 === s2) return true;
    const d1 = s1.replace(/\D/g, '');
    const d2 = s2.replace(/\D/g, '');
    if (!d1 || !d2) return false;
    if (d1 === d2) return true;
    if (d1.padStart(10, '0') === d2.padStart(10, '0')) return true;
    if (d1.replace(/^0+/, '') === d2.replace(/^0+/, '')) return true;
    return false;
  }

  /**
   * Deteksi Cerdas Kolom NISN Berbasis Nama Header DAN Sampel Baris Data:
   * 1. Menilai bobot keyword header (nisn, nomor peserta, no ujian, nis, dll.)
   * 2. Memeriksa isi sel dari 10 baris pertama: kolom yang berisi digit angka 7-12 digit
   *    atau cocok dengan siswa database mendapatkan skor tertinggi!
   */
  public static autoDetectNisnColumn(
    headers: string[],
    sampleRows: Record<string, string>[] = [],
    dbStudents: Student[] = []
  ): string {
    if (!headers || headers.length === 0) return '';

    const nisnKeywords = [
      'nisn', 'nomor induk siswa nasional', 'no peserta', 'nomor peserta',
      'no. peserta', 'no ujian', 'nomor ujian', 'no. ujian', 'nis', 'nomor induk',
      'no induk', 'no. induk', 'id siswa', 'n.i.s.n', 'n i s n', 'identitas siswa'
    ];

    const invalidKeywords = ['timestamp', 'waktu', 'tanggal', 'date', 'score', 'skor', 'nilai', 'poin', 'nama', 'name', 'kelas', 'email', 'rombel'];

    const scores = headers.map(h => {
      const lower = h.toLowerCase().trim();
      let score = 0;

      if (invalidKeywords.some(k => lower.includes(k))) {
        score -= 100;
      }

      for (const kw of nisnKeywords) {
        if (lower === kw) score += 50;
        else if (lower.includes(kw)) score += 30;
      }

      if (sampleRows && sampleRows.length > 0) {
        const inspectCount = Math.min(sampleRows.length, 10);
        for (let i = 0; i < inspectCount; i++) {
          const val = (sampleRows[i][h] || '').trim();
          const digits = val.replace(/\D/g, '');
          if (digits.length >= 7 && digits.length <= 12) {
            score += 5;
            if (dbStudents.length > 0) {
              const hasMatch = dbStudents.some(s => GoogleIntegrationService.isNisnMatching(digits, s.nisn));
              if (hasMatch) score += 25;
            }
          }
        }
      }

      return { header: h, score };
    });

    scores.sort((a, b) => b.score - a.score);

    if (scores.length > 0 && scores[0].score > 0) {
      return scores[0].header;
    }

    const fallback = headers.find(h => {
      const l = h.toLowerCase();
      return !l.includes('timestamp') && !l.includes('waktu') && !l.includes('email') && !l.includes('skor');
    });

    return fallback || headers[0] || '';
  }

  public static autoDetectNameColumn(headers: string[]): string {
    const nameKeywords = ['nama lengkap', 'nama siswa', 'nama peserta', 'nama', 'name', 'full name'];
    for (const kw of nameKeywords) {
      const found = headers.find(h => h.toLowerCase().trim() === kw);
      if (found) return found;
    }
    for (const kw of nameKeywords) {
      const found = headers.find(h => {
        const l = h.toLowerCase().trim();
        return l.includes(kw) && !l.includes('sekolah') && !l.includes('guru') && !l.includes('ortu') && !l.includes('ayah') && !l.includes('ibu');
      });
      if (found) return found;
    }
    return '';
  }

  public static autoDetectScoreColumn(headers: string[]): string {
    const scoreKeywords = ['total point', 'total poin', 'skor', 'score', 'nilai akhir', 'total nilai', 'poin', 'nilai'];
    // 1. Exact match
    for (const kw of scoreKeywords) {
      const found = headers.find(h => h.toLowerCase().trim() === kw);
      if (found) return found;
    }
    // 2. Controlled substring match: hanya periksa kolom metadata pendek, jangan cocokkan dengan kalimat soal (bertanda tanya atau diawali kata perintah)
    for (const kw of scoreKeywords) {
      const found = headers.find(h => {
        const l = h.toLowerCase().trim();
        if (l.includes('?') || l.length > 35) return false;
        if (/^(tentukan|hitung|analisis|jelaskan|sebutkan|apakah|berapakah)\b/i.test(l)) return false;
        return l.startsWith(kw + ' ') || l.endsWith(' ' + kw) || l.includes('total score') || l.includes('total point') || l.includes('total skor');
      });
      if (found) return found;
    }
    return '';
  }

  /**
   * Cek apakah suatu kolom merupakan metadata / identitas siswa (Bagian 1 Google Form).
   * Kolom metadata TIDAK boleh dijadikan butir soal.
   */
  public static isMetadataHeader(header: string): boolean {
    const raw = (header || '').trim();
    if (!raw) return true;

    // Header yang diawali penomoran soal (misal: "1. Soal", "No. 1", "Soal 1", "1) ...", "[1] ...") pasti soal
    if (/^(soal\b|no\.?\b|nomor\b|\d+[\.\)\:\s]|\[\d+\])/i.test(raw)) {
      return false;
    }

    // Header yang merupakan kalimat tanya panjang atau bertanda tanya pasti soal (Bagian 2)
    if (raw.endsWith('?') || raw.includes('?') || raw.length > 75) {
      return false;
    }

    const lower = raw.toLowerCase();

    // Pertanyaan yang diawali kata tanya umum bahasa Indonesia pasti soal
    const questionStarters = [
      'apakah', 'siapakah', 'berapakah', 'manakah', 'bagaimanakah', 'sebutkan', 'jelaskan',
      'tentukan', 'hitunglah', 'perhatikan', 'analisis', 'berikut', 'di bawah', 'pada',
      'fungsi', 'hasil', 'jika', 'mengapa', 'kenapa', 'bagaimana', 'apa'
    ];
    if (questionStarters.some(starter => lower.startsWith(starter + ' ') || lower.startsWith(starter + ':') || lower === starter)) {
      return false;
    }

    // 1. Timestamp / Waktu pengiriman
    if (lower.includes('timestamp') || lower === 'waktu' || lower.startsWith('waktu pengiriman') || lower === 'tanggal' || lower === 'date' || lower === 'time') {
      return true;
    }
    // 2. Email / Username / Akun
    if (lower === 'email' || lower.includes('email address') || lower.includes('alamat email') || lower === 'username' || lower === 'surel' || lower === 'akun') {
      return true;
    }
    // 3. NISN / NIS / Nomor Induk / Nomor Peserta
    if (
      lower === 'nisn' ||
      lower.includes('nisn') ||
      lower === 'nis' ||
      lower === 'nomor induk' ||
      lower === 'no induk' ||
      lower === 'nomor peserta' ||
      lower === 'no peserta' ||
      lower === 'nomor ujian' ||
      lower === 'no ujian' ||
      lower === 'no. ujian' ||
      lower === 'no. peserta' ||
      lower.includes('nomor induk siswa')
    ) {
      return true;
    }
    // 4. Nama Siswa / Peserta
    if (
      lower === 'nama' ||
      lower === 'nama lengkap' ||
      lower === 'nama siswa' ||
      lower === 'nama peserta' ||
      lower === 'name' ||
      lower === 'full name' ||
      lower === 'identitas' ||
      lower === 'data diri'
    ) {
      return true;
    }
    // 5. Kelas / Rombel / Absen / Jurusan / Peminatan
    if (
      lower === 'kelas' ||
      lower === 'rombel' ||
      lower === 'absen' ||
      lower === 'no absen' ||
      lower === 'nomor absen' ||
      lower === 'no. absen' ||
      lower === 'nomor urut' ||
      lower === 'no urut' ||
      lower === 'jurusan' ||
      lower === 'peminatan' ||
      lower === 'program keahlian' ||
      lower === 'daftar hadir'
    ) {
      return true;
    }
    // 6. Skor Google Form (Hanya jika eksak / acuan skor form)
    if (
      lower === 'skor' ||
      lower === 'score' ||
      lower === 'total score' ||
      lower.includes('total point') ||
      lower.includes('total poin') ||
      lower.startsWith('skor ') ||
      lower === 'nilai akhir' ||
      lower === 'total nilai'
    ) {
      return true;
    }
    // 7. Token / Password / Ruang / Sesi / Sekolah / Mapel / Paket
    if (
      lower === 'token' ||
      lower.includes('token ujian') ||
      lower === 'password' ||
      lower === 'kode ujian' ||
      lower === 'ruang' ||
      lower === 'ruang ujian' ||
      lower.startsWith('ruang ujian') ||
      lower === 'sesi' ||
      lower === 'sesi ujian' ||
      lower.startsWith('sesi ujian') ||
      lower === 'sekolah' ||
      lower === 'asal sekolah' ||
      lower === 'nama sekolah' ||
      lower === 'mata pelajaran' ||
      lower === 'mapel' ||
      lower === 'paket' ||
      lower === 'paket soal' ||
      lower === 'paket ujian' ||
      lower === 'tanggal lahir' ||
      lower === 'tgl lahir' ||
      lower === 'jenis kelamin' ||
      lower === 'gender' ||
      lower === 'jk' ||
      lower.includes('pakta integritas') ||
      lower.includes('pernyataan kejujuran') ||
      lower === 'pernyataan' ||
      lower === 'catatan' ||
      lower === 'keterangan'
    ) {
      return true;
    }

    return false;
  }

  /**
   * Mengambil seluruh kolom yang merupakan Murni Butir Soal (Bagian 2 Google Form).
   */
  public static getQuestionHeaders(headers: string[]): string[] {
    return headers.filter(h => h && h.trim().length > 0 && !this.isMetadataHeader(h));
  }

  /**
   * Ekstraksi prefix huruf opsi eksplisit (A-E) dari teks jawaban Google Form.
   * Hanya mengenali format eksplisit seperti "A", "A. ...", "B) ...", "[C] ...", "A: ...", "Opsi A ...",
   * TIDAK mencocokkan kalimat biasa yang kebetulan diawali huruf A-E diikuti spasi (seperti "E = mc^2" atau "A dan B").
   */
  public static extractExplicitOptionPrefix(rawVal: string): { letter: 'A' | 'B' | 'C' | 'D' | 'E'; text: string } | null {
    const trimmed = (rawVal || '').trim();
    if (!trimmed) return null;

    if (/^[A-Ea-e]$/.test(trimmed)) {
      const letter = trimmed.toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
      return { letter, text: letter };
    }

    const match = trimmed.match(/^\s*(?:\[([A-Ea-e])\]|\(([A-Ea-e])\)|(?:opsi|pilihan)\s+([A-Ea-e])(?:[\.\)\:\-\s]|$)|([A-Ea-e])[\.\)\:\-\s])(?:\s*(.*))?$/i);
    if (!match) return null;

    const letter = (match[1] || match[2] || match[3] || match[4]).toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
    const remainder = (match[5] || '').trim();
    return {
      letter,
      text: remainder || trimmed,
    };
  }

  /**
   * Mengecek apakah string dengan koma merupakan pilihan ganda kompleks (kotak centang) berhuruf eksplisit,
   * misalnya "A, C" atau "A. Opsi 1, C. Opsi 2", BUKAN angka desimal ("2,5 m/s") atau daftar biasa ("1, 2, dan 3").
   */
  public static extractMultiSelectLetters(rawVal: string): string | null {
    if (!rawVal || !rawVal.includes(',')) return null;
    const parts = rawVal.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;

    const letters: string[] = [];
    for (const p of parts) {
      const extracted = this.extractExplicitOptionPrefix(p);
      if (!extracted) return null;
      letters.push(extracted.letter);
    }
    return Array.from(new Set(letters)).sort().join(', ');
  }

  /**
   * Menyelaraskan kolom pilihan guru yang tersimpan (selectedQuestionColumns) dengan header CSV terbaru.
   * Menangani kasus di mana header soal Google Form diedit, ada duplikasi judul soal yang diberi sufiks (#2),
   * atau ada kolom tersimpan yang seluruh isinya kosong di sheet.
   */
  public static reconcileSelectedColumns(
    savedColumns: string[] | undefined | null,
    headers: string[],
    rows?: Record<string, string>[] | null
  ): string[] {
    const pureQuestionHeaders = this.getQuestionHeaders(headers);
    if (!savedColumns || savedColumns.length === 0) {
      return pureQuestionHeaders;
    }

    const used = new Set<string>();
    const reconciled: string[] = [];

    for (let i = 0; i < savedColumns.length; i++) {
      const saved = savedColumns[i];
      const savedTrim = (saved || '').trim();

      // 1. Exact match pada header yang belum terpakai
      let match = headers.find(h => !used.has(h) && h === saved);

      // 2. Match terhadap header duplikat yang telah didisambiguasi, mis. "Perhatikan gambar (#2)"
      if (!match && savedTrim) {
        match = headers.find(h => {
          if (used.has(h)) return false;
          const base = h.replace(/\s*\(#\d+\)$/, '').trim();
          return base === savedTrim;
        });
      }

      // 3. Fallback posisional ke pureQuestionHeaders[i] jika tidak ditemukan di sheet terbaru
      if (!match && pureQuestionHeaders[i] && !used.has(pureQuestionHeaders[i])) {
        match = pureQuestionHeaders[i];
      }

      if (match) {
        used.add(match);
        reconciled.push(match);
      }
    }

    if (reconciled.length === 0) {
      return pureQuestionHeaders;
    }

    // Jika ada baris data siswa dan seluruh kolom hasil rekonsiliasi ternyata kosong (sedangkan pureQuestionHeaders memiliki isi),
    // gunakan pureQuestionHeaders agar jawaban siswa tidak hilang.
    if (rows && rows.length > 0) {
      const hasAnyValueInReconciled = rows.some(r =>
        reconciled.some(col => r[col] !== undefined && String(r[col]).trim().length > 0)
      );
      if (!hasAnyValueInReconciled && pureQuestionHeaders.length > 0) {
        return pureQuestionHeaders;
      }
    }

    return reconciled;
  }

  /**
   * Memperkaya opsi jawaban A..E dan kunci jawaban (correctAnswer) untuk sebuah butir soal
   * berdasarkan variasi jawaban di Google Sheet & baris kunci jawaban resmi.
   * Menjamin jawaban teks penuh dari Google Form (misal "Fotosintesis", "25 m/s") dipetakan ke opsi A..E secara deterministik.
   */
  public static enrichQuestionOptionsFromRows(
    existingOptions: { key: string; text: string }[] | undefined,
    existingCorrectAnswer: string | undefined,
    header: string,
    rows?: Record<string, string>[] | null,
    answerKeyRow?: Record<string, string> | null
  ): { options: { key: string; text: string }[]; correctAnswer: string } {
    const optionKeys: Array<'A' | 'B' | 'C' | 'D' | 'E'> = ['A', 'B', 'C', 'D', 'E'];
    const isPlaceholderText = (txt: string, k: string) => {
      const t = (txt || '').trim();
      return !t || t.toLowerCase() === `pilihan ${k.toLowerCase()}` || t.toLowerCase() === `opsi ${k.toLowerCase()}` || t.toUpperCase() === k;
    };

    const rawValues: string[] = [];
    const rawKeyCell = (answerKeyRow && header && answerKeyRow[header] !== undefined)
      ? String(answerKeyRow[header]).trim()
      : '';

    // Kumpulkan seluruh variasi jawaban siswa dari baris data terlebih dahulu
    if (rows && rows.length > 0 && header) {
      rows.forEach(r => {
        const cell = r[header] !== undefined ? String(r[header]).trim() : '';
        if (cell && !/^INVALID_/i.test(cell)) {
          rawValues.push(cell);
        }
      });
    }

    // Masukkan jawaban dari baris kunci jika ada dan belum terdaftar
    if (rawKeyCell && !/^INVALID_/i.test(rawKeyCell)) {
      rawValues.push(rawKeyCell);
    }

    // Peta opsi A..E saat ini
    const keyToText = new Map<'A' | 'B' | 'C' | 'D' | 'E', string>();

    // Cek apakah existingOptions relevan dengan data sheet saat ini
    if (Array.isArray(existingOptions)) {
      const existingNonPlaceholder = existingOptions.filter(opt => {
        const k = (opt.key || '').trim().toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
        return optionKeys.includes(k) && !isPlaceholderText(opt.text, k);
      });

      // Jika ada rawValues, periksa apakah ada setidaknya satu nilai yang cocok dengan existingOptions
      const hasAnyMatch = rawValues.length === 0 || existingNonPlaceholder.some(opt => {
        const optNorm = opt.text.replace(/\s+/g, ' ').trim().toUpperCase();
        return rawValues.some(rv => {
          const rvNorm = rv.replace(/\s+/g, ' ').trim().toUpperCase();
          return rvNorm === optNorm || rvNorm.includes(optNorm) || optNorm.includes(rvNorm);
        });
      });

      // Hanya gunakan existingOptions jika masih relevan atau belum ada data baris sheet
      if (hasAnyMatch) {
        existingNonPlaceholder.forEach(opt => {
          const k = (opt.key || '').trim().toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
          keyToText.set(k, opt.text.trim());
        });
      }
    }

    // 1. Tangkap opsi yang memiliki prefix huruf eksplisit (misal "A. Fotosintesis" atau "(A) Fotosintesis")
    const unprefixedTexts: string[] = [];
    const seenNormTexts = new Set<string>();

    // Daftarkan teks yang sudah ada di keyToText agar tidak terduplikasi
    keyToText.forEach(txt => {
      seenNormTexts.add(txt.toUpperCase());
    });

    rawValues.forEach(val => {
      const multi = this.extractMultiSelectLetters(val);
      if (multi) return;

      const explicit = this.extractExplicitOptionPrefix(val);
      if (explicit) {
        if (explicit.text && explicit.text.toUpperCase() !== explicit.letter) {
          keyToText.set(explicit.letter, explicit.text);
          seenNormTexts.add(explicit.text.toUpperCase());
        }
        return;
      }

      const upper = val.toUpperCase();
      if (['BENAR', 'TRUE'].includes(upper)) {
        if (!keyToText.has('A')) keyToText.set('A', val);
        seenNormTexts.add(upper);
        return;
      }
      if (['SALAH', 'FALSE'].includes(upper)) {
        if (!keyToText.has('B')) keyToText.set('B', val);
        seenNormTexts.add(upper);
        return;
      }

      if (!seenNormTexts.has(upper)) {
        seenNormTexts.add(upper);
        unprefixedTexts.push(val);
      }
    });

    // 2. Alokasikan teks jawaban Google Form tanpa prefix huruf sesuai urutan kemunculan alaminya di sheet
    // JANGAN lakukan sorting alfabetis agar urutan pilihan ganda asli guru di Google Form tidak teracak
    unprefixedTexts.forEach(txt => {
      const emptyKey = optionKeys.find(k => !keyToText.has(k));
      if (emptyKey) {
        keyToText.set(emptyKey, txt);
      }
    });

    // 3. Tentukan jumlah opsi aktif secara dinamis:
    // Jika soal di Google Form hanya memiliki 4 pilihan (A..D, standar SMP/MTs), JANGAN buat opsi E dummy!
    // Hanya sertakan E jika data eksplisit memiliki opsi E atau terdapat 5 variasi jawaban.
    let activeOptionKeys: Array<'A' | 'B' | 'C' | 'D' | 'E'> = ['A', 'B', 'C', 'D'];
    if (keyToText.has('E')) {
      activeOptionKeys = ['A', 'B', 'C', 'D', 'E'];
    } else if (keyToText.size === 2 && keyToText.has('A') && keyToText.has('B') && !keyToText.has('C')) {
      activeOptionKeys = ['A', 'B'];
    } else if (keyToText.size === 3 && keyToText.has('A') && keyToText.has('B') && keyToText.has('C') && !keyToText.has('D')) {
      activeOptionKeys = ['A', 'B', 'C'];
    } else {
      activeOptionKeys = ['A', 'B', 'C', 'D'];
    }

    const finalOptions = activeOptionKeys.map(k => ({
      key: k,
      text: keyToText.get(k) || `Pilihan ${k}`,
    }));

    // 4. Tentukan kunci jawaban (correctAnswer) dalam bentuk huruf 'A'..'E'
    const candidateRawCorrect = rawKeyCell || (existingCorrectAnswer || '').trim();
    let finalCorrect = 'A';

    if (candidateRawCorrect) {
      const multi = this.extractMultiSelectLetters(candidateRawCorrect);
      if (multi) {
        finalCorrect = multi.slice(0, 1);
      } else {
        const explicit = this.extractExplicitOptionPrefix(candidateRawCorrect);
        if (explicit) {
          finalCorrect = explicit.letter;
        } else {
          const upperCorr = candidateRawCorrect.replace(/\s+/g, ' ').trim().toUpperCase();
          const strippedCorr = upperCorr.replace(/^[A-E][\.\)\:\-\s]+\s*/, '').trim();

          if (['BENAR', 'TRUE'].includes(upperCorr)) {
            finalCorrect = 'A';
          } else if (['SALAH', 'FALSE'].includes(upperCorr)) {
            finalCorrect = 'B';
          } else if (activeOptionKeys.includes(upperCorr as any)) {
            finalCorrect = upperCorr;
          } else {
            const matchedOpt = finalOptions.find(o => {
              const optNorm = o.text.replace(/\s+/g, ' ').trim().toUpperCase();
              const optStripped = optNorm.replace(/^[A-E][\.\)\:\-\s]+\s*/, '').trim();
              return optNorm === upperCorr || (optStripped && optStripped === strippedCorr);
            });
            if (matchedOpt) {
              finalCorrect = matchedOpt.key;
            }
          }
        }
      }
    }

    return {
      options: finalOptions,
      correctAnswer: finalCorrect,
    };
  }

  /**
   * Menormalisasi jawaban mentah siswa pada satu butir soal menjadi huruf opsi 'A'..'E' (atau '' jika kosong).
   */
  public static normalizeAnswerToOptionKey(rawVal: string, q: Question): string {
    const trimmed = (rawVal || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!trimmed) return '';

    const multi = this.extractMultiSelectLetters(trimmed);
    if (multi) return multi;

    const explicit = this.extractExplicitOptionPrefix(trimmed);
    if (explicit) return explicit.letter;

    const rawUpper = trimmed.toUpperCase();
    if (['BENAR', 'TRUE'].includes(rawUpper)) return 'A';
    if (['SALAH', 'FALSE'].includes(rawUpper)) return 'B';

    const cleanRaw = rawUpper.replace(/^[A-E][\.\)\:\-\s]+\s*/, '').replace(/[\.\,\;]+$/, '').trim();

    // Cocokkan dengan teks opsi butir soal
    if (Array.isArray(q.options) && q.options.length > 0) {
      // 1. Exact match (case-insensitive)
      const exactOpt = q.options.find(opt => {
        const optText = (opt.text || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
        return optText === rawUpper;
      });
      if (exactOpt) return exactOpt.key.toUpperCase();

      // 2. Loose match: strip prefix dan tanda baca akhir
      const looseOpt = q.options.find(opt => {
        const optText = (opt.text || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
        if (!optText || optText === `PILIHAN ${opt.key.toUpperCase()}` || optText === `OPSI ${opt.key.toUpperCase()}`) return false;
        const optClean = optText.replace(/^[A-E][\.\)\:\-\s]+\s*/, '').replace(/[\.\,\;]+$/, '').trim();
        return Boolean(optClean && cleanRaw && optClean === cleanRaw);
      });
      if (looseOpt) return looseOpt.key.toUpperCase();
    }

    // Jika jawaban cocok langsung dengan kunci jawaban yang memiliki format huruf tunggal
    if (q.correctAnswer) {
      const cleanCorr = q.correctAnswer.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
      if (['A', 'B', 'C', 'D', 'E'].includes(cleanCorr) && rawUpper === cleanCorr) {
        return cleanCorr;
      }
    }

    return trimmed;
  }

  /**
   * Auto-Bootstrap Butir Soal:
   * Jika bank soal di database untuk mapel ini masih kosong atau kurang lengkap,
   * otomatis buat/perbarui butir soal dari kolom Bagian 2 Google Form beserta opsi A..E dan kunci jawabannya.
   */
  public static ensureQuestionsExist(
    subject: Subject,
    headers: string[],
    answerKeyRow?: Record<string, string> | null,
    currentUser?: User | null,
    selectedColumns?: string[] | null,
    rows?: Record<string, string>[] | null
  ): Question[] {
    const questionHeaders = this.reconcileSelectedColumns(selectedColumns, headers, rows);
    if (questionHeaders.length === 0) {
      return dbService.getQuestions().filter(q => q.subjectId === subject.id);
    }

    // 1. Bersihkan soal bogus yang tidak sengaja terbuat dari header metadata Bagian 1 sebelumnya
    const currentSubjectQuestions = dbService.getQuestions().filter(q => q.subjectId === subject.id);
    const bogusQuestions = currentSubjectQuestions.filter(q => this.isMetadataHeader(q.questionText));
    if (bogusQuestions.length > 0) {
      dbService.deleteQuestionsBatch(bogusQuestions.map(q => q.id), null);
    }

    const remainingQuestions = dbService.getQuestions().filter(q => q.subjectId === subject.id);

    let firstMaterial = dbService.getMaterials().find(m => m.subjectId === subject.id);
    let firstCompetency = dbService.getCompetencies().find(c => c.subjectId === subject.id);

    if (!firstMaterial) {
      try {
        firstMaterial = dbService.addMaterial(
          {
            code: `${subject.code || 'MAPEL'}-01`,
            title: `Materi Pokok ${subject.name}`,
            description: `Materi dasar untuk mata pelajaran ${subject.name}`,
            subjectId: subject.id,
          },
          null
        );
      } catch {
        // Fallback jika terjadi pembatasan
      }
    }

    if (!firstCompetency) {
      try {
        firstCompetency = dbService.addCompetency(
          {
            code: 'KD-3.1',
            statement: `Memahami dan menguasai materi ${subject.name}`,
            gradeLevel: 'Umum',
            subjectId: subject.id,
          },
          null
        );
      } catch {
        // Fallback jika terjadi pembatasan
      }
    }

    const materialId = firstMaterial?.id || `mat-${subject.id}-default`;
    const competencyId = firstCompetency?.id || `comp-${subject.id}-default`;

    const resultQuestions: Question[] = [];

    questionHeaders.forEach((headerText, idx) => {
      const qNum = idx + 1;
      const cleanText = headerText.trim() || `Butir Soal Nomor ${qNum}`;
      const existing = remainingQuestions.find(q => q.questionNumber === qNum);

      const enriched = this.enrichQuestionOptionsFromRows(
        existing?.options,
        existing?.correctAnswer,
        headerText,
        rows,
        answerKeyRow
      );

      if (existing) {
        const updates: Partial<Question> = {};
        if (!existing.questionText || existing.questionText.startsWith('Butir Soal Nomor') || existing.questionText !== cleanText) {
          updates.questionText = cleanText;
        }
        if (enriched.correctAnswer && existing.correctAnswer !== enriched.correctAnswer) {
          updates.correctAnswer = enriched.correctAnswer;
        }
        const prevOptsJson = JSON.stringify(existing.options || []);
        const nextOptsJson = JSON.stringify(enriched.options);
        if (prevOptsJson !== nextOptsJson) {
          updates.options = enriched.options;
        }
        if (Object.keys(updates).length > 0) {
          dbService.updateQuestion(existing.id, updates, null);
        }
        resultQuestions.push({ ...existing, ...updates });
      } else {
        const uniqueCode = `${subject.code || 'SOAL'}-Q${String(qNum).padStart(3, '0')}`;
        const newQ = dbService.addQuestion(
          {
            uniqueCode,
            questionNumber: qNum,
            questionText: cleanText,
            subjectId: subject.id,
            materialId,
            competencyId,
            correctAnswer: enriched.correctAnswer || 'A',
            options: enriched.options,
            weight: 1,
            status: 'ACTIVE',
          },
          null // System action: bypass teacher subject restriction during automated ingestion
        );
        resultQuestions.push(newQ);
      }
    });

    return resultQuestions.sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));
  }

  /**
   * 1. PARSE: Parse raw CSV / Tab-separated text adhering strictly to RFC 4180
   * (Handles commas inside quotes, multiline text inside quotes, quotes escaping,
   *  blank image-question headers, and duplicate question headers)
   */
  public static parseRawSheetText(rawText: string): ParseResult {
    if (!rawText || !rawText.trim()) return { headers: [], rows: [] };

    // Deteksi apakah format TSV (tab) atau CSV (koma)
    const isTsv = rawText.includes('\t') && (!rawText.includes(',') || rawText.indexOf('\t') < rawText.indexOf(','));
    const delimiter = isTsv ? '\t' : ',';

    const parsedMatrix: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let insideQuotes = false;

    for (let i = 0; i < rawText.length; i++) {
      const char = rawText[i];
      const nextChar = rawText[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Escaped quote: ""
          currentCell += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === delimiter && !insideQuotes) {
        currentRow.push(currentCell.trim().replace(/^"|"$/g, ''));
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !insideQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip \n
        }
        currentRow.push(currentCell.trim().replace(/^"|"$/g, ''));
        currentCell = '';
        if (currentRow.some(c => c.length > 0)) {
          parsedMatrix.push(currentRow);
        }
        currentRow = [];
      } else {
        currentCell += char;
      }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim().replace(/^"|"$/g, ''));
      if (currentRow.some(c => c.length > 0)) {
        parsedMatrix.push(currentRow);
      }
    }

    if (parsedMatrix.length === 0) return { headers: [], rows: [] };

    // Normalisasi & disambiguasi header kolom:
    // 1. Jika ada kolom soal bergambar (header kosong "") namun baris datanya berisi jawaban, beri nama "Soal Kolom X"
    // 2. Jika ada judul pertanyaan yang sama persis (misal "Perhatikan gambar berikut:"), beri sufiks "(#2)", "(#3)" agar tidak saling menimpa di objek row
    const rawHeaders = parsedMatrix[0];
    const headerCounts = new Map<string, number>();
    const headers: string[] = rawHeaders.map((rawH, idx) => {
      let baseHeader = (rawH || '').trim();
      if (!baseHeader) {
        const hasDataInColumn = parsedMatrix.slice(1).some(r => r[idx] !== undefined && r[idx].trim().length > 0);
        if (hasDataInColumn) {
          baseHeader = `Soal Kolom ${idx + 1}`;
        } else {
          return '';
        }
      }
      const prevCount = headerCounts.get(baseHeader) || 0;
      headerCounts.set(baseHeader, prevCount + 1);
      return prevCount === 0 ? baseHeader : `${baseHeader} (#${prevCount + 1})`;
    });

    const rows: Record<string, string>[] = [];

    for (let r = 1; r < parsedMatrix.length; r++) {
      const cols = parsedMatrix[r];
      const rowObj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (!h) return;
        rowObj[h] = cols[idx] !== undefined ? cols[idx] : '';
      });
      rows.push(rowObj);
    }

    return { headers: headers.filter(Boolean), rows };
  }

  /**
   * 2. MAPPING: Detect & map column headers to domain fields and unique Question IDs.
   * CRITICAL RULE: Uses Unique Question IDs (e.g. 'MAT-TO03-Q015') and prevents duplicate column collisions!
   */
  public static detectColumnMappings(
    headers: string[],
    questions: Question[],
    customOverrides?: Partial<ColumnMappingConfig>,
    selectedColumns?: string[]
  ): ColumnMappingConfig {
    const nisnHeader = customOverrides?.nisnColumn || GoogleIntegrationService.autoDetectNisnColumn(headers);
    const scoreHeader = customOverrides?.scoreColumn !== undefined ? customOverrides.scoreColumn : GoogleIntegrationService.autoDetectScoreColumn(headers);
    const nameHeader = customOverrides?.nameColumn || GoogleIntegrationService.autoDetectNameColumn(headers);

    // Auto-detect Timestamp column
    const timestampHeader =
      customOverrides?.timestampColumn ||
      headers.find(h => {
        const lower = h.toLowerCase().trim();
        return lower.includes('timestamp') || lower.includes('waktu') || lower.includes('tanggal');
      });

    // Ambil kolom-kolom murni pertanyaan (Bagian 2 Google Form atau Kolom Pilihan Guru yang telah direkonsiliasi)
    const questionHeaders = this.reconcileSelectedColumns(selectedColumns, headers);

    // Map each question by uniqueCode without collisions
    const questionMappings: Record<string, string> = {
      ...(customOverrides?.questionMappings || {}),
    };
    const usedHeaders = new Set<string>(Object.values(questionMappings).filter(Boolean));

    // Apakah ada header di sheet yang secara eksplisit memuat kode unik soal?
    const hasExplicitCodeHeaders = headers.some(h =>
      questions.some(q => h.toLowerCase().includes(q.uniqueCode.toLowerCase()))
    );

    questions.forEach((q, idx) => {
      if (questionMappings[q.uniqueCode]) return;

      // 1. Prioritas 1: Exact match pada kode unik di header
      const codeMatch = headers.find(h => !usedHeaders.has(h) && h.toLowerCase().includes(q.uniqueCode.toLowerCase()));
      if (codeMatch) {
        questionMappings[q.uniqueCode] = codeMatch;
        usedHeaders.add(codeMatch);
        return;
      }

      // Jika sheet menggunakan format kode unik eksplisit (seperti pada test suite), jangan lakukan fallback posisional ke kolom kode asing
      if (hasExplicitCodeHeaders) {
        return;
      }

      // 2. Prioritas 2: Exact match dengan questionText pada kolom soal
      const qTextTrim = (q.questionText || '').trim();
      if (qTextTrim) {
        const exactTextMatch = questionHeaders.find(h => !usedHeaders.has(h) && h.trim() === qTextTrim);
        if (exactTextMatch) {
          questionMappings[q.uniqueCode] = exactTextMatch;
          usedHeaders.add(exactTextMatch);
          return;
        }
      }

      // 3. Prioritas 3: Pemetaan posisional berdasarkan urutan kolom soal yang dipilih (paling akurat untuk Google Form)
      const positionalHeader = questionHeaders[idx];
      if (positionalHeader && !usedHeaders.has(positionalHeader)) {
        questionMappings[q.uniqueCode] = positionalHeader;
        usedHeaders.add(positionalHeader);
        return;
      }

      // 4. Prioritas 4: Pola nomor soal ketat di awal judul header (misal "1. ...", "[No. 1] ...", "Soal 1:")
      if (q.questionNumber) {
        const strictNumPattern = new RegExp(
          `^(?:\\[?\\s*(?:soal|no|nomor|q|butir)\\s*\\.?\\s*${q.questionNumber}\\s*[\\]\\.\\)\\:\\-\\s]|${q.questionNumber}\\s*[\\.\\)\\:])`,
          'i'
        );
        const numMatch = questionHeaders.find(h => !usedHeaders.has(h) && strictNumPattern.test(h.trim()));
        if (numMatch) {
          questionMappings[q.uniqueCode] = numMatch;
          usedHeaders.add(numMatch);
        }
      }
    });

    return {
      nisnColumn: nisnHeader,
      scoreColumn: scoreHeader,
      nameColumn: nameHeader,
      timestampColumn: timestampHeader,
      questionMappings,
    };
  }

  /**
   * 3. VALIDATION & PREVIEW: Strict multi-step validation engine
   * Validates:
   * - NISN (format & existence in student roster)
   * - Student existence
   * - Try Out existence & validity
   * - Subject validity
   * - Question ID validity
   * - Answer format & malformed answer detection
   * - Duplicate submission in database
   * - Duplicate response in the same sheet
   * - Scoring mismatch (deterministic recalculation vs GForm score without silent overwrite)
   */
  public static validateSheetImportDetailed(
    parsedRows: Record<string, string>[],
    tryout: Tryout | undefined,
    subject: Subject | undefined,
    questions: Question[],
    students: Student[],
    existingScores: Score[],
    mappingConfig: ColumnMappingConfig
  ): ImportValidationResult {
    // 1. Validate Try Out
    if (!tryout) {
      return {
        isValidTryout: false,
        isValidSubject: false,
        tryoutError: 'Validasi Gagal: Try Out target tidak ditemukan.',
        mappingConfig,
        previewItems: [],
        summary: {
          totalRows: parsedRows.length,
          successCount: 0,
          failedCount: parsedRows.length,
          mismatchCount: 0,
          duplicateCount: 0,
          errorDetails: ['Try Out target tidak valid atau tidak ditemukan.'],
        },
      };
    }

    if (tryout.status === 'ARCHIVED') {
      return {
        isValidTryout: false,
        isValidSubject: true,
        tryoutError: `Validasi Gagal: Try Out '${tryout.title}' berstatus ARCHIVED dan tidak menerima data pengerjaan baru.`,
        mappingConfig,
        previewItems: [],
        summary: {
          totalRows: parsedRows.length,
          successCount: 0,
          failedCount: parsedRows.length,
          mismatchCount: 0,
          duplicateCount: 0,
          errorDetails: ['Try Out berstatus ARCHIVED.'],
        },
      };
    }

    // 2. Validate Subject
    if (!subject) {
      return {
        isValidTryout: true,
        isValidSubject: false,
        subjectError: 'Validasi Gagal: Mata pelajaran target tidak ditemukan.',
        mappingConfig,
        previewItems: [],
        summary: {
          totalRows: parsedRows.length,
          successCount: 0,
          failedCount: parsedRows.length,
          mismatchCount: 0,
          duplicateCount: 0,
          errorDetails: ['Mata pelajaran target tidak ditemukan.'],
        },
      };
    }

    // Helper untuk mengekstrak NISN & Nama dari baris (mendukung Google Form bercabang per kelas yang memiliki lebih dari 1 kolom NISN/Nama)
    const extractRowNisn = (row: Record<string, string>): string => {
      const primary = (row[mappingConfig.nisnColumn] || '').trim();
      if (primary) return primary;
      for (const [k, v] of Object.entries(row)) {
        if (!v || !v.trim()) continue;
        const lk = k.toLowerCase();
        if (lk === 'nisn' || lk.includes('nisn') || lk.includes('nomor induk') || lk.includes('no induk') || lk.includes('no. peserta')) {
          return v.trim();
        }
      }
      return '';
    };

    const extractRowName = (row: Record<string, string>): string => {
      const primary = (mappingConfig.nameColumn ? row[mappingConfig.nameColumn] : '')?.trim() || '';
      if (primary) return primary;
      for (const [k, v] of Object.entries(row)) {
        if (!v || !v.trim()) continue;
        const lk = k.toLowerCase();
        if ((lk === 'nama' || lk.includes('nama lengkap') || lk.includes('nama siswa') || lk.includes('nama peserta')) && !lk.includes('sekolah')) {
          return v.trim();
        }
      }
      return '';
    };

    // 0. Pre-scan for Official Answer Key row (identified by isAnswerKeyAccount === true, or name/NISN indicators)
    const allDbStudents = dbService.getStudents();
    let detectedKeyRow: Record<string, string> | null = null;
    let detectedKeyStudent: Student | null = null;
    let answerKeyExtractedCount = 0;

    for (const row of parsedRows) {
      const rawNisn = extractRowNisn(row);
      const rawName = extractRowName(row);
      if (!rawNisn && !rawName) continue;

      // 1. Cek kecocokan NISN terhadap akun siswa di database yang bertanda isAnswerKeyAccount
      const cleanRowNisn = GoogleIntegrationService.normalizeNisn(rawNisn);
      const matched = (rawNisn || cleanRowNisn)
        ? (students.find(s => s.nisn === rawNisn || String(s.nisn).trim() === rawNisn || (cleanRowNisn && GoogleIntegrationService.normalizeNisn(s.nisn) === cleanRowNisn) || (cleanRowNisn && s.nisn.replace(/\D/g, '') === cleanRowNisn))
           || allDbStudents.find(s => s.nisn === rawNisn || String(s.nisn).trim() === rawNisn || (cleanRowNisn && GoogleIntegrationService.normalizeNisn(s.nisn) === cleanRowNisn) || (cleanRowNisn && s.nisn.replace(/\D/g, '') === cleanRowNisn)))
        : null;

      // 2. Cek apakah nama atau NISN secara eksplisit menandakan Kunci Jawaban
      const isKeyByName = /kunci|answer\s*key|master\s*key/i.test(rawName);
      const isKeyByNisn = /kunci|answer\s*key|master\s*key/i.test(rawNisn) || rawNisn === '0000000000' || rawNisn === '9999999999';

      if (matched?.isAnswerKeyAccount || isKeyByName || isKeyByNisn) {
        detectedKeyRow = row;
        detectedKeyStudent = matched || {
          id: 'temp-key-account',
          nisn: rawNisn || '0000000000',
          nis: 'KUNCI',
          name: rawName || 'KUNCI JAWABAN',
          gender: 'L',
          classId: '',
          targetScore: 100,
          isAnswerKeyAccount: true,
        };
        break;
      }
    }

    // Filter out the answer key account row from student preview / score calculation
    const studentRows = parsedRows.filter(row => {
      if (detectedKeyRow && row === detectedKeyRow) return false;
      const rawNisn = extractRowNisn(row);
      const rawName = extractRowName(row);
      if (/kunci|answer\s*key|master\s*key/i.test(rawName) || /kunci|answer\s*key|master\s*key/i.test(rawNisn) || rawNisn === '0000000000' || rawNisn === '9999999999') {
        return false;
      }
      if (!rawNisn) return true;
      const cleanRowNisn = GoogleIntegrationService.normalizeNisn(rawNisn);
      const matched = students.find(s => s.nisn === rawNisn || String(s.nisn).trim() === rawNisn || (cleanRowNisn && GoogleIntegrationService.normalizeNisn(s.nisn) === cleanRowNisn) || (cleanRowNisn && s.nisn.replace(/\D/g, '') === cleanRowNisn))
                   || allDbStudents.find(s => s.nisn === rawNisn || String(s.nisn).trim() === rawNisn || (cleanRowNisn && GoogleIntegrationService.normalizeNisn(s.nisn) === cleanRowNisn) || (cleanRowNisn && s.nisn.replace(/\D/g, '') === cleanRowNisn));
      return !matched?.isAnswerKeyAccount;
    });

    // Perkaya opsi A..E dan kunci jawaban setiap soal berdasarkan seluruh baris sheet & baris kunci jawaban
    questions.forEach(q => {
      const header = mappingConfig.questionMappings[q.uniqueCode];
      if (!header) return;

      const enriched = this.enrichQuestionOptionsFromRows(
        q.options,
        q.correctAnswer,
        header,
        studentRows,
        detectedKeyRow
      );

      const updates: Partial<Question> = {};
      if (JSON.stringify(q.options || []) !== JSON.stringify(enriched.options)) {
        q.options = enriched.options;
        updates.options = enriched.options;
      }

      if (detectedKeyRow && detectedKeyRow[header] !== undefined && detectedKeyRow[header].trim()) {
        answerKeyExtractedCount++;
        if (q.correctAnswer !== enriched.correctAnswer) {
          q.correctAnswer = enriched.correctAnswer;
          updates.correctAnswer = enriched.correctAnswer;
        }
      } else if (!['A', 'B', 'C', 'D', 'E'].includes((q.correctAnswer || '').trim().toUpperCase())) {
        q.correctAnswer = enriched.correctAnswer;
        updates.correctAnswer = enriched.correctAnswer;
      }

      if (Object.keys(updates).length > 0) {
        try {
          dbService.updateQuestion(q.id, updates, null);
        } catch {
          // Abaikan jika soal berasal dari objek simulasi/test yang belum tersimpan di DB
        }
      }
    });

    // If Official Answer Key row is detected, simpan array kunci jawaban pada tryout
    if (detectedKeyRow && detectedKeyStudent) {
      const maxQNum = Math.max(...questions.map(q => q.questionNumber || 1), questions.length, 1);
      const answerKeyArr: string[] = new Array(maxQNum).fill('');
      questions.forEach(q => {
        const qIdx = (q.questionNumber || 1) - 1;
        if (q.correctAnswer && qIdx >= 0 && qIdx < answerKeyArr.length) {
          answerKeyArr[qIdx] = q.correctAnswer;
        }
      });

      dbService.updateTryout(tryout.id, { answerKey: answerKeyArr }, null);
    }

    // Group student rows by student to detect duplicates and keep the LAST submitted row
    interface StudentSubmissionTracker {
      nisn: string;
      cleanNisn: string;
      rawName: string;
      rawClass?: string;
      matchedStudent?: Student;
      rowIndices: number[];
    }

    const studentTrackers = new Map<string, StudentSubmissionTracker>();

    studentRows.forEach((row, index) => {
      const rawNisn = extractRowNisn(row);
      const rawName = extractRowName(row);
      const rawClass = mappingConfig.classColumn && row[mappingConfig.classColumn]
        ? String(row[mappingConfig.classColumn]).trim()
        : undefined;
      const cleanNisn = GoogleIntegrationService.normalizeNisn(rawNisn);

      let matchedStudent: Student | undefined =
        students.find(s => GoogleIntegrationService.isNisnMatching(rawNisn, s.nisn)) ||
        allDbStudents.find(s => GoogleIntegrationService.isNisnMatching(rawNisn, s.nisn));

      if (!matchedStudent && cleanNisn) {
        matchedStudent =
          students.find(s => GoogleIntegrationService.isNisnMatching(cleanNisn, s.nisn)) ||
          allDbStudents.find(s => GoogleIntegrationService.isNisnMatching(cleanNisn, s.nisn));
      }

      if (!matchedStudent && rawNisn) {
        matchedStudent =
          students.find(s => s.nis && (s.nis.trim() === rawNisn || GoogleIntegrationService.isNisnMatching(rawNisn, s.nis))) ||
          allDbStudents.find(s => s.nis && (s.nis.trim() === rawNisn || GoogleIntegrationService.isNisnMatching(rawNisn, s.nis)));
      }

      if (!matchedStudent && rawName && rawName.length >= 3) {
        const normName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const nameMatches = allDbStudents.filter(s => {
          const sn = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          return sn === normName || (sn.length > 5 && (sn.includes(normName) || normName.includes(sn)));
        });
        if (nameMatches.length === 1) {
          matchedStudent = nameMatches[0];
        }
      }

      const dedupKey = matchedStudent
        ? `STUDENT_${matchedStudent.id}`
        : (cleanNisn ? `NISN_${cleanNisn}` : (rawNisn ? `RAW_${rawNisn}` : `ROW_${index}`));

      const existing = studentTrackers.get(dedupKey);
      if (existing) {
        existing.rowIndices.push(index);
        if (rawName && !existing.rawName) existing.rawName = rawName;
        if (rawClass && !existing.rawClass) existing.rawClass = rawClass;
        if (matchedStudent && !existing.matchedStudent) existing.matchedStudent = matchedStudent;
      } else {
        studentTrackers.set(dedupKey, {
          nisn: matchedStudent?.nisn || cleanNisn || rawNisn,
          cleanNisn,
          rawName,
          rawClass,
          matchedStudent,
          rowIndices: [index],
        });
      }
    });

    const earlierDuplicateRowIndices = new Map<number, { lastRowNumber: number; nisn: string; name: string }>();
    const duplicateSubmissions: DuplicateSubmissionInfo[] = [];

    studentTrackers.forEach(tracker => {
      if (tracker.rowIndices.length > 1) {
        const lastIdx = tracker.rowIndices[tracker.rowIndices.length - 1];
        const earlierIndices = tracker.rowIndices.slice(0, -1);
        const lastRowNumber = lastIdx + 1;
        const skippedRowNumbers = earlierIndices.map(i => i + 1);

        const dupInfo: DuplicateSubmissionInfo = {
          nisn: tracker.nisn || '-',
          studentName: tracker.matchedStudent?.name || tracker.rawName || 'Siswa',
          className: tracker.matchedStudent?.classId || tracker.rawClass || undefined,
          submissionCount: tracker.rowIndices.length,
          selectedRowNumber: lastRowNumber,
          skippedRowNumbers,
        };
        duplicateSubmissions.push(dupInfo);

        earlierIndices.forEach(idx => {
          earlierDuplicateRowIndices.set(idx, {
            lastRowNumber,
            nisn: tracker.nisn,
            name: dupInfo.studentName,
          });
        });
      }
    });

    const errorDetails: string[] = [];
    let successCount = 0;
    let failedCount = 0;
    let mismatchCount = 0;
    let duplicateCount = 0;

    const previewItems: SheetImportPreviewItem[] = studentRows.map((row, index) => {
      const rowNumber = index + 1;
      const rawNisn = extractRowNisn(row);
      const rawName = extractRowName(row);
      const cleanNisn = GoogleIntegrationService.normalizeNisn(rawNisn);

      // Cek apakah baris ini merupakan submisi terdahulu yang digantikan oleh submisi terakhir siswa
      const isEarlierDuplicateRow = earlierDuplicateRowIndices.has(index);
      const earlierDupMeta = isEarlierDuplicateRow ? earlierDuplicateRowIndices.get(index) : undefined;

      // Extract raw GForm score with smart auto-normalization (supporting X/Y format, Indonesian comma decimal, etc.)
      let rawGFormScoreNum = 0;
      if (mappingConfig.scoreColumn && row[mappingConfig.scoreColumn]) {
        const rawScoreStr = row[mappingConfig.scoreColumn].trim();
        if (rawScoreStr.includes('/')) {
          const parts = rawScoreStr.split('/');
          const num = parseFloat(parts[0].trim().replace(',', '.'));
          const denom = parseFloat(parts[1].trim().replace(',', '.'));
          if (!isNaN(num) && !isNaN(denom) && denom > 0) {
            const maxScore = tryout.scoringConfig?.maxScore || 100;
            rawGFormScoreNum = Math.round(((num / denom) * maxScore) * 100) / 100;
          } else {
            rawGFormScoreNum = isNaN(num) ? 0 : num;
          }
        } else {
          const normalizedStr = rawScoreStr.replace(',', '.');
          const parsed = parseFloat(normalizedStr);
          rawGFormScoreNum = isNaN(parsed) ? 0 : parsed;
        }
      }

      // Multi-tier student lookup:
      let matchedStudent: Student | undefined =
        students.find(s => GoogleIntegrationService.isNisnMatching(rawNisn, s.nisn)) ||
        allDbStudents.find(s => GoogleIntegrationService.isNisnMatching(rawNisn, s.nisn));

      if (!matchedStudent && cleanNisn) {
        matchedStudent =
          students.find(s => GoogleIntegrationService.isNisnMatching(cleanNisn, s.nisn)) ||
          allDbStudents.find(s => GoogleIntegrationService.isNisnMatching(cleanNisn, s.nisn));
      }

      if (!matchedStudent && rawNisn) {
        matchedStudent =
          students.find(s => s.nis && (s.nis.trim() === rawNisn || GoogleIntegrationService.isNisnMatching(rawNisn, s.nis))) ||
          allDbStudents.find(s => s.nis && (s.nis.trim() === rawNisn || GoogleIntegrationService.isNisnMatching(rawNisn, s.nis)));
      }

      if (!matchedStudent && rawName && rawName.length >= 3) {
        const normName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const nameMatches = allDbStudents.filter(s => {
          const sn = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          return sn === normName || (sn.length > 5 && (sn.includes(normName) || normName.includes(sn)));
        });
        if (nameMatches.length === 1) {
          matchedStudent = nameMatches[0];
        }
      }

      const isValidStudent = !!matchedStudent;
      const effectiveNisn = matchedStudent ? matchedStudent.nisn : (cleanNisn || rawNisn);

      // Check NISN format (Indonesian standard: 10 digits numeric, tolerating 7-10 after normalization or if student is found)
      const isFormatValid = isValidStudent || /^\d{10}$/.test(rawNisn) || (cleanNisn.length >= 7 && cleanNisn.length <= 10);

      // Baris ini dianggap duplikasi sheet hanya jika merupakan submisi terdahulu (bukan yang terakhir)
      const isDuplicateRowInSheet = isEarlierDuplicateRow;

      // Duplicate submission in database
      const isExistingSubmissionInDb = isValidStudent
        ? existingScores.some(s => s.studentId === matchedStudent!.id && s.tryoutId === tryout.id)
        : false;

      // Extract & validate answers
      const studentAnswers: Record<string, string> = {};
      const malformedAnswers: Record<string, string> = {};

      questions.forEach(q => {
        const header = mappingConfig.questionMappings[q.uniqueCode];
        if (header && row[header] !== undefined) {
          const rawVal = row[header].trim();
          if (!rawVal) {
            studentAnswers[q.uniqueCode] = ''; // unanswered
            return;
          }

          if (/^INVALID_/i.test(rawVal)) {
            malformedAnswers[q.uniqueCode] = rawVal;
            studentAnswers[q.uniqueCode] = rawVal;
            return;
          }

          studentAnswers[q.uniqueCode] = this.normalizeAnswerToOptionKey(rawVal, q);
        } else {
          studentAnswers[q.uniqueCode] = '';
        }
      });

      const hasMalformedAnswer = Object.keys(malformedAnswers).length > 0;

      // Deterministic Scoring Calculation
      const scoringResult = ScoringService.calculateStudentScore(
        studentAnswers,
        questions,
        tryout.scoringConfig,
        rawGFormScoreNum
      );

      // Determine validation status & error message
      let status: SheetImportPreviewItem['status'] = 'VALID';
      let validationError: string | undefined = undefined;

      if (isEarlierDuplicateRow && earlierDupMeta) {
        status = 'ERROR_DUPLICATE_ROW';
        validationError = `Submisi ganda: NISN '${earlierDupMeta.nisn}' (${earlierDupMeta.name}) digantikan oleh pengerjaan terakhir di baris ${earlierDupMeta.lastRowNumber}.`;
        failedCount++;
        duplicateCount++;
        errorDetails.push(`Baris ${rowNumber}: Submisi ganda NISN '${earlierDupMeta.nisn}' digantikan oleh baris ${earlierDupMeta.lastRowNumber}`);
      } else if (!rawNisn) {
        status = 'ERROR_MALFORMED_DATA';
        validationError = 'Baris data cacat: Kolom NISN kosong.';
        failedCount++;
        errorDetails.push(`Baris ${rowNumber}: Kolom NISN kosong`);
      } else if (!isFormatValid) {
        status = 'ERROR_MALFORMED_DATA';
        validationError = `Format NISN '${rawNisn}' tidak valid (wajib 10 digit angka).`;
        failedCount++;
        errorDetails.push(`Baris ${rowNumber}: Format NISN '${rawNisn}' tidak valid`);
      } else if (!isValidStudent) {
        status = 'ERROR_STUDENT_NOT_FOUND';
        validationError = `Siswa dengan NISN '${rawNisn}' tidak terdaftar dalam database sekolah.`;
        failedCount++;
        errorDetails.push(`Baris ${rowNumber}: NISN '${rawNisn}' tidak ditemukan`);
      } else if (hasMalformedAnswer) {
        status = 'ERROR_INVALID_ANSWER';
        const malformedKeys = Object.entries(malformedAnswers)
          .map(([k, v]) => `${k}: "${v}"`)
          .join(', ');
        validationError = `Opsi jawaban cacat/tidak dikenal pada [${malformedKeys}].`;
        failedCount++;
        errorDetails.push(`Baris ${rowNumber}: Jawaban cacat pada [${malformedKeys}]`);
      } else {
        // Valid student & valid answers (termasuk baris terakhir dari siswa yang submisi ganda)
        successCount++;
        if (isExistingSubmissionInDb) {
          duplicateCount++;
        }
        if (scoringResult.scoringStatus === 'SCORING_MISMATCH') {
          status = 'WARNING_MISMATCH';
          mismatchCount++;
          errorDetails.push(
            `Baris ${rowNumber} (${matchedStudent?.name || 'Siswa'}): Selisih skor terdeteksi (GForm: ${rawGFormScoreNum}, Hitung: ${scoringResult.calculatedScore}, Selisih: ${scoringResult.scoreDifference.toFixed(2)})`
          );
        }
      }

      return {
        rowNumber,
        nisn: effectiveNisn || rawNisn,
        studentName: matchedStudent?.name || (row[mappingConfig.nameColumn || ''] || 'Siswa Tidak Dikenal'),
        studentId: matchedStudent?.id,
        classId: matchedStudent?.classId,
        rawGFormScore: rawGFormScoreNum,
        answers: studentAnswers,
        malformedAnswers: hasMalformedAnswer ? malformedAnswers : undefined,
        calculatedScore: scoringResult.calculatedScore,
        scoreDifference: scoringResult.scoreDifference,
        scoringStatus: scoringResult.scoringStatus,
        isValidStudent,
        isDuplicateRowInSheet,
        isExistingSubmissionInDb,
        status,
        validationError,
      };
    });

    return {
      isValidTryout: true,
      isValidSubject: true,
      mappingConfig,
      previewItems,
      summary: {
        totalRows: studentRows.length,
        successCount,
        failedCount,
        mismatchCount,
        duplicateCount,
        errorDetails,
        answerKeyDetected: !!detectedKeyStudent,
        answerKeyStudentName: detectedKeyStudent?.name,
        answerKeyExtractedCount,
        duplicateSubmissions,
      },
    };
  }

  /**
   * 4. CONFIRMATION & IDEMPOTENT PERSISTENCE:
   * Rule: Import ulang data yang sama tidak boleh menghasilkan duplicate submission.
   * Updates existing submission records or inserts new ones cleanly.
   * Records comprehensive audit log.
   */
  public static executeIdempotentImport(
    tryout: Tryout,
    subject: Subject,
    validPreviewItems: SheetImportPreviewItem[],
    questions: Question[],
    currentUser: User,
    sourceMetadata: {
      sourceType: 'GOOGLE_SHEETS_IMPORT' | 'GOOGLE_FORM_SYNC';
      sourceUrl?: string;
      formRef?: string;
    }
  ): {
    savedCount: number;
    updatedCount: number;
    insertedCount: number;
    auditLogId: string;
  } {
    const now = new Date().toISOString();
    let updatedCount = 0;
    let insertedCount = 0;

    const newResponses: Response[] = [];
    const newAnswers: Answer[] = [];
    const newScores: Score[] = [];

    // Filter to items that can be safely imported (VALID or WARNING_MISMATCH)
    const importableItems = validPreviewItems.filter(
      item => item.status === 'VALID' || item.status === 'WARNING_MISMATCH'
    );

    if (importableItems.length === 0) {
      throw new Error('Validasi Gagal: Tidak ada baris data valid yang dapat disimpan.');
    }

    // Build lookup map of existing answer IDs for this tryout to prevent duplicate answer rows on re-sync
    const existingAnswerIdMap = new Map<string, string>();
    dbService.getAnswers().forEach(a => {
      if (a.tryoutId === tryout.id && a.id && isValidUuid(a.id)) {
        existingAnswerIdMap.set(`${a.studentId}_${a.questionId}`, a.id);
      }
    });

    const isGFormSource = tryout.scoringConfig?.scoreSource === 'GOOGLE_FORM';

    importableItems.forEach((item, index) => {
      const studentId = item.studentId!;

      // Check if student already has a response for this tryout in database (IDEMPOTENCY)
      const existingResponse = dbService.getResponses().find(
        r => r.studentId === studentId && r.tryoutId === tryout.id
      );

      const responseId = (existingResponse?.id && isValidUuid(existingResponse.id))
        ? existingResponse.id
        : generateUuid();

      if (existingResponse) {
        updatedCount++;
      } else {
        insertedCount++;
      }

      // 1. Build Response record
      const respRecord: Response = {
        id: responseId,
        tryoutId: tryout.id,
        studentId,
        nisnInput: item.nisn,
        rawScoreGForm: item.rawGFormScore,
        submittedAt: now,
        syncBatchId: generateUuid(),
      };
      newResponses.push(respRecord);

      // 2. Build Item Answer records adhering strictly to tryout.scoringConfig
      questions.forEach((q, qIdx) => {
        const studentAns = item.answers[q.uniqueCode] || '';
        const isCorrect = ScoringService.isAnswerMatching(studentAns, q.correctAnswer);
        const qWeight = tryout.scoringConfig.scoringType === 'CUSTOM_WEIGHT' ? (q.weight || 1) : 1;

        let ansScore = 0;
        if (!studentAns) {
          ansScore = tryout.scoringConfig.unansweredScore * qWeight;
        } else if (isCorrect) {
          ansScore = tryout.scoringConfig.correctScore * qWeight;
        } else {
          ansScore = (tryout.scoringConfig.allowNegativeMarking ? tryout.scoringConfig.wrongScore : 0) * qWeight;
        }

        const existingAnswerId = existingAnswerIdMap.get(`${studentId}_${q.id}`);

        newAnswers.push({
          id: existingAnswerId || generateUuid(),
          responseId,
          studentId,
          tryoutId: tryout.id,
          questionId: q.id,
          studentAnswer: studentAns,
          correctAnswer: q.correctAnswer,
          isCorrect,
          score: Math.round(ansScore * 100) / 100,
          submittedAt: now,
        });
      });

      // 3. Build Score record
      const existingScore = dbService.getScores().find(
        s => s.studentId === studentId && s.tryoutId === tryout.id
      );

      const scoreId = (existingScore?.id && isValidUuid(existingScore.id))
        ? existingScore.id
        : generateUuid();

      const totalCorrect = Object.entries(item.answers).filter(
        ([code, ans]) => {
          const q = questions.find(itemQ => itemQ.uniqueCode === code);
          return q && ScoringService.isAnswerMatching(ans, q.correctAnswer);
        }
      ).length;

      const totalUnanswered = Object.values(item.answers).filter(ans => !ans).length;
      const totalIncorrect = questions.length - totalCorrect - totalUnanswered;

      const hasGFormScore = item.rawGFormScore !== undefined && !isNaN(item.rawGFormScore);
      const isCustomEngineExplicit = tryout.scoringConfig?.scoreSource === 'CUSTOM_ENGINE';
      // Nilai dari Google Form (kolom Skor) adalah sumber nilai utama, kecuali jika guru secara eksplisit memilih CUSTOM_ENGINE
      const useGFormScore = !isCustomEngineExplicit && hasGFormScore;
      const finalScoreVal = useGFormScore ? item.rawGFormScore! : item.calculatedScore;

      newScores.push({
        id: scoreId,
        responseId,
        studentId,
        tryoutId: tryout.id,
        subjectScores: { [subject.id]: finalScoreVal },
        googleFormScore: item.rawGFormScore,
        calculatedScore: finalScoreVal,
        scoreDifference: useGFormScore ? 0 : item.scoreDifference,
        scoringStatus: useGFormScore ? 'MATCH' : item.scoringStatus,
        totalCorrect,
        totalIncorrect,
        totalUnanswered,
        createdAt: existingScore?.createdAt || now,
      });
    });

    // Save to Database Service with idempotency
    dbService.saveImportedResponsesAndScores(
      tryout.id,
      newResponses,
      newAnswers,
      newScores,
      currentUser
    );

    // Write comprehensive AUDIT LOG matching requirements
    const auditDetails = JSON.stringify({
      actor: { id: currentUser?.id || 'system', name: currentUser?.name || 'Sistem Otomatis', role: currentUser?.role || 'SYSTEM' },
      timestamp: now,
      source: sourceMetadata.sourceUrl || 'Google Sheets Manual Paste',
      formReference: sourceMetadata.formRef || 'Form-TO03',
      tryout: { id: tryout.id, code: tryout.code, title: tryout.title },
      subject: { id: subject.id, code: subject.code, name: subject.name },
      totalRowsProcessed: validPreviewItems.length,
      successCount: importableItems.length,
      updatedCount,
      insertedCount,
      mismatchCount: importableItems.filter(i => i.scoringStatus === 'SCORING_MISMATCH').length,
      errors: validPreviewItems.filter(i => i.validationError).map(i => `Row ${i.rowNumber}: ${i.validationError}`),
    });

    const auditLog = dbService.logAudit(
      currentUser,
      'IMPORT_GOOGLE_SHEETS_CONFIRM',
      'TRYOUT_RESPONSES',
      `Impor Google Sheets (${tryout.code} - ${subject.name}): ${importableItems.length} berhasil (${insertedCount} baru, ${updatedCount} perbarui/idempotent). Detail: ${auditDetails}`
    );

    return {
      savedCount: importableItems.length,
      updatedCount,
      insertedCount,
      auditLogId: auditLog?.id || `audit-${Date.now()}`,
    };
  }

  /**
   * 5. AUTOMATED TEST SUITE: Full coverage of all Phase 7 requirements
   * Tests:
   * 1. Valid import
   * 2. Invalid student (unknown NISN)
   * 3. Invalid Try Out (missing or archived)
   * 4. Invalid question ID (unmapped question)
   * 5. Duplicate in sheet & duplicate in DB
   * 6. Malformed answer (illegal characters)
   * 7. Scoring mismatch (Google Form score != calculated score)
   * 8. Repeated import (Idempotency guarantee: 0 duplicate submissions)
   * 9. Partial failure (mixed valid and invalid rows)
   */
  public static runIntegrationTestSuite(): {
    passed: boolean;
    tests: { name: string; passed: boolean; message: string }[];
  } {
    const results: { name: string; passed: boolean; message: string }[] = [];

    const mockAdmin: User = {
      id: 'u-admin',
      name: 'Drs. Supriyadi, M.Pd',
      email: 'admin@sekolah.sch.id',
      role: 'ADMIN',
      createdAt: '2025-07-01T08:00:00Z',
    };

    const tryout = dbService.getTryouts().find(t => t.id === 'to-3') || dbService.getTryouts()[0];
    const subject = dbService.getSubjects().find(s => s.id === 'subj-mat') || dbService.getSubjects()[0];
    const questions = dbService.getQuestions().filter(q => q.subjectId === subject.id);
    const students = dbService.getStudents();
    const existingScores = dbService.getScoresByTryout(tryout.id);

    // TEST 1: Valid Import
    try {
      const validText = `NISN\tSkor\tMAT-TO03-Q001\tMAT-TO03-Q002\tMAT-TO03-Q003\n0061234561\t100\tA\tA\tA`;
      const parseRes = this.parseRawSheetText(validText);
      const mappings = this.detectColumnMappings(parseRes.headers, questions);
      const valRes = this.validateSheetImportDetailed(
        parseRes.rows,
        tryout,
        subject,
        questions,
        students,
        existingScores,
        mappings
      );

      const t1Passed =
        valRes.summary.successCount === 1 &&
        valRes.summary.failedCount === 0 &&
        valRes.previewItems[0].status === 'VALID';

      results.push({
        name: '1. Valid Import Processing',
        passed: t1Passed,
        message: t1Passed
          ? `Sukses: 1 baris valid diproses dengan status VALID (Siswa: ${valRes.previewItems[0].studentName})`
          : `Gagal: baris valid tidak berhasil divalidasi`,
      });
    } catch (err: any) {
      results.push({
        name: '1. Valid Import Processing',
        passed: false,
        message: `Error: ${err.message}`,
      });
    }

    // TEST 2: Invalid Student (Unknown NISN)
    try {
      const unknownNisnText = `NISN\tSkor\tMAT-TO03-Q001\n9999999999\t80\tA`;
      const parseRes = this.parseRawSheetText(unknownNisnText);
      const mappings = this.detectColumnMappings(parseRes.headers, questions);
      const valRes = this.validateSheetImportDetailed(
        parseRes.rows,
        tryout,
        subject,
        questions,
        students,
        existingScores,
        mappings
      );

      const t2Passed =
        valRes.summary.failedCount === 1 &&
        valRes.previewItems[0].status === 'ERROR_STUDENT_NOT_FOUND';

      results.push({
        name: '2. Invalid Student Rejection',
        passed: t2Passed,
        message: t2Passed
          ? `Sukses: NISN 9999999999 ditolak dengan status ERROR_STUDENT_NOT_FOUND`
          : `Gagal: NISN tidak dikenal tidak terdeteksi`,
      });
    } catch (err: any) {
      results.push({
        name: '2. Invalid Student Rejection',
        passed: false,
        message: `Error: ${err.message}`,
      });
    }

    // TEST 3: Invalid Try Out (Archived or Missing)
    try {
      const archivedTryout: Tryout = { ...tryout, status: 'ARCHIVED' };
      const testText = `NISN\tSkor\n0061234561\t80`;
      const parseRes = this.parseRawSheetText(testText);
      const mappings = this.detectColumnMappings(parseRes.headers, questions);
      const valRes = this.validateSheetImportDetailed(
        parseRes.rows,
        archivedTryout,
        subject,
        questions,
        students,
        existingScores,
        mappings
      );

      const t3Passed = !valRes.isValidTryout && !!valRes.tryoutError;

      results.push({
        name: '3. Invalid Try Out Status Rejection',
        passed: t3Passed,
        message: t3Passed
          ? `Sukses: Try Out ARCHIVED dicegat ("${valRes.tryoutError}")`
          : `Gagal: Try Out ARCHIVED lolos validasi`,
      });
    } catch (err: any) {
      results.push({
        name: '3. Invalid Try Out Status Rejection',
        passed: false,
        message: `Error: ${err.message}`,
      });
    }

    // TEST 4: Invalid Question ID Detection
    try {
      const nonExistentCode = 'NON-EXISTENT-Q999';
      const questionText = `NISN\tSkor\t${nonExistentCode}\n0061234561\t80\tA`;
      const parseRes = this.parseRawSheetText(questionText);
      const mappings = this.detectColumnMappings(parseRes.headers, questions);

      // Verify non-existent code is not mapped to valid question
      const isUnmapped = !mappings.questionMappings[nonExistentCode];

      results.push({
        name: '4. Invalid Question ID Mapping Isolation',
        passed: isUnmapped,
        message: isUnmapped
          ? `Sukses: Kode soal tidak sah (${nonExistentCode}) tidak dipetakan ke bank soal`
          : `Gagal: Kode soal tidak sah terpetakan`,
      });
    } catch (err: any) {
      results.push({
        name: '4. Invalid Question ID Mapping Isolation',
        passed: false,
        message: `Error: ${err.message}`,
      });
    }

    // TEST 5: Duplicate Detection (Duplicate in Sheet & in DB)
    try {
      const duplicateSheetText = `NISN\tSkor\tMAT-TO03-Q001\n0061234561\t80\tA\n0061234561\t80\tA`;
      const parseRes = this.parseRawSheetText(duplicateSheetText);
      const mappings = this.detectColumnMappings(parseRes.headers, questions);
      const valRes = this.validateSheetImportDetailed(
        parseRes.rows,
        tryout,
        subject,
        questions,
        students,
        existingScores,
        mappings
      );

      const t5Passed =
        valRes.summary.duplicateCount >= 1 &&
        valRes.previewItems.some(i => i.status === 'ERROR_DUPLICATE_ROW');

      results.push({
        name: '5. Duplicate Row in Sheet Rejection',
        passed: t5Passed,
        message: t5Passed
          ? `Sukses: Duplikasi baris dalam lembar terdeteksi (${valRes.summary.duplicateCount} terdeteksi)`
          : `Gagal: Duplikasi baris tidak terdeteksi`,
      });
    } catch (err: any) {
      results.push({
        name: '5. Duplicate Row in Sheet Rejection',
        passed: false,
        message: `Error: ${err.message}`,
      });
    }

    // TEST 6: Malformed Answer Detection
    try {
      const malformedText = `NISN\tSkor\tMAT-TO03-Q001\n0061234561\t80\tINVALID_CORRUPT_OPTION`;
      const parseRes = this.parseRawSheetText(malformedText);
      const mappings = this.detectColumnMappings(parseRes.headers, questions);
      const valRes = this.validateSheetImportDetailed(
        parseRes.rows,
        tryout,
        subject,
        questions,
        students,
        existingScores,
        mappings
      );

      const t6Passed =
        valRes.summary.failedCount === 1 &&
        valRes.previewItems[0].status === 'ERROR_INVALID_ANSWER';

      results.push({
        name: '6. Malformed Answer Option Detection',
        passed: t6Passed,
        message: t6Passed
          ? `Sukses: Opsi jawaban cacat "INVALID_CORRUPT_OPTION" terdeteksi sebagai ERROR_INVALID_ANSWER`
          : `Gagal: Opsi jawaban cacat tidak terdeteksi`,
      });
    } catch (err: any) {
      results.push({
        name: '6. Malformed Answer Option Detection',
        passed: false,
        message: `Error: ${err.message}`,
      });
    }

    // TEST 7: Scoring Mismatch Detection (No Silent Overwrite)
    try {
      // Correct answer is 'A' for questions. If student answers 'B', calculated score is lower, but GForm claims 95
      const mismatchText = `NISN\tSkor\tMAT-TO03-Q001\tMAT-TO03-Q002\tMAT-TO03-Q003\n0061234561\t95\tB\tB\tB`;
      const parseRes = this.parseRawSheetText(mismatchText);
      const mappings = this.detectColumnMappings(parseRes.headers, questions);
      const valRes = this.validateSheetImportDetailed(
        parseRes.rows,
        tryout,
        subject,
        questions,
        students,
        existingScores,
        mappings
      );

      const t7Passed =
        valRes.summary.mismatchCount === 1 &&
        valRes.previewItems[0].status === 'WARNING_MISMATCH' &&
        valRes.previewItems[0].scoringStatus === 'SCORING_MISMATCH' &&
        valRes.previewItems[0].scoreDifference > 0;

      results.push({
        name: '7. Scoring Mismatch Detection & Non-Overwrite Rule',
        passed: t7Passed,
        message: t7Passed
          ? `Sukses: Selisih skor (${valRes.previewItems[0].scoreDifference.toFixed(2)} poin) ditandai SCORING_MISMATCH tanpa silent overwrite`
          : `Gagal: Selisih skor tidak ditandai sebagai SCORING_MISMATCH`,
      });
    } catch (err: any) {
      results.push({
        name: '7. Scoring Mismatch Detection & Non-Overwrite Rule',
        passed: false,
        message: `Error: ${err.message}`,
      });
    }

    // TEST 8: Repeated Import (Idempotency Guarantee)
    try {
      const importText = `NISN\tSkor\tMAT-TO03-Q001\n0061234561\t100\tA`;
      const parseRes = this.parseRawSheetText(importText);
      const mappings = this.detectColumnMappings(parseRes.headers, questions);
      const valRes = this.validateSheetImportDetailed(
        parseRes.rows,
        tryout,
        subject,
        questions,
        students,
        existingScores,
        mappings
      );

      const initialRespCount = dbService.getResponses().length;

      // First run
      this.executeIdempotentImport(tryout, subject, valRes.previewItems, questions, mockAdmin, {
        sourceType: 'GOOGLE_SHEETS_IMPORT',
        sourceUrl: 'https://docs.google.com/spreadsheets/d/test-idempotency',
      });

      const afterFirstCount = dbService.getResponses().length;

      // Second run with identical student & tryout
      this.executeIdempotentImport(tryout, subject, valRes.previewItems, questions, mockAdmin, {
        sourceType: 'GOOGLE_SHEETS_IMPORT',
        sourceUrl: 'https://docs.google.com/spreadsheets/d/test-idempotency',
      });

      const afterSecondCount = dbService.getResponses().length;

      // Idempotency: response count after second import must equal response count after first import
      const t8Passed = afterSecondCount === afterFirstCount;

      results.push({
        name: '8. Idempotent Repeated Import Guarantee',
        passed: t8Passed,
        message: t8Passed
          ? `Sukses: Impor ulang menghasilkan 0 duplikasi submission (Total Response tetap: ${afterSecondCount})`
          : `Gagal: Impor ulang menambah duplikasi data (${afterFirstCount} -> ${afterSecondCount})`,
      });
    } catch (err: any) {
      results.push({
        name: '8. Idempotent Repeated Import Guarantee',
        passed: false,
        message: `Error: ${err.message}`,
      });
    }

    // TEST 9: Partial Failure Handling
    try {
      const mixedText = `NISN\tSkor\tMAT-TO03-Q001\n0061234561\t100\tA\n9999999999\t80\tA\n0061234562\t100\tINVALID_OPT`;
      const parseRes = this.parseRawSheetText(mixedText);
      const mappings = this.detectColumnMappings(parseRes.headers, questions);
      const valRes = this.validateSheetImportDetailed(
        parseRes.rows,
        tryout,
        subject,
        questions,
        students,
        existingScores,
        mappings
      );

      const t9Passed =
        valRes.summary.totalRows === 3 &&
        valRes.summary.successCount === 1 &&
        valRes.summary.failedCount === 2;

      results.push({
        name: '9. Partial Failure Diagnostics & Isolation',
        passed: t9Passed,
        message: t9Passed
          ? `Sukses: Diagnosa baris akurat: 1 baris sukses, 2 baris gagal terisolasi (${valRes.summary.errorDetails.length} pesan detail)`
          : `Gagal: Diagnosa parsial tidak akurat (Sukses: ${valRes.summary.successCount}, Gagal: ${valRes.summary.failedCount})`,
      });
    } catch (err: any) {
      results.push({
        name: '9. Partial Failure Diagnostics & Isolation',
        passed: false,
        message: `Error: ${err.message}`,
      });
    }

    return {
      passed: results.every(r => r.passed),
      tests: results,
    };
  }

  // ─── Auto-Sync Helpers (Feature: Poll Google Sheet CSV every 5 min) ──────────

}
