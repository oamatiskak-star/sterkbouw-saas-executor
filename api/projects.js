// /api/projecten.js
import express from 'express'
import { supabase } from '@/lib/supabase'
import { generateCalculatiePDF } from '@/lib/pdf-generator'

const router = express.Router()

// POST /api/projecten - Nieuw project aanmaken
router.post('/', async (req, res) => {
  try {
    const { projectInfo, opslagen, uurlonen, posten, berekeningen } = req.body
    
    // 1. Project opslaan
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert([{
        naam_opdrachtgever: projectInfo.naam_opdrachtgever,
        t_a_v_naam: projectInfo.t_a_v_naam,
        straatnaam_en_huisnummer: projectInfo.straatnaam_en_huisnummer,
        postcode: projectInfo.postcode,
        plaats: projectInfo.plaats,
        projectnaam: projectInfo.projectnaam,
        plaatsnaam: projectInfo.plaatsnaam,
        telefoon: projectInfo.telefoon,
        project_type: projectInfo.project_type,
        oppervlakte_m2: projectInfo.oppervlakte_m2,
        bouwjaar: projectInfo.bouwjaar,
        opmerking: projectInfo.opmerking,
        status: 'concept'
      }])
      .select()
      .single()

    if (projectError) throw projectError

    const projectId = project.id

    // 2. Posten opslaan
    const postenMetProjectId = posten.map(post => ({
      project_id: projectId,
      code: post.code,
      omschrijving: post.omschrijving,
      eenheid: post.eenheid,
      aantal: post.aantal,
      eenheidsprijs: post.eenheidsprijs,
      arbeidsuren: post.arbeidsuren,
      materiaal: post.materiaal,
      opmerking: post.opmerking,
      totaal: berekeningen?.subtotaal || 0
    }))

    const { error: postenError } = await supabase
      .from('calculatie_posten')
      .insert(postenMetProjectId)

    if (postenError) throw postenError

    // 3. Totalen opslaan
    const { error: totalenError } = await supabase
      .from('calculatie_totalen')
      .insert([{
        project_id: projectId,
        subtotaal: berekeningen?.subtotaal || 0,
        opslagen_ak: berekeningen?.opslagen?.bedragen?.ak || 0,
        opslagen_abk: berekeningen?.opslagen?.bedragen?.abk || 0,
        opslagen_w: berekeningen?.opslagen?.bedragen?.w || 0,
        opslagen_r: berekeningen?.opslagen?.bedragen?.r || 0,
        totaal_opslagen: berekeningen?.opslagen?.totaal || 0,
        totaal_excl_btw: berekeningen?.opslagen?.totaalExclusiefBtw || 0,
        btw_bedrag: berekeningen?.totaal?.btwBedrag || 0,
        totaal_incl_btw: berekeningen?.totaal?.inclusiefBtw || 0
      }])

    if (totalenError) throw totalenError

    // 4. Opslagen instellingen opslaan
    const { error: opslagenError } = await supabase
      .from('project_opslagen')
      .insert([{
        project_id: projectId,
        ak_pct: opslagen.ak_pct,
        abk_pct: opslagen.abk_pct,
        w_pct: opslagen.w_pct,
        r_pct: opslagen.r_pct,
        btw_pct: opslagen.btw_pct
      }])

    if (opslagenError) throw opslagenError

    res.json({ 
      success: true, 
      project_id: projectId,
      message: 'Project aangemaakt'
    })

  } catch (error) {
    console.error('Error creating project:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message 
    })
  }
})

// GET /api/projecten/:id - Project ophalen
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()

    if (projectError) throw projectError

    // Haal alle gerelateerde data op
    const { data: posten } = await supabase
      .from('calculatie_posten')
      .select('*')
      .eq('project_id', id)

    const { data: totalen } = await supabase
      .from('calculatie_totalen')
      .select('*')
      .eq('project_id', id)
      .single()

    const { data: opslagen } = await supabase
      .from('project_opslagen')
      .select('*')
      .eq('project_id', id)
      .single()

    res.json({
      success: true,
      project: {
        ...project,
        posten: posten || [],
        totalen: totalen || {},
        opslagen: opslagen || {}
      }
    })

  } catch (error) {
    console.error('Error fetching project:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message 
    })
  }
})

export default router
