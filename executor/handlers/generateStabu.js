// executor/handlers/generateStabu.js
import { createClient } from "@supabase/supabase-js"
import pdfjsLib from "pdfjs-dist/legacy/build/pdf.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DEFAULT_BUCKET = "sterkcalc"
const LABOR_RATE = Number.isFinite(Number(process.env.STABU_LABOR_RATE))
  ? Number(process.env.STABU_LABOR_RATE)
  : null
const MATERIAL_RATE = Number.isFinite(Number(process.env.STABU_MATERIAL_RATE_PER_M2))
  ? Number(process.env.STABU_MATERIAL_RATE_PER_M2)
  : null

const CONTEXT_KEYWORDS = {
  existing: ["bestaand", "bestaande", "te behouden", "bestaande situatie"],
  new: ["nieuw", "nieuwbouw", "uitbreiding", "aanbouw", "toevoeging"]
}

const POST_DEFS = {
  fundering: {
    code: "21.10",
    omschrijving: "Fundering en grondwerk",
    discipline: "fundering",
    normurenPerM2: 2.6,
    keywords: ["fundering", "hei", "heien", "paal", "grondwerk", "poer", "funderingsbalk"]
  },
  casco: {
    code: "22.20",
    omschrijving: "Casco en draagconstructie",
    discipline: "casco",
    normurenPerM2: 3.4,
    keywords: ["casco", "draagconstructie", "beton", "staal", "kolom", "balk", "constructie", "vloer"]
  },
  schil: {
    code: "24.30",
    omschrijving: "Gevels en schil",
    discipline: "gevel",
    normurenPerM2: 2.1,
    keywords: ["gevel", "kozijnen", "schil", "gevels", "ramen", "isolatie", "spouw"]
  },
  dak: {
    code: "31.40",
    omschrijving: "Daken en dakopbouw",
    discipline: "dak",
    normurenPerM2: 1.8,
    keywords: ["dak", "dakbedekking", "dakopbouw", "dakisolatie"]
  },
  installaties: {
    code: "41.10",
    omschrijving: "Installaties E en W",
    discipline: "installaties",
    normurenPerM2: 1.6,
    keywords: ["installatie", "elektra", "werktuigkundig", "ventilatie", "verwarming", "koeling", "leiding"]
  },
  afbouw: {
    code: "51.90",
    omschrijving: "Afbouw en binnenafwerking",
    discipline: "afbouw",
    normurenPerM2: 2.2,
    keywords: ["afbouw", "binnenwand", "plafond", "vloerafwerking", "wandafwerking"]
  },
  sloop: {
    code: "12.10",
    omschrijving: "Sloop en stripwerk",
    discipline: "casco",
    normurenPerM2: 1.2,
    keywords: ["sloop", "strip", "demontage", "verwijderen"]
  },
  bestaand_casco: {
    code: "22.11",
    omschrijving: "Bestaand casco herstellen",
    discipline: "casco",
    normurenPerM2: 2.3,
    keywords: ["herstel", "versterken", "aanpassen", "bestaand", "constructie"]
  },
  bestaand_schil: {
    code: "24.11",
    omschrijving: "Bestaande schil herstellen",
    discipline: "gevel",
    normurenPerM2: 2.0,
    keywords: ["herstel", "renovatie", "bestaand", "gevel", "schil"]
  },
  bestaand_installaties: {
    code: "41.11",
    omschrijving: "Bestaande installaties aanpassen",
    discipline: "installaties",
    normurenPerM2: 1.4,
    keywords: ["bestaand", "installatie", "aanpassen", "vervangen"]
  },
  isolatie: {
    code: "24.50",
    omschrijving: "Isolatie en schilmaatregelen",
    discipline: "gevel",
    normurenPerM2: 1.5,
    keywords: ["isolatie", "na-isolatie", "spouw", "gevelisolatie", "dakisolatie"]
  }
}

