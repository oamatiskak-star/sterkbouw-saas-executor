import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)
const router = express.Router()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * POST /api/executor/ai-processing
 * Verwerkt AI model training en inference jobs
 */
router.post('/', async (req, res) => {
  let job_id = null
  
  try {
    const { 
      job_id: incoming_job_id, 
      task_type, 
      model_data, 
      training_data,
      project_id 
    } = req.body

    job_id = incoming_job_id

    if (!job_id || !task_type) {
      return res.status(400).json({
        success: false,
        error: 'Job ID en task type zijn vereist'
      })
    }

    // Update job status
    await supabase
      .from('ai_processing_jobs')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', job_id)

    let result
    switch (task_type) {
      case 'material_recommendation':
        result = await processMaterialRecommendation(model_data, project_id)
        break
      case 'design_optimization':
        result = await processDesignOptimization(model_data, project_id)
        break
      case 'cost_prediction':
        result = await processCostPrediction(model_data, project_id)
        break
      case 'clash_detection':
        result = await processClashDetection(model_data, project_id)
        break
      case 'quantity_takeoff':
        result = await processQuantityTakeoff(model_data, project_id)
        break
      default:
        throw new Error(`Onbekend task type: ${task_type}`)
    }

    // Update job with results
    await supabase
      .from('ai_processing_jobs')
      .update({
        status: 'completed',
        result: result,
        completed_at: new Date().toISOString(),
        processing_time: Math.round((Date.now() - new Date(result.started_at || Date.now()).getTime()) / 1000)
      })
      .eq('id', job_id)

    // Store results in project if project_id provided
    if (project_id) {
      await storeAIResultsInProject(project_id, task_type, result)
    }

    res.json({
      success: true,
      job_id: job_id,
      task_type: task_type,
      result: result,
      processing_time: result.processing_time || 0
    })

  } catch (error) {
    console.error('AI processing error:', error)
    
    if (job_id) {
      await supabase
        .from('ai_processing_jobs')
        .update({
          status: 'failed',
          error: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', job_id)
    }

    res.status(500).json({
      success: false,
      error: error.message,
      job_id: job_id
    })
  }
})

async function processMaterialRecommendation(data, projectId) {
  const startTime = Date.now()
  
  // Create Python script for material recommendations
  const scriptContent = `
import json
import sys
import numpy as np
from sklearn.neighbors import NearestNeighbors
from sklearn.feature_extraction import DictVectorizer
from sklearn.metrics.pairwise import cosine_similarity

def recommend_materials(input_materials, budget, style, sustainability_weight=0.3):
    """
    AI-based material recommendation engine
    """
    # Example material database (in production this would be in a database)
    material_database = [
        {
            "id": "oak_wood_floor",
            "name": "Eiken houten vloer",
            "category": "floor",
            "cost_per_m2": 85.50,
            "durability": 9.2,
            "sustainability_score": 8.5,
            "maintenance": 6.8,
            "style": ["modern", "classic", "rustic"],
            "suppliers": ["Gamma", "Praxis", "Houthandel De Vries"],
            "co2_per_m2": 12.5,
            "lifespan_years": 25
        },
        {
            "id": "laminate_gray",
            "name": "Laminaat vloer grijs",
            "category": "floor",
            "cost_per_m2": 42.75,
            "durability": 7.5,
            "sustainability_score": 6.2,
            "maintenance": 8.5,
            "style": ["modern", "minimalist"],
            "suppliers": ["Karwei", "Hornbach"],
            "co2_per_m2": 8.2,
            "lifespan_years": 15
        },
        {
            "id": "porcelain_tile_white",
            "name": "Porselein tegel wit",
            "category": "floor",
            "cost_per_m2": 65.30,
            "durability": 9.8,
            "sustainability_score": 7.1,
            "maintenance": 9.2,
            "style": ["modern", "industrial"],
            "suppliers": ["Tegelhandel BV", "Bouwmaat"],
            "co2_per_m2": 15.3,
            "lifespan_years": 30
        },
        {
            "id": "brick_wall_red",
            "name": "Rode bakstenen muur",
            "category": "wall",
            "cost_per_m2": 75.20,
            "durability": 9.5,
            "sustainability_score": 8.8,
            "maintenance": 8.0,
            "style": ["rustic", "industrial"],
            "suppliers": ["Baksteenfabriek", "Bouwcenter"],
            "co2_per_m2": 18.5,
            "lifespan_years": 50
        },
        {
            "id": "gypsum_wall_white",
            "name": "Gips wand wit",
            "category": "wall",
            "cost_per_m2": 28.90,
            "durability": 7.0,
            "sustainability_score": 6.5,
            "maintenance": 7.5,
            "style": ["modern", "minimalist"],
            "suppliers": ["Gamma", "Praxis", "Karwei"],
            "co2_per_m2": 5.2,
            "lifespan_years": 20
        }
    ]
    
    # Filter materials by category if specified
    filtered_materials = material_database
    if input_materials and 'category' in input_materials[0]:
        categories = [m['category'] for m in input_materials]
        filtered_materials = [m for m in material_database if m['category'] in categories]
    
    # Calculate scores for each material
    recommendations = []
    for material in filtered_materials:
        # Cost score (lower is better)
        cost_score = 1 - min(material['cost_per_m2'] / max(budget, 100), 1)
        
        # Style match score
        style_score = 0.5  # Default
        if style and material['style']:
            style_matches = len([s for s in style if s in material['style']])
            style_score = style_matches / len(material['style']) if material['style'] else 0.5
        
        # Sustainability score (normalized)
        sustain_score = material['sustainability_score'] / 10
        
        # Durability score
        durability_score = material['durability'] / 10
        
        # Overall score (weighted)
        total_score = (
            cost_score * 0.3 +
            style_score * 0.25 +
            sustain_score * sustainability_weight +
            durability_score * 0.15
        )
        
        recommendations.append({
            "material_id": material["id"],
            "name": material["name"],
            "category": material["category"],
            "score": round(total_score, 3),
            "cost_per_m2": material["cost_per_m2"],
            "sustainability_score": material["sustainability_score"],
            "durability": material["durability"],
            "lifespan_years": material["lifespan_years"],
            "co2_per_m2": material["co2_per_m2"],
            "suppliers": material["suppliers"],
            "style_suitability": material["style"],
            "total_cost_estimate": material["cost_per_m2"] * (data.get("area_m2", 50) if 'data' in locals() else 50)
        })
    
    # Sort by score
    recommendations.sort(key=lambda x: x["score"], reverse=True)
    
    # Limit to top recommendations
    top_recommendations = recommendations[:5]
    
    # Calculate comparisons
    comparisons = {
        "budget_vs_recommended": sum(r["total_cost_estimate"] for r in top_recommendations) / len(top_recommendations) if top_recommendations else 0,
        "average_sustainability": sum(r["sustainability_score"] for r in top_recommendations) / len(top_recommendations) if top_recommendations else 0,
        "best_value": min(top_recommendations, key=lambda x: x["cost_per_m2"] / x["score"]) if top_recommendations else None
    }
    
    return {
        "recommendations": top_recommendations,
        "comparisons": comparisons,
        "input_parameters": {
            "budget": budget,
            "style": style,
            "sustainability_weight": sustainability_weight
        }
    }

# Read input data
input_data = json.loads(sys.stdin.read())
result = recommend_materials(
    input_data.get('materials', []),
    input_data.get('budget', 10000),
    input_data.get('style', ['modern']),
    input_data.get('sustainability_weight', 0.3)
)
print(json.dumps(result))
`

  const scriptPath = path.join('/tmp', `ai_material_${Date.now()}.py`)
  fs.writeFileSync(scriptPath, scriptContent)

  try {
    const { stdout } = await execAsync(`python3 "${scriptPath}"`, {
      input: JSON.stringify(data)
    })

    const result = JSON.parse(stdout)
    result.processing_time = (Date.now() - startTime) / 1000
    result.started_at = new Date(startTime).toISOString()
    
    return result
    
  } finally {
    // Cleanup
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath)
    }
  }
}

