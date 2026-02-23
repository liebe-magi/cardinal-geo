/**
 * App configuration fetched from Supabase `app_config` table.
 * - Version gate: prevents outdated clients from starting games.
 * - Maintenance mode: blocks gameplay when maintenance flag is set.
 */

import { supabase } from './supabase';

/** Compare two semver strings. Returns -1 if a < b, 0 if equal, 1 if a > b */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

export interface AppConfigResult {
  /** Client version is up to date */
  versionOk: boolean;
  /** Server is in maintenance mode */
  maintenance: boolean;
  /** Optional maintenance message from DB */
  maintenanceMessage: string | null;
  clientVersion: string;
  minVersion: string | null;
}

/**
 * Fetch app configuration from `app_config` table in a single query.
 * Returns version check result and maintenance status.
 * Fails open on any error (does not block the user).
 */
export async function fetchAppConfig(): Promise<AppConfigResult> {
  const clientVersion = __APP_VERSION__;
  const defaults: AppConfigResult = {
    versionOk: true,
    maintenance: false,
    maintenanceMessage: null,
    clientVersion,
    minVersion: null,
  };

  if (!supabase) return defaults;

  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', ['min_client_version', 'maintenance_mode', 'maintenance_message']);

    if (error || !data) {
      console.warn('fetchAppConfig: could not fetch config', error);
      return defaults;
    }

    const config: Record<string, string> = {};
    for (const row of data) {
      config[row.key] = row.value;
    }

    const minVersion = config['min_client_version'] ?? null;
    const versionOk = minVersion ? compareSemver(clientVersion, minVersion) >= 0 : true;
    const maintenance = config['maintenance_mode'] === 'true';
    const maintenanceMessage = config['maintenance_message'] ?? null;

    return { versionOk, maintenance, maintenanceMessage, clientVersion, minVersion };
  } catch {
    return defaults;
  }
}
