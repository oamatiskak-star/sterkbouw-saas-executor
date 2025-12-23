export async function buildNieuwbouwStabu({ supabase, project_id }) {
  const regels = [
    {
      project_id,
      omschrijving: "grondwerk en fundering",
      hoeveelheid: 1,
      eenheidsprijs: 45000,
      btw_tarief: 21
    },
    {
      project_id,
      omschrijving: "ruwbouw casco",
      hoeveelheid: 1,
      eenheidsprijs: 110000,
      btw_tarief: 21
    },
    {
      project_id,
      omschrijving: "gevels en kozijnen",
      hoeveelheid: 1,
      eenheidsprijs: 65000,
      btw_tarief: 21
    },
    {
      project_id,
      omschrijving: "dakconstructie en dakbedekking",
      hoeveelheid: 1,
      eenheidsprijs: 42000,
      btw_tarief: 21
    },
    {
      project_id,
      omschrijving: "installaties elektra en werktuigbouw",
      hoeveelheid: 1,
      eenheidsprijs: 58000,
      btw_tarief: 21
    },
    {
      project_id,
      omschrijving: "afbouw en inrichting",
      hoeveelheid: 1,
      eenheidsprijs: 72000,
      btw_tarief: 21
    }
  ]

  await supabase
    .from("stabu_result_regels")
    .insert(regels)
}
