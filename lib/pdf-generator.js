// /lib/pdf-generator.js
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

export async function generateCalculatiePDF(projectData) {
  return new Promise((resolve, reject) => {
    try {
      const { projectInfo, posten, totalen, opslagen } = projectData
      
      // Maak een tijdelijk bestand
      const fileName = `calculatie_${projectInfo.projectnaam}_${Date.now()}.pdf`
      const filePath = path.join(process.cwd(), 'public', 'calculaties', fileName)
      
      // Zorg dat de directory bestaat
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // Maak een nieuwe PDF
      const doc = new PDFDocument({ 
        margin: 50,
        size: 'A4'
      })

      // Stream naar bestand
      const stream = fs.createWriteStream(filePath)
      doc.pipe(stream)

      // === HEADER ===
      // Logo of bedrijfsnaam
      doc.fontSize(20).text('BouwProffs B.V.', { align: 'center' })
      doc.fontSize(10).text('Edisonstraat 16a, 8912 AW Leeuwarden', { align: 'center' })
      doc.fontSize(10).text('Tel: 058 203 0660 | info@bouwproffs.nl', { align: 'center' })
      doc.moveDown(2)

      // Offerte informatie
      doc.fontSize(12).text(`Offertenummer: O.${new Date().getFullYear()}.${(new Date().getMonth() + 1).toString().padStart(2, '0')}.${new Date().getDate().toString().padStart(2, '0')}`)
      doc.text(`Offertedatum: ${new Date().toLocaleDateString('nl-NL')}`)
      doc.moveDown()

      // Klantgegevens
      doc.fontSize(14).text('Aan:', { underline: true })
      doc.fontSize(11).text(projectInfo.naam_opdrachtgever)
      if (projectInfo.t_a_v_naam) {
        doc.text(`t.a.v.: ${projectInfo.t_a_v_naam}`)
      }
      doc.text(projectInfo.straatnaam_en_huisnummer)
      doc.text(`${projectInfo.postcode} ${projectInfo.plaats}`)
      if (projectInfo.telefoon) {
        doc.text(`Tel: ${projectInfo.telefoon}`)
      }
      doc.moveDown(2)

      // Projectinformatie
      doc.fontSize(16).text(`Offerte voor: ${projectInfo.projectnaam}`, { align: 'center' })
      doc.fontSize(12).text(`Te: ${projectInfo.plaatsnaam}`, { align: 'center' })
      doc.moveDown()

      // === CALCULATIE TABEL ===
      doc.fontSize(14).text('Calculatie:', { underline: true })
      doc.moveDown(0.5)

      // Tabel headers
      const tableTop = doc.y
      const col1 = 50
      const col2 = 100
      const col3 = 300
      const col4 = 380
      const col5 = 450
      const col6 = 520

      doc.fontSize(9)
      doc.text('Code', col1, tableTop)
      doc.text('Omschrijving', col2, tableTop)
      doc.text('Eenheid', col3, tableTop)
      doc.text('Aantal', col4, tableTop)
      doc.text('€/eenheid', col5, tableTop)
      doc.text('Totaal', col6, tableTop)

      doc.moveTo(50, tableTop + 15)
        .lineTo(570, tableTop + 15)
        .stroke()

      let yPos = tableTop + 25

      // Posten
      doc.fontSize(9)
      posten.forEach((post, index) => {
        if (yPos > 700) {
          doc.addPage()
          yPos = 50
        }

        const postTotaal = (post.eenheidsprijs * post.aantal) + post.materiaal
        
        doc.text(post.code, col1, yPos)
        doc.text(post.omschrijving, col2, yPos, { width: 190 })
        
        if (post.opmerking) {
          doc.fontSize(8).fillColor('#666')
          doc.text(post.opmerking, col2, yPos + 12, { width: 190 })
          doc.fontSize(9).fillColor('#000')
        }
        
        doc.text(post.eenheid, col3, yPos)
        doc.text(post.aantal.toString(), col4, yPos, { align: 'right' })
        doc.text(`€ ${post.eenheidsprijs.toFixed(2)}`, col5, yPos, { align: 'right' })
        doc.text(`€ ${postTotaal.toFixed(2)}`, col6, yPos, { align: 'right' })

        yPos += post.opmerking ? 30 : 20
      })

      doc.moveDown(2)

      // === TOTALEN ===
      const totalenTop = doc.y
      doc.fontSize(11)

      // Subtotaal
      doc.text('Subtotaal werkzaamheden:', 350, totalenTop)
      doc.text(`€ ${totalen.subtotaal.toFixed(2)}`, 500, totalenTop, { align: 'right' })

      // Opslagen
      doc.text(`Algemene kosten (${(opslagen.ak_pct * 100).toFixed(1)}%):`, 350, totalenTop + 20)
      doc.text(`€ ${totalen.opslagen_ak.toFixed(2)}`, 500, totalenTop + 20, { align: 'right' })

      doc.text(`Bedrijfskosten (${(opslagen.abk_pct * 100).toFixed(1)}%):`, 350, totalenTop + 35)
      doc.text(`€ ${totalen.opslagen_abk.toFixed(2)}`, 500, totalenTop + 35, { align: 'right' })

      doc.text(`Winstopslag (${(opslagen.w_pct * 100).toFixed(1)}%):`, 350, totalenTop + 50)
      doc.text(`€ ${totalen.opslagen_w.toFixed(2)}`, 500, totalenTop + 50, { align: 'right' })

      doc.text(`Risicopslag (${(opslagen.r_pct * 100).toFixed(1)}%):`, 350, totalenTop + 65)
      doc.text(`€ ${totalen.opslagen_r.toFixed(2)}`, 500, totalenTop + 65, { align: 'right' })

      // Lijn
      doc.moveTo(350, totalenTop + 80)
        .lineTo(550, totalenTop + 80)
        .stroke()

      // Totaal exclusief BTW
      doc.font('Helvetica-Bold')
      doc.text('Totaal exclusief BTW:', 350, totalenTop + 90)
      doc.text(`€ ${totalen.totaal_excl_btw.toFixed(2)}`, 500, totalenTop + 90, { align: 'right' })

      // BTW
      doc.font('Helvetica')
      doc.text(`BTW (${(opslagen.btw_pct * 100).toFixed(1)}%):`, 350, totalenTop + 110)
      doc.text(`€ ${totalen.btw_bedrag.toFixed(2)}`, 500, totalenTop + 110, { align: 'right' })

      // Totaal inclusief BTW
      doc.moveTo(350, totalenTop + 125)
        .lineTo(550, totalenTop + 125)
        .stroke()

      doc.font('Helvetica-Bold').fontSize(12)
      doc.text('TOTAAL INCLUSIEF BTW:', 350, totalenTop + 135)
      doc.text(`€ ${totalen.totaal_incl_btw.toFixed(2)}`, 500, totalenTop + 135, { align: 'right' })

      // === VOETNOTEN ===
      doc.font('Helvetica').fontSize(9)
      doc.moveDown(3)
      doc.text('Deze offerte is geldig tot 30 dagen na datum.', 50, doc.y)
      doc.text('Alle genoemde bedragen zijn in Euro.', 50, doc.y + 15)
      doc.text('BouwProffs B.V. is ingeschreven bij de Kamer van Koophandel onder nummer 97554839.', 50, doc.y + 30)
      doc.text('BTW-nummer: NL868107591B01', 50, doc.y + 45)

      // Einde document
      doc.end()

      stream.on('finish', () => {
        const publicUrl = `/calculaties/${fileName}`
        resolve({
          success: true,
          pdf_url: publicUrl,
          file_path: filePath
        })
      })

      stream.on('error', (error) => {
        reject(error)
      })

    } catch (error) {
      reject(error)
    }
  })
}
