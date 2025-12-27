import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
2JOURS PREVIEW PDF – READ ONLY
===========================================================
- GEEN executor calls
- GEEN writes
- GEEN asserts die falen
- NOOIT fouten gooien
- Toont wat er IS, en meldt wat ontbreekt
===========================================================
*/

const A4_P = { w: 595, h: 842 }
const A4_L = { w: 842, h: 595 }

const MARGIN = 40
const LINE = 12
const SMALL = 8
const NORMAL = 10
const TITLE = 18

function safeArray(v) {
  return Array.isArray(v) ? v : []
}

function txt(v) {
  return String(v ?? "")
}

export async function preview2joursPdf(project_id) {
  if (!project_id) {
    return {
      status: "NO_PROJECT_ID",
      pdf: null
    }
  }

  /*
  ============================
  DATA LEZEN (ALTIJD VEILIG)
  ============================
  */
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .maybeSingle()

  const { data: regelsRaw } = await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id", project_id)

  const regels = safeArray(regelsRaw)

  const { data: filesRaw } =
    await supabase.from("project_files").select("file_name").eq("project_id", project_id)
  const files = safeArray(filesRaw)

  const { data: scanlogRaw } =
    await supabase
      .from("project_initialization_log")
      .select("*")
      .eq("project_id", project_id)
      .order("created_at", { ascending: true })
  const scanlog = safeArray(scanlogRaw)

  const { data: calc } =
    await supabase.from("calculaties").select("workflow_status").eq("project_id", project_id).maybeSingle()

  /*
  ============================
  PDF INIT
  ============================
  */
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  const draw = (page, t, x, y, size = NORMAL) =>
    page.drawText(txt(t), { x, y, size, font, color: rgb(0, 0, 0) })

  /*
  ===========================================================
  PREVIEW VOORBLAD
  ===========================================================
  */
  let page = pdf.addPage([A4_P.w, A4_P.h])
  let y = A4_P.h - MARGIN

  draw(page, "2JOURS PREVIEW (LIVE)", 150, y, TITLE)
  y -= 40

  draw(page, `Project: ${project?.naam || "(onbekend)"}`, MARGIN, y)
  y -= LINE
  draw(page, `Status calculatie: ${calc?.workflow_status || "nog niet gestart"}`, MARGIN, y)
  y -= LINE * 2

  /*
  ===========================================================
  UPLOAD STATUS
  ===========================================================
  */
  draw(page, "Uploads", MARGIN, y, 14)
  y -= 20

  if (files.length === 0) {
    draw(page, "Nog geen bestanden aangeleverd.", MARGIN, y)
    y -= LINE
  } else {
    for (const f of files) {
      draw(page, `- ${f.file_name}`, MARGIN, y, SMALL)
      y -= LINE
    }
  }

  /*
  ===========================================================
  SCAN STATUS
  ===========================================================
  */
  y -= 20
  draw(page, "Scan / Analyse", MARGIN, y, 14)
  y -= 20

  if (scanlog.length === 0) {
    draw(page, "Scan nog niet uitgevoerd.", MARGIN, y)
    y -= LINE
  } else {
    for (const l of scanlog) {
      draw(page, `${txt(l.module)} → ${txt(l.status)}`, MARGIN, y, SMALL)
      y -= LINE
    }
  }

  /*
  ===========================================================
  STABU / REKENWOLK STATUS
  ===========================================================
  */
  y -= 20
  draw(page, "STABU / Rekenwolk", MARGIN, y, 14)
  y -= 20

  if (regels.length === 0) {
    draw(page, "STABU-structuur of rekenwolk nog niet beschikbaar.", MARGIN, y)
    y -= LINE
  } else {
    draw(page, `Aantal regels: ${regels.length}`, MARGIN, y)
    y -= LINE
  }

  /*
  ===========================================================
  OPSLAAN (IN MEMORY)
  ===========================================================
  */
  const bytes = await pdf.save()

  return {
    status: "PREVIEW_OK",
    project_id,
    pdf_bytes: bytes,
    summary: {
      files: files.length,
      scan_steps: scanlog.length,
      regels: regels.length,
      workflow_status: calc?.workflow_status || null
    }
  }
}
