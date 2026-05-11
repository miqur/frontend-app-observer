import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultObserverConfig, defineObserverConfig, type ObserverConfig } from './defaults.js';

export async function loadObserverConfig(projectRoot: string): Promise<ObserverConfig> {
  const candidates = ['observer.config.ts', 'observer.config.mts', 'observer.config.js', 'observer.config.mjs'];
  for (const name of candidates) {
    const file = path.join(projectRoot, name);
    if (!fs.existsSync(file)) continue;
    try {
      const href = pathToFileURL(file).href + `?t=${Date.now()}`;
      const mod = (await import(href)) as { default?: ObserverConfig; observerConfig?: ObserverConfig };
      const raw = mod.default ?? mod.observerConfig;
      if (raw && typeof raw === 'object') {
        return defineObserverConfig(raw as Partial<ObserverConfig>);
      }
    } catch (e) {
      console.warn(`[observer] Failed to load ${file}:`, e);
    }
  }
  return defaultObserverConfig;
}
