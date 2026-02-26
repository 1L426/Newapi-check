import { X, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function CheckinProgress({ progress, onCancel, onClear }) {
  if (!progress) return null;

  const { total, completed, current, status, results } = progress;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isRunning = status === 'running';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';

  const successCount = results?.filter(r => r.success).length || 0;
  const failCount = results?.filter(r => !r.success).length || 0;

  return (
    <div className="glass-progress mx-4 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-4">
        {/* Status Icon */}
        <div className="flex-shrink-0">
          {isRunning && <Loader2 size={20} className="animate-spin text-sky-500" />}
          {isCompleted && <CheckCircle size={20} className="text-emerald-500" />}
          {isFailed && <XCircle size={20} className="text-red-500" />}
        </div>

        {/* Progress Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {isRunning && current ? `正在签到: ${current}` : isRunning ? '准备签到...' : isCompleted ? '签到完成' : '签到失败'}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {completed}/{total} ({percent}%)
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 bg-gray-200/50 dark:bg-gray-700/50 rounded-full overflow-hidden">
            <div
              className="h-full progress-fill rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Results Summary */}
          {(isCompleted || isFailed) && results && results.length > 0 && (
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="text-emerald-600 dark:text-emerald-400">成功: {successCount}</span>
              {failCount > 0 && <span className="text-red-500 dark:text-red-400">失败: {failCount}</span>}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex-shrink-0">
          {isRunning ? (
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg hover:bg-gray-200/50 dark:hover:bg-gray-700/50 text-gray-500 dark:text-gray-400"
              title="取消签到"
            >
              <X size={18} />
            </button>
          ) : (
            <button
              onClick={onClear}
              className="p-1.5 rounded-lg hover:bg-gray-200/50 dark:hover:bg-gray-700/50 text-gray-500 dark:text-gray-400"
              title="关闭"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
