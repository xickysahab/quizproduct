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
  const button = 'inline-flex items-center gap-1.5 px-4 h-9 rounded-full text-[14px] font-semibold bg-gray-100 text-ink hover:bg-gray-200';

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

      <AiDraftModal
        open={open === 'draft'}
        eventId={eventId}
        onClose={() => setOpen(null)}
        onDrafts={(list) => onDrafts(list.map((d, i) => ({ ...d, draftKey: `${Date.now()}-${i}` })))}
      />
      <ImportModal open={open === 'import'} eventId={eventId} onClose={() => setOpen(null)} onImported={onImported} />
    </>
  );
};

export default QuestionTools;
