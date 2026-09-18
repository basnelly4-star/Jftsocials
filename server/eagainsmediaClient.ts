/**
 * Eagainsmedia API v2 Provider Client for JFT Socials
 * Upstream URL: https://eagainsmedia.com/api/v2
 * Implements the standard SMM Panel v2 protocol.
 */

import {
  ServiceProvider,
  PeakerrServiceItem,
  PeakerrStatusResponse,
  PeakerrBalanceResponse
} from './peakerrClient.js';

export class EagainsmediaClient implements ServiceProvider {
  private apiKey: string;
  private apiUrl: string;
  private authSuspended: boolean = false;
  private lastAuthError?: string;

  constructor(apiKey?: string, apiUrl?: string) {
    this.apiKey = apiKey || process.env.EAGAINSMEDIA_API_KEY || '';
    this.apiUrl = apiUrl || process.env.EAGAINSMEDIA_API_URL || 'https://eagainsmedia.com/api/v2';
  }

  public setApiKey(key: string) {
    this.apiKey = key;
    this.authSuspended = false;
    this.lastAuthError = undefined;
  }

  public isLive(): boolean {
    if (!this.apiKey) return false;
    const clean = this.apiKey.trim().toLowerCase();
    if (clean.length <= 8) return false;
    if (
      clean.startsWith('demo_') ||
      clean.startsWith('mock_') ||
      clean.startsWith('test_') ||
      clean.includes('test') ||
      clean.includes('placeholder') ||
      clean.includes('dummy') ||
      clean.includes('example') ||
      clean.includes('sample')
    ) {
      return false;
    }
    return !this.authSuspended;
  }

  private async request<T>(params: Record<string, string | number>): Promise<T> {
    const formData = new URLSearchParams();
    formData.append('key', this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      formData.append(k, String(v));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'JFT-Socials-Enterprise/2.0 (+https://jftsocials.online)'
        },
        body: formData.toString(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.authSuspended = true;
          this.lastAuthError = `Eagainsmedia API authentication rejected (HTTP ${response.status}). Operating in simulated sandbox mode until a valid API key is saved.`;
          console.info(`[EagainsmediaClient] ${this.lastAuthError}`);
        }
        throw new Error(`Eagainsmedia API HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw new Error(`Eagainsmedia provider connection failed: ${err.message || err}`);
    }
  }

  public async getServices(): Promise<PeakerrServiceItem[]> {
    if (!this.isLive()) {
      console.warn('[EagainsmediaClient] Provider key is not configured — returning empty catalog.');
      return [];
    }

    try {
      const services = await this.request<PeakerrServiceItem[]>({ action: 'services' });
      if (Array.isArray(services)) {
        return services;
      }
      return [];
    } catch (e: any) {
      console.error('[EagainsmediaClient] Failed to fetch services from Eagainsmedia:', e.message || e);
      throw e;
    }
  }

  public async addOrder(
    service: number,
    link: string,
    quantity: number
  ): Promise<{ orderId: number; error?: string }> {
    if (!this.isLive()) {
      return {
        orderId: 0,
        error: 'Eagainsmedia API key is not configured on this server.'
      };
    }

    try {
      const res = await this.request<{ order?: number; error?: string }>({
        action: 'add',
        service,
        link,
        quantity
      });

      if (res.order) {
        return { orderId: res.order };
      }
      return { orderId: 0, error: res.error || 'Unknown error response from Eagainsmedia API' };
    } catch (err: any) {
      return { orderId: 0, error: err.message || 'Connection failure while adding order to Eagainsmedia' };
    }
  }

  public async getOrderStatus(orderId: number | string): Promise<PeakerrStatusResponse> {
    if (!this.isLive()) {
      return { error: 'Eagainsmedia API key is not configured.' };
    }

    try {
      const res = await this.request<PeakerrStatusResponse>({
        action: 'status',
        order: orderId
      });
      return res;
    } catch (err: any) {
      return { error: err.message };
    }
  }

  public async getMultipleOrderStatus(orderIds: (number | string)[]): Promise<Record<string, PeakerrStatusResponse>> {
    if (!this.isLive() || orderIds.length === 0) {
      return {};
    }

    try {
      const res = await this.request<Record<string, PeakerrStatusResponse>>({
        action: 'status',
        orders: orderIds.join(',')
      });
      return res || {};
    } catch {
      return {};
    }
  }

  public async createRefill(orderId: number | string): Promise<{ refillId?: string; error?: string }> {
    if (!this.isLive()) {
      return { error: 'Eagainsmedia API key is not configured.' };
    }

    try {
      const res = await this.request<{ refill?: number | string; error?: string }>({
        action: 'refill',
        order: orderId
      });
      if (res.refill) {
        return { refillId: String(res.refill) };
      }
      return { error: res.error || 'Refill was declined by Eagainsmedia' };
    } catch (err: any) {
      return { error: err.message };
    }
  }

  public async getRefillStatus(refillId: string): Promise<{ status?: string; error?: string }> {
    if (!this.isLive()) {
      return { error: 'Eagainsmedia API key is not configured.' };
    }

    try {
      const res = await this.request<{ status?: string; error?: string }>({
        action: 'refill_status',
        refill: refillId
      });
      return res;
    } catch (err: any) {
      return { error: err.message };
    }
  }

  public async cancelOrders(orderIds: (number | string)[]): Promise<{ success: boolean; error?: string }> {
    if (!this.isLive()) {
      return { success: false, error: 'Eagainsmedia API key is not configured.' };
    }

    try {
      const res = await this.request<any>({
        action: 'cancel',
        orders: orderIds.join(',')
      });
      return { success: !res.error, error: res.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async getBalance(): Promise<{ balance: number; currency: string; error?: string }> {
    if (!this.isLive()) {
      return { balance: 0, currency: 'USD', error: 'Eagainsmedia API key is not configured' };
    }

    try {
      const res = await this.request<PeakerrBalanceResponse>({ action: 'balance' });
      if (res.error) {
        return { balance: 0, currency: 'USD', error: res.error };
      }
      return {
        balance: parseFloat(res.balance || '0'),
        currency: res.currency || 'USD'
      };
    } catch (err: any) {
      return { balance: 0, currency: 'USD', error: err.message };
    }
  }
}
