import { PDFDocument, StandardFonts } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const A4_P={w:595,h:842}
const A4_L={w:842,h:595}

export async function generate2joursPdf(project_id){
  if(!project_id)throw new Error("NO_PROJECT_ID")

  const {data:project}=await supabase.from("projects").select("*").eq("id",project_id).single()
  if(!project)throw new Error("PROJECT_NOT_FOUND")

  const {data:regels=[]}=await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id",project_id)
    .order("hoofdstuk_code")
    .order("subhoofdstuk_code")
    .order("code")

  const {data:stelposten=[]}=await supabase.from("calculatie_stelposten").select("*").eq("project_id",project_id)
  const {data:correcties}=await supabase.from("calculatie_correcties").select("*").eq("project_id",project_id).single()
  const {data:uurlonen=[]}=await supabase.from("calculatie_uurloon_overrides").select("*").eq("project_id",project_id)

  const pdf=await PDFDocument.create()
  const font=await pdf.embedFont(StandardFonts.Helvetica)

  let p=pdf.addPage([A4_P.w,A4_P.h])
  let y=780
  p.drawText("CALCULATIE / OFFERTE",{x:50,y,size:20,font})
  y-=40
  p.drawText(`Project: ${project.naam||""}`,{x:50,y,size:12,font})
  y-=20
  p.drawText(`Opdrachtgever: ${project.naam_opdrachtgever||""}`,{x:50,y,size:12,font})
  y-=20
  p.drawText(`Adres: ${project.adres||""} ${project.plaatsnaam||""}`,{x:50,y,size:12,font})

  p=pdf.addPage([A4_P.w,A4_P.h])
  y=780
  p.drawText("OPDRACHTBEVESTIGING",{x:50,y,size:18,font})
  y-=40
  p.drawText("Uitvoering conform bijgevoegde calculatie.",{x:50,y,size:11,font,maxWidth:480})

  let page=pdf.addPage([A4_L.w,A4_L.h])
  let x0=30
  y=560

  const header=()=>{
    const h=["Code","Omschrijving","Aantal","Eenh","Norm","Uren","Loon","Mat/eh","Mat tot","Stelp","Totaal"]
    let x=x0
    h.forEach(t=>{page.drawText(t,{x,y,size:9,font});x+=75})
    y-=15
  }

  header()

  for(const r of regels){
    if(y<40){page=pdf.addPage([A4_L.w,A4_L.h]);y=560;header()}
    let x=x0
    const c=[r.code,r.omschrijving,r.aantal,r.eenheid,r.normuren,r.uren,r.loonkosten,r.materiaalprijs,r.materiaalkosten,r.stelposten,r.totaal]
    c.forEach(v=>{page.drawText(String(v??""),{x,y,size:8,font});x+=75})
    y-=12
  }

  if(stelposten.length){
    page=pdf.addPage([A4_L.w,A4_L.h])
    y=560
    page.drawText("STELPOSTEN",{x:30,y,size:14,font})
    y-=30
    stelposten.forEach(s=>{
      page.drawText(`${s.omschrijving} – € ${Number(s.bedrag||0).toFixed(2)}`,{x:30,y,size:10,font})
      y-=14
    })
  }

  page=pdf.addPage([A4_L.w,A4_L.h])
  y=560
  page.drawText("AANNAMES EN CORRECTIES",{x:30,y,size:14,font})
  y-=30
  page.drawText(
    `AK ${correcties?.ak_pct*100||0}% | ABK ${correcties?.abk_pct*100||0}% | W ${correcties?.w_pct*100||0}% | R ${correcties?.r_pct*100||0}%`,
    {x:30,y,size:10,font}
  )
  y-=30
  page.drawText("Uurlonen:",{x:30,y,size:11,font})
  y-=15
  uurlonen.forEach(u=>{
    page.drawText(`${u.discipline}: € ${u.uurloon}/uur`,{x:30,y,size:10,font})
    y-=12
  })

  const bytes=await pdf.save()

  const path=`${project_id}/calculatie_2jours.pdf`

  await supabase.storage.from("sterkcalc").upload(path,bytes,{
    contentType:"application/pdf",
    upsert:true
  })

  const {data:url}=await supabase.storage
    .from("sterkcalc")
    .createSignedUrl(path,60*60*24)

  if(!url?.signedUrl)throw new Error("SIGNED_URL_FAILED")

  await supabase
    .from("projects")
    .update({pdf_url:url.signedUrl})
    .eq("id",project_id)

  return true
}
