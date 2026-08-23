import type { QuestionType } from '@prisma/client';

export type StarterQuestion = {
  type: QuestionType;
  text: string;
  options: string[];
  correctOption: number | null;
  correctOptions: number[];
  timeLimit: number | null;
  order: number;
};

export type StarterTemplate = {
  id: string;
  title: string;
  description: string;
  sessionMode: 'QUIZ' | 'SURVEY';
  questions: StarterQuestion[];
};

/**
 * Built-in decks the host can clone into a real event. Kept in code rather
 * than the database so every environment gets the same starters without a
 * seed step, and so `isTemplate` stays free for user-saved packs later.
 */
export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'icebreaker',
    title: 'Team icebreaker',
    description: 'Light warm-up polls for kickoffs and all-hands.',
    sessionMode: 'SURVEY',
    questions: [
      {
        type: 'MCQ',
        text: 'How are you feeling about this week?',
        options: ['Energised', 'Steady', 'Overloaded', 'Need coffee'],
        correctOption: null,
        correctOptions: [],
        timeLimit: 30,
        order: 0,
      },
      {
        type: 'WORD_CLOUD',
        text: 'One word for our biggest opportunity right now',
        options: [],
        correctOption: null,
        correctOptions: [],
        timeLimit: 45,
        order: 1,
      },
      {
        type: 'MULTI_SELECT',
        text: 'Which of these would help you most this month?',
        options: ['Clearer priorities', 'Fewer meetings', 'More pairing', 'Better tools'],
        correctOption: null,
        correctOptions: [],
        timeLimit: 40,
        order: 2,
      },
      {
        type: 'OPEN_TEXT',
        text: 'What should we celebrate from last sprint?',
        options: [],
        correctOption: null,
        correctOptions: [],
        timeLimit: 60,
        order: 3,
      },
    ],
  },
  {
    id: 'knowledge-check',
    title: 'Quick knowledge check',
    description: 'Scored MCQs with a short timer — good for training recaps.',
    sessionMode: 'QUIZ',
    questions: [
      {
        type: 'MCQ',
        text: 'What does a room PIN do in QuizPulse?',
        options: [
          'Lets the audience join the live session',
          'Resets every password',
          'Deletes the quiz',
          'Opens billing settings',
        ],
        correctOption: 0,
        correctOptions: [],
        timeLimit: 20,
        order: 0,
      },
      {
        type: 'MCQ',
        text: 'When should you reveal results?',
        options: [
          'As soon as the first answer lands',
          'When you want the room to see the distribution',
          'Only after the quiz is deleted',
          'Never — results stay private',
        ],
        correctOption: 1,
        correctOptions: [],
        timeLimit: 20,
        order: 1,
      },
      {
        type: 'MULTI_SELECT',
        text: 'Which question types can be scored?',
        options: ['MCQ', 'MULTI_SELECT', 'OPEN_TEXT', 'RANKING'],
        correctOption: null,
        correctOptions: [0, 1, 3],
        timeLimit: 25,
        order: 2,
      },
      {
        type: 'RATING',
        text: 'How confident are you running a live session? (1 = low, 5 = high)',
        options: ['1', '2', '3', '4', '5'],
        correctOption: null,
        correctOptions: [],
        timeLimit: 15,
        order: 3,
      },
    ],
  },
  {
    id: 'town-hall',
    title: 'Town hall pulse',
    description: 'Anonymous-friendly Q&A style polls for leadership updates.',
    sessionMode: 'SURVEY',
    questions: [
      {
        type: 'RATING',
        text: 'How clear was today’s update?',
        options: ['1', '2', '3', '4', '5'],
        correctOption: null,
        correctOptions: [],
        timeLimit: 30,
        order: 0,
      },
      {
        type: 'RANKING',
        text: 'Rank what we should prioritise next quarter',
        options: ['Hiring', 'Product quality', 'Customer support', 'Marketing'],
        correctOption: null,
        correctOptions: [],
        timeLimit: 45,
        order: 1,
      },
      {
        type: 'OPEN_TEXT',
        text: 'What question should leadership answer next?',
        options: [],
        correctOption: null,
        correctOptions: [],
        timeLimit: 60,
        order: 2,
      },
      {
        type: 'MCQ',
        text: 'Preferred format for the next all-hands?',
        options: ['Short update + Q&A', 'Deep dive on one topic', 'Breakout rooms', 'Async written update'],
        correctOption: null,
        correctOptions: [],
        timeLimit: 30,
        order: 3,
      },
    ],
  },
];

export const getStarterTemplate = (id: string): StarterTemplate | undefined =>
  STARTER_TEMPLATES.find((template) => template.id === id);
