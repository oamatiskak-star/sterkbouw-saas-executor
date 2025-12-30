import { CronJob } from 'cron';
import MoneybirdSync from './syncInvoices';
import MoneybirdContacts from './syncContacts';
import logger from '../utils/logger';

class MoneybirdExecutor {
  constructor() {
    this.syncService = new MoneybirdSync();
    this.contactsService = new MoneybirdContacts();
    this.jobs = [];
  }

  async initialize() {
    logger.info('Initializing Moneybird Executor');
    
    // Daily invoice sync at 2:00 AM
    this.jobs.push(new CronJob(
      '0 2 * * *',
      () => this.dailySync(),
      null,
      true,
      'Europe/Amsterdam'
    ));
    
    // Hourly sync for high-priority companies
    this.jobs.push(new CronJob(
      '0 * * * *',
      () => this.hourlySync(),
      null,
      true,
      'Europe/Amsterdam'
    ));
    
    // Weekly contact sync
    this.jobs.push(new CronJob(
      '0 3 * * 0',
      () => this.weeklyContactSync(),
      null,
      true,
      'Europe/Amsterdam'
    ));
    
    logger.info(`Started ${this.jobs.length} Moneybird sync jobs`);
  }

  async dailySync() {
    logger.info('Starting daily Moneybird sync');
    
    try {
      // Get all active companies with Moneybird connection
      const companies = await this.getActiveCompanies();
      
      for (const company of companies) {
        try {
          await this.syncService.syncCompanyInvoices(company.id, {
            fullSync: false,
            syncProjects: true,
            updateForecasts: true
          });
          
          logger.info(`Synced invoices for company ${company.name}`);
        } catch (error) {
          logger.error(`Error syncing company ${company.name}:`, error);
        }
      }
      
      logger.info('Daily Moneybird sync completed');
    } catch (error) {
      logger.error('Daily sync failed:', error);
    }
  }

  async hourlySync() {
    // Sync high-priority companies more frequently
    const highPriorityCompanies = await this.getHighPriorityCompanies();
    
    for (const company of highPriorityCompanies) {
      try {
        await this.syncService.syncRecentInvoices(company.id, {
          hours: 1,
          updateCashflow: true
        });
      } catch (error) {
        logger.error(`Hourly sync failed for ${company.name}:`, error);
      }
    }
  }

  async weeklyContactSync() {
    logger.info('Starting weekly contact sync');
    
    try {
      const companies = await this.getActiveCompanies();
      
      for (const company of companies) {
        await this.contactsService.syncContacts(company.id);
        await this.contactsService.syncLedgerAccounts(company.id);
      }
      
      logger.info('Weekly contact sync completed');
    } catch (error) {
      logger.error('Weekly contact sync failed:', error);
    }
  }

  async getActiveCompanies() {
    // Implementation to fetch companies from database
    // Returns array of { id, name, moneybird_access_token }
  }

  async getHighPriorityCompanies() {
    // Implementation for companies that need frequent sync
  }

  async stop() {
    this.jobs.forEach(job => job.stop());
    logger.info('Moneybird Executor stopped');
  }
}

// Export singleton
const moneybirdExecutor = new MoneybirdExecutor();
export default moneybirdExecutor;

// For direct execution
if (require.main === module) {
  moneybirdExecutor.initialize()
    .then(() => {
      logger.info('Moneybird Executor running');
      process.on('SIGTERM', () => moneybirdExecutor.stop());
    })
    .catch(error => {
      logger.error('Failed to initialize Moneybird Executor:', error);
      process.exit(1);
    });
}
