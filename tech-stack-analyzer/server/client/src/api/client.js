const API_BASE = import.meta.env.VITE_API_BASE || '/api';

async function request(path, params = {}) {
  const url = new URL(API_BASE + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const getRiskRanking = (params) => request('/risk-ranking', params);
export const getRepos = (params) => request('/repos', params);
export const getRepoDetail = (id) => request(`/repos/${id}`);
export const getDependencies = (repoId, params) => request(`/dependencies/${repoId}`, params);
export const getQiitaTrends = (params) => request('/qiita-trends', params);
