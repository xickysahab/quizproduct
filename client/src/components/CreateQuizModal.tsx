import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import Sheet from './Sheet';
import SegmentedControl from './SegmentedControl';

interface CreateQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

/** Name it, and you are straight into adding questions. */
const CreateQuizModal: React.FC<CreateQuizModalProps> = ({ isOpen, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  // Asked, not defaulted: it decides whether answers are graded, and a graded
  // answer is final once submitted.
  const [kind, setKind] = useState<'GAME' | 'SURVEY'>('GAME');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      const response = await api.post('/events', { title: title.trim(), preset: kind });
      setTitle('');
      onClose();
      onCreated?.();
      navigate(`/events/${response.data.event.id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not create the quiz.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onClose={onClose} title="New quiz" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block text-[13px] font-medium text-muted mb-1.5">Name</span>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field w-full px-4 h-12 text-[17px]"
            placeholder="Chapter 3 — Motion"
          />
        </label>
        <div className="space-y-2">
          <SegmentedControl
            id="new-quiz-kind"
            value={kind}
            onChange={setKind}
            segments={[
              { value: 'GAME', label: 'Quiz' },
              { value: 'SURVEY', label: 'Survey' },
            ]}
          />
          <p className="text-[13px] text-muted">
            {kind === 'GAME'
              ? 'Answers are scored, and final once submitted.'
              : 'Nothing is scored, and people can change their answer.'}
          </p>
        </div>
        <button
          type="submit"
          disabled={loading || !title.trim()}
          className="btn-primary w-full h-12 rounded-full text-[17px] disabled:opacity-40"
        >
          {loading ? 'Creating…' : `Create ${kind === 'SURVEY' ? 'survey' : 'quiz'}`}
        </button>
      </form>
    </Sheet>
  );
};

export default CreateQuizModal;
