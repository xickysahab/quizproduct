import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Server, FileText, Settings, Trash2, Edit2, Play, Search } from 'lucide-react';
import { format } from 'date-fns';
import DashboardLayout from '../components/DashboardLayout';
import { sidebarForRole, dashboardTitleForRole } from '../config/sidebar';
import { useAuth } from '../context/AuthContext';

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
  const { user } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    fetchLogs(1);
  }, []);

  const fetchLogs = async (nextPage = 1, append = false) => {
    try {
      const response = await api.get('/logs', { params: { page: nextPage, limit: 100 } });
      setLogs((prev) => (append ? [...prev, ...(response.data.logs || [])] : response.data.logs || []));
      setHasMore(Boolean(response.data.pagination?.hasMore));
      setPage(nextPage);
    } catch (error: any) {
      console.error('Failed to fetch logs', error);
      if (error.response?.status === 403) {
        navigate('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes('CREATE') || action.includes('ADD')) return <Play className="w-4 h-4 text-accent" />;
    if (action.includes('DELETE') || action.includes('CLEAR')) return <Trash2 className="w-4 h-4 text-red-500" />;
    if (action.includes('UPDATE') || action.includes('EDIT')) return <Edit2 className="w-4 h-4 text-amber-500" />;
    return <Server className="w-4 h-4 text-gray-500" />;
  };

  const getActionBadge = (action: string) => {
    const baseClasses = "px-2.5 py-1 text-[11px] font-bold rounded-md tracking-wide";
    if (action.includes('CREATE') || action.includes('ADD')) return `${baseClasses} bg-accent-wash text-accent`;
    if (action.includes('DELETE') || action.includes('CLEAR')) return `${baseClasses} bg-red-50 text-red-600`;
    if (action.includes('UPDATE') || action.includes('EDIT')) return `${baseClasses} bg-amber-50 text-amber-700`;
    return `${baseClasses} bg-gray-100 text-gray-600`;
  };

  const filteredLogs = logs.filter(log => 
    log.action.toLowerCase().includes(search.toLowerCase()) || 
    log.user.name.toLowerCase().includes(search.toLowerCase()) ||
    (log.details?.title && log.details.title.toLowerCase().includes(search.toLowerCase())) ||
    (log.details?.text && log.details.text.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <DashboardLayout title={dashboardTitleForRole(user?.role)} sidebarItems={sidebarForRole(user?.role)}>
      <div className="space-y-8">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
            System Records
          </span>
          <h1 className="text-4xl font-heading font-bold text-gray-900 flex items-center gap-3 mt-1">
            <FileText className="w-8 h-8 text-accent" />
            Audit Logs
          </h1>
          <p className="text-sm text-gray-500 mt-1">Track platform activities and administrative actions</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Search Header */}
          <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
            <div className="relative max-w-md w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search by action, user, or details..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-accent focus:border-accent transition-all bg-white text-gray-900 placeholder:text-gray-400 shadow-sm"
              />
            </div>
            <div className="text-sm text-gray-600 font-medium font-mono bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
              Total records: {filteredLogs.length}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="text-[10px] uppercase tracking-wider bg-gray-50 text-gray-500 font-bold border-b border-gray-200">
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
                      <div className="flex flex-col items-center gap-3 text-gray-400">
                        <Settings className="w-8 h-8 animate-spin" />
                        <span>Loading logs...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400">
                      No logs found.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs whitespace-nowrap text-gray-500">
                        {format(new Date(log.createdAt), 'MMM dd, yyyy HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{log.user.name}</div>
                        <div className="text-xs text-gray-500">{log.user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getActionIcon(log.action)}
                          <span className={getActionBadge(log.action)}>{log.action}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-700">
                        {log.resource}
                      </td>
                      <td className="px-6 py-4">
                        <pre className="text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-200 overflow-x-auto max-w-xs text-gray-600">
                          {log.details ? JSON.stringify(log.details, null, 2) : 'No details'}
                        </pre>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="p-4 text-center border-t border-gray-100">
              <button onClick={() => fetchLogs(page + 1, true)} className="text-sm font-semibold text-accent">
                Load more
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ActivityLogs;
