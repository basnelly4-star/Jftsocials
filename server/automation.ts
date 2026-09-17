import { db } from './db.js';
import { PeakerrClient } from './peakerrClient.js';
import { OrderStatus } from '../src/types/index.js';

export class AutomationEngine {
  private peakerr: PeakerrClient;
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;

  constructor(peakerr: PeakerrClient) {
    this.peakerr = peakerr;
  }

  public start() {
    console.log('[AutomationEngine] Background order status & provider synchronizer started.');
    // Run an initial sync after 5 seconds
    setTimeout(() => this.runOrderSync(), 5000);
    // Then every 15 seconds for responsive live updates
    this.syncTimer = setInterval(() => this.runOrderSync(), 15000);
  }

  public stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  public async runOrderSync() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const activeOrders = db.getOrders().filter(o =>
        ['pending', 'processing', 'in_progress'].includes(o.status)
      );

      if (activeOrders.length === 0) {
        this.isSyncing = false;
        return;
      }

      // Check provider statuses
      for (const order of activeOrders.slice(0, 20)) {
        try {
          if (!order.provider_order_id) continue;

          const providerStatus = await this.peakerr.getOrderStatus(order.provider_order_id);

          if (providerStatus && !providerStatus.error) {
            let normalizedStatus: OrderStatus = order.status;
            const pStatus = (providerStatus.status || '').toLowerCase();

            if (pStatus.includes('completed') || pStatus === 'finish') {
              normalizedStatus = 'completed';
            } else if (pStatus.includes('progress')) {
              normalizedStatus = 'in_progress';
            } else if (pStatus.includes('partial')) {
              normalizedStatus = 'partial';
            } else if (pStatus.includes('canceled') || pStatus.includes('cancelled')) {
              normalizedStatus = 'cancelled';
            }

            const currentRemains = providerStatus.remains !== undefined ? parseInt(providerStatus.remains, 10) : order.remains;
            const currentStartCount = providerStatus.start_count !== undefined ? parseInt(providerStatus.start_count, 10) : order.start_count;

            const hasChanged = order.status !== normalizedStatus || order.remains !== currentRemains;

            if (hasChanged) {
              db.updateOrder(order.id, {
                status: normalizedStatus,
                provider_status: providerStatus.status || 'Updated',
                remains: isNaN(currentRemains) ? 0 : currentRemains,
                start_count: isNaN(currentStartCount) ? order.start_count : currentStartCount,
                completed_at: normalizedStatus === 'completed' ? new Date().toISOString() : order.completed_at
              });

              if (normalizedStatus === 'completed') {
                db.createNotification({
                  user_id: order.user_id,
                  type: 'order',
                  title: 'Order Completed',
                  message: `Your order ${order.id} for ${order.service_name || 'Social Growth'} has completed successfully.`,
                  read: false,
                  link: '/orders'
                });
              }
            }
          }
        } catch (e) {
          // Individual order check failure, continue others
        }
      }
    } catch (err) {
      console.error('[AutomationEngine] Order status sync error:', err);
    } finally {
      this.isSyncing = false;
    }
  }

  public async syncServicesFromProvider(): Promise<{ added: number; updated: number; total: number }> {
    const rawServices = await this.peakerr.getServices();
    const existingServices = db.getServices(false);
    const existingCategories = db.getCategories();
    const now = new Date().toISOString();

    let added = 0;
    let updated = 0;

    for (const raw of rawServices) {
      // Find matching category or map to existing platform
      let categoryId = 'cat_ig';
      const catLower = (raw.category || '').toLowerCase();
      if (catLower.includes('tiktok')) categoryId = 'cat_tk';
      else if (catLower.includes('youtube')) categoryId = 'cat_yt';
      else if (catLower.includes('telegram')) categoryId = 'cat_tg';
      else if (catLower.includes('twitter') || catLower.includes(' x')) categoryId = 'cat_tw';
      else if (catLower.includes('facebook')) categoryId = 'cat_fb';
      else if (catLower.includes('spotify')) categoryId = 'cat_sp';

      // Convert USD rate to NGN (rate per 1000)
      const usdRate = parseFloat(raw.rate) || 1.0;
      const exchangeRate = db.getSettings().exchange_rate_usd_ngn || 1500;
      const rateInNGN = Math.round(usdRate * exchangeRate);

      const existing = existingServices.find(s => s.provider_service_id === raw.service);

      if (existing) {
        // Update provider-only rate without overwriting custom admin overrides
        db.updateService(existing.id, {
          provider_rate: rateInNGN,
          min_quantity: parseInt(raw.min, 10) || existing.min_quantity,
          max_quantity: parseInt(raw.max, 10) || existing.max_quantity,
          refill_supported: Boolean(raw.refill),
          cancel_supported: Boolean(raw.cancel),
          synced_at: now
        });
        updated++;
      } else {
        // New service
        const newService = {
          id: `srv_${raw.service}`,
          provider_id: 'peakerr',
          provider_service_id: raw.service,
          name: raw.name,
          description: `Fast delivery guaranteed. High-quality accounts. Min: ${raw.min}, Max: ${raw.max}.`,
          category_id: categoryId,
          provider_rate: rateInNGN,
          min_quantity: parseInt(raw.min, 10) || 100,
          max_quantity: parseInt(raw.max, 10) || 10000,
          refill_supported: Boolean(raw.refill),
          cancel_supported: Boolean(raw.cancel),
          active: true,
          ordering_enabled: true,
          sort_order: existingServices.length + added + 1,
          synced_at: now
        };
        existingServices.push(newService);
        added++;
      }
    }

    if (added > 0) {
      db.setServices(existingServices);
    }

    return { added, updated, total: rawServices.length };
  }
}
