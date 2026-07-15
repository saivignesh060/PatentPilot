import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export const submitMolecule = (data) => api.post('/molecules', data).then(r => r.data);
export const getMolecule    = (id)   => api.get(`/molecules/${id}`).then(r => r.data);
export const getMoleculePatents = (id, params) => api.get(`/molecules/${id}/patents`, { params }).then(r => r.data);
export const triggerAnalysis = (id, k = 15)  => api.post(`/molecules/${id}/analyze?k=${k}`).then(r => r.data);
export const triggerReport   = (id)   => api.post(`/molecules/${id}/report`).then(r => r.data);
export const getReport       = (id)   => api.get(`/reports/${id}`).then(r => r.data);
export const getHistory      = ()     => api.get('/history').then(r => r.data);
export const getHistoryEntry = (id)   => api.get(`/history/${id}`).then(r => r.data);
export const getPatentAnalysis = (id) => api.get(`/patents/${id}/analysis`).then(r => r.data);

export default api;
