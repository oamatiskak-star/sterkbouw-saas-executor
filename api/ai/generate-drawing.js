// /backend/api/ai/generate-drawing.js
import express from 'express'
import supabase from '../../lib/supabase.js'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import axios from 'axios'

const execAsync = promisify(exec)
const router = express.Router()

// Configuratie
const AI_API_URL = process.env.AI_API_URL || "http://localhost:8000"
const GENERATED_DIR = path.join(process.cwd(), 'public', 'generated')

// Zorg dat directory bestaat
if (!fs.existsSync(GENERATED_DIR)) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true })
}

router.post('/', async (req, res) => {
  try {
    const {
      project_naam,
      type,
      niveau,
      schaal,
      locatie,
      beschrijving,
      extra_specificaties,
      user_id,
      project_id
    } = req.body

    // Valideer input
    if (!project_naam || !type || !niveau) {
      return res.status(400).json({
        success: false,
        error: "Projectnaam, type en niveau zijn verplicht"
      })
    }

    console.log(`[AI] Generating drawing for: ${project_naam}`)

    // Roep AI service aan
    const aiResponse = await axios.post(`${AI_API_URL}/api/generate-drawing`, {
      project_naam,
      type,
      niveau,
      schaal: schaal || "1:50",
      locatie: locatie || "",
      beschrijving: beschrijving || "",
      extra_specificaties: extra_specificaties || "",
      seed: Math.floor(Math.random() * 1000000)
    }, {
      timeout: 300000 // 5 minuten timeout voor AI generatie
    })

    if (!aiResponse.data.success) {
      throw new Error(aiResponse.data.error || "AI generatie mislukt")
    }

    const { drawing_url, metadata, prompt } = aiResponse.data

    // Sla tekening op in database
    const { data: tekening, error: dbError } = await supabase
      .from('bim_tekeningen')
      .insert([{
        project_naam,
        tekening_type: type,
        detail_niveau: niveau,
        schaal: schaal || "1:50",
        locatie,
        beschrijving,
        extra_specificaties,
        ai_prompt: prompt,
        image_url: drawing_url,
        metadata: metadata,
        status: 'gegenereerd',
        user_id: user_id || null,
        project_id: project_id || null,
        gegenereerd_op: new Date().toISOString()
      }])
      .select()
      .single()

    if (dbError) {
      console.error("[AI] Database error:", dbError)
      // Ga door ook als database opslag faalt
    }

    res.json({
      success: true,
      tekening: {
        id: tekening?.id,
        url: drawing_url,
        project_naam,
        type,
        niveau,
        metadata: metadata
      },
      message: "Tekening succesvol gegenereerd"
    })

  } catch (error) {
    console.error("[AI] Generation error:", error)
    
    // Sla fout op in database
    try {
      await supabase
        .from('ai_generation_errors')
        .insert([{
          error_message: error.message,
          request_data: req.body,
          timestamp: new Date().toISOString()
        }])
    } catch (dbError) {
      console.error("[AI] Error logging failed:", dbError)
    }

    res.status(500).json({
      success: false,
      error: error.message || "Interne serverfout bij AI generatie"
    })
  }
})

// Batch generatie endpoint
router.post('/batch', async (req, res) => {
  try {
    const { tekeningen, project_id, user_id } = req.body
    
    if (!Array.isArray(tekeningen) || tekeningen.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Geen tekeningen opgegeven voor batch generatie"
      })
    }

    console.log(`[AI] Batch generating ${tekeningen.length} drawings`)

    const results = []
    const errors = []

    // Genereer tekeningen parallel (max 3 tegelijk)
    const batchSize = 3
    for (let i = 0; i < tekeningen.length; i += batchSize) {
      const batch = tekeningen.slice(i, i + batchSize)
      
      const batchPromises = batch.map(async (tekeningConfig) => {
        try {
          const response = await axios.post(`${AI_API_URL}/api/generate-drawing`, {
            ...tekeningConfig,
            project_id,
            user_id
          }, { timeout: 300000 })

          if (response.data.success) {
            // Opslaan in database
            const { error: dbError } = await supabase
              .from('bim_tekeningen')
              .insert([{
                project_naam: tekeningConfig.project_naam,
                tekening_type: tekeningConfig.type,
                detail_niveau: tekeningConfig.niveau,
                schaal: tekeningConfig.schaal || "1:50",
                image_url: response.data.drawing_url,
                metadata: response.data.metadata,
                ai_prompt: response.data.prompt,
                status: 'gegenereerd',
                project_id: project_id || null,
                user_id: user_id || null,
                gegenereerd_op: new Date().toISOString()
              }])

            if (dbError) {
              console.error(`[AI] Database error for ${tekeningConfig.project_naam}:`, dbError)
            }

            return {
              success: true,
              config: tekeningConfig,
              result: response.data
            }
          } else {
            throw new Error(response.data.error || "AI generatie mislukt")
          }
        } catch (error) {
          return {
            success: false,
            config: tekeningConfig,
            error: error.message
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    }

    // Split successes en errors
    const successes = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)

    res.json({
      success: true,
      summary: {
        total: tekeningen.length,
        successful: successes.length,
        failed: failed.length
      },
      successes: successes.map(s => ({
        project: s.config.project_naam,
        type: s.config.type,
        url: s.result.drawing_url
      })),
      errors: failed.map(f => ({
        project: f.config.project_naam,
        error: f.error
      }))
    })

  } catch (error) {
    console.error("[AI] Batch generation error:", error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Get gegenereerde tekeningen
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params
    
    const { data: tekeningen, error } = await supabase
      .from('bim_tekeningen')
      .select('*')
      .eq('project_id', projectId)
      .order('gegenereerd_op', { ascending: false })

    if (error) throw error

    res.json({
      success: true,
      tekeningen: tekeningen || []
    })

  } catch (error) {
    console.error("[AI] Fetch error:", error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Delete tekening
router.delete('/:tekeningId', async (req, res) => {
  try {
    const { tekeningId } = req.params
    
    // Haal eerst de tekening op om image file te verwijderen
    const { data: tekening, error: fetchError } = await supabase
      .from('bim_tekeningen')
      .select('image_url')
      .eq('id', tekeningId)
      .single()

    if (fetchError) throw fetchError

    // Verwijder uit database
    const { error: deleteError } = await supabase
      .from('bim_tekeningen')
      .delete()
      .eq('id', tekeningId)

    if (deleteError) throw deleteError

    // Verwijder image file als die bestaat
    if (tekening?.image_url) {
      try {
        const imagePath = path.join(GENERATED_DIR, path.basename(tekening.image_url))
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath)
        }
      } catch (fileError) {
        console.warn("[AI] Could not delete image file:", fileError)
      }
    }

    res.json({
      success: true,
      message: "Tekening verwijderd"
    })

  } catch (error) {
    console.error("[AI] Delete error:", error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

export default router
