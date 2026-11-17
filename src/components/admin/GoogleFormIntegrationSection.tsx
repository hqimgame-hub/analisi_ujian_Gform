import React, { useState } from 'react';
import {
  FileSpreadsheet, Copy, Check, Download, Sparkles, BookOpen,
  HelpCircle, CheckCircle2, ChevronRight, Layers, Shuffle,
  ShieldCheck, FileCode, ExternalLink, Lightbulb, CheckSquare, Grid, CheckCircle
} from 'lucide-react';

interface GoogleFormIntegrationSectionProps {
  onShowToast?: (msg: string, type?: 'success' | 'error') => void;
}

export const APPS_SCRIPT_SOURCE = `/**
 * ===================================================================
 * SISTEM AUTO-CONVERT SPREADSHEET LENGKAP v3.0 (UNIVERSAL)
 * ===================================================================
 * Mendukung:
 *  1. Pilihan Ganda (PG)        --> "C. Presipitasi"
 *  2. Pilihan Ganda Kompleks    --> "A. Evaporasi, C. Presipitasi"
 *  3. Menjodohkan (Kisi Grid)   --> "B. Pasangan Benar" per kolom baris
 *  4. Benar / Salah (True/False)--> "A. Benar" / "B. Salah"
 *  5. Dropdown (Menu Turun)     --> "A. Opsi"
 *  6. Mendukung Acak Opsi       --> Siswa melihat teks acak tanpa huruf,
 *                                   Spreadsheet otomatis berhuruf A-E master!
 * ===================================================================
 */

function onOpen() {
  FormApp.getUi()
    .createMenu('🚀 Sinkronisasi Ujian')
    .addItem('1. Aktifkan Pencatat Otomatis (Untuk Siswa Baru)', 'aktifkanSinkronisasiSpreadsheet')
    .addItem('2. Format Ulang Seluruh Kolom di Sheet (PG, PGK, Menjodohkan)', 'konversiSeluruhDataLamaDiSheet')
    .addToUi();
}

/**
 * FUNGSI 1: AKTIFKAN PEMICU OTOMATIS (CUKUP DIJALANKAN SEKALI)
 * Otomatis memformat setiap ada pengumpulan jawaban baru oleh siswa/kunci.
 */
function aktifkanSinkronisasiSpreadsheet() {
  var form = FormApp.getActiveForm();
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'konversiJawabanKeHurufDiSheet') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('konversiJawabanKeHurufDiSheet')
    .forForm(form)
    .onFormSubmit()
    .create();

  Logger.log('✅ SUKSES: Pemicu otomatis telah aktif!');
}

/**
 * FUNGSI 2: BERJALAN OTOMATIS SETIAP KALI ADA TANGGAPAN MASUK
 */
function konversiJawabanKeHurufDiSheet(e) {
  if (!e || !e.response) return;

  var form = FormApp.getActiveForm();
  var destId = form.getDestinationId();
  if (!destId) return;

  var ss = SpreadsheetApp.openById(destId);
  var sheet = ss.getSheets()[0];
  var lastRow = sheet.getLastRow();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var itemResponses = e.response.getItemResponses();
  var letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  for (var i = 0; i < itemResponses.length; i++) {
    var ir = itemResponses[i];
    var item = ir.getItem();
    var type = item.getType();
    var title = item.getTitle().trim();
    var rawAnswer = ir.getResponse();

    // 1. Pilihan Ganda (Multiple Choice)
    if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
      var colIdx = cariIndexKolom(headers, title);
      if (colIdx !== -1) {
        var mc = item.asMultipleChoiceItem();
        var choices = mc.getChoices();
        for (var c = 0; c < choices.length; c++) {
          if (choices[c].getValue().trim() === String(rawAnswer).trim()) {
            sheet.getRange(lastRow, colIdx + 1).setValue(letters[c] + '. ' + rawAnswer);
            break;
          }
        }
      }
    }
    // 2. Kotak Centang (PGK)
    else if (type === FormApp.ItemType.CHECKBOX) {
      var colIdx = cariIndexKolom(headers, title);
      if (colIdx !== -1) {
        var cb = item.asCheckboxItem();
        var cbChoices = cb.getChoices();
        var chosenArr = Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer];
        var formattedList = [];

        for (var c = 0; c < cbChoices.length; c++) {
          var choiceVal = cbChoices[c].getValue().trim();
          if (chosenArr.indexOf(choiceVal) !== -1) {
            formattedList.push(letters[c] + '. ' + choiceVal);
          }
        }
        if (formattedList.length > 0) {
          sheet.getRange(lastRow, colIdx + 1).setValue(formattedList.join(', '));
        }
      }
    }
    // 3. Menjodohkan / Kisi Matriks (Grid)
    else if (type === FormApp.ItemType.GRID) {
      var grid = item.asGridItem();
      var rows = grid.getRows();
      var cols = grid.getColumns();
      var gridAnswers = rawAnswer;

      if (Array.isArray(gridAnswers)) {
        for (var rIdx = 0; rIdx < rows.length; rIdx++) {
          var expectedH = title + ' [' + rows[rIdx].trim() + ']';
          var colIdx = cariIndexKolom(headers, expectedH);
          var ans = gridAnswers[rIdx];

          if (colIdx !== -1 && ans) {
            for (var c = 0; c < cols.length; c++) {
              if (cols[c].trim() === String(ans).trim()) {
                sheet.getRange(lastRow, colIdx + 1).setValue(letters[c] + '. ' + ans);
                break;
              }
            }
          }
        }
      }
    }
  }
}

/**
 * FUNGSI 3: FORMAT ULANG SELURUH DATA LAMA DI SPREADSHEET
 * Jalankan jika di spreadsheet sudah ada jawaban yang terlanjur masuk tanpa huruf.
 */
function konversiSeluruhDataLamaDiSheet() {
  var form = FormApp.getActiveForm();
  var destId = form.getDestinationId();
  if (!destId) {
    Logger.log('❌ Error: Form belum ditautkan ke Spreadsheet.');
    return;
  }

  var ss = SpreadsheetApp.openById(destId);
  var sheet = ss.getSheets()[0];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return;

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var dataValues = dataRange.getValues();

  var items = form.getItems();
  var letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var type = item.getType();
    var title = item.getTitle().trim();

    // A. Pilihan Ganda (PG)
    if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
      var colIdx = cariIndexKolom(headers, title);
      if (colIdx !== -1) {
        var mc = item.asMultipleChoiceItem();
        var choices = mc.getChoices();
        for (var r = 0; r < dataValues.length; r++) {
          var val = String(dataValues[r][colIdx]).trim();
          if (!val || /^[A-Ha-h]\\.\\s/.test(val)) continue;

          for (var c = 0; c < choices.length; c++) {
            if (choices[c].getValue().trim() === val) {
              dataValues[r][colIdx] = letters[c] + '. ' + val;
              break;
            }
          }
        }
      }
    }
    // B. Pilihan Ganda Kompleks (PGK)
    else if (type === FormApp.ItemType.CHECKBOX) {
      var colIdx = cariIndexKolom(headers, title);
      if (colIdx !== -1) {
        var cb = item.asCheckboxItem();
        var cbChoices = cb.getChoices();
        for (var r = 0; r < dataValues.length; r++) {
          var cellVal = String(dataValues[r][colIdx]).trim();
          if (!cellVal || /^[A-Ha-h]\\.\\s/.test(cellVal)) continue;

          var parts = cellVal.split(/,\\s*/);
          var newParts = [];

          for (var p = 0; p < parts.length; p++) {
            var rawP = parts[p].trim();
            var matchedLetter = null;
            for (var c = 0; c < cbChoices.length; c++) {
              if (cbChoices[c].getValue().trim() === rawP) {
                matchedLetter = letters[c];
                break;
              }
            }
            if (matchedLetter) {
              newParts.push(matchedLetter + '. ' + rawP);
            } else {
              newParts.push(rawP);
            }
          }

          if (newParts.length > 0) {
            dataValues[r][colIdx] = newParts.join(', ');
          }
        }
      }
    }
    // C. Menjodohkan / Kisi Matriks (Grid)
    else if (type === FormApp.ItemType.GRID) {
      var grid = item.asGridItem();
      var rows = grid.getRows();
      var cols = grid.getColumns();

      for (var rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        var expectedHeader = title + ' [' + rows[rowIdx].trim() + ']';
        var colIdx = cariIndexKolom(headers, expectedHeader);

        if (colIdx !== -1) {
          for (var r = 0; r < dataValues.length; r++) {
            var cellVal = String(dataValues[r][colIdx]).trim();
            if (!cellVal || /^[A-Ha-h]\\.\\s/.test(cellVal)) continue;

            for (var c = 0; c < cols.length; c++) {
              if (cols[c].trim() === cellVal) {
                dataValues[r][colIdx] = letters[c] + '. ' + cellVal;
                break;
              }
            }
          }
        }
      }
    }
    // D. Dropdown
    else if (type === FormApp.ItemType.LIST) {
      var colIdx = cariIndexKolom(headers, title);
      if (colIdx !== -1) {
        var list = item.asListItem();
        var lChoices = list.getChoices();
        for (var r = 0; r < dataValues.length; r++) {
          var val = String(dataValues[r][colIdx]).trim();
          if (!val || /^[A-Ha-h]\\.\\s/.test(val)) continue;

          for (var c = 0; c < lChoices.length; c++) {
            if (lChoices[c].getValue().trim() === val) {
              dataValues[r][colIdx] = letters[c] + '. ' + val;
              break;
            }
          }
        }
      }
    }
  }

  dataRange.setValues(dataValues);
  Logger.log('✅ SUKSES: Seluruh data lama di spreadsheet berhasil diperbaiki!');
}

function cariIndexKolom(headers, target) {
  var t = target.toLowerCase().trim();
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase().trim() === t) {
      return h;
    }
  }
  return -1;
}`;

