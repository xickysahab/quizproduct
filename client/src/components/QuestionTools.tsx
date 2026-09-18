import React, { useState } from 'react';
import { Sparkles, FileSpreadsheet } from 'lucide-react';
import AiDraftModal from './AiDraftModal';
import ImportModal from './ImportModal';

/** The two ways to add questions without typing each one. */
const QuestionTools: React.FC<{
  eventId: string;
  onDrafts: (drafts: any[]) => void;
  onImported: () => void;
}> = ({ eventId, onDrafts, onImported }) => {
  const [open, setOpen] = useState<'draft' | 'import' | null>(null);
  const button = 'bg-white text-accent border border-accent-soft px-5 py-3 rounded-2xl font-semibold text-sm flex items-center gap-2';

  return (
    <>
      <button onClick={() => setOpen('draft')} className={button}>
        <Sparkles className="w-4 h-4" />
        <span>Draft from PDF</span>
      </button>
      <button onClick={() => setOpen('import')} className={button}>
        <FileSpreadsheet className="w-4 h-4" />
        <span>Import from Excel</span>
      </button>

      {open === 'draft' && (
        <AiDraftModal
          eventId={eventId}
          onClose={() => setOpen(null)}
          onDrafts={(list) => onDrafts(list.map((d, i) => ({ ...d, draftKey: `${Date.now()}-${i}` })))}
        />
      )}
      {open === 'import' && <ImportModal eventId={eventId} onClose={() => setOpen(null)} onImported={onImported} />}
    </>
  );
};

export default QuestionTools;
