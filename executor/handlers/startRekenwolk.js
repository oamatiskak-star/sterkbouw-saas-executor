import { createClient } from "@supabase/supabase-js"

/*
=====================================================================
REKENWOLK – VOLLEDIGE CALCULATIE ENGINE
=====================================================================
- Enige input: project_id
- Leest STABU regels
- Leest hoeveelheden
- Rekent regels door
- Schrijft calculatie totalen
- Zet workflow_status = done
=====================================================================
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
---------------------------------------------------------------------
HULPFUNCTIES
---------------------------------------------------------------------
*/

function assert(condition, code) {
  if (!condition) throw new Error(code)
}

function round2(v) {
  return Math.round(v * 100) / 100
}

function sum(arr) {
  return round2(arr.reduce((a, b) => a + b, 0))
}

/*
---------------------------------------------------------------------
STAP 1 – HAAL ACTIEVE CALCULATIE OP
---------------------------------------------------------------------
*/

async function getActiveCalculatie(project_id) {
  const { data, error } = await supabase
    .from("calculaties")
    .select("*")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  assert(!error && data, "REKENWOLK_NO_CALCULATIE")
  return data
}

/*
---------------------------------------------------------------------
STAP 2 – HAAL STABU REGELS OP
---------------------------------------------------------------------
Verwacht tabel:
stabu_regels
- id
- code
- omschrijving
- eenheid
- prijs
---------------------------------------------------------------------
*/

async function getStabuRegels() {
  const { data, error } = await supabase
    .from("stabu_regels")
    .select("*")

  assert(!error, "REKENWOLK_STABU_FETCH_FAILED")
  return data || []
}

/*
---------------------------------------------------------------------
STAP 3 – HAAL HOEVEELHEDEN OP
---------------------------------------------------------------------
Verwacht tabel:
project_hoeveelheden
- project_id
- stabu_code
- hoeveelheid
---------------------------------------------------------------------
*/

async function getHoeveelheden(project_id) {
  const { data, error } = await supabase
    .from("project_hoeveelheden")
    .select("*")
    .eq("project_id", project_id)

  assert(!error, "REKENWOLK_HOEVEELHEDEN_FETCH_FAILED")
  return data || []
}

/*
---------------------------------------------------------------------
STAP 4 – BOUW CALCULATIE REGELS
---------------------------------------------------------------------
Resultaat:
- stabu_code
- hoeveelheid
- prijs
- regel_totaal
---------------------------------------------------------------------
*/

function buildCalculatieRegels(stabu, hoeveelheden) {
  const qtyMap = {}
  for (const h of hoeveelheden) {
    qtyMap[h.stabu_code] = Number(h.hoeveelheid || 0)
  }

  const regels = []

  for (const s of stabu) {
    const qty = Number(qtyMap[s.code] || 0)
    if (qty <= 0) continue

    const prijs = Number(s.prijs || 0)
    const totaal = round2(qty * prijs)

    regels.push({
      stabu_code: s.code,
      omschrijving: s.omschrijving,
      eenheid: s.eenheid,
      hoeveelheid: qty,
      prijs,
      totaal
    })
  }

  return regels
}

/*
---------------------------------------------------------------------
STAP 5 – SCHRIJF REGELS WEG
---------------------------------------------------------------------
Tabel:
calculatie_regels
---------------------------------------------------------------------
*/

async function writeCalculatieRegels(calculatie_id, regels) {
  if (regels.length === 0) return

  const rows = regels.map(r => ({
    calculatie_id,
    stabu_code: r.stabu_code,
    omschrijving: r.omschrijving,
    eenheid: r.eenheid,
    hoeveelheid: r.hoeveelheid,
    prijs: r.prijs,
    totaal: r.totaal
  }))

  const { error } = await supabase
    .from("calculatie_regels")
    .insert(rows)

  assert(!error, "REKENWOLK_WRITE_REGELS_FAILED")
}

/*
---------------------------------------------------------------------
STAP 6 – BEREKEN TOTALEN
---------------------------------------------------------------------
*/

function calculateTotals(regels) {
  const kostprijs = sum(regels.map(r => r.totaal))
  const opslag = 0.15
  const verkoopprijs = round2(kostprijs * (1 + opslag))
  const marge = round2(verkoopprijs - kostprijs)

  return {
    kostprijs,
    verkoopprijs,
    marge
  }
}

/*
---------------------------------------------------------------------
STAP 7 – UPDATE CALCULATIE
---------------------------------------------------------------------
*/

async function updateCalculatie(calculatie_id, totals) {
  const { error } = await supabase
    .from("calculaties")
    .update({
      kostprijs: totals.kostprijs,
      verkoopprijs: totals.verkoopprijs,
      marge: totals.marge,
      workflow_status: "done"
    })
    .eq("id", calculatie_id)

  assert(!error, "REKENWOLK_UPDATE_CALCULATIE_FAILED")
}

/*
---------------------------------------------------------------------
HOOFDFUNCTIE
---------------------------------------------------------------------
*/

export async function handleStartRekenwolk(task) {
  assert(task, "REKENWOLK_NO_TASK")

  const project_id = task.project_id || task.payload?.project_id
  assert(project_id, "REKENWOLK_PROJECT_ID_MISSING")

  // 1. Calculatie
  const calculatie = await getActiveCalculatie(project_id)

  // 2. STABU
  const stabu = await getStabuRegels()
  assert(stabu.length > 0, "REKENWOLK_NO_STABU")

  // 3. Hoeveelheden
  const hoeveelheden = await getHoeveelheden(project_id)

  // 4. Regels bouwen
  const regels = buildCalculatieRegels(stabu, hoeveelheden)
  assert(regels.length > 0, "REKENWOLK_NO_REGELS")

  // 5. Oude regels opschonen
  await supabase
    .from("calculatie_regels")
    .delete()
    .eq("calculatie_id", calculatie.id)

  // 6. Regels schrijven
  await writeCalculatieRegels(calculatie.id, regels)

  // 7. Totalen
  const totals = calculateTotals(regels)

  // 8. Calculatie updaten
  await updateCalculatie(calculatie.id, totals)

  return {
    state: "DONE",
    project_id,
    calculatie_id: calculatie.id,
    regels: regels.length,
    totals
  }
}
