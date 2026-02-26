import { useState, useEffect, useMemo } from 'react';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCheckin } from '../hooks/useCheckin';
import { useAccounts } from '../hooks/useAccounts';
import CheckinCalendar from '../components/CheckinCalendar';
import CheckinTrendChart from '../components/CheckinTrendChart';
import StatusBadge from '../components/StatusBadge';

const PAGE_SIZE = 20;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export default function CheckinLog() {
  const { fetchLogs } = useCheckin();
  const { accounts } = useAccounts();
  const [logs, setLogs] = useState([]);
  const [calendarLogs, setCalendarLogs] = useState([]);
  const [trendLogs, setTrendLogs] = useState([]);
  const [filter, setFilter] = useState({ account_id: '', status: '', start_date: '', end_date: '' });
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const hasFilter = filter.account_id || filter.status || filter.start_date || filter.end_date;

  const clearFilters = () => {
    setFilter({ account_id: '', status: '', start_date: '', end_date: '' });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [filter.account_id, filter.status, filter.start_date, filter.end_date]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const data = await fetchLogs({
          ...filter,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        });
        if (!mounted) return;
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setError('');
      } catch (e) {
        if (!mounted) return;
        setError(e.message || '加载日志失败');
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [fetchLogs, filter, page]);

  useEffect(() => {
    let mounted = true;
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const run = async () => {
      try {
        const data = await fetchLogs({
          account_id: filter.account_id,
          status: filter.status,
          start_date: formatDate(monthStart),
          end_date: formatDate(monthEnd),
          limit: 500,
          offset: 0,
        });
        if (!mounted) return;
        setCalendarLogs(data.logs || []);
      } catch {
        if (!mounted) return;
        setCalendarLogs([]);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [fetchLogs, filter.account_id, filter.status, year, month]);

  // Fetch trend data (last 14 days)
  useEffect(() => {
    let mounted = true;
    const today = new Date();
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(today.getDate() - 13);
    const run = async () => {
      try {
        const data = await fetchLogs({
          account_id: filter.account_id,
          start_date: formatDate(twoWeeksAgo),
          end_date: formatDate(today),
          limit: 1000,
          offset: 0,
        });
        if (!mounted) return;
        setTrendLogs(data.logs || []);
      } catch {
        if (!mounted) return;
        setTrendLogs([]);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [fetchLogs, filter.account_id]);

  const monthLogs = useMemo(() => {
    return calendarLogs.filter(l => {
      const d = new Date(l.created_at);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [calendarLogs, year, month]);

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(y => y - 1);
    } else {
      setMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(y => y + 1);
    } else {
      setMonth(m => m + 1);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">签到日志</h1>

      {/* 月份导航 */}
      <div className="flex items-center gap-4">
        <button onClick={prevMonth} className="glass-button !p-2 !rounded-xl">
          <ChevronLeft size={16} />
        </button>
        <span className="font-medium text-gray-700 dark:text-gray-200 min-w-[100px] text-center">{year}年{month + 1}月</span>
        <button onClick={nextMonth} className="glass-button !p-2 !rounded-xl">
          <ChevronRight size={16} />
        </button>
      </div>

      <CheckinCalendar logs={monthLogs} year={year} month={month} />

      <CheckinTrendChart logs={trendLogs} days={14} />

      {/* 筛选区域 */}
      <div className="glass-panel p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Search size={16} className="text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">筛选条件</span>
          {hasFilter && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 flex items-center gap-1"
            >
              <X size={14} />
              清除筛选
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">账号</label>
            <select
              className="glass-select"
              value={filter.account_id}
              onChange={e => setFilter(f => ({ ...f, account_id: e.target.value }))}
            >
              <option value="">全部账号</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">状态</label>
            <select
              className="glass-select"
              value={filter.status}
              onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
            >
              <option value="">全部状态</option>
              <option value="success">签到成功</option>
              <option value="failed">签到失败</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">开始日期</label>
            <input
              className="glass-input"
              type="date"
              value={filter.start_date}
              onChange={e => setFilter(f => ({ ...f, start_date: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">结束日期</label>
            <input
              className="glass-input"
              type="date"
              value={filter.end_date}
              onChange={e => setFilter(f => ({ ...f, end_date: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300 pt-1">
          <span>共 {total} 条日志</span>
          <span>第 {page} / {totalPages} 页</span>
        </div>
      </div>

      {error && (
        <div className="glass-panel px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/30 dark:border-white/10 text-left text-gray-600 dark:text-gray-300">
              <th className="px-4 py-3">账号</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">消息</th>
              <th className="px-4 py-3">时间</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-b border-white/20 dark:border-white/5 hover:bg-white/20 dark:hover:bg-white/5">
                <td className="px-4 py-3 dark:text-white">{log.account_name}</td>
                <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-xs truncate">{log.message}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{log.created_at}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">暂无日志</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="glass-button text-xs flex items-center gap-1.5 disabled:opacity-50"
        >
          <ChevronLeft size={14} />
          上一页
        </button>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="glass-button text-xs flex items-center gap-1.5 disabled:opacity-50"
        >
          下一页
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