const DISCIPLINE_MAP = {
  nieuwbouw: ["fundering", "casco", "gevel", "dak", "installaties", "afbouw", "oplevering"],
  transformatie: ["sloop", "casco", "gevel", "dak", "installaties", "afbouw"],
  renovatie: ["afbouw", "installaties", "gevel", "dak"],
  uitbreiding: ["fundering", "casco", "gevel", "dak", "installaties", "afbouw"],
  verduurzaming: ["gevel", "dak", "installaties"]
}

// ============================
// GEOMETRISCHE ANALYSE (PDF)
// ============================
async function extractSurfaceFromPdf(fileBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: fileBuffer })
  const pdf = await loadingTask.promise

  let totalSurface = 0
  let confidence = 0

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getOperatorList()

    const rectangles = content.fnArray.filter(fn => fn === pdfjsLib.OPS.rectangle)

    if (rectangles.length > 0) {
      const pageSurface = (viewport.width * viewport.height) / 1_000_000
      totalSurface += pageSurface
      confidence += 0.2
    }
  }

  return {
    surface_m2: totalSurface > 0 ? Math.round(totalSurface) : null,
    confidence: Math.min(confidence, 1)
  }
}

// ============================
// DWG ANALYSE
// ============================
function polygonArea(points = []) {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]
    sum += (p1.x * p2.y) - (p2.x * p1.y)
  }
  return Math.abs(sum) / 2
}

function normalizeUnitScale(unitsCode) {
  switch (Number(unitsCode)) {
    case 1:
      return 0.0254
    case 2:
      return 0.3048
    case 3:
      return 1609.344
    case 4:
      return 0.001
    case 5:
      return 0.01
    case 6:
      return 1
    case 7:
      return 1000
    case 8:
      return 0.0000254
    case 9:
      return 0.000001
    default:
      return 1
  }
}

async function parseDwgSurface(buffer) {
  try {
    const dwgModule = await import("@gdsestimating/dwg-parser")
    const parser = dwgModule?.default || dwgModule
    const dwg = await parser(buffer)
    const entities = dwg?.entities || dwg?.Entity || []
    const unitsCode = dwg?.header?.$INSUNITS || dwg?.header?.INSUNITS || null
    const unitScale = normalizeUnitScale(unitsCode)

    let totalArea = 0
    let closedCount = 0

    for (const entity of entities) {
      const type = String(entity?.type || entity?.Type || entity?.entityType || "").toUpperCase()
      if (type !== "LWPOLYLINE" && type !== "POLYLINE") continue

      const vertices = entity?.vertices || entity?.Vertices || entity?.points || []
      const closed = Boolean(entity?.closed || entity?.isClosed || (entity?.flags & 1))
      if (!closed || !Array.isArray(vertices) || vertices.length < 3) continue

      const points = vertices.map(v => ({
        x: Number(v.x ?? v[0] ?? v?.X ?? 0),
        y: Number(v.y ?? v[1] ?? v?.Y ?? 0)
      }))
      const area = polygonArea(points) * unitScale * unitScale
      if (area > 0) {
        totalArea += area
        closedCount += 1
      }
    }

    return {
      surface_m2: totalArea > 0 ? Math.round(totalArea) : null,
      confidence: closedCount > 0 ? Math.min(0.2 + closedCount * 0.1, 1) : 0
    }
  } catch (err) {
    return { surface_m2: null, confidence: 0 }
  }
}

// ============================
// DISCIPLINE DETECTIE
// ============================
function detectDisciplineFromText(text = "") {
  const t = text.toLowerCase()

  if (t.includes("fundering") || t.includes("palenplan")) return "fundering"
  if (t.includes("constructie") || t.includes("beton")) return "casco"
  if (t.includes("gevel") || t.includes("kozijnen")) return "gevel"
  if (t.includes("dak")) return "dak"
  if (t.includes("installatie") || t.includes("elektra") || t.includes("wtw")) return "installaties"
  if (t.includes("afbouw") || t.includes("wandafwerking")) return "afbouw"

  return "onbekend"
}

