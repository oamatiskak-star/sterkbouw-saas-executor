import { createClient } from '@supabase/supabase-js';

/**
 * Real-time updates service voor portaal ↔ dashboard
 * Gebruikt Supabase Realtime + fallback polling
 */
export class RealtimeSyncService {
  constructor(config) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.clients = new Map(); // projectId -> WebSocket connections
    this.setupChannels();
  }

  setupChannels() {
    // Dashboard → Portaal updates
    this.dashboardChannel = this.supabase
      .channel('dashboard-to-portal')
      .on('broadcast', { event: 'portal_update' }, (payload) => {
        this.broadcastToPortal(payload.payload.projectId, payload.payload);
      })
      .subscribe();

    // Portaal → Dashboard updates (client acties)
    this.portalChannel = this.supabase
      .channel('portal-to-dashboard')
      .on('broadcast', { event: 'client_action' }, (payload) => {
        this.forwardToDashboard(payload.payload);
      })
      .subscribe();
  }

  registerPortalConnection(projectId, wsConnection) {
    if (!this.clients.has(projectId)) {
      this.clients.set(projectId, new Set());
    }
    this.clients.get(projectId).add(wsConnection);
    
    console.log(`🔗 Portaal verbonden voor project ${projectId}`);
    
    // Stuur initiële data
    this.sendInitialData(projectId, wsConnection);
    
    // Setup disconnect handler
    wsConnection.on('close', () => {
      this.removeConnection(projectId, wsConnection);
    });
  }

  async sendInitialData(projectId, connection) {
    try {
      const { data } = await this.supabase
        .from('portal_cache')
        .select('data')
        .eq('project_id', projectId)
        .single();

      if (data) {
        connection.send(JSON.stringify({
          type: 'INITIAL_DATA',
          payload: data
        }));
      }
    } catch (error) {
      console.error('Initial data error:', error);
    }
  }

  broadcastToPortal(projectId, update) {
    const connections = this.clients.get(projectId);
    if (!connections) return;

    const message = JSON.stringify({
      type: 'UPDATE',
      timestamp: new Date().toISOString(),
      payload: update
    });

    connections.forEach(conn => {
      if (conn.readyState === 1) { // WebSocket.OPEN
        conn.send(message);
      } else {
        this.removeConnection(projectId, conn);
      }
    });
  }

  forwardToDashboard(action) {
    // Stuur naar dashboard service
    this.supabase
      .from('client_actions')
      .insert({
        project_id: action.projectId,
        action_type: action.type,
        payload: action.payload,
        client_id: action.clientId,
        ip_address: action.ip,
        user_agent: action.userAgent
      })
      .then(() => {
        console.log(`📝 Client actie gelogd: ${action.type}`);
      });
  }

  removeConnection(projectId, connection) {
    const connections = this.clients.get(projectId);
    if (connections) {
      connections.delete(connection);
      if (connections.size === 0) {
        this.clients.delete(projectId);
      }
    }
  }

  getStats() {
    return {
      activeProjects: this.clients.size,
      totalConnections: Array.from(this.clients.values())
        .reduce((sum, set) => sum + set.size, 0),
      channels: ['dashboard-to-portal', 'portal-to-dashboard']
    };
  }
}