export const GoogleFormIntegrationSection: React.FC<GoogleFormIntegrationSectionProps> = ({ onShowToast }) => {
  const [activeSubTab, setActiveSubTab] = useState<'SCRIPT' | 'TUTORIAL' | 'CHEATSHEET'>('SCRIPT');
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyScript = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_SOURCE);
    setIsCopied(true);
    if (onShowToast) {
      onShowToast('Skrip Google Apps Script berhasil disalin ke clipboard!', 'success');
    }
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleDownloadScript = () => {
    const element = document.createElement('a');
    const file = new Blob([APPS_SCRIPT_SOURCE], { type: 'text/javascript' });
    element.href = URL.createObjectURL(file);
    element.download = 'GoogleForm_AutoConvert_v3.0.gs';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    if (onShowToast) {
      onShowToast('File skrip (.gs) berhasil diunduh.', 'success');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Hero Banner */}
      <div className="bg-gradient-to-r from-teal-900 via-teal-800 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-[11px] font-bold tracking-wide uppercase mb-3">
            <Sparkles className="w-3.5 h-3.5 text-teal-300" />
            Integrasi Google Form & Analisis Butir Soal v3.0
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
            Panduan & Generator Skrip Otomatis Google Form
          </h2>
          <p className="text-xs sm:text-sm text-teal-100/90 leading-relaxed mb-6">
            Solusi cerdas bagi pengelola ujian agar <strong>fitur acak urutan pilihan (shuffle)</strong>, 
            <strong> opsi A–E (SMA/SMK)</strong>, <strong>Pilihan Ganda Kompleks (PGK)</strong>, <strong>Menjodohkan (Grid)</strong>, dan <strong>Benar/Salah</strong> 
            tercatat dengan huruf master asli di Google Spreadsheet dan terbaca 100% presisi di analisis butir soal aplikasi ini.
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleCopyScript}
              className="px-4 py-2.5 bg-white text-teal-950 hover:bg-teal-50 font-bold text-xs rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-2"
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">Tersalin ke Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-teal-700" />
                  <span>Salin Seluruh Skrip</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadScript}
              className="px-4 py-2.5 bg-teal-700/80 hover:bg-teal-600 text-white font-bold text-xs rounded-xl border border-teal-500/40 transition-colors shadow-sm cursor-pointer flex items-center gap-2"
            >
              <Download className="w-4 h-4 text-teal-200" />
              <span>Unduh File (.gs)</span>
            </button>

            <div className="flex items-center gap-1.5 ml-auto text-[11px] text-teal-200 font-medium">
              <ShieldCheck className="w-4 h-4 text-teal-300" />
              <span>Anti-Tertukar Kunci C ke A</span>
            </div>
          </div>
        </div>

        {/* Ambient background decoration */}
        <div className="absolute right-[-40px] bottom-[-40px] opacity-10 pointer-events-none">
          <FileSpreadsheet className="w-80 h-80 text-white" />
        </div>
      </div>

      {/* Feature Badges Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <Shuffle className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">Soal Diacak</span>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Bebas Acak Opsi</span>
          </div>
        </div>

        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <CheckSquare className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">Multi-Jawaban</span>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">PGK (Kotak Centang)</span>
          </div>
        </div>

        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Grid className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">Kisi Matriks</span>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Menjodohkan</span>
          </div>
        </div>

        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">Jenjang Fleksibel</span>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">A-D (SMP) & A-E (SMA)</span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveSubTab('SCRIPT')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'SCRIPT'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>Skrip Google Apps Script</span>
        </button>

        <button
          onClick={() => setActiveSubTab('TUTORIAL')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'TUTORIAL'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Langkah Pemasangan (Tutorial)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('CHEATSHEET')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'CHEATSHEET'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>Panduan Tipe Soal & Akun Kunci</span>
        </button>
      </div>

      {/* TAB CONTENT 1: SKRIP GOOGLE APPS SCRIPT */}
      {activeSubTab === 'SCRIPT' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">Kode Skrip Universal (v3.0)</span>
              <span className="text-slate-500 dark:text-slate-400">
                Cukup salin skrip ini dan tempelkan di menu <strong>Extensions &gt; Apps Script</strong> pada Google Form Anda.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleCopyScript}
                className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Tersalin!' : 'Salin Skrip'}</span>
              </button>
            </div>
          </div>

          <div className="relative rounded-2xl overflow-hidden border border-slate-800 shadow-md bg-slate-950">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-[11px] font-mono text-slate-400">
              <span>GoogleForm_AutoConvert_v3.0.gs</span>
              <span>JavaScript (Google Apps Script)</span>
            </div>
            <pre className="p-4 sm:p-6 overflow-x-auto text-[11px] sm:text-xs font-mono text-teal-300 leading-relaxed max-h-[500px]">
              <code>{APPS_SCRIPT_SOURCE}</code>
            </pre>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: TUTORIAL LANGKAH PEMASANGAN */}
      {activeSubTab === 'TUTORIAL' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Buka Editor Apps Script di Google Form</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Buka Google Form soal ujian Anda. Di pojok kanan atas di sebelah tombol <em>Kirim/Send</em>, klik ikon <strong>Titik Tiga (&hellip;)</strong> &gt; pilih menu <strong>Editor Skrip (Apps Script)</strong>.
            </p>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">
                2
              </span>
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Hapus Kode Lama &amp; Tempel Skrip Ini</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Hapus semua tulisan bawaan di editor Apps Script, lalu <strong>tempelkan (paste)</strong> kode skrip dari Tab 1. Tekan <strong>Ctrl + S</strong> (atau ikon disket) untuk menyimpan.
            </p>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">
                3
              </span>
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Jalankan Fungsi 1-Klik</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Di bilah atas Apps Script pada dropdown fungsi, pilih: <strong><code>aktifkanSinkronisasiSpreadsheet</code></strong> &gt; klik <strong>&blacktriangleright; Jalankan</strong>. Berikan izin akses akun Google sekali saja jika diminta.
            </p>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">
                4
              </span>
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Tautkan ke Spreadsheet &amp; Sinkronkan</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Pastikan Google Form ditautkan ke Spreadsheet (tab Tanggapan &gt; hijau). Ubah akses Spreadsheet ke: <strong>Siapa saja yang memiliki link dapat melihat (Viewer)</strong>. Salin link-nya dan masukkan ke menu Paket Ujian aplikasi ini.
            </p>
          </div>

          <div className="md:col-span-2 p-4 bg-teal-50 dark:bg-teal-950/40 rounded-2xl border border-teal-200 dark:border-teal-900/60 flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
            <div className="text-xs text-teal-900 dark:text-teal-200 leading-relaxed">
              <strong>Tips Efisiensi Guru:</strong> Ketika Anda membuat mata pelajaran lain, cukup klik kanan Google Form ini di Google Drive &gt; <strong>"Buat Salinan" (Make a copy)</strong>. Kodenya otomatis ikut tersalin! Anda hanya perlu klik Jalankan sekali pada fungsi <code>aktifkanSinkronisasiSpreadsheet</code> di form baru tersebut.
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: CHEATSHEET & TIPE SOAL */}
      {activeSubTab === 'CHEATSHEET' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                <Shuffle className="w-4 h-4" />
                <span>Pilihan Ganda Biasa (Opsi Acak)</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Buat pilihan jawaban <strong>tanpa tulisan "A.", "B."</strong> di Google Form. Siswa melihat teks murni dan urutannya bisa diacak di layar. Skrip otomatis mencatat <code>C. Presipitasi</code> di Spreadsheet sesuai nomor master guru.
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                <CheckSquare className="w-4 h-4" />
                <span>Pilihan Ganda Kompleks (PGK)</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Siswa memilih beberapa centang kotak. Di spreadsheet otomatis dirapikan menjadi kombinasi berhuruf: <code>A. Pilihan 1, C. Pilihan 2</code> sehingga analisis butir soal dapat mengekstrak kombinasi jawaban secara tepat.
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-bold">
                <Grid className="w-4 h-4" />
                <span>Menjodohkan / Kisi Matriks (Grid)</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Setiap baris pernyataan pada kisi matriks dipecah otomatis di spreadsheet dengan kurung siku <code>[Pernyataan 1]</code>. Skrip otomatis menambahkan huruf kolom pilihan siswa (<code>A. Jodoh 1</code>).
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Soal Benar / Salah</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Pilihan <em>Benar</em> otomatis menjadi opsi A, dan <em>Salah</em> menjadi opsi B. Sistem analisis butir soal secara ketat mengunci opsi hanya menjadi 2 (A &amp; B) tanpa memunculkan opsi fiktif C, D, atau E.
              </p>
            </div>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Cara Membuat Kunci Jawaban Resmi (Bebas NISN Sesuai Tingkatan Kelas)</span>
            </h4>
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
              <p>
                Anda tidak perlu repot menyetel akun rumit. Cukup buka link Google Form ujian siswa (<code>.../viewform</code>), lalu kirim 1 kali tanggapan dengan data berikut:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li><strong>Nama Siswa:</strong> Ketik <code>KUNCI JAWABAN</code> (wajib ada kata "KUNCI").</li>
                <li><strong>NISN:</strong> Masukkan nomor sesuai tingkatan kelas (contoh: Kelas 7: <code>0120000000</code>, Kelas 8: <code>0110000000</code>, Kelas 9: <code>0100000000</code>).</li>
                <li>Pilih semua jawaban yang benar, lalu klik <strong>Kirim</strong>.</li>
              </ul>
              <p>
                Aplikasi secara otomatis mengenali baris ini sebagai <strong>Master Kunci Jawaban Resmi</strong> dan mengekstrak seluruh kunci soal secara deterministik.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
