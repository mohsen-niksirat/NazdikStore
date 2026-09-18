/**
 * Enterprise Phase 17 — a11y / themes / low-bandwidth helpers.
 */

export const THEME_KEY = 'nazdik_theme';
export const DATA_SAVER_KEY = 'nazdik_data_saver';
export const OFFLINE_QUEUE_KEY = 'nazdik_offline_queue';

export type ThemeMode = 'light' | 'oled' | 'high-contrast';

export function themeVars(mode: ThemeMode): Record<string, string> {
  if (mode === 'oled') {
    return {
      '--paper': '#000000',
      '--paper-deep': '#0a0a0a',
      '--ink': '#f2f2f2',
      '--ink-muted': '#a0a0a0',
      '--accent': '#3d9b86',
      '--accent-soft': '#12352e',
      '--line': '#222',
      '--white': '#111',
    };
  }
  if (mode === 'high-contrast') {
    return {
      '--paper': '#ffffff',
      '--paper-deep': '#f0f0f0',
      '--ink': '#000000',
      '--ink-muted': '#222222',
      '--accent': '#004d40',
      '--accent-soft': '#d0f0ea',
      '--line': '#000000',
      '--white': '#ffffff',
    };
  }
  return {
    '--paper': '#f7f4ef',
    '--paper-deep': '#efeae2',
    '--ink': '#1c2421',
    '--ink-muted': '#5c6b66',
    '--accent': '#0f6b5c',
    '--accent-soft': '#d8ece7',
    '--line': '#e2ddd4',
    '--white': '#ffffff',
  };
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const vars = themeVars(mode);
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v);
  }
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function loadTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'light';
  try {
    return (localStorage.getItem(THEME_KEY) as ThemeMode) || 'light';
  } catch {
    return 'light';
  }
}

export function setDataSaver(on: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.dataSaver = on ? 'on' : 'off';
  try {
    localStorage.setItem(DATA_SAVER_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function loadDataSaver(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(DATA_SAVER_KEY) === '1';
  } catch {
    return false;
  }
}

export interface OfflineJob {
  id: string;
  type: 'order' | 'message';
  payload: Record<string, unknown>;
  createdAt: number;
}

export function enqueueOffline(job: Omit<OfflineJob, 'createdAt' | 'id'>): OfflineJob[] {
  const list = loadOfflineQueue();
  const item: OfflineJob = {
    id: `off_${Date.now().toString(36)}`,
    createdAt: Date.now(),
    ...job,
  };
  list.push(item);
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

export function loadOfflineQueue(): OfflineJob[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearOfflineQueue(): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, '[]');
  } catch {
    /* ignore */
  }
}

/** Lightweight ARIA announcement helper for live order status */
export function announceStatus(message: string): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('nazdik-live-region');
  if (!el) {
    el = document.createElement('div');
    el.id = 'nazdik-live-region';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.position = 'absolute';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.overflow = 'hidden';
    el.style.clip = 'rect(0 0 0 0)';
    document.body.appendChild(el);
  }
  el.textContent = message;
}

export const PRODUCTION_A11Y_PHASE = 17;
