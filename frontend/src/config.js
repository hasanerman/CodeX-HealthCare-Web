const raw = import.meta.env.VITE_API_URL || '/api';
const trimmed = String(raw).replace(/\/$/, '');
export const API_URL = trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
