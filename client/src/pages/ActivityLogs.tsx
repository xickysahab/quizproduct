import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ArrowLeft, Server, FileText, Settings, Trash2, Edit2, Play, Search } from 'lucide-react';
import { format } from 'date-fns';

interface Log {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  details: any;
  createdAt: string;
  user: {
    name: string;
    email: string;
    role: string;
  };
}

const ActivityLogs: React.FC = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await api.get('/logs');
      setLogs(response.data.logs);
    } catch (error: any) {
      console.error('Failed to fetch logs', error);
      if (error.response?.status === 403) {
        navigate('/dashboard'); // Fallback if non-admin tries to access directly
      }
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes('CREATE') || action.includes('ADD')) return <Play className="w-4 h-4 text-[#8B5CF6]" />;
    if (action.includes('DELETE') || action.includes('CLEAR')) return <Trash2 className="w-4 h-4 text-[#F43F5E]" />;
    if (action.includes('UPDATE') || action.includes('EDIT')) return <Edit2 className="w-4 h-4 text-[#F59E0B]" />;
    return <Server className="w-4 h-4 text-[#64748B]" />;
  };

  const getActionBadge = (action: string) => {
    const baseClasses = "px-2.5 py-1 text-[11px] font-bold rounded-md tracking-wide";
    if (action.includes('CREATE') || action.includes('ADD')) return `${baseClasses} bg-[#8B5CF6]/15 text-[#A78BFA]`;
    if (action.includes('DELETE') || action.includes('CLEAR')) return `${baseClasses} bg-[#F43F5E]/15 text-[#FB7185]`;
    if (action.includes('UPDATE') || action.includes('EDIT')) return `${baseClasses} bg-[#F59E0B]/15 text-[#FBBF24]`;
    return `${baseClasses} bg-[#1E293B] text-[#64748B]`;
  };

  const filteredLogs = logs.filter(log => 
    log.action.toLowerCase().includes(search.toLowerCase()) || 
    log.user.name.toLowerCase().includes(search.toLowerCase()) ||
    (log.details?.title && log.details.title.toLowerCase().includes(search.toLowerCase())) ||
    (log.details?.text && log.details.text.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-[#F1F5F9] flex flex-col font-sans relative selection:bg-[#8B5CF6]/30">
      <Navbar />
      
      <main className="flex-grow container mx-auto px-4 pt-32 pb-12 md:pb-24 max-w-6xl">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2.5 bg-[#1E293B] hover:bg-[#334155] text-[#8B5CF6] rounded-xl transition-all border border-[#8B5CF6]/20"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8B5CF6]">
              System Records
            </span>
            <h1 className="text-4xl font-heading font-bold text-white flex items-center gap-3 mt-1">
              <FileText className="w-8 h-8 text-[#8B5CF6]" />
              Audit Logs
            </h1>
            <p className="text-sm text-[#64748B] mt-1">Track platform activities and administrative actions</p>
          </div>
        </div>

        <div className="bg-[#111827] rounded-3xl shadow-card border border-[#8B5CF6]/10 overflow-hidden">
          {/* Search Header */}
          <div className="p-4 border-b border-[#1E293B] bg-[#0B0F1A]/50 flex items-center justify-between">
            <div className="relative max-w-md w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
              <input 
                type="text" 
                placeholder="Search by action, user, or details..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-[#1E293B] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30 focus:border-[#8B5CF6]/50 transition-all bg-[#111827] text-white placeholder:text-[#475569]"
              />
            </div>
            <div className="text-sm text-[#64748B] font-medium font-mono bg-[#0B0F1A] px-3 py-1 rounded-full border border-[#1E293B]">
              Total records: {filteredLogs.length}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[#94A3B8]">
              <thead className="text-[10px] uppercase tracking-wider bg-[#0B0F1A] text-[#8B5CF6] font-semibold border-b border-[#1E293B]">
                <tr>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Resource</th>
                  <th className="px-6 py-4">Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3 text-[#64748B]">
                        <Settings className="w-8 h-8 animate-spin" />
                        <span>Loading logs...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-[#64748B]">
                      No logs found.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="border-b border-[#1E293B] hover:bg-[#1E293B]/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs whitespace-nowrap text-[#64748B]">
                        {format(new Date(log.createdAt), 'MMM dd, yyyy HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{log.user.name}</div>
                        <div className="text-xs text-[#475569]">{log.user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getActionIcon(log.action)}
                          <span className={getActionBadge(log.action)}>{log.action}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-[#94A3B8]">
                        {log.resource}
                      </td>
                      <td className="px-6 py-4">
                        <pre className="text-xs bg-[#0B0F1A] p-2.5 rounded-xl border border-[#1E293B] overflow-x-auto max-w-xs text-[#64748B]">
                          {log.details ? JSON.stringify(log.details, null, 2) : 'No details'}
                        </pre>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ActivityLogs;
