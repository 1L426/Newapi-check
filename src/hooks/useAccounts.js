import { useState, useEffect, useCallback } from 'react';

const API = '/api/accounts';

async function request(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Request failed');
  }
  return data;
}

export function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request(API);
      setAccounts(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const createAccount = async (data) => {
    await request(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await fetchAccounts();
  };

  const updateAccount = async (id, data) => {
    await request(`${API}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await fetchAccounts();
  };

  const deleteAccount = async (id) => {
    await request(`${API}/${id}`, { method: 'DELETE' });
    await fetchAccounts();
  };

  const toggleAccount = async (id, enabled) => {
    await updateAccount(id, { enabled });
  };

  const testAccount = async (id) => {
    return await request(`${API}/${id}/test`, { method: 'POST' });
  };

  const toggleAllAccounts = async (enabled) => {
    await request(`${API}/batch/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    await fetchAccounts();
  };

  const refreshBalance = async (id) => {
    const data = await request(`${API}/${id}/balance`);
    await fetchAccounts();
    return data;
  };

  const refreshAllBalance = async () => {
    const data = await request(`${API}/refresh-all-balance`, { method: 'POST' });
    await fetchAccounts();
    return data;
  };

  return {
    accounts,
    loading,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    toggleAccount,
    testAccount,
    toggleAllAccounts,
    refreshBalance,
    refreshAllBalance,
  };
}