async function fail(taskId, calculationRunId, msg) {
  if (taskId) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: msg,
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)
  }

  if (calculationRunId) {
    await supabase
      .from("calculation_runs")
      .update({
        status: "failed",
        current_step: "failed",
        error: msg,
        updated_at: new Date().toISOString()
      })
      .eq("id", calculationRunId)
  }
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
}

function parseNumber(value) {
  const cleaned = String(value || "")
    .replace(/\s+/g, "")
    .replace(/[^\d.,-]/g, "")
  if (!cleaned) return null

  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      return Number(cleaned.replace(/\./g, "").replace(",", "."))
    }
    return Number(cleaned.replace(/,/g, ""))
  }

  if (cleaned.includes(",")) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."))
  }

  return Number(cleaned.replace(/,/g, ""))
}

function extractScaleRatios(text) {
  const ratios = []
  const regex = /(?:schaal|scale)\s*[:=]?\s*1\s*[:/]\s*(\d{1,6})/gi
  let match
  while ((match = regex.exec(text))) {
    ratios.push(Number(match[1]))
  }
  return ratios
}

function getContextSnippet(text, index, length = 80) {
  const start = Math.max(index - length, 0)
  const end = Math.min(index + length, text.length)
  return text.slice(start, end)
}

function classifyContext(contextLower) {
  if (CONTEXT_KEYWORDS.existing.some(k => contextLower.includes(k))) return "existing"
  if (CONTEXT_KEYWORDS.new.some(k => contextLower.includes(k))) return "new"
  return "total"
}

function hasEvidence(textLower, keywords) {
  return keywords.some(keyword => textLower.includes(keyword))
}

function hasContextualEvidence(textLower, baseKeywords, contextKeywords) {
  return hasEvidence(textLower, baseKeywords) && hasEvidence(textLower, contextKeywords)
}

function extractAreaCandidates(text) {
  const candidates = []
  const normalized = normalizeText(text)
  const lower = normalized.toLowerCase()

  const areaRegex = /(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(m2|m²|m\^2)\b/gi
  let match
  while ((match = areaRegex.exec(normalized))) {
    const area = parseNumber(match[1])
    if (!area || area <= 0) continue

    const context = getContextSnippet(normalized, match.index)
    const contextLower = context.toLowerCase()
    const hasLabel = /vloeroppervlak|vloer oppervlakte|bvo|gbo|bruto vloeroppervlak|gebruiksoppervlak/i.test(context)
    const confidence = hasLabel ? 3 : 2
    const contextType = classifyContext(contextLower)

    candidates.push({
      area,
      confidence,
      source: "explicit_m2",
      context,
      contextType
    })
  }

  const dimensionRegex = /(\d+(?:[.,]\d+)?)\s*(m|meter|m\.|cm|mm)?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(m|meter|m\.|cm|mm)?/gi
  while ((match = dimensionRegex.exec(normalized))) {
    const valueA = parseNumber(match[1])
    const valueB = parseNumber(match[3])
    if (!valueA || !valueB) continue

    const unitA = match[2] ? match[2].toLowerCase() : null
    const unitB = match[4] ? match[4].toLowerCase() : null
    const unit = unitA || unitB
    if (!unit) continue

    const factor =
      unit.startsWith("mm") ? 0.001 :
      unit.startsWith("cm") ? 0.01 :
      1

    const length = valueA * factor
    const width = valueB * factor
    const area = length * width
    if (!area || area <= 0) continue

    const context = getContextSnippet(normalized, match.index)
    const contextLower = context.toLowerCase()
    const contextType = classifyContext(contextLower)

    candidates.push({
      area,
      confidence: 1,
      source: "dimensions",
      context,
      contextType
    })
  }

  return { candidates, scaleRatios: extractScaleRatios(normalized), textLower: lower }
}

function pickBestCandidate(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  return [...candidates].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return b.area - a.area
  })[0]
}

