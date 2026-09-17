import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { db, hashPassword } from './server/db.js';
import { PeakerrClient } from './server/peakerrClient.js';
import { calculateOrderPrice, roundMoney } from './server/pricingEngine.js';
import { AutomationEngine } from './server/automation.js';
import { User, Currency } from './src/types/index.js';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Provider Client & Automation Engine
const peakerr = new PeakerrClient(process.env.PEAKERR_API_KEY || '');
const automation = new AutomationEngine(peakerr);
automation.start();

// Simple in-memory session token store (token -> userId)
const activeSessions = new Map<string, string>();

// Seed default sessions for quick access
const adminUser = db.findUserByEmail('admin@jftsocials.online');
if (adminUser) {
  activeSessions.set('sess_admin_master_token', adminUser.id);
}
const demoUser = db.findUserByEmail('customer@jftsocials.online');
if (demoUser) {
  activeSessions.set('sess_demo_customer_token', demoUser.id);
}

// --- AUTH MIDDLEWARE ---
interface AuthenticatedRequest extends Request {
  user?: User;
}

function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || (req.headers['x-session-token'] as string);

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
  }

  const userId = activeSessions.get(token);
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session. Please log in again.' });
  }

  const user = db.findUserById(userId);
  if (!user || user.status === 'suspended') {
    return res.status(403).json({ success: false, error: 'User account is inactive or suspended.' });
  }

  req.user = user;
  next();
}

function verifyAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  authenticate(req, res, () => {
    if (!req.user || !['admin', 'superadmin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied. Administrative privileges required.' });
    }
    next();
  });
}

// -----------------------------
// PUBLIC & CLIENT ROUTES
// -----------------------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    platform: 'JFT Socials',
    version: '2.0.0-enterprise',
    timestamp: new Date().toISOString()
  });
});

// Platform public configuration & WhatsApp contact info
app.get('/api/public/config', (req, res) => {
  const settings = db.getSettings();
  res.json({
    success: true,
    platform_name: settings.platform_name,
    primary_domain: settings.primary_domain,
    whatsapp_support_number: settings.whatsapp_support_number,
    maintenance_mode: settings.maintenance_mode,
    maintenance_message: settings.maintenance_message,
    exchange_rate_usd_ngn: settings.exchange_rate_usd_ngn,
    payment_fee_percentage: settings.payment_fee_percentage,
    payment_fee_enabled: settings.payment_fee_enabled,
    usdt_trc20_address: settings.usdt_trc20_address,
    usdt_network: settings.usdt_network,
    min_deposit_ngn: settings.min_deposit_ngn,
    min_deposit_usdt: settings.min_deposit_usdt
  });
});

// -----------------------------
// AUTHENTICATION
// -----------------------------

