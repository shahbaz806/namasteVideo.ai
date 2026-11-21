/** API client helpers for project CRUD operations */

import type { ProjectFilter, ProjectListResponse, ProjectSingleResponse, ApiError } from './types';

const BASE_URL = '/api/projects';

export async function fetchProjects(params?: {
  filter?: ProjectFilter;
  cursor?: string;
  limit?: number;
}): Promise<ProjectListResponse> {
  const url = new URL(BASE_URL, window.location.origin);
  if (params?.filter && params.filter !== 'all') {
    url.searchParams.set('filter', params.filter);
  }
  if (params?.cursor) url.searchParams.set('cursor', params.cursor);
  if (params?.limit) url.searchParams.set('limit', String(params.limit));

  const res = await fetch(url.toString(), { credentials: 'same-origin' });
  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({
      error: 'NETWORK_ERROR',
      message: `HTTP ${res.status}`,
    }));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function createProject(title?: string): Promise<ProjectSingleResponse> {
  const body = title ? { title } : {};
  const res = await fetch(BASE_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({
      error: 'NETWORK_ERROR',
      message: `HTTP ${res.status}`,
    }));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function renameProject(
  id: string,
  title: string,
  expectedRevision: number
): Promise<ProjectSingleResponse> {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, expectedRevision }),
  });
  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({
      error: 'NETWORK_ERROR',
      message: `HTTP ${res.status}`,
    }));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteProject(
  id: string,
  expectedRevision: number
): Promise<void> {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ expectedRevision, confirm: true }),
  });
  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({
      error: 'NETWORK_ERROR',
      message: `HTTP ${res.status}`,
    }));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
}