function pickBestByContext(candidates, contextType) {
  const filtered = candidates.filter(candidate => candidate.contextType === contextType)
  return pickBestCandidate(filtered)
}

function normalizeStoragePath(bucket, path) {
  if (!path) return null
  let normalizedPath = String(path)
  let normalizedBucket = DEFAULT_BUCKET

  if (!normalizedBucket && normalizedPath.startsWith(`${DEFAULT_BUCKET}/`)) {
    normalizedBucket = DEFAULT_BUCKET
    normalizedPath = normalizedPath.replace(`${DEFAULT_BUCKET}/`, "")
  }

  if (normalizedBucket && normalizedPath.startsWith(`${normalizedBucket}/`)) {
    normalizedPath = normalizedPath.replace(`${normalizedBucket}/`, "")
  }

  return {
    bucket: DEFAULT_BUCKET,
    path: normalizedPath
  }
}

function extractPathsFromScanRow(scanRow) {
  if (!scanRow) return []
  const paths = []
  if (typeof scanRow.storage_path === "string") {
    paths.push({ path: scanRow.storage_path })
  }

  return paths
}

async function getDocumentSources(project_id) {
  const sources = []

  const { data: documentSources, error: docError } = await supabase
    .from("document_sources")
    .select("*")
    .eq("project_id", project_id)

  if (!docError && Array.isArray(documentSources)) {
    for (const doc of documentSources) {
      if (doc?.bucket && doc.bucket !== DEFAULT_BUCKET) {
        throw new Error("DOCUMENT_BUCKET_INVALID")
      }
      if (!doc?.storage_path) {
        throw new Error("DOCUMENT_STORAGE_PATH_MISSING")
      }
      sources.push({
        path: doc.storage_path,
        bucket: DEFAULT_BUCKET
      })
    }
  }

  const { data: scanRows, error: scanError } = await supabase
    .from("project_scan_results")
    .select("*")
    .eq("project_id", project_id)
    .order("scanned_at", { ascending: false })
    .limit(1)

  if (!scanError && Array.isArray(scanRows) && scanRows[0]) {
    sources.push(...extractPathsFromScanRow(scanRows[0]))
  }

  const unique = new Map()
  for (const source of sources) {
    const normalized = normalizeStoragePath(source.bucket, source.path)
    if (!normalized) continue
    const key = `${normalized.bucket}:${normalized.path}`
    if (!unique.has(key)) unique.set(key, normalized)
  }

  return Array.from(unique.values())
}

async function downloadPdfData(source, pdfParser) {
  const { path } = source
  if (!path) return null
  if (!String(path).toLowerCase().endsWith(".pdf")) return null

  const { data: fileBlob, error } = await supabase.storage.from(DEFAULT_BUCKET).download(path)
  if (error || !fileBlob) return null

  const buffer = Buffer.from(await fileBlob.arrayBuffer())
  const parsed = await pdfParser(buffer)
  return {
    buffer,
    text: parsed?.text || ""
  }
}

async function downloadFileBuffer(source) {
  const { path } = source
  if (!path) return null

  const { data: fileBlob, error } = await supabase.storage.from(DEFAULT_BUCKET).download(path)
  if (error || !fileBlob) return null

  return Buffer.from(await fileBlob.arrayBuffer())
}

function buildPost(definition, oppervlakte, now) {
  const hoeveelheid = Number(oppervlakte)
  const normurenPerM2 = definition.normurenPerM2
  const normuren = hoeveelheid * normurenPerM2

  return {
    stabu_code: definition.code,
    omschrijving: definition.omschrijving,
    discipline: definition.discipline,
    eenheid: "m²",
    normuren,
    arbeidsprijs: LABOR_RATE,
    materiaalprijs: MATERIAL_RATE,
    hoeveelheid,
    oa_perc: null,
    oa_bedrag: null,
    stelp_eenh: null,
    stelp_tot: null,
    created_at: now,
    updated_at: now
  }
}

