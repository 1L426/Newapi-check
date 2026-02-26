import { useState, useEffect } from 'react';
import { PlayCircle, Users, CheckCircle, XCircle, DollarSign, RefreshCw, CheckSquare, Square, X } from 'lucide-react';
import { useAccounts } from '../hooks/useAccounts';
import { useCheckin } from '../hooks/useCheckin';
import AccountCard from '../components/AccountCard';
import AddAccountModal from '../components/AddAccountModal';

function formatQuota(value) {
  if (value == null) return '0';
  const num = Number(value);
  if (Number.isNaN(num)) return '0';
  if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
}

export default function Dashboard() {
  const { accounts, fetchAccounts, createAccount, updateAccount, deleteAccount, toggleAccount, refreshBalance, refreshAllBalance } = useAccounts();
  const { running, checkinOne, checkinAllAsync, fetchDashboard } = useCheckin();
  const [dashboard, setDashboard] = useState(null);
  const [editAccount, setEditAccount] = useState(undefined);
  const [error, setError] = useState('');
  const [refreshingBalanceId, setRefreshingBalanceId] = useState(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    fetchDashboard().then(setDashboard).catch((e) => setError(e.message || '加载仪表盘失败'));
  }, [fetchDashboard]);

  const handleCheckinOne = async (id) => {
    try {
      await checkinOne(id);
      await fetchAccounts();
      setDashboard(await fetchDashboard());
      setError('');
    } catch (e) {
      setError(e.message || '签到失败');
    }
  };

  const handleCheckinAll = async () => {
    try {
      await checkinAllAsync();
      await fetchAccounts();
      setDashboard(await fetchDashboard());
      setError('');
    } catch (e) {
      setError(e.message || '批量签到失败');
    }
  };

  const handleSave = async (form) => {
    if (form.id) await updateAccount(form.id, form);
    else await createAccount(form);
    setEditAccount(undefined);
    setDashboard(await fetchDashboard());
  };

  const handleDelete = async (id) => {
    try {
      await deleteAccount(id);
      await fetchAccounts();
      setDashboard(await fetchDashboard());
    } catch (e) {
      setError(e.message || '删除失败');
    }
  };

  const handleToggle = async (id, enabled) => {
    try {
      await toggleAccount(id, enabled);
      await fetchAccounts();
      setDashboard(await fetchDashboard());
    } catch (e) {
      setError(e.message || '状态更新失败');
    }
  };

  const handleRefreshBalance = async (id) => {
    try {
      setRefreshingBalanceId(id);
      await refreshBalance(id);
      setDashboard(await fetchDashboard());
      setError('');
    } catch (e) {
      setError(e.message || '余额查询失败');
    } finally {
      setRefreshingBalanceId(null);
    }
  };

  const handleRefreshAllBalance = async () => {
    try {
      setRefreshingAll(true);
      await refreshAllBalance();
      setDashboard(await fetchDashboard());
      setError('');
    } catch (e) {
      setError(e.message || '批量余额查询失败');
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleSelectToggle = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map(a => a.id)));
    }
  };

  const handleSelectCheckin = async () => {
    if (selectedIds.size === 0) return;
    try {
      await checkinAllAsync([...selectedIds]);
      setSelectMode(false);
      setSelectedIds(new Set());
      await fetchAccounts();
      setDashboard(await fetchDashboard());
      setError('');
    } catch (e) {
      setError(e.message || '自定义签到失败');
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const totalQuota = dashboard?.totalQuota ?? 0;
  const totalUsedQuota = dashboard?.totalUsedQuota ?? 0;
  const totalRemaining = totalQuota - totalUsedQuota;

  const stats = [
    { label: '总账号', value: dashboard?.totalAccounts || 0, icon: Users, color: 'text-sky-600 dark:text-sky-400' },
    { label: '已启用', value: dashboard?.enabledAccounts || 0, icon: Users, color: 'text-cyan-600 dark:text-cyan-400' },
    { label: '今日成功', value: dashboard?.todaySuccess || 0, icon: CheckCircle, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: '今日失败', value: dashboard?.todayFailed || 0, icon: XCircle, color: 'text-red-500 dark:text-red-400' },
    { label: '总余额', value: formatQuota(totalRemaining), icon: DollarSign, color: totalRemaining > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">仪表盘</h1>
        <div className="flex flex-wrap gap-2">
          {!selectMode ? (
            <>
              <button onClick={handleRefreshAllBalance} disabled={refreshingAll} className="glass-button flex items-center gap-2">
                <RefreshCw size={16} className={refreshingAll ? 'animate-spin' : ''} /> {refreshingAll ? '查询中...' : '刷新余额'}
              </button>
              <button onClick={() => setSelectMode(true)} disabled={running} className="glass-button flex items-center gap-2">
                <CheckSquare size={16} /> 批量选择
              </button>
              <button onClick={handleCheckinAll} disabled={running} className="glass-button-primary flex items-center gap-2">
                <PlayCircle size={16} /> {running ? '签到中...' : '全部签到'}
              </button>
            </>
          ) : (
            <>
              <button onClick={handleSelectAll} className="glass-button flex items-center gap-2">
                {selectedIds.size === accounts.length ? <CheckSquare size={16} /> : <Square size={16} />}
                {selectedIds.size === accounts.length ? '取消全选' : '全选'}
              </button>
              <button
                onClick={handleSelectCheckin}
                disabled={selectedIds.size === 0 || running}
                className="glass-button-primary flex items-center gap-2"
              >
                <PlayCircle size={16} /> 自定义签到 ({selectedIds.size})
              </button>
              <button onClick={exitSelectMode} className="glass-button flex items-center gap-2">
                <X size={16} /> 退出选择
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map((s, index) => (
          <div
            key={s.label}
            className="glass-panel-stats p-5 group cursor-default"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="glass-icon w-12 h-12 mx-auto mb-3">
              <s.icon className={`${s.color} transition-transform duration-300 group-hover:scale-110`} size={22} />
            </div>
            <div className="text-2xl font-bold text-gray-800 dark:text-white tracking-tight">{s.value}</div>
            <div className="text-xs text-gray-500/80 dark:text-gray-300 font-medium mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="glass-panel px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map(a => (
          <AccountCard key={a.id} account={a} loading={running}
            onCheckin={handleCheckinOne} onEdit={setEditAccount}
            onDelete={handleDelete} onToggle={handleToggle}
            onRefreshBalance={handleRefreshBalance}
            refreshingBalance={refreshingBalanceId === a.id}
            selectMode={selectMode}
            selected={selectedIds.has(a.id)}
            onSelect={handleSelectToggle} />
        ))}
      </div>

      {editAccount !== undefined && (
        <AddAccountModal account={editAccount || null} onClose={() => setEditAccount(undefined)} onSave={handleSave} />
      )}
    </div>
  );
}
