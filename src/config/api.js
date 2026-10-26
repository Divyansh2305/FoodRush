const explicit = process.env.FOODRUSH_API_BASE || "";
export const API_BASE = explicit || `${window.location.protocol}//${window.location.hostname}:3001`;
export const apiUrl = (path) => `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
export const getAuthToken = () => localStorage.getItem("foodrush_auth_token_v3") || "";
export const setAuthToken = (token) => token ? localStorage.setItem("foodrush_auth_token_v3", token) : localStorage.removeItem("foodrush_auth_token_v3");
export const apiFetch = async (path, options = {}) => {
  const token = getAuthToken();
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  });
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
};
