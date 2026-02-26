import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const CheckinContext = createContext(null);

async function request(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Request failed');
  }
  return data;
}

export function CheckinProvider({ children }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const eventSourceRef = useRef(null);

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const checkinOne = useCallback(async (id) => {
    setRunning(true);
    try {
      return await request(`/api/checkin/run/${id}`, { method: 'POST' });
    } finally {
      setRunning(false);
    }
  }, []);

  const checkinAll = useCallback(async () => {
    setRunning(true);
    try {
      return await request('/api/checkin/run-all', { method: 'POST' });
    } finally {
      setRunning(false);
    }
  }, []);

  const checkinAllAsync = useCallback(async (accountIds = null) => {
    setRunning(true);
    closeEventSource();

    try {
      const body = accountIds ? { accountIds } : {};
      const data = await request('/api/checkin/run-all-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const newTaskId = data.taskId;
      setTaskId(newTaskId);
      setProgress({ total: 0, completed: 0, current: null, status: 'running' });

      const es = new EventSource(`/api/checkin/progress/${newTaskId}`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const progressData = JSON.parse(event.data);
          setProgress(progressData);

          if (progressData.status === 'completed' || progressData.status === 'failed') {
            setRunning(false);
            closeEventSource();
          }
        } catch (e) {
          console.error('Failed to parse progress data:', e);
        }
      };

      es.onerror = () => {
        setRunning(false);
        closeEventSource();
      };

      return data;
    } catch (e) {
      setRunning(false);
      throw e;
    }
  }, [closeEventSource]);

  const cancelCheckin = useCallback(async () => {
    if (taskId) {
      try {
        await request(`/api/checkin/cancel/${taskId}`, { method: 'POST' });
      } catch (e) {
        console.error('Failed to cancel checkin:', e);
      }
    }
    closeEventSource();
    setRunning(false);
    setProgress(null);
    setTaskId(null);
  }, [taskId, closeEventSource]);

  const clearProgress = useCallback(() => {
    setProgress(null);
    setTaskId(null);
  }, []);

  const fetchLogs = useCallback(async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return await request(`/api/checkin/logs?${qs}`);
  }, []);

  const fetchDashboard = useCallback(async () => {
    return await request('/api/checkin/dashboard');
  }, []);

  useEffect(() => {
    return () => {
      closeEventSource();
    };
  }, [closeEventSource]);

  const value = {
    running,
    progress,
    taskId,
    checkinOne,
    checkinAll,
    checkinAllAsync,
    cancelCheckin,
    clearProgress,
    fetchLogs,
    fetchDashboard,
  };

  return (
    <CheckinContext.Provider value={value}>
      {children}
    </CheckinContext.Provider>
  );
}

export function useCheckin() {
  const context = useContext(CheckinContext);
  if (!context) {
    throw new Error('useCheckin must be used within a CheckinProvider');
  }
  return context;
}
