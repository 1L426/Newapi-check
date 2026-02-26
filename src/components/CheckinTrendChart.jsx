import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useTheme } from '../hooks/useTheme';

export default function CheckinTrendChart({ logs, days = 14 }) {
  const { darkMode } = useTheme();

  const chartData = useMemo(() => {
    const now = new Date();
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      data.push({
        date: dateStr,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        success: 0,
        failed: 0,
        total: 0,
      });
    }

    logs.forEach(log => {
      const logDate = log.created_at?.slice(0, 10);
      const item = data.find(d => d.date === logDate);
      if (item) {
        item.total += 1;
        if (log.status === 'success') {
          item.success += 1;
        } else {
          item.failed += 1;
        }
      }
    });

    return data;
  }, [logs, days]);

  const totals = useMemo(() => {
    return chartData.reduce(
      (acc, d) => ({
        success: acc.success + d.success,
        failed: acc.failed + d.failed,
        total: acc.total + d.total,
      }),
      { success: 0, failed: 0, total: 0 }
    );
  }, [chartData]);

  const axisColor = darkMode ? '#64748b' : '#6b7280';
  const gridColor = darkMode ? 'rgba(56, 189, 248, 0.2)' : 'rgba(125, 211, 252, 0.3)';
  const tickLineColor = darkMode ? '#475569' : '#d1d5db';

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100">签到趋势</h3>
        <div className="flex items-center gap-4 text-xs dark:text-gray-300">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            成功 {totals.success}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-400"></span>
            失败 {totals.failed}
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            共 {totals.total} 次
          </span>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: axisColor }}
              tickLine={{ stroke: tickLineColor }}
              axisLine={{ stroke: tickLineColor }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: axisColor }}
              tickLine={{ stroke: tickLineColor }}
              axisLine={{ stroke: tickLineColor }}
            />
            <Tooltip
              contentStyle={{
                background: darkMode ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(8px)',
                border: darkMode ? '1px solid rgba(148, 163, 184, 0.3)' : '1px solid rgba(255, 255, 255, 0.7)',
                borderRadius: '12px',
                boxShadow: darkMode ? '0 4px 16px rgba(0, 0, 0, 0.3)' : '0 4px 16px rgba(0, 120, 200, 0.1)',
                color: darkMode ? '#e2e8f0' : '#374151',
              }}
              labelStyle={{ color: darkMode ? '#e2e8f0' : '#374151', fontWeight: 600 }}
              formatter={(value, name) => [
                value,
                name === 'success' ? '成功' : name === 'failed' ? '失败' : '总计',
              ]}
              labelFormatter={(label) => `日期: ${label}`}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value) =>
                value === 'success' ? '成功' : value === 'failed' ? '失败' : '总计'
              }
              wrapperStyle={{ color: darkMode ? '#94a3b8' : '#6b7280' }}
            />
            <Line
              type="monotone"
              dataKey="success"
              name="success"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="failed"
              name="failed"
              stroke="#f87171"
              strokeWidth={2.5}
              dot={{ fill: '#f87171', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
