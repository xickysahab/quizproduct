import React, { useState } from 'react';
import { Share2, Copy, Check, MessageCircle } from 'lucide-react';
import { formatRoomCode } from '../utils/roomCode';

/**
 * Sharing a room, shaped for how join links actually travel in India.
 *
 * They go on WhatsApp, not email. That means one tap to the WhatsApp share
 * sheet, a code formatted so it can be read aloud off a slide, and the native
 * share sheet on mobile where it exists.
 */

interface Props {
  roomCode: string;
  title?: string;
}

const ShareRoom: React.FC<Props> = ({ roomCode, title }) => {
  const [copied, setCopied] = useState(false);

  const url = `${window.location.origin}/?code=${roomCode}`;
  const message = title
    ? `Join "${title}" — go to ${url} or enter code ${formatRoomCode(roomCode)}`
    : `Join my session — go to ${url} or enter code ${formatRoomCode(roomCode)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is on screen to copy by hand */
    }
  };

  const nativeShare = async () => {
    // The OS share sheet reaches WhatsApp, Telegram and everything else in one
    // tap. Falls through to copy where it does not exist, which is most desktops.
    if (navigator.share) {
      try {
        await navigator.share({ title: title || 'Join my session', text: message, url });
        return;
      } catch {
        /* user dismissed the sheet */
      }
    }
    void copy();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
        <span>WhatsApp</span>
      </a>

      <button
        onClick={nativeShare}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-100 transition-colors"
      >
        <Share2 className="w-4 h-4" />
        <span>Share</span>
      </button>

      <button
        onClick={copy}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-100 transition-colors"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
        <span>{copied ? 'Copied' : 'Copy link'}</span>
      </button>
    </div>
  );
};

export default ShareRoom;
