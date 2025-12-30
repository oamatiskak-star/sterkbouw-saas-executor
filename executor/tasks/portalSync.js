import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

/**
 * Real-time synchronisatie tussen Dashboard en Projectportaal
 * Pollt elke 30 seconden voor updates
 */
export class PortalSyncTask {
  constructor(config) {
    this.supabase = createClient(
      config.supabaseUrl,
      config.supabaseKey
    );
    this.pollingInterval = 30000; // 30 seconden
    this.activeSyncs = new Map();
  }

  async start() {
    console.log('🚀 Portal Sync Task gestart');
    
    // Start polling voor alle actieve projecten
    setInterval(() => this.pollDashboardUpdates(), this.pollingInterval);
    
    // Luister naar database changes via Supabase
    this.setupRealtimeListeners();
    
    return { status: 'active', startedAt: new Date() };
  }

  async pollDashboardUpdates() {
    try {
      // Haal alle projecten op die een portaal hebben
      const { data: projects, error } = await this.supabase
        .from('projects')
        .select('id, portal_enabled, last_dashboard_update')
        .eq('portal_enabled', true)
        .eq('status', 'active');

      if (error) throw error;

      // Check voor updates per project
      for (const project of projects) {
        await this.syncProjectToPortal(project.id);
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }

  async syncProjectToPortal(projectId) {
    try {
      // 1. Haal dashboard data op
      const dashboardData = await this.fetchDashboardData(projectId);
      
      // 2. Transformeer voor portaal (verwijder interne data)
      const portalData = this.transformForPortal(dashboardData);
      
      // 3. Update portaal cache
      await this.updatePortalCache(projectId, portalData);
      
      // 4. Stuur notificatie indien belangrijk
      if (this.hasImportantUpdates(dashboardData)) {
        await this.notifyClient(projectId, dashboardData);
      }
      
      console.log(`✅ Project ${projectId} gesynchroniseerd`);
      return true;
    } catch (error) {
      console.error(`Sync error project ${projectId}:`, error);
      return false;
    }
  }

  async fetchDashboardData(projectId) {
    // In praktijk: haal data uit je dashboard database
    const { data, error } = await this.supabase
      .from('projects')
      .select(`
        *,
        contracts (*),
        drawings (*),
        extra_work (*),
        delivery_points (*),
        communications (*)
      `)
      .eq('id', projectId)
      .single();

    if (error) throw error;
    return data;
  }

  transformForPortal(dashboardData) {
    // Filter interne data weg voor portaal
    return {
      overview: {
        name: dashboardData.name,
        status: dashboardData.status,
        expected_delivery: dashboardData.expected_delivery,
        last_update: dashboardData.updated_at,
        open_points: dashboardData.delivery_points?.filter(p => !p.completed).length || 0
      },
      contracts: dashboardData.contracts?.map(c => ({
        id: c.id,
        title: c.title,
        version: c.version,
        file_url: c.file_url,
        signed_at: c.signed_at,
        requires_client_approval: c.requires_client_approval
      })) || [],
      drawings: dashboardData.drawings?.map(d => ({
        id: d.id,
        title: d.title,
        revision: d.revision,
        file_url: d.file_url,
        is_latest: d.is_latest,
        created_at: d.created_at
      })) || [],
      extraWork: dashboardData.extra_work?.map(ew => ({
        id: ew.id,
        description: ew.description,
        status: ew.status,
        quote_amount: ew.quote_amount,
        client_approved: ew.client_approved,
        drawings: ew.drawings,
        created_at: ew.created_at
      })) || [],
      // ... meer secties
    };
  }

  async updatePortalCache(projectId, portalData) {
    // Sla op in Supabase voor portaal toegang
    const { error } = await this.supabase
      .from('portal_cache')
      .upsert({
        project_id: projectId,
        data: portalData,
        last_sync: new Date().toISOString(),
        sync_status: 'success'
      }, { onConflict: 'project_id' });

    if (error) throw error;
  }

  async notifyClient(projectId, updates) {
    // Stuur email/WhatsApp notificatie
    const { data: client } = await this.supabase
      .from('clients')
      .select('email, phone')
      .eq('project_id', projectId)
      .single();

    if (!client) return;

    // Implementeer je notificatie service hier
    console.log(`📧 Notificatie gestuurd voor project ${projectId}`);
  }

  setupRealtimeListeners() {
    // Supabase realtime subscriptions
    this.supabase
      .channel('portal-updates')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'extra_work' },
        (payload) => this.handleExtraWorkUpdate(payload)
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'drawings' },
        (payload) => this.handleDrawingUpdate(payload)
      )
      .subscribe();
  }

  handleExtraWorkUpdate(payload) {
    console.log('Extra work update:', payload);
    // Trigger immediate sync voor dit project
    this.syncProjectToPortal(payload.new.project_id);
  }

  handleDrawingUpdate(payload) {
    console.log('Drawing update:', payload);
    this.syncProjectToPortal(payload.new.project_id);
  }
}
