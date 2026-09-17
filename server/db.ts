import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  User,
  Wallet,
  WalletTransaction,
  Category,
  Service,
  Order,
  Payment,
  SupportTicket,
  SupportMessage,
  NotificationItem,
  AuditLog,
  SystemSettings,
  Currency
} from '../src/types/index.js';

interface DatabaseSchema {
  users: User[];
  wallets: Wallet[];
  wallet_transactions: WalletTransaction[];
  categories: Category[];
  services: Service[];
  orders: Order[];
  payments: Payment[];
  support_tickets: SupportTicket[];
  support_messages: SupportMessage[];
  notifications: NotificationItem[];
  audit_logs: AuditLog[];
  settings: SystemSettings;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'jft_database.json');

// Default system settings
const DEFAULT_SETTINGS: SystemSettings = {
  platform_name: 'JFT Socials',
  primary_domain: 'jftsocials.online',
  whatsapp_support_number: '+2347018409997',
  default_markup_percentage: 50, // 50%
  default_min_margin_ngn: 2000,  // ₦2,000 minimum platform margin
  payment_fee_percentage: 3,     // 3% payment/deposit fee
  payment_fee_enabled: true,
  exchange_rate_usd_ngn: 1500,   // ₦1,500 = 1 USDT
  min_deposit_ngn: 1000,
  max_deposit_ngn: 5000000,
  min_deposit_usdt: 5,
  max_deposit_usdt: 10000,
  usdt_trc20_address: 'TLvQxJFTsocialsNetworkTRC20OfficialDepositAddress',
  usdt_network: 'TRON (TRC-20)',
  maintenance_mode: false,
  maintenance_message: 'JFT Socials infrastructure upgrade in progress. Order automation services remain protected.',
  peakerr_api_url: 'https://peakerr.com/api/v2',
  peakerr_key_configured: false,
  sync_interval_minutes: 10,
  low_balance_threshold_usd: 25.0
};

// Simple secure hash helper (for password storage)
export function hashPassword(plainText: string): string {
  return crypto.createHash('sha256').update(plainText + 'jft_salt_enterprise_2026').digest('hex');
}

class Database {
  private data: DatabaseSchema;
  private isWriting: boolean = false;

  constructor() {
    this.ensureDirectory();
    this.data = this.loadOrCreate();
  }