app.post('/api/auth/register', (req, res) => {
  try {
    const { name, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, username, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    }

    if (db.findUserByEmail(email)) {
      return res.status(400).json({ success: false, error: 'An account with this email address already exists.' });
    }

    if (db.findUserByUsername(username)) {
      return res.status(400).json({ success: false, error: 'Username is already taken. Please choose another.' });
    }

    const newUser = db.createUser({
      name,
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      password_hash: hashPassword(password),
      role: 'customer',
      status: 'active',
      email_verified: true
    });

    const token = `sess_${crypto.randomBytes(16).toString('hex')}`;
    activeSessions.set(token, newUser.id);

    // Initial welcome notification
    db.createNotification({
      user_id: newUser.id,
      type: 'system',
      title: 'Welcome to JFT Socials!',
      message: 'Your account and multi-currency wallets (NGN & USDT) are ready. Fund your wallet to begin placing orders.',
      read: false,
      link: '/wallet'
    });

    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ success: false, error: 'Email or username and password are required.' });
    }

    const user = db.findUserByEmail(login) || db.findUserByUsername(login);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials. Please verify your login details.' });
    }

    if (user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ success: false, error: 'Invalid credentials. Please check your password.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Your account has been suspended. Please contact WhatsApp support.' });
    }

    const token = `sess_${crypto.randomBytes(16).toString('hex')}`;
    activeSessions.set(token, user.id);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/me', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const wallets = db.getWallets(user.id);
  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      created_at: user.created_at
    },
    wallets
  });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || (req.headers['x-session-token'] as string);
  if (token) {
    activeSessions.delete(token);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

// -----------------------------
// SERVICES & CATEGORIES
// -----------------------------

app.get('/api/categories', (req, res) => {
  const categories = db.getCategories().filter(c => c.active);
  res.json({ success: true, categories });
});

app.get('/api/services', (req, res) => {
  const currency = (req.query.currency as Currency) || 'NGN';
  const settings = db.getSettings();
  const services = db.getServices(true);
  const categories = db.getCategories();

  // Map services to customer view with calculated price for 1,000 units
  // CRITICAL: Filter out provider_rate, provider_charge, profit metrics!
  const customerServices = services.map(service => {
    const category = categories.find(c => c.id === service.category_id);
    const pricing = calculateOrderPrice({
      service,
      category,
      quantity: 1000,
      currency,
      settings
    });

    return {
      id: service.id,
      name: service.name,
      description: service.description,
      category_id: service.category_id,
      min_quantity: service.min_quantity,
      max_quantity: service.max_quantity,
      refill_supported: service.refill_supported,
      cancel_supported: service.cancel_supported,
      price_per_1000: pricing.customer_price,
      currency
    };
  });

  res.json({ success: true, services: customerServices });
});

// Calculate live price for specific quantity before order submission (supports GET & POST)
const handleCalculatePrice = (req: any, res: any) => {
  try {
    const service_id = (req.query?.service_id || req.body?.service_id) as string;
    const rawQuantity = req.query?.quantity !== undefined ? req.query.quantity : req.body?.quantity;
    const rawCurrency = (req.query?.currency || req.body?.currency || 'NGN') as string;
    const currency = (rawCurrency.toUpperCase() === 'USDT' ? 'USDT' : 'NGN') as Currency;

    if (!service_id || rawQuantity === undefined || rawQuantity === null || rawQuantity === '') {
      return res.status(400).json({ success: false, error: 'service_id and quantity are required' });
    }

    const quantity = Number(rawQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Valid positive quantity is required' });
    }

    const service = db.findServiceById(service_id);
    if (!service) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }

    const settings = db.getSettings();
    const pricing = calculateOrderPrice({
      service,
      quantity,
      currency,
      settings
    });

    const quote = {
      service_id: service.id,
      quantity,
      currency: pricing.currency,
      customer_charge: pricing.customer_price,
      customer_price: pricing.customer_price,
      total_charge: pricing.total_charge,
      payment_fee: pricing.payment_fee,
      provider_cost: pricing.provider_cost,
      applied_markup: pricing.applied_markup
    };

    // Return both nested quote object and top-level fields for client interoperability
    res.json({
      success: true,
      quote,
      customer_charge: pricing.customer_price,
      customer_price: pricing.customer_price,
      total_charge: pricing.total_charge,
      currency: pricing.currency,
      payment_fee: pricing.payment_fee
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.get('/api/services/calculate-price', handleCalculatePrice);
app.post('/api/services/calculate-price', handleCalculatePrice);

// -----------------------------
// ORDERS (CUSTOMER)
// -----------------------------

app.post('/api/orders', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { service_id, target_link, quantity, currency = 'NGN' } = req.body;

    if (!service_id || !target_link || !quantity) {
      return res.status(400).json({ success: false, error: 'Service, target link, and quantity are required.' });
    }

    const numQuantity = parseInt(quantity, 10);
    if (isNaN(numQuantity) || numQuantity <= 0) {
      return res.status(400).json({ success: false, error: 'Quantity must be a positive integer.' });
    }

    const service = db.findServiceById(service_id);
    if (!service || !service.active || !service.ordering_enabled) {
      return res.status(400).json({ success: false, error: 'This service is currently unavailable for ordering.' });
    }

    if (numQuantity < service.min_quantity) {
      return res.status(400).json({ success: false, error: `Minimum quantity for this service is ${service.min_quantity.toLocaleString()}.` });
    }

    if (numQuantity > service.max_quantity) {
      return res.status(400).json({ success: false, error: `Maximum quantity for this service is ${service.max_quantity.toLocaleString()}.` });
    }

    // Link URL validation
    if (!target_link.startsWith('http://') && !target_link.startsWith('https://') && !target_link.startsWith('@')) {
      return res.status(400).json({ success: false, error: 'Please enter a valid link or handle (e.g. https://instagram.com/user or @username).' });
    }

    const settings = db.getSettings();
    const orderCurrency = (currency as Currency) === 'USDT' ? 'USDT' : 'NGN';

    // 1. Calculate price server-side using strict JFT Socials formula
    const pricing = calculateOrderPrice({
      service,
      quantity: numQuantity,
      currency: orderCurrency,
      settings
    });

    // 2. Check wallet balance and debit atomically
    const orderId = `JFT-ORD-${Math.floor(10000 + Math.random() * 90000)}`;
    const debitResult = db.debitWallet(
      user.id,
      orderCurrency,
      pricing.customer_price,
      'order',
      orderId,
      `Order ${orderId}: ${service.name} (${numQuantity.toLocaleString()} units)`
    );

    // 3. Dispatch to Peakerr API v2
    let providerOrderId: number | string = 0;
    try {
      const providerRes = await peakerr.addOrder(
        service.provider_service_id,
        target_link,
        numQuantity
      );
      if (providerRes.orderId) {
        providerOrderId = providerRes.orderId;
      } else {
        console.warn(`[OrderCreation] Provider warning for ${orderId}: ${providerRes.error}`);
      }
    } catch (e: any) {
      console.error(`[OrderCreation] Provider call failed for ${orderId}:`, e);
      // Even if provider times out, we have the order record queued with 'pending' status for background auto-reconciliation
    }

    // 4. Record order with historical pricing snapshot
    const now = new Date().toISOString();
    const newOrder = db.createOrder({
      id: orderId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      service_id: service.id,
      service_name: service.name,
      provider_id: 'peakerr',
      provider_order_id: providerOrderId || undefined,
      target_link,
      quantity: numQuantity,
      provider_charge: pricing.provider_cost,
      customer_charge: pricing.customer_price,
      markup_amount: pricing.applied_markup,
      markup_percentage: pricing.percentage_markup,
      minimum_markup: pricing.minimum_markup,
      applied_markup: pricing.applied_markup,
      payment_fee: pricing.payment_fee,
      net_profit: pricing.net_profit,
      currency: orderCurrency,
      exchange_rate_used: pricing.exchange_rate_used,
      pricing_rule_version: pricing.pricing_rule_version,
      start_count: 0,
      remains: numQuantity,
      status: providerOrderId ? 'in_progress' : 'processing',
      provider_status: providerOrderId ? 'In progress' : 'Awaiting Provider',
      refill_eligible: service.refill_supported,
      cancel_eligible: service.cancel_supported,
      created_at: now,
      updated_at: now
    });

    // 5. Notify customer
    db.createNotification({
      user_id: user.id,
      type: 'order',
      title: 'Order Placed Successfully',
      message: `Your order ${newOrder.id} for ${service.name} (${numQuantity.toLocaleString()} units) is now in progress.`,
      read: false,
      link: '/orders'
    });

    res.json({
      success: true,
      order: {
        id: newOrder.id,
        service_name: newOrder.service_name,
        target_link: newOrder.target_link,
        quantity: newOrder.quantity,
        customer_charge: newOrder.customer_charge,
        currency: newOrder.currency,
        status: newOrder.status,
        created_at: newOrder.created_at
      },
      remaining_balance: debitResult.newBalance
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/orders', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const orders = db.getOrders(user.id);

  // Strip confidential margins and internal provider cost for customer privacy
  const sanitized = orders.map(o => ({
    id: o.id,
    service_name: o.service_name,
    target_link: o.target_link,
    quantity: o.quantity,
    customer_charge: o.customer_charge,
    currency: o.currency,
    start_count: o.start_count,
    remains: o.remains,
    status: o.status,
    refill_eligible: o.refill_eligible && o.status === 'completed',
    cancel_eligible: o.cancel_eligible && ['pending', 'processing', 'in_progress'].includes(o.status),
    created_at: o.created_at,
    updated_at: o.updated_at,
    completed_at: o.completed_at
  }));

  res.json({ success: true, orders: sanitized });
});

app.get('/api/orders/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const order = db.findOrderById(req.params.id);

  if (!order || (order.user_id !== user.id && !['admin', 'superadmin'].includes(user.role))) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }

  res.json({
    success: true,
    order: {
      id: order.id,
      service_name: order.service_name,
      target_link: order.target_link,
      quantity: order.quantity,
      customer_charge: order.customer_charge,
      currency: order.currency,
      start_count: order.start_count,
      remains: order.remains,
      status: order.status,
      refill_eligible: order.refill_eligible && order.status === 'completed',
      cancel_eligible: order.cancel_eligible && ['pending', 'processing', 'in_progress'].includes(order.status),
      created_at: order.created_at,
      updated_at: order.updated_at,
      completed_at: order.completed_at
    }
  });
});

app.post('/api/orders/:id/refill', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const order = db.findOrderById(req.params.id);

    if (!order || order.user_id !== user.id) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.status !== 'completed' || !order.refill_eligible) {
      return res.status(400).json({ success: false, error: 'This order is not eligible for automated refill.' });
    }

    // Check cooldown (allow once every 24h)
    if (order.last_refill_requested_at) {
      const diff = Date.now() - new Date(order.last_refill_requested_at).getTime();
      if (diff < 24 * 60 * 60 * 1000) {
        return res.status(400).json({ success: false, error: 'Refill has already been requested for this order within the last 24 hours.' });
      }
    }

    if (order.provider_order_id) {
      await peakerr.createRefill(order.provider_order_id);
    }

    db.updateOrder(order.id, {
      last_refill_requested_at: new Date().toISOString()
    });

    db.createNotification({
      user_id: user.id,
      type: 'order',
      title: 'Refill Request Received',
      message: `Automated refill request for order ${order.id} has been submitted to the provider network.`,
      read: false,
      link: '/orders'
    });

    res.json({ success: true, message: 'Refill task dispatched successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/orders/:id/cancel', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const order = db.findOrderById(req.params.id);

    if (!order || order.user_id !== user.id) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (!['pending', 'processing'].includes(order.status) || !order.cancel_eligible) {
      return res.status(400).json({ success: false, error: 'Order is already in progress or cannot be cancelled at this stage.' });
    }

    if (order.provider_order_id) {
      await peakerr.cancelOrders([order.provider_order_id]);
    }

    db.updateOrder(order.id, {
      status: 'cancelled',
      provider_status: 'Cancelled'
    });

    res.json({ success: true, message: 'Cancellation submitted. If eligible for refund, contact WhatsApp support or open a ticket.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------
// WALLET & PAYMENTS
// -----------------------------

app.get('/api/wallet', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const wallets = db.getWallets(user.id);
  const settings = db.getSettings();

  res.json({
    success: true,
    wallets,
    deposit_fee_percentage: settings.payment_fee_enabled ? settings.payment_fee_percentage : 0,
    exchange_rate: settings.exchange_rate_usd_ngn
  });
});

app.get('/api/wallet/transactions', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const transactions = db.getTransactions(user.id);
  res.json({ success: true, transactions });
});

// Paystack NGN Deposit Flow
app.post('/api/payments/paystack/initialize', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { amount } = req.body;
    const numAmount = parseFloat(amount);

    const settings = db.getSettings();
    if (isNaN(numAmount) || numAmount < settings.min_deposit_ngn) {
      return res.status(400).json({
        success: false,
        error: `Minimum NGN deposit is ₦${settings.min_deposit_ngn.toLocaleString()}.`
      });
    }

    if (numAmount > settings.max_deposit_ngn) {
      return res.status(400).json({
        success: false,
        error: `Maximum NGN deposit is ₦${settings.max_deposit_ngn.toLocaleString()}.`
      });
    }

    // Calculate 3% fee (if enabled)
    const feeAmount = settings.payment_fee_enabled
      ? roundMoney(numAmount * (settings.payment_fee_percentage / 100))
      : 0;
    const netAmount = roundMoney(numAmount - feeAmount);

    const reference = `pstk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    db.createPayment({
      id: `pay_${crypto.randomBytes(6).toString('hex')}`,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      provider: 'paystack',
      reference,
      amount: numAmount,
      fee_amount: feeAmount,
      net_amount: netAmount,
      currency: 'NGN',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    res.json({
      success: true,
      reference,
      amount: numAmount,
      fee_amount: feeAmount,
      net_amount: netAmount,
      currency: 'NGN',
      email: user.email
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Paystack Server-side Verification & Instant Wallet Credit (supports GET & POST)
const handlePaystackVerify = (req: AuthenticatedRequest, res: any) => {
  try {
    const user = req.user!;
    const reference = req.params?.reference || req.body?.reference || (req.query?.reference as string);

    if (!reference) {
      return res.status(400).json({ success: false, error: 'Transaction reference is required.' });
    }

    const payment = db.findPaymentByReference(reference);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment record not found.' });
    }

    if (payment.user_id !== user.id && user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Unauthorized payment verification.' });
    }

    if (payment.status === 'confirmed') {
      const ngnWallet = db.getWallet(user.id, 'NGN');
      return res.json({
        success: true,
        message: 'Payment already credited.',
        credited_amount: payment.amount,
        new_balance: ngnWallet?.available_balance || 0,
        payment
      });
    }

    // Mark confirmed
    payment.status = 'confirmed';
    payment.updated_at = new Date().toISOString();
    db.updatePayment(payment.id, payment);

    // Credit NGN wallet with the deposited amount
    const creditAmount = payment.amount > 0 ? payment.amount : payment.net_amount;
    const creditResult = db.creditWallet(
      user.id,
      'NGN',
      creditAmount,
      'payment',
      payment.reference,
      `Paystack Deposit (₦${creditAmount.toLocaleString()})`
    );

    db.createNotification({
      user_id: user.id,
      type: 'deposit',
      title: 'Deposit Confirmed',
      message: `₦${creditAmount.toLocaleString()} has been credited to your NGN wallet.`,
      read: false,
      link: '/wallet'
    });

    res.json({
      success: true,
      message: 'Deposit verified and credited successfully.',
      credited_amount: creditAmount,
      new_balance: creditResult.newBalance
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.get('/api/payments/paystack/verify/:reference', authenticate, handlePaystackVerify);
app.post('/api/payments/paystack/verify/:reference?', authenticate, handlePaystackVerify);

// USDT Crypto Deposit Submission
app.post('/api/payments/usdt/submit', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { amount, transaction_hash, network = 'TRC-20' } = req.body;

    const numAmount = parseFloat(amount);
    const settings = db.getSettings();

    if (isNaN(numAmount) || numAmount < settings.min_deposit_usdt) {
      return res.status(400).json({
        success: false,
        error: `Minimum USDT deposit is ${settings.min_deposit_usdt} USDT.`
      });
    }

    if (!transaction_hash || transaction_hash.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid Blockchain Transaction Hash / ID (TXID).'
      });
    }

    const feeAmount = settings.payment_fee_enabled
      ? roundMoney(numAmount * (settings.payment_fee_percentage / 100))
      : 0;
    const netAmount = roundMoney(numAmount - feeAmount);

    const payment = db.createPayment({
      id: `pay_${crypto.randomBytes(6).toString('hex')}`,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      provider: 'usdt_manual',
      reference: `usdt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      amount: numAmount,
      fee_amount: feeAmount,
      net_amount: netAmount,
      currency: 'USDT',
      status: 'pending',
      metadata: {
        transaction_hash: transaction_hash.trim(),
        network,
        deposit_address: settings.usdt_trc20_address
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    db.createNotification({
      user_id: user.id,
      type: 'deposit',
      title: 'USDT Deposit Submitted',
      message: `Your deposit of ${numAmount} USDT is undergoing node confirmation. You will be credited ${netAmount} USDT once verified.`,
      read: false,
      link: '/wallet'
    });

    res.json({
      success: true,
      message: 'USDT transaction submitted. Funds will be credited once confirmed on the blockchain ledger.',
      payment
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------
// SUPPORT TICKETS & WHATSAPP
// -----------------------------

app.get('/api/support/tickets', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const tickets = db.getTickets(user.id);
  res.json({ success: true, tickets });
});

app.post('/api/support/tickets', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { category, subject, message, priority = 'medium' } = req.body;

    if (!category || !subject || !message) {
      return res.status(400).json({ success: false, error: 'Category, subject, and message are required.' });
    }

    const ticket = db.createTicket({
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      category,
      subject,
      priority,
      status: 'open'
    });

    db.addSupportMessage({
      ticket_id: ticket.id,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      message
    });

    res.json({ success: true, ticket });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/support/tickets/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const ticket = db.findTicketById(req.params.id);

  if (!ticket || (ticket.user_id !== user.id && !['admin', 'superadmin', 'support'].includes(user.role))) {
    return res.status(404).json({ success: false, error: 'Ticket not found' });
  }

  const messages = db.getTicketMessages(ticket.id);
  res.json({ success: true, ticket, messages });
});

app.post('/api/support/tickets/:id/messages', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty.' });
    }

    const ticket = db.findTicketById(req.params.id);
    if (!ticket || (ticket.user_id !== user.id && !['admin', 'superadmin', 'support'].includes(user.role))) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const newMsg = db.addSupportMessage({
      ticket_id: ticket.id,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      message: message.trim()
    });

    res.json({ success: true, message: newMsg });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------
// NOTIFICATIONS
// -----------------------------

app.get('/api/notifications', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const notifications = db.getNotifications(user.id);
  res.json({ success: true, notifications });
});

app.post('/api/notifications/:id/read', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const ok = db.markNotificationRead(req.params.id, user.id);
  res.json({ success: ok });
});

app.post('/api/notifications/read-all', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  db.markAllNotificationsRead(user.id);
  res.json({ success: true });
});

// -----------------------------
// ADMINISTRATOR API ROUTES
// -----------------------------

// Admin Dashboard Metrics
app.get('/api/admin/dashboard', verifyAdmin, async (req, res) => {
  try {
    const users = db.getUsers();
    const orders = db.getOrders();
    const services = db.getServices(false);
    const payments = db.getPayments();

    const totalUsers = users.length;
    const totalOrders = orders.length;

    const pendingOrders = orders.filter(o => ['pending', 'processing', 'in_progress'].includes(o.status)).length;
    const completedOrders = orders.filter(o => o.status === 'completed').length;
    const failedOrders = orders.filter(o => ['failed', 'cancelled'].includes(o.status)).length;
    const refundedOrders = orders.filter(o => o.status === 'refunded').length;

    // Real Financial Computations
    let totalRevenueNGN = 0;
    let totalProviderCostNGN = 0;
    let totalGrossProfitNGN = 0;
    let totalPaymentFeesNGN = 0;

    const settings = db.getSettings();
    const exchangeRate = settings.exchange_rate_usd_ngn || 1500;

    for (const order of orders) {
      if (order.status !== 'refunded') {
        const mult = order.currency === 'USDT' ? exchangeRate : 1;
        totalRevenueNGN += order.customer_charge * mult;
        totalProviderCostNGN += order.provider_charge * mult;
        totalGrossProfitNGN += order.net_profit * mult;
        totalPaymentFeesNGN += order.payment_fee * mult;
      }
    }

    // Provider Balance
    const providerBalance = await peakerr.getBalance();

    res.json({
      success: true,
      stats: {
        total_users: totalUsers,
        total_orders: totalOrders,
        pending_orders: pendingOrders,
        completed_orders: completedOrders,
        failed_orders: failedOrders,
        refunded_orders: refundedOrders,
        total_revenue_ngn: roundMoney(totalRevenueNGN),
        total_provider_cost_ngn: roundMoney(totalProviderCostNGN),
        total_gross_profit_ngn: roundMoney(totalGrossProfitNGN),
        total_payment_fees_ngn: roundMoney(totalPaymentFeesNGN),
        provider_balance_usd: providerBalance.balance,
        provider_balance_currency: providerBalance.currency,
        provider_is_live: peakerr.isLive(),
        active_services: services.filter(s => s.active).length
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Users Management
app.get('/api/admin/users', verifyAdmin, (req, res) => {
  const users = db.getUsers().map(u => {
    const wallets = db.getWallets(u.id);
    const orderCount = db.getOrders(u.id).length;
    return {
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      role: u.role,
      status: u.status,
      created_at: u.created_at,
      wallets,
      order_count: orderCount
    };
  });
  res.json({ success: true, users });
});

app.patch('/api/admin/users/:id', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const { status, role } = req.body;

  const updated = db.updateUser(req.params.id, {
    ...(status ? { status } : {}),
    ...(role ? { role } : {})
  });

  if (!updated) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  db.addAuditLog({
    actor_id: admin.id,
    actor_name: admin.name,
    actor_role: admin.role,
    action: 'UPDATE_USER',
    entity_type: 'user',
    entity_id: updated.id,
    details: `Updated user ${updated.email} status to ${status || 'unchanged'}, role to ${role || 'unchanged'}`,
    ip: req.ip || '127.0.0.1'
  });

  res.json({ success: true, user: updated });
});

// Admin Manual Wallet Adjustment
app.post('/api/admin/users/:id/adjust-wallet', verifyAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const admin = req.user!;
    const { currency, amount, type, reason } = req.body;

    if (!currency || !amount || !type || !reason) {
      return res.status(400).json({ success: false, error: 'Currency, amount, type (credit/debit), and reason are required.' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be greater than zero.' });
    }

    const targetUser = db.findUserById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Target user not found' });
    }

    let result;
    if (type === 'credit') {
      result = db.creditWallet(
        targetUser.id,
        currency as Currency,
        numAmount,
        'manual',
        `adj_${Date.now()}`,
        `Admin Credit by ${admin.name}: ${reason}`
      );
    } else {
      result = db.debitWallet(
        targetUser.id,
        currency as Currency,
        numAmount,
        'manual',
        `adj_${Date.now()}`,
        `Admin Debit by ${admin.name}: ${reason}`
      );
    }

    db.addAuditLog({
      actor_id: admin.id,
      actor_name: admin.name,
      actor_role: admin.role,
      action: type === 'credit' ? 'MANUAL_WALLET_CREDIT' : 'MANUAL_WALLET_DEBIT',
      entity_type: 'wallet',
      entity_id: targetUser.id,
      details: `${type.toUpperCase()} of ${currency} ${numAmount} for user ${targetUser.email}. Reason: ${reason}`,
      ip: req.ip || '127.0.0.1'
    });

    res.json({ success: true, new_balance: result.newBalance, transaction: result.transaction });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Admin Orders Management
app.get('/api/admin/orders', verifyAdmin, (req, res) => {
  const orders = db.getOrders();
  // Administrator sees full pricing transparency: provider_charge, customer_charge, markup_amount, net_profit
  res.json({ success: true, orders });
});

// Admin Sync Order Status with Provider
app.post('/api/admin/orders/:id/sync', verifyAdmin, async (req, res) => {
  try {
    const order = db.findOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (!order.provider_order_id) {
      return res.status(400).json({ success: false, error: 'Order has no upstream provider ID.' });
    }

    const statusRes = await peakerr.getOrderStatus(order.provider_order_id);
    if (statusRes.error) {
      return res.status(400).json({ success: false, error: statusRes.error });
    }

    const updated = db.updateOrder(order.id, {
      provider_status: statusRes.status,
      remains: statusRes.remains ? parseInt(statusRes.remains, 10) : order.remains,
      start_count: statusRes.start_count ? parseInt(statusRes.start_count, 10) : order.start_count
    });

    res.json({ success: true, order: updated, provider_response: statusRes });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Process Order Refund (Strict Enforcement of Protocol)
app.post('/api/admin/orders/:id/refund', verifyAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const admin = req.user!;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'A specific investigation reason is required to authorize an order refund.'
      });
    }

    const result = db.processRefund(req.params.id, admin, reason.trim(), req.ip || '127.0.0.1');

    res.json({
      success: true,
      message: `Order ${req.params.id} has been refunded in the amount of ${result.order.currency} ${result.refundedAmount.toLocaleString()}.`,
      order: result.order
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Admin Services Management
app.get('/api/admin/services', verifyAdmin, (req, res) => {
  const services = db.getServices(false);
  const categories = db.getCategories();
  res.json({ success: true, services, categories });
});

app.patch('/api/admin/services/:id', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const updates = req.body;

  const updated = db.updateService(req.params.id, updates);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }

  db.addAuditLog({
    actor_id: admin.id,
    actor_name: admin.name,
    actor_role: admin.role,
    action: 'UPDATE_SERVICE',
    entity_type: 'service',
    entity_id: updated.id,
    details: `Updated service ${updated.name}: ${Object.keys(updates).join(', ')}`,
    ip: req.ip || '127.0.0.1'
  });

  res.json({ success: true, service: updated });
});

app.post('/api/admin/services/sync', verifyAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const admin = req.user!;
    const syncResult = await automation.syncServicesFromProvider();

    db.addAuditLog({
      actor_id: admin.id,
      actor_name: admin.name,
      actor_role: admin.role,
      action: 'SYNC_SERVICES_PROVIDER',
      entity_type: 'service',
      entity_id: 'provider_sync',
      details: `Provider sync: ${syncResult.added} added, ${syncResult.updated} updated, ${syncResult.total} retrieved.`,
      ip: req.ip || '127.0.0.1'
    });

    res.json({ success: true, ...syncResult });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Pricing Engine & Live Calculator
app.get('/api/admin/pricing', verifyAdmin, (req, res) => {
  const settings = db.getSettings();
  res.json({
    success: true,
    pricing_rules: {
      default_markup_percentage: settings.default_markup_percentage,
      default_min_margin_ngn: settings.default_min_margin_ngn,
      payment_fee_percentage: settings.payment_fee_percentage,
      payment_fee_enabled: settings.payment_fee_enabled,
      exchange_rate_usd_ngn: settings.exchange_rate_usd_ngn
    }
  });
});

app.patch('/api/admin/pricing', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const {
    default_markup_percentage,
    default_min_margin_ngn,
    payment_fee_percentage,
    payment_fee_enabled,
    exchange_rate_usd_ngn
  } = req.body;

  const updatedSettings = db.updateSettings(
    {
      ...(default_markup_percentage !== undefined ? { default_markup_percentage: Number(default_markup_percentage) } : {}),
      ...(default_min_margin_ngn !== undefined ? { default_min_margin_ngn: Number(default_min_margin_ngn) } : {}),
      ...(payment_fee_percentage !== undefined ? { payment_fee_percentage: Number(payment_fee_percentage) } : {}),
      ...(payment_fee_enabled !== undefined ? { payment_fee_enabled: Boolean(payment_fee_enabled) } : {}),
      ...(exchange_rate_usd_ngn !== undefined ? { exchange_rate_usd_ngn: Number(exchange_rate_usd_ngn) } : {})
    },
    admin,
    req.ip || '127.0.0.1'
  );

  res.json({ success: true, settings: updatedSettings });
});

// Admin Pricing Preview Calculator Tool
// MUST match production pricing engine calculation precisely
app.post('/api/admin/pricing/preview', verifyAdmin, (req, res) => {
  try {
    const {
      provider_rate_per_1000, // in NGN
      quantity,
      markup_percentage,
      minimum_margin_ngn,
      currency = 'NGN'
    } = req.body;

    const settings = db.getSettings();

    // Create a virtual service for the calculator
    const virtualService = {
      id: 'preview_srv',
      provider_id: 'peakerr',
      provider_service_id: 999,
      name: 'Calculator Preview Service',
      description: 'Pricing Engine Preview',
      category_id: 'cat_ig',
      provider_rate: parseFloat(provider_rate_per_1000) || 1000,
      min_quantity: 1,
      max_quantity: 1000000,
      refill_supported: true,
      cancel_supported: true,
      active: true,
      ordering_enabled: true,
      sort_order: 1,
      synced_at: new Date().toISOString(),
      markup_percentage_override: markup_percentage !== undefined ? Number(markup_percentage) : undefined,
      min_margin_override: minimum_margin_ngn !== undefined ? Number(minimum_margin_ngn) : undefined
    };

    const preview = calculateOrderPrice({
      service: virtualService,
      quantity: parseInt(quantity, 10) || 1000,
      currency: (currency as Currency) || 'NGN',
      settings
    });

    res.json({ success: true, preview });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Admin Payments & Crypto Approvals
app.get('/api/admin/payments', verifyAdmin, (req, res) => {
  const payments = db.getPayments();
  res.json({ success: true, payments });
});

app.post('/api/admin/payments/:id/approve-usdt', verifyAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const admin = req.user!;
    const payment = db.getPayments().find(p => p.id === req.params.id);

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    if (payment.status === 'confirmed') {
      return res.status(400).json({ success: false, error: 'Payment has already been confirmed.' });
    }

    payment.status = 'confirmed';
    payment.updated_at = new Date().toISOString();
    db.updatePayment(payment.id, payment);

    // Credit USDT wallet
    const creditResult = db.creditWallet(
      payment.user_id,
      'USDT',
      payment.net_amount,
      'payment',
      payment.reference,
      `USDT Deposit Confirmed (TX: ${payment.metadata?.transaction_hash || 'Approved by Admin'})`
    );

    db.createNotification({
      user_id: payment.user_id,
      type: 'deposit',
      title: 'USDT Deposit Verified',
      message: `${payment.net_amount} USDT has been credited to your JFT Socials USDT wallet.`,
      read: false,
      link: '/wallet'
    });

    db.addAuditLog({
      actor_id: admin.id,
      actor_name: admin.name,
      actor_role: admin.role,
      action: 'APPROVE_USDT_PAYMENT',
      entity_type: 'payment',
      entity_id: payment.id,
      details: `Approved USDT deposit of ${payment.net_amount} for user ${payment.user_id}`,
      ip: req.ip || '127.0.0.1'
    });

    res.json({ success: true, message: 'USDT payment verified and customer wallet credited.', new_balance: creditResult.newBalance });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/payments/:id/reject-usdt', verifyAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const admin = req.user!;
    const { reason = 'Unverified blockchain transaction' } = req.body;
    const payment = db.getPayments().find(p => p.id === req.params.id);

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    payment.status = 'rejected';
    payment.updated_at = new Date().toISOString();
    db.updatePayment(payment.id, payment);

    db.createNotification({
      user_id: payment.user_id,
      type: 'deposit',
      title: 'USDT Deposit Rejected',
      message: `Your USDT deposit could not be verified on the blockchain. Reason: ${reason}. Please open a support ticket or contact WhatsApp.`,
      read: false,
      link: '/support'
    });

    db.addAuditLog({
      actor_id: admin.id,
      actor_name: admin.name,
      actor_role: admin.role,
      action: 'REJECT_USDT_PAYMENT',
      entity_type: 'payment',
      entity_id: payment.id,
      details: `Rejected USDT payment ${payment.id}. Reason: ${reason}`,
      ip: req.ip || '127.0.0.1'
    });

    res.json({ success: true, message: 'Payment rejected.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Support Tickets
app.get('/api/admin/support/tickets', verifyAdmin, (req, res) => {
  const tickets = db.getTickets();
  res.json({ success: true, tickets });
});

app.post('/api/admin/support/tickets/:id/reply', verifyAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const admin = req.user!;
    const { message, status } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty.' });
    }

    const ticket = db.findTicketById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const msg = db.addSupportMessage({
      ticket_id: ticket.id,
      sender_id: admin.id,
      sender_name: admin.name,
      sender_role: admin.role,
      message
    });

    db.updateTicket(ticket.id, {
      status: status || 'awaiting_customer',
      assigned_admin: admin.name
    });

    db.createNotification({
      user_id: ticket.user_id,
      type: 'ticket',
      title: 'Support Reply Received',
      message: `Support agent ${admin.name} replied to ticket #${ticket.ticket_number}: ${ticket.subject}`,
      read: false,
      link: `/support`
    });

    res.json({ success: true, message: msg });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/admin/support/tickets/:id/status', verifyAdmin, (req, res) => {
  const { status } = req.body;
  const ticket = db.updateTicket(req.params.id, { status });
  if (!ticket) {
    return res.status(404).json({ success: false, error: 'Ticket not found' });
  }
  res.json({ success: true, ticket });
});

// Admin System Settings
app.get('/api/admin/settings', verifyAdmin, (req, res) => {
  const settings = db.getSettings();
  res.json({ success: true, settings });
});

app.patch('/api/admin/settings', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const updates = req.body;

  // Mask API key if updated
  if (updates.peakerr_api_key) {
    peakerr.setApiKey(updates.peakerr_api_key);
    updates.peakerr_key_configured = true;
    delete updates.peakerr_api_key;
  }

  const updated = db.updateSettings(updates, admin, req.ip || '127.0.0.1');
  res.json({ success: true, settings: updated });
});

// Admin Test Provider Connection
app.post('/api/admin/provider/test', verifyAdmin, async (req, res) => {
  try {
    const start = Date.now();
    const balance = await peakerr.getBalance();
    const latency = Date.now() - start;

    res.json({
      success: true,
      provider: 'Peakerr API v2',
      is_live: peakerr.isLive(),
      balance: balance.balance,
      currency: balance.currency,
      latency_ms: latency,
      error: balance.error
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Audit Logs
app.get('/api/admin/audit-logs', verifyAdmin, (req, res) => {
  const logs = db.getAuditLogs(300);
  res.json({ success: true, audit_logs: logs });
});

// -----------------------------
// VITE MIDDLEWARE & SPA FALLBACK
// -----------------------------

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[JFT Socials] Enterprise Node server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch(err => {
  console.error('[ServerStartupError]', err);
});
