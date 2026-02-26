import { useState } from 'react';
import { Plus, PlayCircle, Power, RefreshCw, CheckSquare, Square, X, Search, Filter } from 'lucide-react';
import { useAccounts } from '../hooks/useAccounts';
import { useCheckin } from '../hooks/useCheckin';
import AccountCard from '../components/AccountCard';
import AddAccountModal from '../components/AddAccountModal';
import ConfirmModal from '../components/ConfirmModal';

export default function Accounts() {
  const {
    accounts,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    toggleAccount,
    testAccount,
    toggleAllAccounts,
    refreshBalance,
    refreshAllBalance,
  } = useAccounts();
  const { running, checkinOne, checkinAll, checkinAllAsync } = useCheckin();
  const [modal, setModal] = useState(undefined);
  const [testingId, setTestingId] = useState(null);
  const [refreshingBalanceId, setRefreshingBalanceId] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredAccounts = accounts.filter(a => {
    if (searchQuery && !a.name.toLowerCase().includes(searchQuery.toLowerCase()) && !a.base_url?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter === 'success' && a.last_checkin_result !== 'success') return false;
    if (statusFilter === 'failed' && a.last_checkin_result !== 'failed') return false;
    if (statusFilter === 'enabled' && !a.enabled) return false;
    if (statusFilter === 'disabled' && a.enabled) return false;
    return true;
  });

  const showMsg = (text, isError = false) => {
    if (isError) {
      setError(text);
      setMsg('');
    } else {
      setMsg(text);
      setError('');
    }
    setTimeout(() => {
      setMsg('');
      setError('');
    }, 3000);
  };

  const handleSave = async (form) => {
    try {
      if (form.id) await updateAccount(form.id, form);
      else await createAccount(form);
      setModal(undefined);
      showMsg('账号保存成功');
    } catch (e) {
      showMsg(e.message || '保存失败', true);
    }
  };

  const handleCheckinOne = async (id) => {
    const result = await checkinOne(id);
    await fetchAccounts();
    showMsg(result?.success ? '签到成功' : `签到失败: ${result?.message || '未知错误'}`, !result?.success);
  };

  const handleCheckinAll = async () => {
    try {
      await checkinAllAsync();
    } catch (e) {
      showMsg(e.message || '签到失败', true);
    }
  };

  const handleTest = async (id) => {
    setTestingId(id);
    try {
      const result = await testAccount(id);
      showMsg(result?.success ? '连接测试成功' : `连接测试失败: ${result?.message || '未知错误'}`, !result?.success);
      await fetchAccounts();
    } catch (e) {
      showMsg(e.message || '连接测试失败', true);
    } finally {
      setTestingId(null);
    }
  };

  const handleBatchToggle = async (enabled) => {
    await toggleAllAccounts(enabled);
    showMsg(enabled ? '已全部启用' : '已全部禁用');
  };

  const handleDelete = async (id) => {
    const account = accounts.find(a => a.id === id);
    setDeleteConfirm(account);
  };

  const confirmDelete = async () => {
    if (deleteConfirm) {
      try {
        await deleteAccount(deleteConfirm.id);
        showMsg('账号已删除');
      } catch (e) {
        showMsg(e.message || '删除失败', true);
      }
      setDeleteConfirm(null);
    }
  };

  const handleToggle = async (id, enabled) => {
    try {
      await toggleAccount(id, enabled);
      showMsg(enabled ? '账号已启用' : '账号已禁用');
    } catch (e) {
      showMsg(e.message || '更新状态失败', true);
    }
  };

  const handleRefreshBalance = async (id) => {
    setRefreshingBalanceId(id);
    try {
      await refreshBalance(id);
      showMsg('余额刷新成功');
    } catch (e) {
      showMsg(e.message || '余额查询失败', true);
    } finally {
      setRefreshingBalanceId(null);
    }
  };

  const handleRefreshAllBalance = async () => {
    try {
      await refreshAllBalance();
      showMsg('全部余额刷新完成');
    } catch (e) {
      showMsg(e.message || '批量余额查询失败', true);
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
    const visibleIds = filteredAccounts.map(a => a.id);
    if (visibleIds.every(id => selectedIds.has(id))) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => new Set([...prev, ...visibleIds]));
    }
  };

  const handleSelectCheckin = async () => {
    if (selectedIds.size === 0) return;
    await checkinAllAsync([...selectedIds]);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">账号管理</h1>
        <button onClick={() => setModal(null)} className="glass-button-primary flex items-center gap-2">
          <Plus size={16} /> 添加账号
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {!selectMode ? (
          <>
            <button onClick={handleCheckinAll} disabled={running} className="glass-button-primary flex items-center gap-2">
              <PlayCircle size={16} /> {running ? '签到中...' : '全部签到'}
            </button>
            <button onClick={() => setSelectMode(true)} className="glass-button flex items-center gap-2">
              <CheckSquare size={16} /> 批量选择
            </button>
            <button onClick={handleRefreshAllBalance} className="glass-button flex items-center gap-2">
              <RefreshCw size={16} /> 刷新余额
            </button>
            <button onClick={() => handleBatchToggle(true)} className="glass-button flex items-center gap-2">
              <Power size={16} /> 全部启用
            </button>
            <button onClick={() => handleBatchToggle(false)} className="glass-button flex items-center gap-2">
              <Power size={16} /> 全部禁用
            </button>
          </>
        ) : (
          <>
            <button onClick={handleSelectAll} className="glass-button flex items-center gap-2">
              {filteredAccounts.every(a => selectedIds.has(a.id)) && filteredAccounts.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
              {filteredAccounts.every(a => selectedIds.has(a.id)) && filteredAccounts.length > 0 ? '取消全选' : '全选'}
            </button>
            <button
              onClick={handleSelectCheckin}
              disabled={selectedIds.size === 0 || running}
              className="glass-button-primary flex items-center gap-2"
            >
              <PlayCircle size={16} /> 签到选中 ({selectedIds.size})
            </button>
            <button onClick={exitSelectMode} className="glass-button flex items-center gap-2">
              <X size={16} /> 退出选择
            </button>
          </>
        )}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索账号名称或地址..."
            className="glass-input w-full pl-9 pr-8 py-2 text-sm"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Filter size={15} className="text-gray-400 dark:text-gray-500 mr-0.5" />
          {[
            { key: 'all', label: '全部' },
            { key: 'success', label: '签到成功' },
            { key: 'failed', label: '签到失败' },
            { key: 'enabled', label: '已启用' },
            { key: 'disabled', label: '已禁用' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                statusFilter === f.key
                  ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/30'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-700/40'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {(searchQuery || statusFilter !== 'all') && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {filteredAccounts.length}/{accounts.length} 个账号
          </span>
        )}
      </div>

      {(msg || error) && (
        <div className={`glass-panel px-4 py-3 text-sm ${error ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {error || msg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
        {filteredAccounts.map(a => (
          <AccountCard
            key={a.id}
            account={a}
            loading={running}
            testing={testingId === a.id}
            refreshingBalance={refreshingBalanceId === a.id}
            onCheckin={handleCheckinOne}
            onTest={handleTest}
            onEdit={setModal}
            onDelete={handleDelete}
            onToggle={handleToggle}
            onRefreshBalance={handleRefreshBalance}
            selectMode={selectMode}
            selected={selectedIds.has(a.id)}
            onSelect={handleSelectToggle}
          />
        ))}
        {filteredAccounts.length === 0 && accounts.length > 0 && (
          <div className="glass-panel p-8 col-span-full text-center text-gray-500 dark:text-gray-400">
            没有匹配的账号
          </div>
        )}
        {accounts.length === 0 && (
          <div className="glass-panel p-8 col-span-full text-center text-gray-500 dark:text-gray-400">
            还没有账号，点击右上角添加
          </div>
        )}
      </div>

      {modal !== undefined && (
        <AddAccountModal account={modal} onClose={() => setModal(undefined)} onSave={handleSave} />
      )}

      {deleteConfirm && (
        <ConfirmModal
          title="确认删除"
          message={`确定要删除账号「${deleteConfirm.name}」吗？此操作不可撤销。`}
          confirmText="删除"
          cancelText="取消"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
