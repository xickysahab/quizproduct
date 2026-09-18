import { useState, useEffect } from 'react';
import { RefreshCw, BarChart, PieChart, LayoutGrid } from 'lucide-react';
import Sheet from './Sheet';
import { QUIZPULSE_PRESET } from '../constants/presets';

interface ConcludeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: any) => void;
  initialConfig?: any;
}

const defaultOptions = [
  { letter: 'A', text: 'Option A Text', alert: 'ALERT A', themeColor: '#4F46E5' },
  { letter: 'B', text: 'Option B Text', alert: 'ALERT B', themeColor: '#10B981' },
  { letter: 'C', text: 'Option C Text', alert: 'ALERT C', themeColor: '#F59E0B' },
  { letter: 'D', text: 'Option D Text', alert: 'ALERT D', themeColor: '#EF4444' },
];

export default function ConcludeSettingsModal({ isOpen, onClose, onSave, initialConfig }: ConcludeSettingsModalProps) {
  const [chartType, setChartType] = useState<string>('CUSTOM_GRID');
  const [options, setOptions] = useState<any[]>(defaultOptions);

  useEffect(() => {
    if (initialConfig) {
      if (initialConfig.chartType) setChartType(initialConfig.chartType);
      
      // Support legacy config format (array instead of object)
      if (Array.isArray(initialConfig)) {
        setOptions(initialConfig);
        setChartType('CUSTOM_GRID');
      } else if (initialConfig.options) {
        setOptions(initialConfig.options);
      }
    }
  }, [initialConfig]);

  const loadPreset = () => {
    setChartType(QUIZPULSE_PRESET.chartType);
    setOptions(QUIZPULSE_PRESET.options);
  };

  const handleChange = (index: number, field: string, value: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setOptions(newOptions);
  };

  const handleSave = () => {
    onSave({ chartType, options });
    onClose();
  };

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      eyebrow="Shown when the session ends"
      title="Results screen"
      size="xl"
      footer={
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-5 h-11 rounded-full bg-gray-100 text-ink font-semibold">
            Cancel
          </button>
          <button onClick={handleSave} className="px-5 h-11 rounded-full btn-primary">
            Save
          </button>
        </div>
      }
    >
          <div>
            
            {/* Chart Type Selector */}
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 font-heading">1. Select Chart Type</h3>
                <button
                  onClick={loadPreset}
                  className="flex items-center gap-2 px-4 py-2 bg-accent-wash text-accent rounded-xl font-bold hover:bg-accent-wash transition-colors text-sm border border-accent-soft"
                >
                  <RefreshCw className="w-4 h-4" />
                  Load QuizPulse Preset
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button 
                  onClick={() => setChartType('CUSTOM_GRID')}
                  className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all shadow-sm ${chartType === 'CUSTOM_GRID' ? 'border-accent bg-accent-wash text-accent' : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white hover:bg-gray-50'}`}
                >
                  <LayoutGrid className={`w-8 h-8 ${chartType === 'CUSTOM_GRID' ? 'text-accent' : 'text-gray-400'}`} />
                  <span className="font-bold text-sm">Cards Grid Layout</span>
                </button>
                <button 
                  onClick={() => setChartType('BAR_CHART')}
                  className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all shadow-sm ${chartType === 'BAR_CHART' ? 'border-accent bg-accent-wash text-accent' : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white hover:bg-gray-50'}`}
                >
                  <BarChart className={`w-8 h-8 ${chartType === 'BAR_CHART' ? 'text-accent' : 'text-gray-400'}`} />
                  <span className="font-bold text-sm">Bar Chart View</span>
                </button>
                <button 
                  onClick={() => setChartType('PIE_CHART')}
                  className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all shadow-sm ${chartType === 'PIE_CHART' ? 'border-accent bg-accent-wash text-accent' : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white hover:bg-gray-50'}`}
                >
                  <PieChart className={`w-8 h-8 ${chartType === 'PIE_CHART' ? 'text-accent' : 'text-gray-400'}`} />
                  <span className="font-bold text-sm">Donut / Pie Chart</span>
                </button>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-900 font-heading">2. Customize Options</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {options.map((opt, idx) => (
                <div key={idx} className="p-6 rounded-2xl border border-gray-200 bg-gray-50 shadow-sm space-y-4 hover-card">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2 font-heading">
                      <span className="w-6 h-6 rounded flex items-center justify-center text-xs text-white shadow-sm" style={{ backgroundColor: opt.themeColor || '#000' }}>
                        {opt.letter}
                      </span>
                      Option {opt.letter}
                    </h3>
                    
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-gray-500 cursor-pointer uppercase tracking-wider" htmlFor={`color-${idx}`}>Theme Color</label>
                      <input 
                        id={`color-${idx}`}
                        type="color" 
                        value={opt.themeColor || '#000000'}
                        onChange={(e) => handleChange(idx, 'themeColor', e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border border-gray-300 p-0 shadow-sm"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Result Text / Title</label>
                    <textarea
                      value={opt.text}
                      onChange={(e) => handleChange(idx, 'text', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-accent focus:border-accent transition-shadow placeholder:text-gray-400 shadow-sm"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Alert Badge / Subtitle</label>
                    <input
                      type="text"
                      value={opt.alert}
                      onChange={(e) => handleChange(idx, 'alert', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-accent focus:border-accent transition-shadow placeholder:text-gray-400 shadow-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

    </Sheet>
  );
}
