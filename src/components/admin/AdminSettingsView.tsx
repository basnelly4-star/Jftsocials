import React, { useState, useEffect } from 'react';
import { Settings, Save, ShieldAlert, Globe, MessageCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const AdminSettingsView: React.FC = () => {
  const { token, showToast } = useApp();

  const [platformName, setPlatformName] = useState('JFT Socials');
  const [primaryDomain, setPrimaryDomain] = useState('jftsocials.online');
  const [supportWhatsapp, setSupportWhatsapp] = useState('+2347018409997');
  const [peakerrApiUrl, setPeakerrApiUrl] = useState('https://peakerr.com/api/v2');
  const [peakerrApiKey, setPeakerrApiKey] = useState('065bba8f05e466cb9e92b8d4e92fc2a7');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/settings', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.settings) {
          const s = data.settings;
          setPlatformName(s.platform_name || 'JFT Socials');
          setPrimaryDomain(s.primary_domain || 'jftsocials.online');
          setSupportWhatsapp(s.support_whatsapp || '+2347018409997');
          setPeakerrApiUrl(s.peakerr_api_url || 'https://peakerr.com/api/v2');
          setPeakerrApiKey(s.peakerr_api_key || '065bba8f05e466cb9e92b8d4e92fc2a7');
          setMaintenanceMode(Boolean(s.maintenance_mode));
        }
      })
      .catch(console.error);
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          platform_name: platformName,
          primary_domain: primaryDomain,
          support_whatsapp: supportWhatsapp,
          peakerr_api_url: peakerrApiUrl,
          peakerr_api_key: peakerrApiKey,
          maintenance_mode: maintenanceMode
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('System configuration saved successfully.', 'success');
      } else {
        showToast(data.error || 'Failed to save settings.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-white">System Settings & Infrastructure</h1>
        <p className="text-xs text-slate-400 mt-1">
          Brand configuration, upstream provider nodes, and WhatsApp contact points.
        </p>
      </div>

      <form onSubmit={handleSave} className="p-6 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-5">
        <div className="space-y-4">
          <h2 className="text-sm font-bold font-display text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            <span>Brand Identity & Domains</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Platform Name
              </label>
              <input
                type="text"
                required
                value={platformName}
                onChange={e => setPlatformName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Primary Domain
              </label>
              <input
                type="text"
                required
                value={primaryDomain}
                onChange={e => setPrimaryDomain(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>Official Support WhatsApp Number</span>
            </label>
            <input
              type="text"
              required
              value={supportWhatsapp}
              onChange={e => setSupportWhatsapp(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Used in all customer support CTAs, refund inquiries, and floating badges (+2347018409997).
            </p>
          </div>
        </div>

        {/* Upstream Node */}
        <div className="pt-4 border-t border-slate-800 space-y-4">
          <h2 className="text-sm font-bold font-display text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-indigo-400" />
            <span>Peakerr Provider Node API</span>
          </h2>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Peakerr API Endpoint URL
            </label>
            <input
              type="text"
              required
              value={peakerrApiUrl}
              onChange={e => setPeakerrApiUrl(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Peakerr API Key (Encrypted server-side)
            </label>
            <input
              type="password"
              required
              value={peakerrApiKey}
              onChange={e => setPeakerrApiKey(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Maintenance Mode */}
        <div className="pt-4 border-t border-slate-800">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={maintenanceMode}
              onChange={e => setMaintenanceMode(e.target.checked)}
              className="rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-0"
            />
            <div>
              <span className="text-xs font-bold text-white block">Platform Maintenance Mode</span>
              <span className="text-[11px] text-slate-400">
                When enabled, order placement is temporarily paused while admin operations continue.
              </span>
            </div>
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition cursor-pointer flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving System Changes...' : 'Save Configuration'}</span>
        </button>
      </form>
    </div>
  );
};
