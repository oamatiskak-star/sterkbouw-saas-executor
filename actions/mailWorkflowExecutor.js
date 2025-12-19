import { createClient } from "@supabase/supabase-js"
import axios from "axios"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function runMailWorkflow() {
  // Haal alle nieuwe mails op
  const { data: mails } = await supabase
    .from("project_mail")
    .select("*")
    .eq("verwerkt", false)

  if (!mails || mails.length === 0) return

  for (let mail of mails) {
    try {
      // Stuur mail naar AI analyse endpoint
      const { data } = await axios.post(
        `${process.env.AO_FRONTEND_URL}/api/ai/mail-analyse`,
        {
          onderwerp: mail.onderwerp,
          bericht: mail.bericht,
          bijlagen: mail.bijlagen || []
        }
      )

      const acties = data.acties || []

      for (let a of acties) {
        switch (a.type) {
          case "calculatie_regel":
            await supabase.from("calculatie_regels").insert({
              calculatie_id: a.calculatie_id,
              omschrijving: a.omschrijving,
              stabu_id: a.stabu_id || null,
              hoeveelheid: a.hoeveelheid || 1,
              eenheid: a.eenheid || "st",
              materiaalprijs: a.materiaalprijs || 0,
              arbeidsprijs: a.arbeidsprijs || 0,
              totaal: a.totaal || 0
            })
            break

          case "inkoop_order":
            await supabase.from("inkoop_bestellingen").insert({
              project_id: a.project_id,
              discipline: a.discipline,
              omschrijving: a.omschrijving,
              bedrag: a.bedrag || 0,
              status: "open"
            })
            break

          case "contracten":
            await supabase.from("project_contracten").insert({
              project_id: a.project_id,
              naam: a.naam,
              bestand: a.bestand || null,
              status: "concept"
            })
            break

          case "notificatie":
            await supabase.from("project_notificaties").insert({
              project_id: a.project_id,
              bericht: a.bericht,
              type: a.type
            })
            break
        }
      }

      // Markeer mail als verwerkt
      await supabase
        .from("project_mail")
        .update({ verwerkt: true })
        .eq("id", mail.id)

    } catch (err) {
      console.error("Fout bij verwerken mail:", mail.id, err.message)
    }
  }
}
