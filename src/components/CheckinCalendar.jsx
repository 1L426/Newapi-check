import { useMemo } from 'react';

export default function CheckinCalendar({ logs, year, month }) {
  const calendarData = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const dayMap = {};
    logs.forEach(log => {
      const d = new Date(log.created_at).getDate();
      if (!dayMap[d]) dayMap[d] = [];
      dayMap[d].push(log.status);
    });

    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push({ day: null });
    for (let d = 1; d <= totalDays; d++) {
      const statuses = dayMap[d] || [];
      const hasSuccess = statuses.includes('success');
      const hasFailed = statuses.includes('failed');
      cells.push({ day: d, hasSuccess, hasFailed, count: statuses.length });
    }
    return cells;
  }, [logs, year, month]);

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="glass-panel p-4">
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {weekdays.map(w => (
          <div key={w} className="py-1 text-gray-500 dark:text-gray-400 font-medium">{w}</div>
        ))}
        {calendarData.map((cell, i) => (
          <div key={i} className={`py-2 rounded-lg text-sm transition-colors ${
            !cell.day ? '' :
            cell.hasSuccess && !cell.hasFailed ? 'bg-emerald-300/40 dark:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400' :
            cell.hasFailed ? 'bg-red-300/40 dark:bg-red-500/30 text-red-700 dark:text-red-400' :
            'text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-white/10'
          }`}>
            {cell.day || ''}
          </div>
        ))}
      </div>
    </div>
  );
}
