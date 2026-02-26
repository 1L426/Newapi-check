const styles = {
  success: 'from-emerald-400/40 to-emerald-500/30 text-emerald-700 dark:text-emerald-300 border-emerald-300/60 dark:border-emerald-500/40 shadow-emerald-500/10',
  failed: 'from-red-400/40 to-red-500/30 text-red-700 dark:text-red-300 border-red-300/60 dark:border-red-500/40 shadow-red-500/10',
  active: 'from-sky-400/40 to-sky-500/30 text-sky-700 dark:text-sky-300 border-sky-300/60 dark:border-sky-500/40 shadow-sky-500/10',
  disabled: 'from-gray-300/40 to-gray-400/30 text-gray-500 dark:text-gray-300 border-gray-300/50 dark:border-gray-500/40 shadow-gray-500/5',
  pending: 'from-amber-400/40 to-amber-500/30 text-amber-700 dark:text-amber-300 border-amber-300/60 dark:border-amber-500/40 shadow-amber-500/10',
};

const labels = {
  success: '成功',
  failed: '失败',
  active: '启用',
  disabled: '禁用',
  pending: '等待中',
};

export default function StatusBadge({ status }) {
  const style = styles[status] || styles.pending;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-3 py-1
        rounded-full text-xs font-semibold
        border backdrop-blur-md
        bg-gradient-to-r ${style}
        shadow-sm
        transition-all duration-200
      `}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80"></span>
      {labels[status] || status}
    </span>
  );
}
