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
export const getLanguageGraph = () => request('/language-graph');
export const getUseCaseCategories = () => request('/usecase-categories');
export const getPatternsForCategory = (slug) => request(`/usecase-categories/${slug}/patterns`);
export const getArchitecturePattern = (slug) => request(`/architecture-patterns/${slug}`);

export async function postAnalyze(payload) {
  const url = new URL(API_BASE + '/analyze', window.location.origin);
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }
  return res.json();
}
