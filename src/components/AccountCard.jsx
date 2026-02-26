import { Play, Pencil, Trash2, Power, Wifi, RefreshCw } from 'lucide-react';
import StatusBadge from './StatusBadge';

function formatQuota(value) {
  if (value == null) return '--';
  const num = Number(value);
  if (Number.isNaN(num)) return '--';
  if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
}

function quotaColor(quota, usedQuota) {
  if (quota == null) return 'text-gray-400 dark:text-gray-300';
  const num = Number(quota);
  const used = Number(usedQuota) || 0;
  if (num <= 0) return 'text-red-500 dark:text-red-400';
  const remaining = num - used;
  if (remaining <= 0) return 'text-red-500 dark:text-red-400';
  if (remaining / num < 0.2) return 'text-amber-500 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

export default function AccountCard({
  account,
  onCheckin,
  onEdit,
  onDelete,
  onToggle,
  onTest,
  onRefreshBalance,
  loading,
  testing,
  refreshingBalance,
  selectMode,
  selected,
  onSelect,
}) {
  const remaining = account.quota != null && account.used_quota != null
    ? Number(account.quota) - Number(account.used_quota)
    : null;

  return (
    <div
      className={`glass-panel p-6 space-y-4 group ${selectMode ? 'cursor-pointer' : ''} ${selected ? 'ring-2 ring-sky-400 dark:ring-sky-500' : ''}`}
      onClick={selectMode ? () => onSelect(account.id) : undefined}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {selectMode && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect(account.id)}
              onClick={(e) => e.stopPropagation()}
              className="glass-checkbox"
            />
          )}
          <div className="space-y-1">
            <h3 className="font-semibold text-gray-800 dark:text-white text-base tracking-tight">
              {account.name}
            </h3>
            <p className="text-xs text-gray-500/80 dark:text-gray-300 truncate max-w-[200px] font-medium">
              {account.base_url}
            </p>
          </div>
        </div>
        <StatusBadge status={account.enabled ? (account.last_checkin_result || 'active') : 'disabled'} />
      </div>

      {/* Info Section */}
      <div className="text-xs text-gray-600/70 dark:text-gray-300 space-y-1.5 font-medium">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400/60 dark:bg-sky-400"></span>
          类型: {account.login_type === 'session' ? 'Session' : '密码登录'}
        </div>
        {account.last_checkin_at && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400/60 dark:bg-teal-400"></span>
            上次签到: {account.last_checkin_at}
          </div>
        )}
        {account.last_error_message && (
          <div className="flex items-center gap-2 text-red-500/90 dark:text-red-400" title={account.last_error_message}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
            <span className="truncate">失败原因: {account.last_error_message}</span>
          </div>
        )}
      </div>

      {/* Balance Section */}
      <div className="glass-divider"></div>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="text-sm text-gray-600/80 dark:text-gray-300 font-medium">
            余额:
            <span className={`ml-1.5 font-bold text-base ${quotaColor(account.quota, account.used_quota)}`}>
              {remaining != null ? formatQuota(remaining) : '--'}
            </span>
          </div>
          {account.quota != null && (
            <div className="text-xs text-gray-400 dark:text-gray-400 font-medium">
              总额 {formatQuota(account.quota)} / 已用 {formatQuota(account.used_quota)}
            </div>
          )}
          {account.quota_unit && (
            <div className="text-xs text-gray-400 dark:text-gray-400">
              单位系数: {account.quota_unit}
            </div>
          )}
          {account.balance_updated_at && (
            <div className="text-xs text-gray-400 dark:text-gray-400">
              更新: {account.balance_updated_at}
            </div>
          )}
        </div>
        {onRefreshBalance && (
          <button
            onClick={() => onRefreshBalance(account.id)}
            disabled={refreshingBalance}
            className="glass-button !p-2.5 !rounded-xl"
            title="刷新余额"
          >
            <RefreshCw size={14} className={refreshingBalance ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* Actions */}
      {!selectMode && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => onCheckin(account.id)}
            disabled={loading}
            className="glass-button-primary text-xs flex items-center gap-1.5 px-3.5 py-2"
          >
            <Play size={13} /> 签到
          </button>
          {onTest && (
            <button
              onClick={() => onTest(account.id)}
              disabled={loading || testing}
              className="glass-button text-xs flex items-center gap-1.5 px-3 py-2"
            >
              <Wifi size={13} /> {testing ? '测试中' : '测试'}
            </button>
          )}
          <button
            onClick={() => onToggle(account.id, !account.enabled)}
            className="glass-button text-xs flex items-center gap-1.5 px-3 py-2"
          >
            <Power size={13} /> {account.enabled ? '禁用' : '启用'}
          </button>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => onEdit(account)}
              className="glass-button !p-2.5 !rounded-xl"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onDelete(account.id)}
              className="glass-button-danger !p-2.5 !rounded-xl"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
