import React, { useState } from 'react';
import { X, Download, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

/**
 * Imports a question bank from .xlsx or .csv. The sheet is read here; every
 * rule about what makes a row valid lives on the server, which checks all rows
 * and saves all of them or none.
 */

interface Row {
  sheetRow: number;
  type: string;
  question: string;
  options: string[];
  correct: string;
  timeLimit: string;
}

const HEADER = ['Type', 'Question', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Correct', 'Time limit (seconds)'];
const EXAMPLES = [
  ['MCQ', 'What is the capital of Maharashtra?', 'Mumbai', 'Pune', 'Nagpur', 'Nashik', '1', '30'],
  ['MULTI_SELECT', 'Which of these are prime?', '2', '4', '5', '9', '1; 3', '45'],
  ['OPEN_TEXT', 'In one word, how was today’s class?', '', '', '', '', '', ''],
];

const cell = (value: unknown): string => (value === undefined || value === null ? '' : String(value).trim());

/** Maps columns by their header, so extra option columns and any order work. */
const readRows = (grid: unknown[][]): Row[] => {
  const header = (grid[0] ?? []).map((h) => cell(h).toLowerCase());
  const col = (name: string) => header.findIndex((h) => h.startsWith(name));
  const optionCols = header.flatMap((h, i) => (h.startsWith('option') ? [i] : []));
  const [typeCol, questionCol, correctCol, timeCol] = [col('type'), col('question'), col('correct'), col('time')];

  return grid
    .slice(1)
    .map((line, i) => ({
      sheetRow: i + 2,
      type: cell(line[typeCol]),
      question: cell(line[questionCol]),
      options: optionCols.map((c) => cell(line[c])).filter(Boolean),
      correct: cell(line[correctCol]),
      timeLimit: cell(line[timeCol]),
    }))
    .filter((r) => r.type || r.question || r.options.length);
};

const ImportModal: React.FC<{ eventId: string; onClose: () => void; onImported: () => void }> = ({
  eventId,
  onClose,
  onImported,
}) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([HEADER, ...EXAMPLES]);
    // Text-formatted, or Excel turns an answer like "1,3" into a date or 13.
    for (let r = 1; r <= 500; r += 1) {
      const ref = XLSX.utils.encode_cell({ r, c: HEADER.indexOf('Correct') });
      sheet[ref] = { ...(sheet[ref] ?? { t: 's', v: '' }), z: '@' };
    }
    sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 500, c: HEADER.length - 1 } });
    XLSX.utils.book_append_sheet(book, sheet, 'Questions');
    XLSX.writeFile(book, 'quizpulse-questions.xlsx');
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      // A CSV is decoded as UTF-8 here: handed over as bytes, SheetJS reads it
      // as Latin-1 and every Hindi question arrives as mojibake. raw keeps each
      // cell the text it is — otherwise "1, 3" is read as a date.
      const book = /\.csv$/i.test(file.name)
        ? XLSX.read(await file.text(), { type: 'string', raw: true })
        : XLSX.read(await file.arrayBuffer());
      const sheet = book.Sheets[book.SheetNames[0]];
      const parsed = readRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }));
      if (parsed.length === 0) toast.error('No question rows found under the header row.');
      setRows(parsed);
      setErrors({});
    } catch {
      toast.error('That file could not be read. Use .xlsx or .csv.');
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const res = await api.post(`/questions/event/${eventId}/import`, {
        rows: rows.map(({ type, question, options, correct, timeLimit }) => ({ type, question, options, correct, timeLimit })),
      });
      toast.success(res.data.message);
      onImported();
      onClose();
    } catch (error) {
      const data = (error as { response?: { data?: { message?: string; errors?: { row: number; message: string }[] } } })
        ?.response?.data;
      // The server numbers the rows it was sent; translate back to the sheet's own rows.
      if (data?.errors) {
        setErrors(Object.fromEntries(data.errors.map((e) => [rows[e.row - 2]?.sheetRow ?? e.row, e.message])));
      }
      toast.error(data?.message || 'Could not import that sheet.');
    } finally {
      setSaving(false);
    }
  };

  const badCount = Object.keys(errors).length;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-8 shadow-xl border border-gray-200 my-8">
        <div className="flex justify-between items-center pb-5 mb-6 border-b border-gray-200">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Question bank</span>
            <h2 className="font-heading text-2xl font-bold text-gray-900">Import from Excel</h2>
          </div>
          <button onClick={onClose} className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-full border border-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
              <Download className="w-4 h-4" /> Download the template
            </button>
            <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 cursor-pointer">
              <FileSpreadsheet className="w-4 h-4" /> Choose a .xlsx or .csv file
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={(e) => {
                  void readFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <p className="text-xs text-gray-500">
            One row per question. Correct answers are option numbers — “2”, or “1; 3” for several. A blank type
            is multiple choice.
          </p>

          {rows.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-2xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Row</th>
                    <th className="text-left px-3 py-2">Question</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-left px-3 py-2">Options</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.sheetRow} className={`border-t border-gray-100 align-top ${errors[r.sheetRow] ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-2 tabular text-gray-500">{r.sheetRow}</td>
                      <td className="px-3 py-2 text-gray-900">
                        {r.question || <span className="text-gray-400">(empty)</span>}
                        {errors[r.sheetRow] && <p className="text-xs text-red-600 mt-1">{errors[r.sheetRow]}</p>}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{r.type || 'MCQ'}</td>
                      <td className="px-3 py-2 tabular text-gray-600">{r.options.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={saving || rows.length === 0 || badCount > 0}
            className="w-full gradient-btn text-white font-bold py-3.5 rounded-2xl disabled:opacity-50"
          >
            {saving
              ? 'Importing…'
              : badCount
                ? `Fix the ${badCount} highlighted rows in your sheet, then choose it again`
                : `Import ${rows.length || ''} questions`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