  private ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private save() {
    if (this.isWriting) return;
    this.isWriting = true;
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Database] Failed to write database file:', err);
    } finally {
      this.isWriting = false;
    }
  }

  private loadOrCreate(): DatabaseSchema {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.users && parsed.orders && parsed.settings) {
          return parsed;
        }
      } catch (err) {
        console.warn('[Database] Corrupted DB file, rebuilding seed data:', err);
      }
    }

    // Seed new database
    const initial = this.createSeedData();
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Database] Failed to write initial seed DB:', e);
    }
    return initial;
  }

  private createSeedData(): DatabaseSchema {
    const now = new Date().toISOString();

    const adminUser: User = {
      id: 'usr_admin_01',
      name: 'JFT Platform Administrator',
      username: 'jftadmin',
      email: 'admin@jftsocials.online',
      password_hash: hashPassword('AdminSecureKey2026!'),
      role: 'superadmin',
      status: 'active',
      email_verified: true,
      created_at: now,
      updated_at: now
    };

    const demoUser: User = {
      id: 'usr_demo_01',
      name: 'Alex Vance',
      username: 'demouser',
      email: 'customer@jftsocials.online',
      password_hash: hashPassword('Password123!'),
      role: 'customer',
      status: 'active',
      email_verified: true,
      created_at: now,
      updated_at: now
    };

    const wallets: Wallet[] = [
      {
        id: 'wal_admin_ngn',
        user_id: adminUser.id,
        currency: 'NGN',
        available_balance: 5000000,
        created_at: now,
        updated_at: now
      },
      {
        id: 'wal_admin_usdt',
        user_id: adminUser.id,
        currency: 'USDT',
        available_balance: 10000,
        created_at: now,
        updated_at: now
      },
      {
        id: 'wal_demo_ngn',
        user_id: demoUser.id,
        currency: 'NGN',
        available_balance: 75000, // ₦75,000 starting wallet
        created_at: now,
        updated_at: now
      },
      {
        id: 'wal_demo_usdt',
        user_id: demoUser.id,
        currency: 'USDT',
        available_balance: 50.00, // 50 USDT starting balance
        created_at: now,
        updated_at: now
      }
    ];

    const categories: Category[] = [
      { id: 'cat_ig', name: 'Instagram', platform: 'instagram', icon: 'Instagram', description: 'Followers, Likes, Reel Views, Engagement', active: true, sort_order: 1 },
      { id: 'cat_tk', name: 'TikTok', platform: 'tiktok', icon: 'Video', description: 'Followers, FYP Views, Saves, Shares, Likes', active: true, sort_order: 2 },
      { id: 'cat_yt', name: 'YouTube', platform: 'youtube', icon: 'Youtube', description: 'Monetization Views, High Retention Subscribers, Likes', active: true, sort_order: 3 },
      { id: 'cat_tg', name: 'Telegram', platform: 'telegram', icon: 'Send', description: 'Channel Members, Post Auto-Views, Group Growth', active: true, sort_order: 4 },
      { id: 'cat_tw', name: 'Twitter (X)', platform: 'twitter', icon: 'Twitter', description: 'Profile Followers, Retweets, Impressions, Poll Votes', active: true, sort_order: 5 },
      { id: 'cat_fb', name: 'Facebook', platform: 'facebook', icon: 'Share2', description: 'Page Likes, Group Members, Video Views', active: true, sort_order: 6 },
      { id: 'cat_sp', name: 'Spotify', platform: 'spotify', icon: 'Music', description: 'Royalty Eligible Global Track Streams, Playlist Followers', active: true, sort_order: 7 }
    ];

    const services: Service[] = [
      {
        id: 'srv_101',
        provider_id: 'peakerr',
        provider_service_id: 101,
        name: 'Instagram HQ Followers [Instant Start + 30D Refill Guarantee]',
        description: 'Instant start within 5-15 mins. Real profiles with posts and profile pictures. 30 days automated refill guarantee.',
        category_id: 'cat_ig',
        provider_rate: 1425, // ₦1,425 per 1k (Peakerr rate)
        min_quantity: 50,
        max_quantity: 50000,
        refill_supported: true,
        cancel_supported: true,
        active: true,
        ordering_enabled: true,
        sort_order: 1,
        synced_at: now
      },
      {
        id: 'srv_102',
        provider_id: 'peakerr',
        provider_service_id: 102,
        name: 'Instagram Real Active Post Likes [Super Fast Speed]',
        description: 'Instant start post likes. Improves algorithmic reach and explorer page discovery.',
        category_id: 'cat_ig',
        provider_rate: 525, // ₦525 per 1k
        min_quantity: 20,
        max_quantity: 100000,
        refill_supported: true,
        cancel_supported: true,
        active: true,
        ordering_enabled: true,
        sort_order: 2,
        synced_at: now
      },
      {
        id: 'srv_103',
        provider_id: 'peakerr',
        provider_service_id: 103,
        name: 'Instagram Video & Reels Views [High Retention]',
        description: 'Super fast delivery. High watch time to boost Instagram Reels algorithm rankings.',
        category_id: 'cat_ig',
        provider_rate: 225, // ₦225 per 1k
        min_quantity: 100,
        max_quantity: 1000000,
        refill_supported: false,
        cancel_supported: true,
        active: true,
        ordering_enabled: true,
        sort_order: 3,
        synced_at: now
      },
      {
        id: 'srv_201',
        provider_id: 'peakerr',
        provider_service_id: 201,
        name: 'TikTok Genuine Followers [Real Accounts + 60D Refill]',
        description: 'High grade TikTok followers suitable for LIVE streaming unlocking (1,000+ required) and Creator Rewards.',
        category_id: 'cat_tk',
        provider_rate: 2700, // ₦2,700 per 1k
        min_quantity: 50,
        max_quantity: 30000,
        refill_supported: true,
        cancel_supported: false,
        active: true,
        ordering_enabled: true,
        sort_order: 4,
        synced_at: now
      },
      {
        id: 'srv_202',
        provider_id: 'peakerr',
        provider_service_id: 202,
        name: 'TikTok High Retention FYP Video Views [Algorithm Booster]',
        description: 'Instant start. Delivered from organic IP pools to optimize For You Page placement.',
        category_id: 'cat_tk',
        provider_rate: 120, // ₦120 per 1k
        min_quantity: 500,
        max_quantity: 5000000,
        refill_supported: false,
        cancel_supported: true,
        active: true,
        ordering_enabled: true,
        sort_order: 5,
        synced_at: now
      },
      {
        id: 'srv_301',
        provider_id: 'peakerr',
        provider_service_id: 301,
        name: 'YouTube Watch Time Views [Monetization Eligible]',
        description: 'Safe monetization views with 3 to 5 minutes retention per view. Natural gradual distribution.',
        category_id: 'cat_yt',
        provider_rate: 3600, // ₦3,600 per 1k
        min_quantity: 500,
        max_quantity: 100000,
        refill_supported: true,
        cancel_supported: true,
        active: true,
        ordering_enabled: true,
        sort_order: 6,
        synced_at: now
      },
      {
        id: 'srv_401',
        provider_id: 'peakerr',
        provider_service_id: 401,
        name: 'Telegram Channel Members [Non-Drop Global]',
        description: 'HQ Telegram subscribers for public and private channels or groups.',
        category_id: 'cat_tg',
        provider_rate: 1275, // ₦1,275 per 1k
        min_quantity: 100,
        max_quantity: 50000,
        refill_supported: true,
        cancel_supported: true,
        active: true,
        ordering_enabled: true,
        sort_order: 7,
        synced_at: now
      }
    ];

    const orders: Order[] = [
      {
        id: 'JFT-ORD-8821',
        user_id: demoUser.id,
        user_name: demoUser.name,
        user_email: demoUser.email,
        service_id: 'srv_101',
        service_name: 'Instagram HQ Followers [Instant Start + 30D Refill Guarantee]',
        provider_id: 'peakerr',
        provider_order_id: 247910,
        target_link: 'https://instagram.com/jftsocials_official',
        quantity: 1000,
        provider_charge: 1425,
        customer_charge: 3425, // 1425 + 2000 min markup
        markup_amount: 2000,
        markup_percentage: 50,
        minimum_markup: 2000,
        applied_markup: 2000,
        payment_fee: 102.75,
        net_profit: 1897.25,
        currency: 'NGN',
        exchange_rate_used: 1500,
        pricing_rule_version: 'v2.0-min-floor-2000',
        start_count: 3200,
        remains: 0,
        status: 'completed',
        provider_status: 'Completed',
        refill_eligible: true,
        cancel_eligible: false,
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date(Date.now() - 82000000).toISOString(),
        completed_at: new Date(Date.now() - 82000000).toISOString()
      },
      {
        id: 'JFT-ORD-8822',
        user_id: demoUser.id,
        user_name: demoUser.name,
        user_email: demoUser.email,
        service_id: 'srv_201',
        service_name: 'TikTok Genuine Followers [Real Accounts + 60D Refill]',
        provider_id: 'peakerr',
        provider_order_id: 247985,
        target_link: 'https://www.tiktok.com/@creativelabs_ng',
        quantity: 1000,
        provider_charge: 2700,
        customer_charge: 4700, // 2700 + 2000 min margin
        markup_amount: 2000,
        markup_percentage: 50,
        minimum_markup: 2000,
        applied_markup: 2000,
        payment_fee: 141.0,
        net_profit: 1859.0,
        currency: 'NGN',
        exchange_rate_used: 1500,
        pricing_rule_version: 'v2.0-min-floor-2000',
        start_count: 1540,
        remains: 230,
        status: 'in_progress',
        provider_status: 'In progress',
        refill_eligible: false,
        cancel_eligible: true,
        created_at: new Date(Date.now() - 7200000).toISOString(),
        updated_at: now
      }
    ];

    const wallet_transactions: WalletTransaction[] = [
      {
        id: 'tx_seed_01',
        wallet_id: 'wal_demo_ngn',
        user_id: demoUser.id,
        type: 'deposit',
        amount: 83125,
        balance_before: 0,
        balance_after: 83125,
        currency: 'NGN',
        reference_type: 'payment',
        reference_id: 'pstk_ref_seed_01',
        description: 'Paystack Verified Instant Deposit',
        status: 'completed',
        created_at: new Date(Date.now() - 90000000).toISOString()
      },
      {
        id: 'tx_seed_02',
        wallet_id: 'wal_demo_ngn',
        user_id: demoUser.id,
        type: 'order_debit',
        amount: 3425,
        balance_before: 83125,
        balance_after: 79700,
        currency: 'NGN',
        reference_type: 'order',
        reference_id: 'JFT-ORD-8821',
        description: 'Order JFT-ORD-8821: Instagram HQ Followers',
        status: 'completed',
        created_at: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: 'tx_seed_03',
        wallet_id: 'wal_demo_ngn',
        user_id: demoUser.id,
        type: 'order_debit',
        amount: 4700,
        balance_before: 79700,
        balance_after: 75000,
        currency: 'NGN',
        reference_type: 'order',
        reference_id: 'JFT-ORD-8822',
        description: 'Order JFT-ORD-8822: TikTok Genuine Followers',
        status: 'completed',
        created_at: new Date(Date.now() - 7200000).toISOString()
      }
    ];

    const payments: Payment[] = [
      {
        id: 'pay_01',
        user_id: demoUser.id,
        user_name: demoUser.name,
        user_email: demoUser.email,
        provider: 'paystack',
        reference: 'pstk_ref_seed_01',
        amount: 85690,
        fee_amount: 2565, // 3% fee
        net_amount: 83125,
        currency: 'NGN',
        status: 'confirmed',
        created_at: new Date(Date.now() - 90000000).toISOString(),
        updated_at: new Date(Date.now() - 90000000).toISOString()
      }
    ];

    const support_tickets: SupportTicket[] = [
      {
        id: 'tkt_01',
        ticket_number: 'JFT-TKT-104',
        user_id: demoUser.id,
        user_name: demoUser.name,
        user_email: demoUser.email,
        category: 'order',
        subject: 'Refill status for completed Instagram order',
        priority: 'medium',
        status: 'open',
        assigned_admin: 'JFT Platform Administrator',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        updated_at: now
      }
    ];

    const support_messages: SupportMessage[] = [
      {
        id: 'msg_01',
        ticket_id: 'tkt_01',
        sender_id: demoUser.id,
        sender_name: demoUser.name,
        sender_role: 'customer',
        message: 'Hello! I noticed a drop of about 15 followers on my Instagram order JFT-ORD-8821. Would love to request the 30-day refill guaranteed on this service.',
        created_at: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 'msg_02',
        ticket_id: 'tkt_01',
        sender_id: adminUser.id,
        sender_name: adminUser.name,
        sender_role: 'superadmin',
        message: 'Hello Alex! We have triggered the provider refill task on order JFT-ORD-8821. The count will be replenished within 1-2 hours automatically. You can also contact us on WhatsApp at +2347018409997 anytime!',
        created_at: new Date(Date.now() - 1800000).toISOString()
      }
    ];

    const notifications: NotificationItem[] = [
      {
        id: 'notif_01',
        user_id: demoUser.id,
        type: 'deposit',
        title: 'Wallet Funded Successfully',
        message: '₦83,125.00 has been credited to your JFT Socials NGN wallet.',
        read: true,
        link: '/wallet',
        created_at: new Date(Date.now() - 90000000).toISOString()
      },
      {
        id: 'notif_02',
        user_id: demoUser.id,
        type: 'order',
        title: 'Order Completed',
        message: 'Order JFT-ORD-8821 has completed successfully.',
        read: false,
        link: '/orders',
        created_at: new Date(Date.now() - 82000000).toISOString()
      }
    ];

    const audit_logs: AuditLog[] = [
      {
        id: 'aud_01',
        actor_id: adminUser.id,
        actor_name: adminUser.name,
        actor_role: 'superadmin',
        action: 'PLATFORM_INITIALIZATION',
        entity_type: 'system',
        entity_id: 'jft_system',
        details: 'Initial system boot and Peakerr catalog configuration loaded.',
        ip: '127.0.0.1',
        created_at: now
      }
    ];

    return {
      users: [adminUser, demoUser],
      wallets,
      wallet_transactions,
      categories,
      services,
      orders,
      payments,
      support_tickets,
      support_messages,
      notifications,
      audit_logs,
      settings: DEFAULT_SETTINGS
    };
  }

  // --- ACCESSORS ---

  public getSettings(): SystemSettings {
    return { ...this.data.settings };
  }

  public updateSettings(partial: Partial<SystemSettings>, actor?: User, ip: string = '127.0.0.1'): SystemSettings {
    this.data.settings = { ...this.data.settings, ...partial };
    this.save();

    if (actor) {
      this.addAuditLog({
        actor_id: actor.id,
        actor_name: actor.name,
        actor_role: actor.role,
        action: 'UPDATE_SYSTEM_SETTINGS',
        entity_type: 'settings',
        entity_id: 'global',
        details: `Updated settings: ${Object.keys(partial).join(', ')}`,
        ip
      });
    }

    return this.data.settings;
  }

  // --- USERS ---

  public getUsers(): User[] {
    return this.data.users.map(u => ({ ...u }));
  }

  public findUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  }

  public findUserByEmail(email: string): User | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  public findUserByUsername(username: string): User | undefined {
    return this.data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  public createUser(userData: Omit<User, 'id' | 'created_at' | 'updated_at'>): User {
    const now = new Date().toISOString();
    const newUser: User = {
      ...userData,
      id: `usr_${crypto.randomBytes(6).toString('hex')}`,
      created_at: now,
      updated_at: now
    };
    this.data.users.push(newUser);

    // Automatically create both NGN and USDT wallets
    this.data.wallets.push({
      id: `wal_${crypto.randomBytes(6).toString('hex')}`,
      user_id: newUser.id,
      currency: 'NGN',
      available_balance: 0,
      created_at: now,
      updated_at: now
    });
    this.data.wallets.push({
      id: `wal_${crypto.randomBytes(6).toString('hex')}`,
      user_id: newUser.id,
      currency: 'USDT',
      available_balance: 0,
      created_at: now,
      updated_at: now
    });

    this.save();
    return newUser;
  }

  public updateUser(id: string, updates: Partial<User>): User | null {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    this.data.users[idx] = {
      ...this.data.users[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.save();
    return this.data.users[idx];
  }

  // --- WALLET & LEDGER ---

  public getWallets(userId: string): Wallet[] {
    return this.data.wallets.filter(w => w.user_id === userId);
  }

  public getWallet(userId: string, currency: Currency): Wallet {
    let wallet = this.data.wallets.find(w => w.user_id === userId && w.currency === currency);
    if (!wallet) {
      wallet = {
        id: `wal_${crypto.randomBytes(6).toString('hex')}`,
        user_id: userId,
        currency,
        available_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.data.wallets.push(wallet);
      this.save();
    }
    return wallet;
  }

  public getTransactions(userId?: string): WalletTransaction[] {
    if (userId) {
      return this.data.wallet_transactions
        .filter(t => t.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return this.data.wallet_transactions
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /**
   * Atomic wallet debit with double-entry ledger transaction.
   * Throws Error if balance is insufficient.
   */
  public debitWallet(
    userId: string,
    currency: Currency,
    amount: number,
    referenceType: 'order' | 'payment' | 'manual' | 'refund',
    referenceId: string,
    description: string
  ): { success: boolean; transaction: WalletTransaction; newBalance: number } {
    const wallet = this.getWallet(userId, currency);
    if (wallet.available_balance < amount) {
      throw new Error(`Insufficient ${currency} balance. Required: ${amount.toLocaleString()}, Available: ${wallet.available_balance.toLocaleString()}`);
    }

    const before = wallet.available_balance;
    const after = Math.round((before - amount + Number.EPSILON) * 100) / 100;
    wallet.available_balance = after;
    wallet.updated_at = new Date().toISOString();

    const transaction: WalletTransaction = {
      id: `tx_${crypto.randomBytes(8).toString('hex')}`,
      wallet_id: wallet.id,
      user_id: userId,
      type: referenceType === 'order' ? 'order_debit' : 'admin_debit',
      amount,
      balance_before: before,
      balance_after: after,
      currency,
      reference_type: referenceType,
      reference_id: referenceId,
      description,
      status: 'completed',
      created_at: new Date().toISOString()
    };

    this.data.wallet_transactions.unshift(transaction);
    this.save();

    return { success: true, transaction, newBalance: after };
  }

  /**
   * Atomic wallet credit with double-entry ledger transaction.
   */
  public creditWallet(
    userId: string,
    currency: Currency,
    amount: number,
    referenceType: 'order' | 'payment' | 'manual' | 'refund',
    referenceId: string,
    description: string
  ): { success: boolean; transaction: WalletTransaction; newBalance: number } {
    const wallet = this.getWallet(userId, currency);
    const before = wallet.available_balance;
    const after = Math.round((before + amount + Number.EPSILON) * 100) / 100;
    wallet.available_balance = after;
    wallet.updated_at = new Date().toISOString();

    const transaction: WalletTransaction = {
      id: `tx_${crypto.randomBytes(8).toString('hex')}`,
      wallet_id: wallet.id,
      user_id: userId,
      type: referenceType === 'refund' ? 'refund' : (referenceType === 'payment' ? 'deposit' : 'admin_credit'),
      amount,
      balance_before: before,
      balance_after: after,
      currency,
      reference_type: referenceType,
      reference_id: referenceId,
      description,
      status: 'completed',
      created_at: new Date().toISOString()
    };

    this.data.wallet_transactions.unshift(transaction);
    this.save();

    return { success: true, transaction, newBalance: after };
  }

  // --- ORDERS ---

  public getOrders(userId?: string): Order[] {
    if (userId) {
      return this.data.orders
        .filter(o => o.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return this.data.orders
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public findOrderById(id: string): Order | undefined {
    return this.data.orders.find(o => o.id === id);
  }

  public createOrder(order: Order): Order {
    this.data.orders.unshift(order);
    this.save();
    return order;
  }

  public updateOrder(id: string, updates: Partial<Order>): Order | null {
    const idx = this.data.orders.findIndex(o => o.id === id);
    if (idx === -1) return null;
    this.data.orders[idx] = {
      ...this.data.orders[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.save();
    return this.data.orders[idx];
  }

  /**
   * Strictly Enforced Admin Refund Protocol:
   * 1. Customer contacts support/WhatsApp.
   * 2. Administrator investigates.
   * 3. Admin executes refund from admin panel with mandatory reason & admin identity.
   * 4. Double-refund protection: throws error if already refunded.
   * 5. Credits wallet in exact order currency.
   * 6. Writes ledger entry.
   * 7. Creates notification for customer.
   * 8. Records audit log.
   */
  public processRefund(
    orderId: string,
    admin: User,
    reason: string,
    ip: string = '127.0.0.1'
  ): { success: boolean; order: Order; refundedAmount: number } {
    const order = this.findOrderById(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    if (order.status === 'refunded' || order.refunded_at) {
      throw new Error(`Order ${orderId} has already been refunded. Duplicate refund prevented.`);
    }

    const refundAmount = order.customer_charge;

    // 1. Credit customer wallet
    this.creditWallet(
      order.user_id,
      order.currency,
      refundAmount,
      'refund',
      order.id,
      `Refund for Order ${order.id}: ${reason}`
    );

    // 2. Mark order refunded
    const now = new Date().toISOString();
    order.status = 'refunded';
    order.refunded_at = now;
    order.refund_reason = reason;
    order.refund_admin_id = admin.id;
    order.updated_at = now;
    this.save();

    // 3. Notify customer
    this.createNotification({
      user_id: order.user_id,
      type: 'refund',
      title: 'Order Refund Credited',
      message: `Your order ${order.id} has been refunded in the amount of ${order.currency} ${refundAmount.toLocaleString()}. Reason: ${reason}`,
      read: false,
      link: `/orders`
    });

    // 4. Record Audit Log
    this.addAuditLog({
      actor_id: admin.id,
      actor_name: admin.name,
      actor_role: admin.role,
      action: 'PROCESS_ORDER_REFUND',
      entity_type: 'order',
      entity_id: order.id,
      details: `Refunded ${order.currency} ${refundAmount} to user ${order.user_id}. Reason: ${reason}`,
      ip
    });

    return { success: true, order, refundedAmount: refundAmount };
  }

  // --- SERVICES & CATEGORIES ---

  public getCategories(): Category[] {
    return this.data.categories.slice().sort((a, b) => a.sort_order - b.sort_order);
  }

  public updateCategory(id: string, updates: Partial<Category>): Category | null {
    const idx = this.data.categories.findIndex(c => c.id === id);
    if (idx === -1) return null;
    this.data.categories[idx] = { ...this.data.categories[idx], ...updates };
    this.save();
    return this.data.categories[idx];
  }

  public getServices(onlyActive: boolean = true): Service[] {
    if (onlyActive) {
      return this.data.services
        .filter(s => s.active && s.ordering_enabled)
        .sort((a, b) => a.sort_order - b.sort_order);
    }
    return this.data.services.slice().sort((a, b) => a.sort_order - b.sort_order);
  }

  public findServiceById(id: string): Service | undefined {
    return this.data.services.find(s => s.id === id);
  }

  public updateService(id: string, updates: Partial<Service>): Service | null {
    const idx = this.data.services.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.data.services[idx] = { ...this.data.services[idx], ...updates };
    this.save();
    return this.data.services[idx];
  }

  public setServices(services: Service[]) {
    this.data.services = services;
    this.save();
  }

  // --- PAYMENTS ---

  public getPayments(userId?: string): Payment[] {
    if (userId) {
      return this.data.payments
        .filter(p => p.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return this.data.payments
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public createPayment(payment: Payment): Payment {
    this.data.payments.unshift(payment);
    this.save();
    return payment;
  }

  public findPaymentByReference(ref: string): Payment | undefined {
    return this.data.payments.find(p => p.reference === ref);
  }

  public updatePayment(id: string, updates: Partial<Payment>): Payment | null {
    const idx = this.data.payments.findIndex(p => p.id === id);
    if (idx === -1) return null;
    this.data.payments[idx] = {
      ...this.data.payments[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.save();
    return this.data.payments[idx];
  }

  // --- SUPPORT TICKETS ---

  public getTickets(userId?: string): SupportTicket[] {
    if (userId) {
      return this.data.support_tickets
        .filter(t => t.user_id === userId)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    return this.data.support_tickets
      .slice()
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  public findTicketById(id: string): SupportTicket | undefined {
    return this.data.support_tickets.find(t => t.id === id);
  }

  public createTicket(ticket: Omit<SupportTicket, 'id' | 'ticket_number' | 'created_at' | 'updated_at'>): SupportTicket {
    const count = this.data.support_tickets.length + 105;
    const now = new Date().toISOString();
    const newTicket: SupportTicket = {
      ...ticket,
      id: `tkt_${crypto.randomBytes(6).toString('hex')}`,
      ticket_number: `JFT-TKT-${count}`,
      created_at: now,
      updated_at: now
    };
    this.data.support_tickets.unshift(newTicket);
    this.save();
    return newTicket;
  }

  public updateTicket(id: string, updates: Partial<SupportTicket>): SupportTicket | null {
    const idx = this.data.support_tickets.findIndex(t => t.id === id);
    if (idx === -1) return null;
    this.data.support_tickets[idx] = {
      ...this.data.support_tickets[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.save();
    return this.data.support_tickets[idx];
  }

  public getTicketMessages(ticketId: string): SupportMessage[] {
    return this.data.support_messages
      .filter(m => m.ticket_id === ticketId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  public addSupportMessage(msg: Omit<SupportMessage, 'id' | 'created_at'>): SupportMessage {
    const newMsg: SupportMessage = {
      ...msg,
      id: `msg_${crypto.randomBytes(6).toString('hex')}`,
      created_at: new Date().toISOString()
    };
    this.data.support_messages.push(newMsg);

    // Bump ticket updated_at
    const ticket = this.findTicketById(msg.ticket_id);
    if (ticket) {
      ticket.updated_at = new Date().toISOString();
      if (msg.sender_role === 'customer' && ticket.status === 'awaiting_customer') {
        ticket.status = 'open';
      }
    }
    this.save();
    return newMsg;
  }

  // --- NOTIFICATIONS ---

  public getNotifications(userId: string): NotificationItem[] {
    return this.data.notifications
      .filter(n => n.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public createNotification(item: Omit<NotificationItem, 'id' | 'created_at'>): NotificationItem {
    const notif: NotificationItem = {
      ...item,
      id: `notif_${crypto.randomBytes(6).toString('hex')}`,
      created_at: new Date().toISOString()
    };
    this.data.notifications.unshift(notif);
    this.save();
    return notif;
  }

  public markNotificationRead(id: string, userId: string): boolean {
    const notif = this.data.notifications.find(n => n.id === id && n.user_id === userId);
    if (notif) {
      notif.read = true;
      this.save();
      return true;
    }
    return false;
  }

  public markAllNotificationsRead(userId: string): void {
    this.data.notifications
      .filter(n => n.user_id === userId)
      .forEach(n => { n.read = true; });
    this.save();
  }

  // --- AUDIT LOGS ---

  public getAuditLogs(limit: number = 200): AuditLog[] {
    return this.data.audit_logs
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }

  public addAuditLog(item: Omit<AuditLog, 'id' | 'created_at'>): AuditLog {
    const log: AuditLog = {
      ...item,
      id: `aud_${crypto.randomBytes(6).toString('hex')}`,
      created_at: new Date().toISOString()
    };
    this.data.audit_logs.unshift(log);
    // Keep max 1000 logs in storage
    if (this.data.audit_logs.length > 1000) {
      this.data.audit_logs.pop();
    }
    this.save();
    return log;
  }
}

export const db = new Database();
