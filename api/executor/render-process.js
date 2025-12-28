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
    if (job_id) {
      await supabase
        .from('bim_render_jobs')
        .update({
          status: 'failed',
          error: error.message,
          finished_at: new Date().toISOString()
        })
        .eq('id', job_id)
    }

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
  const floorMaterials = materials.filter(m => m.category === 'floor')
  const wallMaterials = materials.filter(m => m.category === 'wall')
  const ceilingMaterials = materials.filter(m => m.category === 'ceiling')
  
  return `
import bpy
import math
import json
from mathutils import Vector

# Clear existing scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Setup scene
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = ${quality === 'high' ? 256 : quality === 'medium' ? 128 : 64}
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080

# Setup camera based on render type
bpy.ops.object.camera_add(location=(10, -10, 8))
camera = bpy.context.object
if '${renderType}' == 'exterior':
    camera.location = (15, -15, 10)
    camera.rotation_euler = (math.radians(50), 0, math.radians(45))
elif '${renderType}' == 'topdown':
    camera.location = (0, 0, 20)
    camera.rotation_euler = (math.radians(90), 0, 0)
else:  # interior
    camera.location = (10, -10, 5)
    camera.rotation_euler = (math.radians(70), 0, math.radians(45))
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
floor.name = "obj_floor"
floor.scale = (room_width/2, room_length/2, 1)

# Walls
def create_wall(name, location, rotation, scale):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    wall = bpy.context.object
    wall.name = name
    wall.rotation_euler = rotation
    wall.scale = scale
    return wall

# Create four walls
create_wall("obj_wall_north", (0, room_length/2, room_height/2), (0, 0, 0), (room_width, 0.2, room_height))
create_wall("obj_wall_south", (0, -room_length/2, room_height/2), (0, 0, 0), (room_width, 0.2, room_height))
create_wall("obj_wall_east", (room_width/2, 0, room_height/2), (0, 0, math.radians(90)), (room_length, 0.2, room_height))
create_wall("obj_wall_west", (-room_width/2, 0, room_height/2), (0, 0, math.radians(90)), (room_length, 0.2, room_height))

# Ceiling
bpy.ops.mesh.primitive_plane_add(size=room_width, location=(0, 0, room_height))
ceiling = bpy.context.object
ceiling.name = "obj_ceiling"
ceiling.scale = (room_width/2, room_length/2, 1)

# Create window openings
if '${renderType}' == 'interior':
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, room_length/2 - 0.3, 1.5))
    window = bpy.context.object
    window.name = "obj_window"
    window.scale = (3, 0.1, 1.5)
    window.data.materials.clear()

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
  let code = 'materials_data = ' + JSON.stringify(materials) + '\n\n'
  code += `
# Create materials from data
for mat_data in materials_data:
    mat = bpy.data.materials.new(name=mat_data.get("name", "unknown"))
    mat.use_nodes = True
    nodes = mat.nodes
    nodes.clear()
    
    # Create principled BSDF shader
    bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
    
    # Set material properties
    color = mat_data.get("color", [0.8, 0.8, 0.8])
    bsdf.inputs[0].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs[7].default_value = mat_data.get("roughness", 0.5)
    bsdf.inputs[9].default_value = mat_data.get("metallic", 0.0)
    
    # Create output node
    output = nodes.new(type='ShaderNodeOutputMaterial')
    
    # Link nodes
    links = mat.node_tree.links
    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    
    # Apply to appropriate objects
    applies_to = mat_data.get("applies_to", "")
    if applies_to and applies_to in bpy.data.objects:
        obj = bpy.data.objects[applies_to]
        if obj.data.materials:
            obj.data.materials[0] = mat
        else:
            obj.data.materials.append(mat)
`
  return code
}

async function executeBlenderRender(scriptPath, jobId) {
  const outputPath = `/tmp/render_${jobId}_${Date.now()}.png`
  
  try {
    const startTime = Date.now()
    
    // Run Blender in background mode
    const { stdout, stderr } = await execAsync(
      `blender --background --factory-startup --python ${scriptPath}`
    )
    
    const renderTime = (Date.now() - startTime) / 1000
    
    // Extract output path from stdout
    let actualOutputPath = outputPath
    if (stdout) {
      const match = stdout.match(/RENDER_COMPLETE:(.+)/)
      if (match) {
        actualOutputPath = match[1].trim()
      }
    }
    
    // Check if file was created
    if (!fs.existsSync(actualOutputPath)) {
      throw new Error(`Render output not found: ${actualOutputPath}`)
    }
    
    return {
      outputPath: actualOutputPath,
      renderTime: renderTime,
      resolution: '1920x1080'
    }
    
  } catch (error) {
    console.error('Blender execution error:', error)
    console.error('Stderr:', error.stderr)
    throw new Error(`Render failed: ${error.message}`)
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
    
    // Cleanup local files
    fs.unlinkSync(filePath)
    const scriptPath = path.join('/tmp', `blender_script_${jobId}.py`)
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath)
    }
    
    return publicUrl
    
  } catch (error) {
    console.error('Upload to storage error:', error)
    throw error
  }
}

/**
 * GET /api/executor/render-process/status/:job_id
 * Check render job status
 */
router.get('/status/:job_id', async (req, res) => {
  try {
    const { job_id } = req.params
    
    const { data, error } = await supabase
      .from('bim_render_jobs')
      .select('*')
      .eq('id', job_id)
      .single()
    
    if (error) throw error
    
    res.json({
      success: true,
      job: data
    })
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

export default router
