// System-memory two-way sync.
//
// Doel: één bron van waarheid (Supabase) + leesbare YAML voor handmatige
// review/editing. YAML staat typisch op `Herinneringen/system_memory.yaml`
// in een gemounte volume; pad is configureerbaar via env.
//
// Activering:
//   - MEMORY_YAML_PATH=<absolute pad>  →  enableert sync
//   - MEMORY_YAML_MIRROR=true          →  ook terugschrijven na DB-updates
//
// Op startup:
//   - lees yaml (als bestand bestaat) → upsert in orchestrator_memory
//     (scope='global', key=<top-level key>, value=<sub-tree>)
//   - haalt DB-state op en schrijft yaml-snapshot terug (canonicaliseert)
//
// Bij MEMORY_YAML_MIRROR=true: een interval (default 30s) controleert
// of de DB nieuwer is dan de yaml en schrijft terug.

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { supabase } from './state.js'

const YAML_PATH   = process.env.MEMORY_YAML_PATH ?? null
const MIRROR      = process.env.MEMORY_YAML_MIRROR === 'true'
const MIRROR_MS   = parseInt(process.env.MEMORY_YAML_MIRROR_INTERVAL_MS ?? '30000', 10)

let mirrorTimer = null
let stopped = false

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

async function readYaml() {
  if (!YAML_PATH) return null
  if (!existsSync(YAML_PATH)) return {}
  const txt = await fs.readFile(YAML_PATH, 'utf8')
  if (!txt.trim()) return {}
  const parsed = yaml.load(txt)
  if (!isPlainObject(parsed)) throw new Error('YAML root moet een object zijn')
  return parsed
}

async function writeYaml(obj) {
  if (!YAML_PATH) return
  await fs.mkdir(path.dirname(YAML_PATH), { recursive: true })
  const tmp = `${YAML_PATH}.tmp`
  await fs.writeFile(
    tmp,
    yaml.dump(obj, { indent: 2, sortKeys: true, lineWidth: 100 }),
    'utf8',
  )
  await fs.rename(tmp, YAML_PATH)
}

async function fetchAllGlobal() {
  if (!supabase) return {}
  const { data, error } = await supabase
    .from('orchestrator_memory')
    .select('key, value, updated_at')
    .eq('scope', 'global')
    .order('key')
  if (error) throw error
  const out = {}
  for (const r of data ?? []) out[r.key] = r.value
  return out
}

async function upsertEntry(key, value, updatedBy = 'memory-sync') {
  if (!supabase) return
  const { error } = await supabase
    .from('orchestrator_memory')
    .upsert(
      { scope: 'global', key, value, updated_by: updatedBy },
      { onConflict: 'scope,key' },
    )
  if (error) throw error
}

/**
 * Importeert yaml-keys naar de DB. Bestaande DB-waarden worden
 * overschreven door yaml — yaml is in deze richting "leidend" bij startup.
 * Keys die alleen in DB staan blijven intact.
 */
async function importFromYaml() {
  if (!YAML_PATH) return { imported: 0, skipped: 'no path' }
  const obj = await readYaml()
  if (obj === null) return { imported: 0, skipped: 'yaml ontbreekt' }
  let imported = 0
  for (const [k, v] of Object.entries(obj)) {
    await upsertEntry(k, v, 'memory-sync:yaml-import')
    imported++
  }
  return { imported }
}

/** Exporteert volledige DB-state naar de yaml (vervangt bestand). */
async function exportToYaml() {
  if (!YAML_PATH) return { exported: 0, skipped: 'no path' }
  const all = await fetchAllGlobal()
  await writeYaml(all)
  return { exported: Object.keys(all).length }
}

async function mirrorTick() {
  try {
    await exportToYaml()
  } catch (e) {
    console.error(`[memory-sync] mirror faalde: ${e?.message ?? e}`)
  } finally {
    if (!stopped) {
      mirrorTimer = setTimeout(mirrorTick, MIRROR_MS)
      mirrorTimer.unref?.()
    }
  }
}

export async function startMemorySync() {
  if (!YAML_PATH) {
    console.log('[memory-sync] uitgeschakeld (MEMORY_YAML_PATH niet gezet)')
    return
  }
  if (!supabase) return

  try {
    const imp = await importFromYaml()
    console.log(`[memory-sync] import: ${JSON.stringify(imp)}`)
    const exp = await exportToYaml()
    console.log(`[memory-sync] initial snapshot: ${JSON.stringify(exp)}`)
  } catch (e) {
    console.error(`[memory-sync] startup faalde: ${e?.message ?? e}`)
  }

  if (MIRROR) {
    console.log(`[memory-sync] mirror aan, interval=${MIRROR_MS}ms`)
    mirrorTimer = setTimeout(mirrorTick, MIRROR_MS)
    mirrorTimer.unref?.()
  }
}

export function stopMemorySync() {
  stopped = true
  if (mirrorTimer) clearTimeout(mirrorTimer)
  mirrorTimer = null
}
