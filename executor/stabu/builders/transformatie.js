export async function buildTransformatieStabu({ supabase, project_id }) {
  const regels = [
    {
      project_id,
      omschrijving: "sloopwerk en strippen bestaand",
      hoeveelheid: 1,
      eenheidsprijs: 38000,
      btw_tarief: 21
    },
    {
      project_id,
      omschrijving: "constructieve aanpassingen",
      hoeveelheid: 1,
      eenheidsprijs: 52000,
      btw_tarief: 21
    },
    {
      project_id,
      omschrijving: "gevelaanpassingen en isolatie",
      hoeveelheid: 1,
      eenheidsprijs: 46000,
      btw_tarief: 21
    },
    {
      project_id,
      omschrijving: "installaties elektra en werktuigbouw",
      hoeveelheid: 1,
      eenheidsprijs: 61000,
      btw_tarief: 21
    },
    {
      project_id,
      omschrijving: "afbouw en herindeling",
      hoeveelheid: 1,
      eenheidsprijs: 68000,
      btw_tarief: 21
    }
  ]

  await supabase
    .from("stabu_result_regels")
    .insert(regels)
}
