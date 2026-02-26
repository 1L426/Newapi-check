import { useState, useEffect } from 'react';
import { Save, Download, Upload } from 'lucide-react';

async function request(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Request failed');
  }
  return data;
}

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [importFile, setImportFile] = useState(null);

  const loadSettings = async () => {
    const data = await request('/api/settings');
    setSettings(data);
  };

  useEffect(() => {
    loadSettings().catch((e) => setError(e.message || '加载设置失败'));
  }, []);

  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));

  const showFeedback = (text, isError = false) => {
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const editableKeys = [
        'auto_checkin_enabled',
        'auto_checkin_cron',
        'max_retries',
        'retry_delay_minutes',
        'random_delay_max_seconds',
        'browser_headless',
        'browser_timeout_seconds',
        'checkin_path',
      ];
      const payload = Object.fromEntries(
        editableKeys
          .filter(key => settings[key] !== undefined)
          .map(key => [key, settings[key]])
      );
      await request('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showFeedback('保存成功');
    } catch (e) {
      showFeedback(e.message || '保存失败', true);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await request('/api/settings/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `checkin-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showFeedback('导出成功');
    } catch (e) {
      showFeedback(e.message || '导出失败', true);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      showFeedback('请先选择导入文件', true);
      return;
    }
    const confirmed = window.confirm('导入会覆盖当前账号与日志数据，是否继续？');
    if (!confirmed) return;

    setImporting(true);
    try {
      const text = await importFile.text();
      const data = JSON.parse(text);
      await request('/api/settings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overwrite: true, data }),
      });
      await loadSettings();
      showFeedback('导入成功');
    } catch (e) {
      showFeedback(e.message || '导入失败', true);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">设置</h1>

      <div className="glass-panel p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-gray-800 dark:text-gray-100">自动签到</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">启用后按 Cron 表达式定时执行</div>
          </div>
          <button
            onClick={() => set('auto_checkin_enabled', settings.auto_checkin_enabled === '1' ? '0' : '1')}
            className={`w-12 h-6 rounded-full transition-colors duration-200 ${
              settings.auto_checkin_enabled === '1' ? 'bg-sky-400' : 'bg-gray-300'
            } relative`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform duration-200 ${
              settings.auto_checkin_enabled === '1' ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">每日签到时间</label>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                className="glass-input"
                type="time"
                value={(() => {
                  const cron = settings.auto_checkin_cron || '0 8 * * *';
                  const parts = cron.split(' ');
                  if (parts.length >= 2) {
                    const minute = parts[0].padStart(2, '0');
                    const hour = parts[1].padStart(2, '0');
                    return `${hour}:${minute}`;
                  }
                  return '08:00';
                })()}
                onChange={e => {
                  const [hour, minute] = e.target.value.split(':');
                  set('auto_checkin_cron', `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * *`);
                }}
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">每天执行</div>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-400 mt-1.5">
            Cron: <code className="bg-white/40 dark:bg-white/10 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">{settings.auto_checkin_cron || '0 8 * * *'}</code>
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">最大重试次数</label>
          <input
            className="glass-input"
            type="number"
            min="1"
            max="10"
            value={settings.max_retries || ''}
            onChange={e => set('max_retries', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">重试间隔（分钟）</label>
          <input
            className="glass-input"
            type="number"
            min="1"
            max="120"
            value={settings.retry_delay_minutes || ''}
            onChange={e => set('retry_delay_minutes', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">随机延迟上限（秒）</label>
          <input
            className="glass-input"
            type="number"
            min="0"
            max="3600"
            value={settings.random_delay_max_seconds || ''}
            onChange={e => set('random_delay_max_seconds', e.target.value)}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">签到前随机等待 0~N 秒，避免集中请求</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">浏览器模式</label>
          <select
            className="glass-select"
            value={settings.browser_headless || '1'}
            onChange={e => set('browser_headless', e.target.value)}
          >
            <option value="1">无头模式（推荐）</option>
            <option value="0">可视化模式</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">浏览器超时（秒）</label>
          <input
            className="glass-input"
            type="number"
            min="10"
            max="300"
            value={settings.browser_timeout_seconds || ''}
            onChange={e => set('browser_timeout_seconds', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">签到 API 路径</label>
          <input
            className="glass-input"
            value={settings.checkin_path || ''}
            onChange={e => set('checkin_path', e.target.value)}
            placeholder="/api/user/self/checkin"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button onClick={handleSave} disabled={saving} className="glass-button-primary flex items-center gap-2">
            <Save size={16} /> {saving ? '保存中...' : '保存设置'}
          </button>
          <button onClick={handleExport} className="glass-button flex items-center gap-2">
            <Download size={16} /> 导出数据
          </button>
        </div>

        <div className="pt-2 border-t border-white/40 dark:border-white/10 space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">导入数据</label>
          <input
            className="glass-input"
            type="file"
            accept="application/json"
            onChange={e => setImportFile(e.target.files?.[0] || null)}
          />
          <button onClick={handleImport} disabled={importing} className="glass-button flex items-center gap-2">
            <Upload size={16} /> {importing ? '导入中...' : '导入并覆盖'}
          </button>
        </div>

        {(msg || error) && (
          <div className={`text-sm ${error ? 'text-red-600' : 'text-emerald-600'}`}>
            {error || msg}
          </div>
        )}
      </div>
    </div>
  );
}
