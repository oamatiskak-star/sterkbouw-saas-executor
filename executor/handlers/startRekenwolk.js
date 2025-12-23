import { createClient } from "@supabase/supabase-js"
import pkg from "pdf-lib"
const { PDFDocument, rgb, StandardFonts } = pkg

/*
===========================================================
rekenwolk – sterkcalc definitieve productieversie
===========================================================
- één rekenwolk per project
- volledig idempotent
- geen dubbele handlers
- soft stabu
- ak 8 procent, abk 6 procent, w&r 8 procent
- btw 9 procent en 21 procent per regel
- volledige logging en statusovergangen
===========================================================
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
vaste opslagen
========================
*/
const opslag_ak = 0.08
const opslag_abk = 0.06
const opslag_wr = 0.08

/*
========================
utils
========================
*/
function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

function now() {
  return new Date().toISOString()
}

async function log(project_id, module, status, extra = null) {
  try {
    await supabase.from("project_initialization_log").insert({
      project_id,
      module,
      status,
      meta: extra,
      created_at: now()
    })
  } catch (_) {}
}

/*
========================
calculatie ophalen of maken
========================
*/
async function getorcreatecalculatie(project_id) {
  const { data: existing } = await supabase
    .from("calculaties")
    .select("*")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return existing

  const { data } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      workflow_status: "running",
      created_at: now()
    })
    .select("*")
    .single()

  return data
}

/*
========================
stabu soft fetch
========================
*/
async function fetchstaburesultregels(project_id) {
  const { data, error } = await supabase
    .from("stabu_result_regels")
    .select("omschrijving, hoeveelheid, eenheidsprijs, btw_tarief")
    .eq("project_id", project_id)

  if (error || !data || !data.length) return []
  return data
}

/*
========================
pdf 2jours
========================
*/
async function generate2jourspdf(calculatie, regels, totals) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  let y = 800
  const line = (t, size = 10) => {
    page.drawText(t, { x: 40, y, size, font, color: rgb(0, 0, 0) })
    y -= size + 6
  }

  line("calculatie – 2jours", 16)
  y -= 10
  line(`project id: ${calculatie.project_id}`)
  line(`calculatie id: ${calculatie.id}`)
  y -= 14

  line("posten", 12)

  if (!regels.length) {
    line("voorlopige calculatie – stabu regels ontbreken")
  } else {
    regels.forEach(r => {
      const sub = Number(r.hoeveelheid) * Number(r.eenheidsprijs)
      line(
        `${r.omschrijving} | ${r.hoeveelheid} x ${euro(
          r.eenheidsprijs
        )} = ${euro(sub)} | btw ${r.btw_tarief}%`
      )
    })
  }

  y -= 14
  line("totaal", 12)
  line(`kostprijs: ${euro(totals.kostprijs)}`)
  line(`ak 8%: ${euro(totals.ak)}`)
  line(`abk 6%: ${euro(totals.abk)}`)
  line(`w&r 8%: ${euro(totals.wr)}`)
  y -= 8
  line(`verkoopprijs excl btw: ${euro(totals.verkoop_ex)}`)
  line(`btw 9%: ${euro(totals.btw9)}`)
  line(`btw 21%: ${euro(totals.btw21)}`)
  line(`verkoopprijs incl btw: ${euro(totals.verkoop_inc)}`)

  return pdf.save()
}

/*
========================
pdf upload
========================
*/
async function uploadpdf(project_id, pdfBytes) {
  const path = `${project_id}/calculatie_2jours.pdf`
  await supabase.storage.from("sterkcalc").upload(path, pdfBytes, {
    contentType: "application/pdf",
    upsert: true
  })
  return path
}

/*
========================
entrypoint
========================
*/
export async function handlestartrekenwolk(task) {
  if (!task || !task.id) return

  const project_id = task.project_id || task.payload?.project_id || null
  if (!project_id) {
    await supabase.from("executor_tasks").update({
      status: "failed",
      error: "no_project_id",
      finished_at: now()
    }).eq("id", task.id)
    return
  }

  const { data: done } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .eq("workflow_status", "done")
    .limit(1)
    .maybeSingle()

  if (done) {
    await supabase.from("executor_tasks").update({
      status: "skipped",
      finished_at: now()
    }).eq("id", task.id)
    return
  }

  try {
    await log(project_id, "rekenwolk", "start")

    const calculatie = await getorcreatecalculatie(project_id)
    const regels = await fetchstaburesultregels(project_id)

    let kostprijs = 0
    let btw9 = 0
    let btw21 = 0

    regels.forEach(r => {
      const sub = Number(r.hoeveelheid) * Number(r.eenheidsprijs)
      kostprijs += sub
      if (Number(r.btw_tarief) === 9) btw9 += sub * 0.09
      if (Number(r.btw_tarief) === 21) btw21 += sub * 0.21
    })

    const ak = kostprijs * opslag_ak
    const abk = kostprijs * opslag_abk
    const wr = kostprijs * opslag_wr

    const verkoop_ex = kostprijs + ak + abk + wr
    const verkoop_inc = verkoop_ex + btw9 + btw21

    const pdfBytes = await generate2jourspdf(calculatie, regels, {
      kostprijs,
      ak,
      abk,
      wr,
      verkoop_ex,
      btw9,
      btw21,
      verkoop_inc
    })

    const pdf_path = await uploadpdf(project_id, pdfBytes)

    await supabase.from("calculaties").update({
      workflow_status: "done",
      kostprijs,
      verkoopprijs: verkoop_ex,
      marge: verkoop_ex - kostprijs,
      pdf_path,
      updated_at: now()
    }).eq("id", calculatie.id)

    await supabase.from("projects").update({
      analysis_status: "completed",
      updated_at: now()
    }).eq("id", project_id)

    await supabase.from("executor_tasks").update({
      status: "completed",
      finished_at: now()
    }).eq("id", task.id)

    await log(project_id, "rekenwolk", "done", {
      regels: regels.length,
      kostprijs,
      verkoop_ex
    })
  } catch (err) {
    await supabase.from("executor_tasks").update({
      status: "failed",
      error: err.message,
      finished_at: now()
    }).eq("id", task.id)

    await log(project_id, "rekenwolk", "failed", { error: err.message })
  }
}