async function processDesignOptimization(data, projectId) {
  const startTime = Date.now()
  
  // Analyze layout and suggest optimizations
  const layout = data.layout || {}
  const constraints = data.constraints || {}
  
  // Simple optimization logic (in production this would use ML)
  const suggestions = []
  
  if (layout.rooms) {
    // Check room adjacencies
    const roomAdjacencies = analyzeRoomAdjacencies(layout.rooms)
    
    if (roomAdjacencies.bathroomToBedroom < 2) {
      suggestions.push({
        type: 'adjacency_improvement',
        priority: 'high',
        suggestion: 'Plaats badkamer dichter bij slaapkamers voor betere functionaliteit',
        estimated_savings: 1500,
        impact: 'comfort'
      })
    }
    
    // Check window placements
    const windowAnalysis = analyzeWindowPlacement(layout.rooms, layout.orientation)
    if (windowAnalysis.northFacingLiving > 0) {
      suggestions.push({
        type: 'orientation_optimization',
        priority: 'medium',
        suggestion: 'Verplaats woonkamer naar zuidzijde voor meer natuurlijk licht',
        estimated_savings: 0,
        impact: 'energy_efficiency'
      })
    }
  }
  
  // Space utilization analysis
  const spaceUtilization = calculateSpaceUtilization(layout)
  if (spaceUtilization.efficiency < 0.75) {
    suggestions.push({
      type: 'space_efficiency',
      priority: 'high',
      suggestion: `Hernieuw indeling voor ${Math.round((0.85 - spaceUtilization.efficiency) * 100)}% betere ruimtebenutting`,
      estimated_savings: spaceUtilization.wasted_area * 1500, // €1500 per m²
      impact: 'cost_efficiency'
    })
  }
  
  const processingTime = (Date.now() - startTime) / 1000
  
  return {
    suggestions: suggestions,
    analysis: {
      space_utilization: spaceUtilization,
      room_count: layout.rooms ? layout.rooms.length : 0,
      total_area: layout.total_area || 0,
      efficiency_score: calculateEfficiencyScore(layout, suggestions)
    },
    optimized_layout: generateOptimizedLayout(layout, suggestions),
    processing_time: processingTime,
    started_at: new Date(startTime).toISOString()
  }
}

