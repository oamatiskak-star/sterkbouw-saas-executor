import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * Verwerkt meerwerk aanvragen en genereert offerte PDFs
 */
export class QuoteProcessor {
  constructor(supabase) {
    this.supabase = supabase;
    this.templatesPath = path.join(process.cwd(), 'templates');
  }

  async processExtraWorkRequest(requestId) {
    try {
      // 1. Haal meerwerk aanvraag op
      const { data: request, error } = await this.supabase
        .from('extra_work_requests')
        .select(`
          *,
          project:projects (*),
          client:clients (*),
          drawings (*)
        `)
        .eq('id', requestId)
        .single();

      if (error) throw error;

      // 2. Bereken kosten
      const calculation = await this.calculateCosts(request);
      
      // 3. Genereer PDF offerte
      const pdfPath = await this.generateQuotePDF(request, calculation);
      
      // 4. Update database
      await this.supabase
        .from('extra_work_requests')
        .update({
          status: 'quote_ready',
          quote_amount: calculation.total,
          quote_pdf_url: pdfPath,
          calculated_at: new Date().toISOString()
        })
        .eq('id', requestId);

      // 5. Stuur notificatie
      await this.notifyClient(request.project_id, request.client.email);

      return {
        success: true,
        quoteId: requestId,
        amount: calculation.total,
        pdfUrl: pdfPath
      };
    } catch (error) {
      console.error('Quote processing error:', error);
      return { success: false, error: error.message };
    }
  }

  async calculateCosts(request) {
    // Implementeer je calculatie logica
    return {
      materials: request.estimated_material_cost || 0,
      labor: request.estimated_labor_hours * 75, // €75 per uur
      equipment: request.equipment_cost || 0,
      contingency: request.contingency_percentage || 10,
      vat: 21,
      total: 0 // Wordt berekend
    };
  }

  async generateQuotePDF(request, calculation) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const fileName = `quote-${request.id}-${Date.now()}.pdf`;
      const filePath = path.join(process.cwd(), 'public', 'quotes', fileName);
      
      // Zorg dat directory bestaat
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // HEADER
      doc.fontSize(20).text('OFFERTE MEERWERK', { align: 'center' });
      doc.moveDown();
      
      // Project informatie
      doc.fontSize(12)
         .text(`Project: ${request.project.name}`)
         .text(`Offertenummer: MW-${request.id}`)
         .text(`Datum: ${new Date().toLocaleDateString('nl-NL')}`)
         .moveDown();

      // Omschrijving
      doc.fontSize(14).text('Omschrijving:');
      doc.fontSize(11).text(request.description);
      doc.moveDown();

      // Kostenoverzicht
      doc.fontSize(14).text('Kostenoverzicht:');
      this.addCostTable(doc, calculation);
      
      // Voorwaarden
      doc.addPage()
         .fontSize(14).text('Algemene voorwaarden:')
         .fontSize(10)
         .text('1. Deze offerte is 30 dagen geldig')
         .text('2. Meerwerk wordt uitgevoerd na schriftelijke opdracht')
         .text('3. Prijzen zijn exclusief 21% BTW')
         .text('4. Planning in overleg')
         .moveDown();

      // Akkoord sectie
      doc.fontSize(12)
         .text('Voor akkoord:')
         .moveDown(2)
         .text('_________________________')
         .text('Naam en handtekening opdrachtgever')
         .text('Datum: ___________________');

      doc.end();
      
      stream.on('finish', () => resolve(`/quotes/${fileName}`));
      stream.on('error', reject);
    });
  }

  addCostTable(doc, calculation) {
    const tableTop = doc.y;
    const itemX = 50;
    const amountX = 400;

    doc.fontSize(11)
       .text('Omschrijving', itemX, tableTop)
       .text('Bedrag', amountX, tableTop)
       .moveDown(0.5);

    // Table rows
    const items = [
      ['Materialen', `€ ${calculation.materials.toFixed(2)}`],
      ['Arbeid', `€ ${calculation.labor.toFixed(2)}`],
      ['Materieel', `€ ${calculation.equipment.toFixed(2)}`],
      ['Contingentie (10%)', `€ ${(calculation.total * 0.1).toFixed(2)}`],
      ['Subtotaal', `€ ${calculation.total.toFixed(2)}`],
      ['BTW (21%)', `€ ${(calculation.total * 0.21).toFixed(2)}`],
      ['TOTAAL', `€ ${(calculation.total * 1.21).toFixed(2)}`]
    ];

    items.forEach(([desc, amount], i) => {
      const y = tableTop + 30 + (i * 20);
      doc.text(desc, itemX, y)
         .text(amount, amountX, y);
    });

    doc.moveDown(2);
  }

  async notifyClient(projectId, clientEmail) {
    // Implementeer email notificatie
    console.log(`📧 Offerte gereed voor project ${projectId}, mail naar ${clientEmail}`);
  }
}
