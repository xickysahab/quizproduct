export const QUIZPULSE_PRESET = {
  chartType: 'CUSTOM_GRID',
  options: [
    {
      letter: 'A',
      text: 'Strongly Agree — fully aligned with this perspective.',
      alert: 'HIGH CONFIDENCE',
      themeColor: '#10B981',
    },
    {
      letter: 'B',
      text: 'Agree — mostly aligned, with minor reservations.',
      alert: 'POSITIVE',
      themeColor: '#8B5CF6',
    },
    {
      letter: 'C',
      text: 'Disagree — some concerns that need to be addressed.',
      alert: 'CAUTION',
      themeColor: '#F59E0B',
    },
    {
      letter: 'D',
      text: 'Strongly Disagree — significant issues identified.',
      alert: 'CRITICAL',
      themeColor: '#F43F5E',
    },
  ]
};

// Keep backward compat alias
export const SAHAJOMETER_PRESET = QUIZPULSE_PRESET;
