import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import { createClient } from "@supabase/supabase-js"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 10000
const POLL = Number(process.env.AO_POLL_INTERVAL || 5000)

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

app.get("/ping", (_, res) => {
  res.send("AO_EXECUTOR LIVE")
})

async function work() {
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(1)

  if (!tasks || tasks.length === 0) return
  const task = tasks[0]

  await supabase
    .from("tasks")
    .update({ status: "running", assigned_to: "executor" })
    .eq("id", task.id)

  try {
    let result = null

    /* =======================
       RUN CALCULATION
    ======================= */
    if (task.type === "run_calculation") {
      const { data: calc } = await supabase
        .from("calculations")
        .insert({
          project_id: task.project_id,
          type: "fixed_price",
          status: "in_uitvoering"
        })
        .select()
        .single()

      const items = [
        { categorie: "Fundering", omschrijving: "Betonwerk", hoeveelheid: 120, eenheid: "m3", prijs: 210 },
        { categorie: "Casco", omschrijving: "Kalkzandsteen", hoeveelheid: 900, eenheid: "m2", prijs: 85 },
        { categorie: "Afbouw", omschrijving: "Stucwerk", hoeveelheid: 1100, eenheid: "m2", prijs: 22 }
      ]

      let totaal = 0

      for (const i of items) {
        const t = i.hoeveelheid * i.prijs
        totaal += t

        await supabase.from("calculation_items").insert({
          calculation_id: calc.id,
          categorie: i.categorie,
          omschrijving: i.omschrijving,
          hoeveelheid: i.hoeveelheid,
          eenheid: i.eenheid,
          prijs: i.prijs,
          totaal: t
        })
      }

      await supabase
        .from("calculations")
        .update({ totaal, status: "klaar" })
        .eq("id", calc.id)

      result = { calculation_id: calc.id, totaal }
    }

    /* =======================
       GENERATE PLANNING
    ======================= */
    if (task.type === "generate_planning") {
      result = {
        fases: [
          { naam: "Fundering", weken: 4 },
          { naam: "Casco", weken: 10 },
          { naam: "Afbouw", weken: 6 }
        ]
      }
    }

    /* =======================
       GENERATE CASHFLOW
    ======================= */
    if (task.type === "generate_cashflow") {
      result = {
        termijnen: [
          { fase: "Fundering", percentage: 30 },
          { fase: "Casco", percentage: 40 },
          { fase: "Afbouw", percentage: 30 }
        ]
      }
    }

    await supabase.from("results").insert({
      calculation_id: task.calculation_id,
      type: task.type,
      data: result
    })

    await supabase
      .from("tasks")
      .update({ status: "done" })
      .eq("id", task.id)

  } catch (err) {
    await supabase
      .from("tasks")
      .update({ status: "error" })
      .eq("id", task.id)
  }
}

setInterval(work, POLL)

app.listen(PORT, () => {
  console.log("AO_EXECUTOR draait")
})
