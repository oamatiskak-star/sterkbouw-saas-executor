import express from 'express'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const router = express.Router()

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * POST /api/executor/render-process
 * Verwerkt 3D render jobs van de backend
 */
router.post('/', async (req, res) => {
  try {
    const { 
      job_id, 
      project_id, 
      materials_data, 
      render_type = 'interior',
      quality = 'medium' 
    } = req.body

    if (!job_id || !project_id || !materials_data) {
      return res.status(400).json({
        success: false,
        error: 'Job ID, project ID en materials data zijn vereist'
      })
    }

    // Update job status naar processing
    await supabase
      .from('bim_render_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', job_id)

    // 1. Maak Blender Python script met materialen
    const blenderScript = generateBlenderScript(materials_data, render_type, quality)
    const scriptPath = path.join('/tmp', `blender_script_${job_id}.py`)
    fs.writeFileSync(scriptPath, blenderScript)

    // 2. Voer Blender render uit
    const renderResult = await executeBlenderRender(scriptPath, job_id)

    // 3. Upload resultaat naar Supabase Storage
    const renderUrl = await uploadRenderToStorage(renderResult.outputPath, job_id)

    // 4. Update job status
    await supabase
      .from('bim_render_jobs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        render_url: renderUrl,
        render_metadata: {
          quality: quality,
          render_type: render_type,
          render_time_seconds: renderResult.renderTime,
          resolution: renderResult.resolution
        }
      })
      .eq('id', job_id)

    res.json({
      success: true,
      job_id: job_id,
      render_url: renderUrl,
      render_time: renderResult.renderTime,
      message: '3D render succesvol gegenereerd'
    })

  } catch (error) {
    console.error('Render process error:', error)
    
    // Update job status naar failed
    await supabase
      .from('bim_render_jobs')
      .update({
        status: 'failed',
        error: error.message,
        finished_at: new Date().toISOString()
      })
      .eq('id', job_id || '')

    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * Genereert Blender Python script op basis van materialen data
 */
function generateBlenderScript(materialsData, renderType, quality) {
  const materials = materialsData.materials || []
  const dimensions = materialsData.dimensions || {}
  
  return `
import bpy
import math
import random
from mathutils import Vector

# Clear existing scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Setup scene
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = ${quality === 'high' ? '256' : quality === 'medium' ? '128' : '64'}
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080

# Setup camera
bpy.ops.object.camera_add(location=(10, -10, 8))
camera = bpy.context.object
camera.rotation_euler = (math.radians(60), 0, math.radians(45))
scene.camera = camera

# Setup lights
bpy.ops.object.light_add(type='SUN', location=(10, -10, 20))
sun = bpy.context.object
sun.data.energy = 2.0

bpy.ops.object.light_add(type='AREA', location=(0, 0, 15))
area_light = bpy.context.object
area_light.data.energy = 500
area_light.data.size = 10

# Create room based on dimensions
room_width = ${dimensions.width || 10}
room_length = ${dimensions.length || 8}
room_height = ${dimensions.height || 3}

# Floor
bpy.ops.mesh.primitive_plane_add(size=room_width, location=(0, 0, 0))
floor = bpy.context.object
floor.scale = (room_width/2, room_length/2, 1)

# Walls
create_wall = lambda loc, size: bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
# ... (volledige wall creation code)

# Apply materials
${generateMaterialCode(materials)}

# Set render output
import os
output_path = "/tmp/render_${Date.now()}.png"
scene.render.filepath = output_path

# Render
bpy.ops.render.render(write_still=True)

print(f"RENDER_COMPLETE:{output_path}")
`
}

function generateMaterialCode(materials) {
  let code = ''
  materials.forEach((material, index) => {
    code += `
# Material: ${material.name}
mat_${index} = bpy.data.materials.new(name="${material.name}")
mat_${index}.use_nodes = True
nodes = mat_${index}.nodes
nodes.clear()

# Diffuse node
diffuse = nodes.new(type='ShaderNodeBsdfDiffuse')
diffuse.inputs[0].default_value = (${material.color?.r || 0.8}, ${material.color?.g || 0.8}, ${material.color?.b || 0.8}, 1)
diffuse.inputs[1].default_value = ${material.roughness || 0.5}

# Output node
output = nodes.new(type='ShaderNodeOutputMaterial')

# Link nodes
links = mat_${index}.node_tree.links
links.new(diffuse.outputs['BSDF'], output.inputs['Surface'])

# Apply to object
if 'obj_${material.applies_to}' in bpy.data.objects:
    obj = bpy.data.objects['obj_${material.applies_to}']
    if obj.data.materials:
        obj.data.materials[0] = mat_${index}
    else:
        obj.data.materials.append(mat_${index})
`
  })
  return code
}

async function executeBlenderRender(scriptPath, jobId) {
  const outputPath = `/tmp/render_${jobId}_${Date.now()}.png`
  
  try {
    const startTime = Date.now()
    
    // Run Blender in background mode
    const { stdout, stderr } = await execAsync(
      `blender --background --python ${scriptPath} --render-output ${outputPath}`
    )
    
    const renderTime = (Date.now() - startTime) / 1000
    
    // Check for success
    if (stderr && !stderr.includes('Blender')) {
      throw new Error(`Blender error: ${stderr}`)
    }
    
    return {
      outputPath: outputPath,
      renderTime: renderTime,
      resolution: '1920x1080'
    }
    
  } catch (error) {
    console.error('Blender execution error:', error)
    throw error
  }
}

async function uploadRenderToStorage(filePath, jobId) {
  try {
    const fileBuffer = fs.readFileSync(filePath)
    const fileName = `renders/render_${jobId}_${Date.now()}.png`
    
    const { data, error } = await supabase.storage
      .from('bim-assets')
      .upload(fileName, fileBuffer, {
        contentType: 'image/png',
        upsert: true
      })
    
    if (error) throw error
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('bim-assets')
      .getPublicUrl(fileName)
    
    // Cleanup local file
    fs.unlinkSync(filePath)
    
    return publicUrl
    
  } catch (error) {
    console.error('Upload to storage error:', error)
    throw error
  }
}

export default router
