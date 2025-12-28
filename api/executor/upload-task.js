import express from 'express'
import multer from 'multer'
import { supabase } from '../lib/supabase'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const router = express.Router()

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${file.originalname}`
    cb(null, uniqueName)
  }
})

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
})

router.post('/', upload.array('files'), async (req, res) => {
  try {
    const { project_id } = req.body
    const files = req.files

    if (!project_id) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is vereist'
      })
    }

    // Opslaan van bestandsinformatie
    const fileRecords = files.map(file => ({
      project_id: project_id,
      filename: file.originalname,
      filepath: `/uploads/${file.filename}`,
      mime_type: file.mimetype,
      size: file.size,
      local_path: file.path
    }))

    const { error: uploadError } = await supabase
      .from('project_files')
      .insert(fileRecords)

    if (uploadError) throw uploadError

    // Update project status
    await supabase
      .from('projects')
      .update({
        status: 'bestanden_geupload',
        updated_at: new Date().toISOString()
      })
      .eq('id', project_id)

    // START AI ANALYSE
    let analyseResultaat = null
    try {
      analyseResultaat = await runAIAnalyse(files)
      
      // Sla analyse resultaat op
      const { error: analyseError } = await supabase
        .from('project_analyse')
        .insert({
          project_id: project_id,
          oppervlakte_m2: analyseResultaat.oppervlakte_m2,
          aantal_kamers: analyseResultaat.aantal_kamers,
          bouwjaar: analyseResultaat.bouwjaar,
          project_type: analyseResultaat.project_type,
          detecties: analyseResultaat.detecties,
          raw_data: analyseResultaat
        })

      if (analyseError) {
        console.error('Analyse opslag fout:', analyseError)
      }
    } catch (analyseError) {
      console.error('AI analyse fout:', analyseError)
      // Ga door zelfs als analyse faalt
    }

    res.json({
      success: true,
      files: fileRecords.map(f => ({
        filename: f.filename,
        filepath: f.filepath,
        size: f.size
      })),
      analyse_resultaat: analyseResultaat,
      message: `${files.length} bestand(en) geüpload${analyseResultaat ? ' en geanalyseerd' : ''}`
    })

  } catch (error) {
    console.error('Error uploading files:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

async function runAIAnalyse(files) {
  const analyseResultaten = []
  
  for (const file of files) {
    try {
      // Roep Python analyse script aan
      const { stdout, stderr } = await execAsync(
        `python3 ${path.join(process.cwd(), '..', 'exe', 'analyse.py')} "${file.path}"`
      )
      
      if (stderr && !stderr.includes('Warning')) {
        console.error(`Analyse fout voor ${file.filename}:`, stderr)
        continue
      }
      
      if (stdout) {
        const result = JSON.parse(stdout)
        analyseResultaten.push(result)
      }
    } catch (error) {
      console.error(`Analyse mislukt voor ${file.filename}:`, error)
    }
  }
  
  // Combineer resultaten
  return combineAnalyseResults(analyseResultaten)
}

function combineAnalyseResults(results) {
  if (results.length === 0) {
    return {
      oppervlakte_m2: 0,
      aantal_kamers: 0,
      bouwjaar: null,
      project_type: 'onbekend',
      detecties: ['geen_analyse_mogelijk']
    }
  }
  
  // Neem het grootste oppervlakte
  const maxOppervlakte = Math.max(...results.map(r => r.oppervlakte_m2 || 0))
  
  // Neem het oudste bouwjaar (waarschijnlijk correct)
  const bouwjaren = results.map(r => r.bouwjaar).filter(Boolean)
  const oudsteBouwjaar = bouwjaren.length > 0 ? Math.min(...bouwjaren) : null
  
  // Bepaal meest voorkomende project type
  const types = results.map(r => r.project_type).filter(t => t !== 'onbekend')
  const meestVoorkomendType = types.length > 0 
    ? types.reduce((a, b, i, arr) => 
        arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
      )
    : 'onbekend'
  
  // Tel kamers op
  const totaalKamers = results.reduce((sum, r) => sum + (r.aantal_kamers || 0), 0)
  
  // Verzamel alle detecties
  const alleDetecties = results.flatMap(r => r.detecties || [])
  
  return {
    oppervlakte_m2: maxOppervlakte,
    aantal_kamers: totaalKamers,
    bouwjaar: oudsteBouwjaar,
    project_type: meestVoorkomendType,
    detecties: [...new Set(alleDetecties)], // Unieke waarden
    aantal_bestanden: results.length
  }
}

export default router