function createPostsForType({ calculationType, surfaceData, textLower, now }) {
  const posts = []

  if (calculationType === "nieuwbouw") {
    const required = ["fundering", "casco", "dak", "installaties"]
    for (const key of required) {
      const def = POST_DEFS[key]
      if (!hasEvidence(textLower, def.keywords)) {
        throw new Error(`MISSING_DOCUMENT_EVIDENCE_FOR_${key.toUpperCase()}`)
      }
      posts.push(buildPost(def, surfaceData.total, now))
    }

    const optional = ["schil", "afbouw"]
    for (const key of optional) {
      const def = POST_DEFS[key]
      if (hasEvidence(textLower, def.keywords)) {
        posts.push(buildPost(def, surfaceData.total, now))
      }
    }
  } else if (calculationType === "transformatie") {
    if (!surfaceData.existing || !surfaceData.new) {
      throw new Error("NO_EXISTING_NEW_SPLIT_DETECTED")
    }

    const sloopDef = POST_DEFS.sloop
    if (!hasEvidence(textLower, sloopDef.keywords)) {
      throw new Error("MISSING_DOCUMENT_EVIDENCE_FOR_SLOOP")
    }
    posts.push(buildPost(sloopDef, surfaceData.existing, now))

    const existingPosts = ["bestaand_casco", "bestaand_schil", "bestaand_installaties"]
    for (const key of existingPosts) {
      const def = POST_DEFS[key]
      if (!hasContextualEvidence(textLower, def.keywords, CONTEXT_KEYWORDS.existing)) {
        throw new Error(`MISSING_DOCUMENT_EVIDENCE_FOR_${key.toUpperCase()}`)
      }
      posts.push(buildPost(def, surfaceData.existing, now))
    }

    const newPosts = ["fundering", "casco", "dak", "installaties", "schil", "afbouw"]
    for (const key of newPosts) {
      const def = POST_DEFS[key]
      if (!hasContextualEvidence(textLower, def.keywords, CONTEXT_KEYWORDS.new)) {
        throw new Error(`MISSING_DOCUMENT_EVIDENCE_FOR_NEW_${key.toUpperCase()}`)
      }
      posts.push(buildPost(def, surfaceData.new, now))
    }
  } else if (calculationType === "renovatie") {
    const required = ["bestaand_casco", "bestaand_schil", "bestaand_installaties"]
    for (const key of required) {
      const def = POST_DEFS[key]
      if (!hasEvidence(textLower, def.keywords)) {
        throw new Error(`MISSING_DOCUMENT_EVIDENCE_FOR_${key.toUpperCase()}`)
      }
      posts.push(buildPost(def, surfaceData.total, now))
    }

    const optional = ["afbouw"]
    for (const key of optional) {
      const def = POST_DEFS[key]
      if (hasEvidence(textLower, def.keywords)) {
        posts.push(buildPost(def, surfaceData.total, now))
      }
    }
  } else if (calculationType === "verduurzaming") {
    const required = ["isolatie", "schil", "installaties"]
    for (const key of required) {
      const def = POST_DEFS[key]
      if (!hasEvidence(textLower, def.keywords)) {
        throw new Error(`MISSING_DOCUMENT_EVIDENCE_FOR_${key.toUpperCase()}`)
      }
      posts.push(buildPost(def, surfaceData.total, now))
    }
  } else {
    throw new Error(`UNSUPPORTED_CALCULATION_TYPE_${String(calculationType || "unknown").toUpperCase()}`)
  }

  return posts
}

