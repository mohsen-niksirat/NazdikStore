'use client';

import { useEffect } from 'react';
import { applyTheme, loadTheme, loadDataSaver } from '@nazdik/shared';

/** Applies saved OLED/high-contrast theme + data-saver on first paint */
export function ThemeBoot() {
  useEffect(() => {
    applyTheme(loadTheme());
    const saver = loadDataSaver();
    document.documentElement.dataset.dataSaver = saver ? 'on' : 'off';
  }, []);
  return null;
}
