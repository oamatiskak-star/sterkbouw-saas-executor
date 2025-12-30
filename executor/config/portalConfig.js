/**
 * Configuratie voor Projectportaal Executor
 */
export const portalConfig = {
  // Supabase config (uit .env)
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_KEY,
    schema: 'public'
  },

  // Sync instellingen
  sync: {
    pollingInterval: 30000, // 30 seconden
    batchSize: 50, // Max projecten per sync batch
    retryAttempts: 3,
    retryDelay: 5000 // 5 seconden
  },

  // Portaal instellingen
  portal: {
    baseUrl: process.env.PORTAL_BASE_URL || 'https://projectportaal.sterkbouw.nl',
    sessionTimeout: 3600000, // 1 uur
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedFileTypes: ['pdf', 'jpg', 'png', 'dwg', 'dxf']
  },

  // Notificaties
  notifications: {
    emailEnabled: true,
    whatsappEnabled: false, // Later implementeren
    pushEnabled: false,
    defaultLanguage: 'nl'
  },

  // Offerte generatie
  quotes: {
    template: 'default',
    currency: 'EUR',
    vatPercentage: 21,
    validityDays: 30,
    termsAndConditions: 'https://sterkbouw.nl/voorwaarden'
  },

  // Export instellingen
  export: {
    maxDossierSize: 100 * 1024 * 1024, // 100MB
    formats: ['pdf', 'zip'],
    retentionDays: 365
  }
};

// Config validatie
export function validateConfig() {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required env variables: ${missing.join(', ')}`);
  }
  
  return true;
}
