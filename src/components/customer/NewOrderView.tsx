import React, { useState, useEffect } from 'react';
import {
  Zap,
  Info,
  AlertCircle,
  CheckCircle2,
  Wallet,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { Currency } from '../../types/index.js';

export const NewOrderView: React.FC = () => {
  const { token, currency, wallets, showToast, setActiveView, refreshOrders, refreshUserData } = useApp();

  const [categories, setCategories] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('instagram');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [targetLink, setTargetLink] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1000);
  const [runs, setRuns] = useState<number>(1);
  const [interval, setInterval] = useState<number>(0);

  const [priceQuote, setPriceQuote] = useState<any>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch Categories & Services
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setCategories(data.categories || []);
        }
      })
      .catch(console.error);

    fetch(`/api/services?currency=${currency}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setServices(data.services || []);
        }
      })
      .catch(console.error);
  }, [currency]);

  // Filter Categories by platform
  const filteredCategories = categories.filter(c => c.platform === selectedPlatform);

  // Set default category when platform changes
  useEffect(() => {
    if (filteredCategories.length > 0) {
      setSelectedCategoryId(filteredCategories[0].id);
    } else {
      setSelectedCategoryId('');
    }
  }, [selectedPlatform, categories]);

  // Filter services by category
  const filteredServices = services.filter(s => s.category_id === selectedCategoryId);

  // Set default service when category changes
  useEffect(() => {
    if (filteredServices.length > 0) {
      setSelectedServiceId(filteredServices[0].id);
      setQuantity(filteredServices[0].min_quantity || 1000);
    } else {
      setSelectedServiceId('');
    }
  }, [selectedCategoryId, services]);

  const activeService = services.find(s => s.id === selectedServiceId);

  // Calculate live quote
  useEffect(() => {
    if (!selectedServiceId || !quantity || quantity <= 0) {
      setPriceQuote(null);
      return;
    }

    let isCancelled = false;
    setLoadingQuote(true);
    setErrorMsg('');

    fetch(
      `/api/services/calculate-price?service_id=${encodeURIComponent(selectedServiceId)}&quantity=${encodeURIComponent(quantity)}&currency=${encodeURIComponent(currency)}`
    )
      .then(async r => {
        const text = await r.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error('Server returned an unexpected response format while calculating price.');
        }
        if (!r.ok || !data) {
          throw new Error(data?.error || `Failed to calculate price (${r.status}).`);
        }
        return data;
      })
      .then(data => {
        if (isCancelled) return;
        if (data.success) {
          const quote = data.quote || {
            service_id: selectedServiceId,
            quantity: Number(quantity),
            currency: data.currency || currency,
            customer_charge: data.customer_charge ?? data.customer_price ?? data.total_charge,
            customer_price: data.customer_price,
            total_charge: data.total_charge,
            payment_fee: data.payment_fee
          };
          setPriceQuote(quote);
        } else {
          setErrorMsg(data.error || 'Failed to calculate price.');
        }
      })
      .catch(err => {
        if (isCancelled) return;
        console.error('Price calculation error:', err);
        setErrorMsg(err.message || 'Error calculating price.');
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingQuote(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedServiceId, quantity, currency]);

  // Check customer balance
  const activeWallet = wallets.find(w => w.currency === currency);
  const currentBalance = activeWallet?.available_balance || 0;
  const isBalanceSufficient = priceQuote ? currentBalance >= priceQuote.customer_charge : false;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!isBalanceSufficient) {
      setErrorMsg(`Insufficient ${currency} balance. Please fund your wallet first.`);
      return;
    }

    if (activeService) {
      if (quantity < activeService.min_quantity || quantity > activeService.max_quantity) {
        setErrorMsg(`Quantity must be between ${activeService.min_quantity} and ${activeService.max_quantity}.`);
        return;
      }
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          service_id: selectedServiceId,
          link: targetLink,
          quantity: Number(quantity),
          currency,
          runs: Number(runs) || 1,
          interval: Number(interval) || 0
        })
      });

      const data = await res.json();
      if (!data.success) {
        setErrorMsg(data.error || 'Failed to submit order.');
        setSubmitting(false);
        return;
      }

      showToast(`Order #${data.order.id} initiated successfully!`, 'success');
      await refreshOrders();
      await refreshUserData();
      setActiveView('orders');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error submitting order.');
    } finally {
      setSubmitting(false);
    }
  };

  const platforms = [
    { id: 'instagram', name: 'Instagram' },
    { id: 'tiktok', name: 'TikTok' },
    { id: 'youtube', name: 'YouTube' },
    { id: 'telegram', name: 'Telegram' },
    { id: 'twitter', name: 'Twitter (X)' },
    { id: 'facebook', name: 'Facebook' },
    { id: 'spotify', name: 'Spotify' }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* View Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-white">Create New Order</h1>
        <p className="text-xs text-slate-400 mt-1">
          Instant execution via Peakerr API v2 with server-side price protection.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: 7 cols */}
        <div className="lg:col-span-7 bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handlePlaceOrder} className="space-y-4">
            {/* Platform Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Target Social Platform
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {platforms.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlatform(p.id)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-medium transition cursor-pointer text-center truncate ${
                      selectedPlatform === p.id
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Service Category
              </label>
              <select
                value={selectedCategoryId}
                onChange={e => setSelectedCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {filteredCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Service Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Service Option
              </label>
              <select
                value={selectedServiceId}
                onChange={e => setSelectedServiceId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {filteredServices.map(srv => (
                  <option key={srv.id} value={srv.id}>
                    {srv.name} — ({currency === 'NGN' ? `₦${srv.price_per_1000}` : `${srv.price_per_1000} USDT`}/1k)
                  </option>
                ))}
              </select>
            </div>

            {/* Service Specs Badge Box */}
            {activeService && (
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-400">
                    Limits: <strong className="text-slate-200">{activeService.min_quantity}</strong> min — <strong className="text-slate-200">{activeService.max_quantity?.toLocaleString() ?? ''}</strong> max
                  </span>
                  <div className="flex items-center gap-2">
                    {activeService.refill_supported && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">
                        30-Day Refill
                      </span>
                    )}
                    {activeService.cancel_supported && (
                      <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-semibold">
                        Cancel Support
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {activeService.description}
                </p>
              </div>
            )}

            {/* Target Link */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Target URL or Username
              </label>
              <input
                type="text"
                required
                placeholder="https://instagram.com/username or @handle"
                value={targetLink}
                onChange={e => setTargetLink(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Quantity */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">Quantity</label>
                {activeService && (
                  <span className="text-[10px] text-slate-400">
                    Min: {activeService.min_quantity} | Max: {activeService.max_quantity?.toLocaleString() ?? ''}
                  </span>
                )}
              </div>
              <input
                type="number"
                required
                min={activeService?.min_quantity || 100}
                max={activeService?.max_quantity || 100000}
                step={100}
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || loadingQuote || !priceQuote || !isBalanceSufficient}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 disabled:opacity-50 text-white font-bold text-xs transition shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Place Order Now</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Price Breakdown: 5 cols */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold font-display text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span>Financial Calculation</span>
            </h3>

            {loadingQuote ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                <RefreshCw className="w-4 h-4 mx-auto animate-spin mb-2" />
                <span>Computing strict ₦2,000 margin rules...</span>
              </div>
            ) : priceQuote ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <span className="text-slate-400">Order Quantity:</span>
                  <span className="font-mono text-white font-semibold">
                    {priceQuote.quantity.toLocaleString()} units
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <span className="text-slate-400">Selected Currency:</span>
                  <span className="font-mono text-cyan-400 font-semibold">{priceQuote.currency}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400">Total Customer Charge</div>
                  <div className="text-2xl font-extrabold font-mono text-white">
                    {currency === 'NGN'
                      ? `₦${priceQuote.customer_charge.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : `${priceQuote.customer_charge.toFixed(2)} USDT`}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-medium">
                    ✓ Includes platform floor protection & instantaneous dispatch
                  </div>
                </div>

                {/* Wallet Balance Check */}
                <div className="pt-2">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Your {currency} Balance:</span>
                    <span className={`font-mono font-bold ${isBalanceSufficient ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {currency === 'NGN' ? `₦${currentBalance.toLocaleString()}` : `${currentBalance.toFixed(2)} USDT`}
                    </span>
                  </div>

                  {!isBalanceSufficient ? (
                    <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs space-y-2 mt-2">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Insufficient Balance</span>
                      </div>
                      <p className="text-[11px] text-rose-200">
                        You need an additional{' '}
                        <strong>
                          {currency === 'NGN'
                            ? `₦${(priceQuote.customer_charge - currentBalance).toLocaleString()}`
                            : `${(priceQuote.customer_charge - currentBalance).toFixed(2)} USDT`}
                        </strong>{' '}
                        to submit this order.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveView('wallet')}
                        className="w-full py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] flex items-center justify-center gap-1.5 transition"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        <span>Add Funds to Wallet</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                      <span>Remaining after order:</span>
                      <span className="font-mono text-slate-200">
                        {currency === 'NGN'
                          ? `₦${(currentBalance - priceQuote.customer_charge).toLocaleString()}`
                          : `${(currentBalance - priceQuote.customer_charge).toFixed(2)} USDT`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs">
                Select a service and quantity to view the live price calculation.
              </div>
            )}
          </div>

          {/* Guarantee Note */}
          <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-indigo-300">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Fulfillment & Refill Safeguard</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Orders are transmitted via encrypted API streams directly to Peakerr. If the upstream provider experiences drops on refill-eligible packages, click Refill on your Orders dashboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