function countChapters(stabuPosten) {
  const chapters = new Set()
  for (const post of stabuPosten) {
    const code = String(post.stabu_code || "")
    const chapter = code.split(".")[0]
    if (chapter) chapters.add(chapter)
  }
  return chapters.size
}

function buildCalculatieRegels(stabuPosten, project_id, calculatie_id) {
  return stabuPosten.map(post => {
    const normPerM2 = post.hoeveelheid ? post.normuren / post.hoeveelheid : null
    const loonkosten = LABOR_RATE ? post.normuren * LABOR_RATE : null
    const materiaalkosten = MATERIAL_RATE ? post.hoeveelheid * MATERIAL_RATE : null
    return {
      project_id,
      calculatie_id,
      stabu_id: null,
      code: post.stabu_code,
      omschrijving: post.omschrijving,
      eenheid: post.eenheid,
      aantal: post.hoeveelheid,
      eenh: post.eenheid,
      hoeveelheid: post.hoeveelheid,
      normuren: post.normuren,
      m_norm: normPerM2,
      uren: post.normuren,
      prijs_eenh: MATERIAL_RATE,
      arbeidsprijs: LABOR_RATE,
      loonkosten,
      materiaalprijs: MATERIAL_RATE,
      materiaalkosten,
      oa_eenh: null,
      oa: null,
      stelp_eenh: null,
      stelposten: null
    }
  })
}

function computeConfidenceScore({
  usedDwgGeometry,
  usedPdfGeometry,
  usedDocumentsCount,
  disciplineConsistent,
  indicativeFallback,
  missingGeometry
}) {
  let score = 0
  const notes = []

  if (usedDwgGeometry) {
    score += 30
    notes.push("DWG-geometrie gevonden")
  }

  if (usedPdfGeometry) {
    score += 20
    notes.push("PDF-geometrie gevonden")
  }

  if (usedDocumentsCount > 1) {
    score += 10
    notes.push("Meerdere documenten gebruikt")
  }

  if (disciplineConsistent) {
    score += 10
    notes.push("Discipline consistent met calculation_type")
  }

  if (indicativeFallback) {
    score -= 20
    notes.push("Indicatieve uitkomst")
  }

  if (missingGeometry) {
    score -= 30
    notes.push("Geen geometrie gevonden")
  }

  score = Math.max(0, Math.min(100, score))
  return { score, notes }
}

async function ensureCalculatie(project_id) {
  const { data: existing, error } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  if (existing) return existing.id

  const { data, error: insertErr } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      workflow_status: "initialized",
      created_at: new Date().toISOString()
    })
    .select("id")
    .single()

  if (insertErr) return null
  return data.id
}

async function getCalculationRun(project_id, calculation_run_id) {
  if (calculation_run_id) {
    const { data, error } = await supabase
      .from("calculation_runs")
      .select("id, calculation_type, calculation_level")
      .eq("id", calculation_run_id)
      .single()
    if (!error && data) return data
  }

  const { data, error } = await supabase
    .from("calculation_runs")
    .select("id, calculation_type, calculation_level")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!error && data) return data
  return null
}

