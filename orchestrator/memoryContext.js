// Memory context loader voor handlers.
//
// Vereist door user-spec: vóór elke task-execute moet Claude bekend zijn
// met onderstaande memory keys (scope='global'):
//
//   known_errors          arch_rules
//   fix_history           dependency_map
//   deploy_status         api_mappings
//   worker_topology
//
// loadContext() returnt een object {key: value} met alléén keys die in
// de DB bestaan. Handlers gebruiken renderContext() om het in een system
// prompt te plakken. Geen mock data — ontbrekende keys → key niet in output.

import { supabase } from './state.js'

export const REQUIRED_KEYS = [
  'known_errors',
  'arch_rules',
  'fix_history',
  'dependency_map',
  'deploy_status',
  'api_mappings',
  'worker_topology',
]

export async function loadContext(extraKeys = []) {
  if (!supabase) return {}
  const keys = Array.from(new Set([...REQUIRED_KEYS, ...extraKeys]))
  const { data, error } = await supabase
    .from('orchestrator_memory')
    .select('key, value')
    .eq('scope', 'global')
    .in('key', keys)
  if (error) return {}

  const out = {}
  for (const row of data ?? []) out[row.key] = row.value
  return out
}

export function renderContext(ctx) {
  const keys = Object.keys(ctx)
  if (keys.length === 0) return ''
  const parts = ['', '## Persistent system memory (read-only)']
  for (const k of keys) {
    let val
    try { val = JSON.stringify(ctx[k], null, 2) } catch { val = String(ctx[k]) }
    parts.push(`### ${k}`, '```json', val.slice(0, 4000), '```')
  }
  return parts.join('\n')
}
