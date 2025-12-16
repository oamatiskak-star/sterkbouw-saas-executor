import { createClient } from "@supabase/supabase-js"

/*
========================
ARCHITECT CONFIG
========================
*/
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
HOOFDFUNCTIE
========================
– Leest projecten
– Bepaalt volledige scope
– Genereert ALLE taken
*/
export async function runArchitect() {
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("status", "nieuw")

  if (error || !projects || projects.length === 0) return

  for (const project of projects) {
    await generateProjectTasks(project)

    await supabase
      .from("projects")
      .update({ status: "geanalyseerd" })
      .eq("id", project.id)
  }
}

/*
========================
TASK GENERATOR
========================
*/
async function generateProjectTasks(project) {
  const tasks = [
    {
      project_id: project.id,
      type: "project:haalbaarheid",
      priority: 1
    },
    {
      project_id: project.id,
      type: "calculaties:bouw",
      priority: 2
    },
    {
      project_id: project.id,
      type: "calculaties:ew",
      priority: 3
    },
    {
      project_id: project.id,
      type: "architectuur:bim",
      priority: 4
    },
    {
      project_id: project.id,
      type: "constructie:opzet",
      priority: 5
    },
    {
      project_id: project.id,
      type: "installaties:ontwerp",
      priority: 6
    },
    {
      project_id: project.id,
      type: "planning:genereer",
      priority: 7
    },
    {
      project_id: project.id,
      type: "inkoop:materiaal",
      priority: 8
    },
    {
      project_id: project.id,
      type: "documenten:contracten",
      priority: 9
    },
    {
      project_id: project.id,
      type: "risico:compliance",
      priority: 10
    },
    {
      project_id: project.id,
      type: "output:dashboard",
      priority: 11
    }
  ]

  for (const task of tasks) {
    await supabase.from("tasks").insert({
      project_id: task.project_id,
      type: task.type,
      status: "open",
      assigned_to: "executor",
      priority: task.priority,
      created_at: new Date().toISOString()
    })
  }
}

/*
========================
AUTO LOOP
========================
– Draait continu
– Architect blijft actief
*/
export function startArchitectLoop() {
  setInterval(runArchitect, 10000)
}
