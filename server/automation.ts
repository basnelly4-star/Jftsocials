import { db } from './db.js';
import { PeakerrClient, ServiceProvider } from './peakerrClient.js';
import { OrderStatus, Order } from '../src/types/index.js';

export type ProviderResolver = (providerId?: string) => ServiceProvider;

export class AutomationEngine {
  private peakerr: PeakerrClient;
  private providerResolver?: ProviderResolver;
  private providers?: Record<string, ServiceProvider>;
  private syncTimer: NodeJS.Timeout | null = null;
  private serviceSyncTimer: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;

  constructor(
    peakerrOrResolver: PeakerrClient | ProviderResolver,
    providers?: Record<string, ServiceProvider>
  ) {
    if (typeof peakerrOrResolver === 'function') {
      this.providerResolver = peakerrOrResolver;
      this.peakerr = peakerrOrResolver('peakerr') as PeakerrClient;
    } else {
      this.peakerr = peakerrOrResolver;
    }
    this.providers = providers;
  }

  public getProvider(providerId?: string): ServiceProvider {
    if (this.providerResolver) {
      return this.providerResolver(providerId);
    }
    if (this.providers && providerId && this.providers[providerId]) {
      return this.providers[providerId];
    }
    return this.peakerr;
  }

  public start() {
    console.log('[AutomationEngine] Background order status & provider synchronizer started.');
    // Run an initial order-status sync after 5 seconds
    setTimeout(() => this.runOrderSync(), 5000);
    // Then every 15 seconds for responsive live updates
    this.syncTimer = setInterval(() => this.runOrderSync(), 15000);

    // Pull the full service catalog from every configured provider shortly
    // after boot, then keep it fresh on a slower schedule (catalogs don't
    // change minute to minute the way order statuses do).
    setTimeout(() => this.syncAllProviderCatalogs(), 10000);
    this.serviceSyncTimer = setInterval(() => this.syncAllProviderCatalogs(), 30 * 60 * 1000); // every 30 minutes
  }

  public stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.serviceSyncTimer) {
      clearInterval(this.serviceSyncTimer);
      this.serviceSyncTimer = null;
    }
  }

  private static readonly MAX_DISPATCH_ATTEMPTS = 5;
  private static readonly DISPATCH_RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes between retries

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

      // Retry orders that never made it to the provider, before checking status of the rest.
      await this.retryFailedDispatches(activeOrders.filter(o => !o.provider_order_id));

      // Check provider statuses
      for (const order of activeOrders.slice(0, 20)) {
        try {
          if (!order.provider_order_id) continue;

          const provider = this.getProvider(order.provider_id);
          const providerStatus = await provider.getOrderStatus(order.provider_order_id);

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

  // Retries orders that were charged to the customer but never successfully
  // dispatched to the provider. Backs off between attempts, and auto-refunds
  // the customer if the order still hasn't dispatched after the attempt cap.
  private async retryFailedDispatches(undispatchedOrders: Order[]) {
    const now = Date.now();

    for (const order of undispatchedOrders) {
      const attempts = order.dispatch_attempts || 0;
      const lastAttemptAt = order.last_dispatch_attempt_at
        ? new Date(order.last_dispatch_attempt_at).getTime()
        : 0;

      if (now - lastAttemptAt < AutomationEngine.DISPATCH_RETRY_INTERVAL_MS) {
        continue; // Not due for a retry yet
      }

      if (attempts >= AutomationEngine.MAX_DISPATCH_ATTEMPTS) {
        try {
          db.processSystemRefund(
            order.id,
            `Provider dispatch failed after ${attempts} attempts.`
          );
          console.warn(`[AutomationEngine] Auto-refunded order ${order.id} after ${attempts} failed dispatch attempts.`);
        } catch (refundErr) {
          console.error(`[AutomationEngine] Auto-refund failed for order ${order.id}:`, refundErr);
        }
        continue;
      }

      try {
        const service = db.findServiceById(order.service_id);
        const rawServiceId = order.provider_service_id ?? service?.provider_service_id;
        const providerServiceId = typeof rawServiceId === 'number' ? rawServiceId : parseInt(String(rawServiceId), 10);

        if (isNaN(providerServiceId)) {
          console.error(`[AutomationEngine] Missing valid numeric provider_service_id for order ${order.id}`);
          continue;
        }

        const provider = this.getProvider(order.provider_id);
        const providerRes = await provider.addOrder(
          providerServiceId,
          order.target_link,
          order.quantity
        );

        if (providerRes.orderId) {
          db.updateOrder(order.id, {
            provider_order_id: providerRes.orderId,
            status: 'in_progress',
            provider_status: 'In progress',
            dispatch_attempts: attempts + 1,
            last_dispatch_attempt_at: new Date().toISOString()
          });
          console.log(`[AutomationEngine] Order ${order.id} dispatched successfully on retry ${attempts + 1}.`);
        } else {
          db.updateOrder(order.id, {
            dispatch_attempts: attempts + 1,
            last_dispatch_attempt_at: new Date().toISOString()
          });
          console.warn(`[AutomationEngine] Retry ${attempts + 1} failed for order ${order.id}: ${providerRes.error}`);
        }
      } catch (e) {
        db.updateOrder(order.id, {
          dispatch_attempts: attempts + 1,
          last_dispatch_attempt_at: new Date().toISOString()
        });
        console.error(`[AutomationEngine] Retry ${attempts + 1} threw for order ${order.id}:`, e);
      }
    }
  }

  public async syncAllProviderCatalogs() {
    const providersToSync: string[] = [];
    const peakerr = this.getProvider('peakerr');
    if (peakerr && peakerr.isLive()) {
      providersToSync.push('peakerr');
    }
    const eagains = this.getProvider('eagainsmedia');
    if (eagains && eagains.isLive()) {
      providersToSync.push('eagainsmedia');
    }

    if (providersToSync.length === 0) {
      return;
    }

    for (const pId of providersToSync) {
      try {
        const result = await this.syncServicesFromProvider(pId);
        console.log(`[AutomationEngine] Catalog sync (${pId}): ${result.added} added, ${result.updated} updated, ${result.total} retrieved from provider.`);
      } catch (err: any) {
        console.info(`[AutomationEngine] Catalog sync note for ${pId}: ${err?.message || err}`);
      }
    }
  }

  public async syncServicesFromProvider(providerId: string = 'peakerr'): Promise<{ added: number; updated: number; total: number }> {
    const provider = this.getProvider(providerId);
    const rawServices = await provider.getServices();
    const existingServices = db.getServices(false);
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

      const existing = existingServices.find(s => s.provider_id === providerId && s.provider_service_id === raw.service);

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
          id: `srv_${providerId}_${raw.service}`,
          provider_id: providerId,
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
