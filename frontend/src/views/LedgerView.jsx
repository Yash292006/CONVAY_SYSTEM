import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Receipt, ArrowRight, TrendingUp, MapPin } from 'lucide-react';
import { AuthContext } from '../App';

// Global Ledger: shows all expenses across all of the user's trips
const LedgerView = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [trips,   setTrips]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAllTrips(); }, []);

  const fetchAllTrips = async () => {
    try {
      setLoading(true);
      // Load all trips so we can collect all expenses
      const tripsRes = await axios.get('/trips');
      const tripList = tripsRes.data;

      // Load expenses for each trip in parallel
      const withExpenses = await Promise.all(
        tripList.map(async (trip) => {
          try {
            const res = await axios.get(`/trips/${trip._id}`);
            return { ...trip, expenses: res.data.expenses || [] };
          } catch {
            return { ...trip, expenses: [] };
          }
        })
      );
      setTrips(withExpenses.filter(t => t.expenses.length > 0));
    } catch (err) {
      console.error('Ledger fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Flatten all expenses with their trip context
  const allExpenses = trips.flatMap(t =>
    t.expenses.map(e => ({ ...e, tripTitle: t.title, tripId: t._id }))
  ).sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

  const totalSpend   = allExpenses.reduce((s, e) => s + e.amount, 0);
  const myExpenses   = allExpenses.filter(e => e.paidBy?._id === user?._id);
  const myTotal      = myExpenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="bg-[#0a0b0d] text-white min-h-screen antialiased pb-28">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0b0d]/90 backdrop-blur-xl border-b border-white/5 px-5 py-4">
        <div className="max-w-screen-sm mx-auto">
          <h1 className="text-base font-bold text-white">Global Ledger</h1>
          <p className="text-[10px] text-gray-500 mt-0.5">All expenses across your convoy trips</p>
        </div>
      </header>

      <div className="max-w-screen-sm mx-auto px-4 pt-5 space-y-5">

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#131416] border border-emerald-500/15 rounded-2xl p-4">
            <p className="text-[9px] uppercase font-mono text-gray-500 mb-1">Total Spent</p>
            <p className="text-2xl font-black text-white">₹{totalSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            <p className="text-[9px] text-gray-600 mt-1">{allExpenses.length} transactions</p>
          </div>
          <div className="bg-[#131416] border border-blue-500/15 rounded-2xl p-4">
            <p className="text-[9px] uppercase font-mono text-gray-500 mb-1">Paid by You</p>
            <p className="text-2xl font-black text-blue-400">₹{myTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            <p className="text-[9px] text-gray-600 mt-1">{myExpenses.length} payments</p>
          </div>
        </div>

        {/* Trips with expenses */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : trips.length === 0 ? (
          <div className="text-center py-16 border border-white/5 rounded-2xl bg-white/2">
            <Receipt className="w-10 h-10 mx-auto mb-3 text-gray-700" />
            <p className="text-sm text-gray-500">No expenses logged yet.</p>
            <p className="text-xs text-gray-700 mt-1">Open a trip to log your first expense.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {trips.map((trip, idx) => {
              const tripTotal = trip.expenses.reduce((s, e) => s + e.amount, 0);
              return (
                <motion.div
                  key={trip._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-[#131416] border border-white/8 rounded-2xl overflow-hidden"
                >
                  {/* Trip header — clickable to go to trip */}
                  <button
                    onClick={() => navigate(`/trips/${trip._id}`)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <MapPin size={13} className="text-blue-400 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-white">{trip.title}</p>
                        <p className="text-[9px] text-gray-500">{trip.expenses.length} expense{trip.expenses.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-emerald-400">₹{tripTotal.toFixed(0)}</span>
                      <ArrowRight size={13} className="text-gray-600" />
                    </div>
                  </button>

                  {/* Expense rows */}
                  <div className="border-t border-white/5 divide-y divide-white/5">
                    {trip.expenses.map(exp => {
                      const isPaidByMe = exp.paidBy?._id === user?._id;
                      return (
                        <div key={exp._id} className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center">
                              <Receipt size={11} className="text-gray-400" />
                            </div>
                            <div>
                              <p className="text-[11px] font-medium text-white">{exp.description}</p>
                              <p className="text-[9px] text-gray-500">
                                Paid by <span className={isPaidByMe ? 'text-blue-400 font-semibold' : 'text-gray-400'}>{exp.paidBy?.name || '—'}</span>
                                {exp.date ? ` · ${new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-white">₹{exp.amount.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LedgerView;