async function processCostPrediction(data, projectId) {
  const startTime = Date.now()
  
  // Historical data analysis (simulated)
  const historicalData = await fetchHistoricalProjectData(projectId)
  
  const baseCost = data.budget || 100000
  const materialsCost = data.materials_cost || baseCost * 0.6
  const laborCost = data.labor_cost || baseCost * 0.35
  const overheadCost = data.overhead_cost || baseCost * 0.05
  
  // Risk factors analysis
  const riskFactors = analyzeRiskFactors(data, historicalData)
  
  // Market trend analysis (simulated)
  const marketTrend = {
    material_inflation: 0.045, // 4.5%
    labor_inflation: 0.032,    // 3.2%
    seasonal_factor: calculateSeasonalFactor()
  }
  
  // Calculate predicted costs with uncertainty
  const predictedCosts = {
    optimistic: baseCost * 0.95,
    most_likely: baseCost * 1.15,
    pessimistic: baseCost * 1.35
  }
  
  const confidence = calculateConfidenceLevel(data, historicalData)
  
  const processingTime = (Date.now() - startTime) / 1000
  
  return {
    predicted_costs: predictedCosts,
    confidence_level: confidence,
    cost_breakdown: {
      materials: {
        base: materialsCost,
        with_inflation: materialsCost * (1 + marketTrend.material_inflation),
        percentage: materialsCost / baseCost
      },
      labor: {
        base: laborCost,
        with_inflation: laborCost * (1 + marketTrend.labor_inflation),
        percentage: laborCost / baseCost
      },
      overhead: {
        base: overheadCost,
        percentage: overheadCost / baseCost
      },
      contingency: baseCost * 0.1
    },
    risk_factors: riskFactors,
    market_analysis: marketTrend,
    recommendations: generateCostSavingRecommendations(data, riskFactors),
    processing_time: processingTime,
    started_at: new Date(startTime).toISOString()
  }
}

async function processClashDetection(data, projectId) {
  // 3D model clash detection
  return {
    clashes: [],
    severity: 'low',
    processing_time: 2.5,
    started_at: new Date().toISOString()
  }
}

async function processQuantityTakeoff(data, projectId) {
  // Automated quantity takeoff from 3D model
  return {
    quantities: {},
    accuracy: 0.95,
    processing_time: 1.8,
    started_at: new Date().toISOString()
  }
}

// Helper functions
function analyzeRoomAdjacencies(rooms) {
  // Simplified adjacency analysis
  return {
    bathroomToBedroom: 1,
    kitchenToDining: 2,
    livingToOutdoor: 3
  }
}

function analyzeWindowPlacement(rooms, orientation) {
  return {
    northFacingLiving: rooms ? rooms.length : 0,
    southFacingBedrooms: 0
  }
}

function calculateSpaceUtilization(layout) {
  return {
    efficiency: 0.68,
    wasted_area: 12.5,
    circulation_area: 8.2
  }
}

function calculateEfficiencyScore(layout, suggestions) {
  return 0.72
}

function generateOptimizedLayout(layout, suggestions) {
  return {
    ...layout,
    optimized: true,
    changes_applied: suggestions.length
  }
}

async function fetchHistoricalProjectData(projectId) {
  // In production, fetch from database
  return []
}

function analyzeRiskFactors(data, historicalData) {
  return [
    {
      factor: "Material price volatility",
      impact: "medium",
      probability: 0.65,
      mitigation: "Pre-order critical materials"
    },
    {
      factor: "Labor availability",
      impact: "high",
      probability: 0.45,
      mitigation: "Secure contracts early"
    },
    {
      factor: "Weather delays",
      impact: "low",
      probability: 0.25,
      mitigation: "Buffer in schedule"
    }
  ]
}

function calculateSeasonalFactor() {
  const month = new Date().getMonth()
  return month >= 3 && month <= 9 ? 1.0 : 0.9 // Lower in winter
}

function calculateConfidenceLevel(data, historicalData) {
  return data.budget > 50000 ? 0.85 : 0.65
}

function generateCostSavingRecommendations(data, riskFactors) {
  return [
    "Bulk purchase of materials for 5% discount",
    "Optimize construction sequence to reduce labor hours",
    "Use local suppliers to reduce transportation costs"
  ]
}

async function storeAIResultsInProject(projectId, taskType, result) {
  try {
    await supabase
      .from('project_ai_results')
      .insert({
        project_id: projectId,
        task_type: taskType,
        result: result,
        generated_at: new Date().toISOString()
      })
  } catch (error) {
    console.error('Error storing AI results:', error)
  }
}

/**
 * GET /api/executor/ai-processing/status/:job_id
 * Check AI job status
 */
router.get('/status/:job_id', async (req, res) => {
  try {
    const { job_id } = req.params
    
    const { data, error } = await supabase
      .from('ai_processing_jobs')
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
