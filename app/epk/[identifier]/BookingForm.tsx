'use client';

import { useState } from 'react';
import { Send, Loader2, CheckCircle } from 'lucide-react';
import { EVENT_TYPES } from '@/lib/epk/constants';

interface BookingFormProps {
  artistAddress: string;
  artistName: string;
  minimumDeposit: string;
}

export default function BookingForm({ artistAddress, artistName, minimumDeposit }: BookingFormProps) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    eventName: '',
    eventDate: '',
    location: '',
    eventType: '',
    expectedAttendance: '',
    message: '',
    depositAmount: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/epk/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiry: {
            artistAddress,
            name: form.name,
            email: form.email,
            company: form.company,
            eventName: form.eventName,
            eventDate: form.eventDate,
            location: form.location,
            eventType: form.eventType,
            expectedAttendance: form.expectedAttendance,
            message: form.message,
          },
          userAddress: '', // Set by wallet connection if available
          depositAmount: form.depositAmount,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit inquiry');
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-[#1e293b] rounded-xl p-8 border border-green-500/20 text-center">
        <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Inquiry Submitted</h3>
        <p className="text-slate-400">
          Your booking inquiry for {artistName} has been received. The artist will review your request.
        </p>
        {form.depositAmount && (
          <p className="text-sm text-purple-300 mt-3">
            To secure your booking with a WMON deposit, connect your wallet and complete the on-chain transaction.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#1e293b] rounded-xl p-6 border border-white/5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Name *</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Email *</label>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
            className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-slate-300 mb-1.5">Company / Organization</label>
        <input
          name="company"
          value={form.company}
          onChange={handleChange}
          className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
          placeholder="Company name"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Event Name *</label>
          <input
            name="eventName"
            value={form.eventName}
            onChange={handleChange}
            required
            className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            placeholder="Event name"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Event Date *</label>
          <input
            name="eventDate"
            type="date"
            value={form.eventDate}
            onChange={handleChange}
            required
            className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Location *</label>
          <input
            name="location"
            value={form.location}
            onChange={handleChange}
            required
            className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            placeholder="City, Country"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Event Type *</label>
          <select
            name="eventType"
            value={form.eventType}
            onChange={handleChange}
            required
            className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
          >
            <option value="">Select type...</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Expected Attendance</label>
          <input
            name="expectedAttendance"
            value={form.expectedAttendance}
            onChange={handleChange}
            className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            placeholder="e.g., 500-1000"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">WMON Deposit Amount</label>
          <input
            name="depositAmount"
            type="number"
            min="0"
            step="1"
            value={form.depositAmount}
            onChange={handleChange}
            className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            placeholder={`Min. ${minimumDeposit} WMON`}
          />
          <p className="text-xs text-slate-500 mt-1">
            Optional. On-chain deposit locks WMON in escrow.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-sm text-slate-300 mb-1.5">Message *</label>
        <textarea
          name="message"
          value={form.message}
          onChange={handleChange}
          required
          rows={4}
          className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors resize-none"
          placeholder="Tell us about your event, what you're looking for, and any special requirements..."
        />
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Submit Booking Inquiry
          </>
        )}
      </button>
    </form>
  );
}