export async function handleGenerateStabu(task) {
  if (!task?.id || !task.project_id) return

  const taskId = task.id
  const project_id = task.project_id
  const calculation_run_id = task.calculation_run_id || task.payload?.calculation_run_id
  const now = new Date().toISOString()
  let resolvedRunId = null

  try {
    await supabase
      .from("executor_tasks")
      .update({ status: "running", started_at: now })
      .eq("id", taskId)

    const calculatieId = await ensureCalculatie(project_id)
    if (!calculatieId) throw new Error("CALCULATIE_NOT_FOUND")

    const runData = await getCalculationRun(project_id, calculation_run_id)
    if (!runData?.id) throw new Error("CALCULATION_RUN_NOT_FOUND")
    resolvedRunId = runData.id
    if (!runData.calculation_type) throw new Error("CALCULATION_TYPE_MISSING")

    await supabase
      .from("calculation_runs")
      .update({
        status: "analysing_documents",
        current_step: "analysing_documents",
        updated_at: now
      })
      .eq("id", runData.id)

    let pdfParser
    try {
      const pdfModule = await import("pdf-parse")
      pdfParser = pdfModule.default
    } catch (err) {
      throw new Error("CRITICAL_DEPENDENCY_MISSING_PDF_PARSE")
    }

    const sources = await getDocumentSources(project_id)
    if (!sources.length) {
      throw new Error("NO_DOCUMENTS_FOUND")
    }

    const analyses = []
    const disciplinesDetected = new Set()
    let detectedSurface = null
    let surfaceConfidence = 0
    let usedDwgGeometry = false
    let usedPdfGeometry = false
    const sourceDocuments = []

    for (const source of sources) {
      sourceDocuments.push(source.path)
      const lowerPath = String(source.path).toLowerCase()

      if (lowerPath.endsWith(".dwg")) {
        const dwgBuffer = await downloadFileBuffer(source)
        if (dwgBuffer) {
          const surfaceResult = await parseDwgSurface(dwgBuffer)
          if (surfaceResult.surface_m2 && surfaceResult.confidence >= surfaceConfidence) {
            detectedSurface = surfaceResult.surface_m2
            surfaceConfidence = surfaceResult.confidence
            usedDwgGeometry = true
          }
        }
        continue
      }

      const pdfData = await downloadPdfData(source, pdfParser)
      if (!pdfData) continue

      const text = pdfData.text || ""
      if (!usedDwgGeometry && pdfData.buffer) {
        const surfaceResult = await extractSurfaceFromPdf(pdfData.buffer)
        if (surfaceResult.surface_m2 && surfaceResult.confidence >= surfaceConfidence) {
          detectedSurface = surfaceResult.surface_m2
          surfaceConfidence = surfaceResult.confidence
          usedPdfGeometry = true
        }
      }

      const discipline = detectDisciplineFromText(text.slice(0, 5000))
      disciplinesDetected.add(discipline)

      const analysis = extractAreaCandidates(text)
      const bestCandidate = pickBestCandidate(analysis.candidates)
      analyses.push({
        source,
        text,
        textLower: analysis.textLower,
        candidates: analysis.candidates,
        bestCandidate
      })
    }

    if (!analyses.length) {
      throw new Error("NO_PDF_TEXT_EXTRACTED")
    }

    const selected = analyses
      .filter(item => item.bestCandidate)
      .sort((a, b) => {
        if (b.bestCandidate.confidence !== a.bestCandidate.confidence) {
          return b.bestCandidate.confidence - a.bestCandidate.confidence
        }
        return b.bestCandidate.area - a.bestCandidate.area
      })[0]

    if (!detectedSurface) {
      const level = String(runData.calculation_level || "").toLowerCase()
      if (level === "contract") {
        throw new Error("NO_GEOMETRY_FOR_CONTRACT")
      }

      const confidence = computeConfidenceScore({
        usedDwgGeometry,
        usedPdfGeometry,
        usedDocumentsCount: sources.length,
        disciplineConsistent: false,
        indicativeFallback: true,
        missingGeometry: true
      })

      await supabase
        .from("calculation_runs")
        .update({
          status: "completed_indicative",
          current_step: "onvoldoende geometrische data",
          error: "Geen betrouwbare m² uit tekeningen afgeleid",
          confidence_score: confidence.score,
          confidence_notes: confidence.notes.join("; "),
          updated_at: now
        })
        .eq("id", runData.id)

      await supabase
        .from("executor_tasks")
        .update({ status: "completed", finished_at: now })
        .eq("id", taskId)

      return
    }

    if (!selected?.bestCandidate) {
      throw new Error("NO_RELIABLE_SURFACE_DETECTED")
    }

    const bestOverall = selected.bestCandidate
    const existingCandidate = pickBestByContext(selected.candidates, "existing")
    const newCandidate = pickBestByContext(selected.candidates, "new")

    const surfaceData = {
      total: detectedSurface,
      existing: existingCandidate?.area || null,
      new: newCandidate?.area || null
    }

    if (surfaceData.total < 20 || surfaceData.total > 10000) {
      throw new Error("UNREALISTIC_SURFACE_AREA")
    }

    await supabase
      .from("calculation_runs")
      .update({
        status: "generating_stabu",
        current_step: "generating_stabu",
        updated_at: now
      })
      .eq("id", runData.id)

    const uniqueSources = Array.from(new Set(sourceDocuments))
    const stabuPostenRaw = createPostsForType({
      calculationType: runData.calculation_type || "nieuwbouw",
      surfaceData,
      textLower: selected.textLower,
      now
    }).map(post => ({
      project_id,
      stabu_post_id: null,
      geselecteerd: true,
      oa_perc: null,
      oa_bedrag: null,
      stelp_eenh: null,
      stelp_tot: null,
      discipline: disciplinesDetected.has(post.discipline) ? post.discipline : "onbekend",
      detected_surface_m2: surfaceData.total,
      surface_confidence: surfaceConfidence,
      source_documents: uniqueSources,
      ...post
    }))

    const allowedDisciplines = DISCIPLINE_MAP[runData.calculation_type]
    if (!allowedDisciplines) {
      throw new Error("DISCIPLINE_MAP_MISSING")
    }

    const removedPosten = stabuPostenRaw.filter(post => !allowedDisciplines.includes(post.discipline))
    if (removedPosten.length > 0) {
      console.warn("[GENERATE_STABU] Removed posts due to discipline_map mismatch:", removedPosten.map(p => ({
        stabu_code: p.stabu_code,
        omschrijving: p.omschrijving,
        discipline: p.discipline
      })))
      throw new Error("DISCIPLINE_MAP_MISMATCH")
    }

    const stabuPosten = stabuPostenRaw

    if (!stabuPosten.length) {
      throw new Error("NO_STABU_POSTS_CREATED")
    }

    await supabase
      .from("stabu_project_posten")
      .delete()
      .eq("project_id", project_id)

    const { error: stabuErr } = await supabase
      .from("stabu_project_posten")
      .insert(stabuPosten)

    if (stabuErr) {
      throw new Error(`STABU_POSTEN_INSERT_FAILED: ${stabuErr.message}`)
    }

    await supabase
      .from("calculatie_regels")
      .delete()
      .eq("project_id", project_id)

    const calculatieRegels = buildCalculatieRegels(stabuPosten, project_id, calculatieId)
    await supabase
      .from("calculatie_regels")
      .insert(calculatieRegels)

    const chapterCount = countChapters(stabuPosten)
    const isIndicative = chapterCount < 3
    const disciplineConsistent = true
    const confidence = computeConfidenceScore({
      usedDwgGeometry,
      usedPdfGeometry,
      usedDocumentsCount: sources.length,
      disciplineConsistent,
      indicativeFallback: isIndicative,
      missingGeometry: false
    })

    await supabase
      .from("calculation_runs")
      .update({
        status: isIndicative ? "completed_indicative" : "completed",
        current_step: isIndicative ? "completed_indicative" : "completed",
        error: isIndicative ? "INSUFFICIENT_STABU_CHAPTERS_INDICATIVE" : null,
        confidence_score: confidence.score,
        confidence_notes: confidence.notes.join("; "),
        updated_at: now
      })
      .eq("id", runData.id)

    await supabase
      .from("executor_tasks")
      .update({ status: "completed", finished_at: now })
      .eq("id", taskId)
  } catch (err) {
    const message = err?.message || "GENERATE_STABU_FAILED"
    await fail(taskId, resolvedRunId || calculation_run_id, message)
  }
}
