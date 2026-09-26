import React, { useState } from 'react';
import {
  ListOrdered,
  Search,
  RotateCw,
  RefreshCw,
  XCircle,
  ExternalLink,
  MessageCircle,
  HelpCircle,
  CheckCircle2,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { WhatsAppBadge } from '../layout/WhatsAppBadge.js';

export const OrdersView: React.FC = () => {
  const { orders, token, refreshOrders, showToast, setActiveView } = useApp();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.link.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.service_name && order.service_name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterStatus === 'all') return true;
    return order.status === filterStatus;
  });

  const handleRefill = async (orderId: string) => {
    if (!token) return;
    setActionLoadingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/refill`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Refill initiated successfully.', 'success');
        refreshOrders();
      } else {
        showToast(data.error || 'Refill failed.', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Error processing refill.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to cancel this order?')) return;
    setActionLoadingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast('Order cancelled successfully.', 'success');
        refreshOrders();
      } else {
        showToast(data.error || 'Cancel failed.', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Error cancelling order.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const statuses = [
    { id: 'all', label: 'All Orders' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'completed', label: 'Completed' },
    { id: 'pending', label: 'Pending' },
    { id: 'partial', label: 'Partial' },
    { id: 'cancelled', label: 'Cancelled' },
    { id: 'refunded', label: 'Refunded' }
  ];

  const whatsappNumber = '+2347018409997';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Order Tracking</h1>
          <p className="text-xs text-slate-400 mt-1">
            Autonomous live sync with Peakerr node every 8 seconds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshOrders()}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-2 transition"
          >
            <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sync Live Status</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          {statuses.map(st => (
            <button
              key={st.id}
              onClick={() => setFilterStatus(st.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                filterStatus === st.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search order ID or link..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <ListOrdered className="w-8 h-8 mx-auto text-slate-500" />
            <p className="text-sm">No orders found matching your filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Order ID</th>
                  <th className="py-3.5 px-4">Service & Target</th>
                  <th className="py-3.5 px-4">Quantity</th>
                  <th className="py-3.5 px-4">Charge</th>
                  <th className="py-3.5 px-4">Start / Remains</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredOrders.map(order => {
                  const isCompleted = order.status === 'completed';
                  const isInProgress = ['in_progress', 'processing'].includes(order.status);
                  const isPending = order.status === 'pending';
                  const isCancelled = order.status === 'cancelled';
                  const isRefunded = order.status === 'refunded';

                  return (
                    <tr key={order.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-4 px-4 font-mono font-bold text-white whitespace-nowrap">
                        {order.id}
                        <div className="text-[10px] text-slate-400 font-normal">
                          {new Date(order.created_at).toLocaleDateString()}
                        </div>
                      </td>

                      <td className="py-4 px-4 max-w-xs">
                        <div className="font-semibold text-slate-200 truncate">
                          {order.service_name || 'Social Media Service'}
                        </div>
                        <a
                          href={order.link.startsWith('http') ? order.link : `https://${order.link}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-cyan-400 hover:underline truncate inline-flex items-center gap-1 mt-0.5"
                        >
                          <span className="truncate max-w-[180px]">{order.link}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </td>

                      <td className="py-4 px-4 font-mono">
                        {(order.quantity ?? 0).toLocaleString()}
                      </td>

                      <td className="py-4 px-4 font-mono font-bold text-white whitespace-nowrap">
                        {order.currency === 'NGN'
                          ? `₦${(order.customer_charge ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          : `${(order.customer_charge ?? 0).toFixed(2)} USDT`}
                      </td>

                      <td className="py-4 px-4 font-mono text-[11px] whitespace-nowrap">
                        <span className="text-slate-400">Start:</span> {order.start_count}
                        <br />
                        <span className="text-cyan-400 font-semibold">Remains: {order.remains}</span>
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isCompleted
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : isInProgress
                              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse'
                              : isRefunded
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : isCancelled
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {order.status.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-right whitespace-nowrap space-x-1.5">
                        {isCompleted && (
                          <button
                            onClick={() => handleRefill(order.id)}
                            disabled={actionLoadingId === order.id}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-medium text-slate-200 hover:text-white transition cursor-pointer"
                            title="Request Refill"
                          >
                            <RefreshCw className="w-3 h-3 inline mr-1" />
                            Refill
                          </button>
                        )}

                        {isPending && (
                          <button
                            onClick={() => handleCancel(order.id)}
                            disabled={actionLoadingId === order.id}
                            className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-[11px] font-medium text-rose-300 transition cursor-pointer"
                            title="Cancel Order"
                          >
                            <XCircle className="w-3 h-3 inline mr-1" />
                            Cancel
                          </button>
                        )}

                        {/* Order Help & Refund inquiry via WhatsApp */}
                        <a
                          href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                            `Hello JFT Socials Support! I need assistance/investigation for Order ID: ${order.id}`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-600/40 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 transition"
                          title="Contact WhatsApp Agent for this order"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>Help</span>
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom Guidance Card */}
      <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 text-xs text-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            Need order investigation or refund assistance? Connect with our dedicated WhatsApp agent directly.
          </span>
        </div>
        <a
          href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3.5 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-semibold text-xs whitespace-nowrap transition flex items-center gap-1.5"
        >
          <MessageCircle className="w-3.5 h-3.5 fill-current" />
          <span>WhatsApp: {whatsappNumber}</span>
        </a>
      </div>
    </div>
  );
};
