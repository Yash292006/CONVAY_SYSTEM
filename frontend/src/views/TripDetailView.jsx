import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthContext } from '../App';
import {
  ArrowLeft, MapPin, Calendar, CreditCard, Trash2,
  Users, UserPlus, DollarSign, Compass, Activity,
  ShieldAlert, Plus, Fuel, Coffee, Bed, Flag, MoreHorizontal,
  CheckCircle2, Circle, ChevronDown, ChevronUp, Edit3,
  Navigation, AlertTriangle, X, Send
} from 'lucide-react';

// ─── Waypoint type config ────────────────────────────────────────────────────
const WP_TYPES = {
  fuel:       { label: 'Fuel Stop',   icon: '⛽', color: 'text-yellow-400',  border: 'border-yellow-500/30', bg: 'bg-yellow-500/10' },
  food:       { label: 'Food Stop',   icon: '🍽️', color: 'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/10' },
  rest:       { label: 'Rest Stop',   icon: '🛏️', color: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/10' },
  checkpoint: { label: 'Checkpoint',  icon: '🚩', color: 'text-blue-400',   border: 'border-blue-500/30',   bg: 'bg-blue-500/10'  },
  custom:     { label: 'Custom Stop', icon: '📍', color: 'text-gray-400',   border: 'border-gray-500/30',   bg: 'bg-gray-500/10'  },
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  planning:  { label: 'Planning',  color: 'text-yellow-400', dot: 'bg-yellow-400', badge: 'bg-yellow-400/10 border-yellow-400/30' },
  active:    { label: 'Active',    color: 'text-emerald-400', dot: 'bg-emerald-400', badge: 'bg-emerald-400/10 border-emerald-400/30' },
  completed: { label: 'Completed', color: 'text-blue-400',   dot: 'bg-blue-400',   badge: 'bg-blue-400/10   border-blue-400/30'   },
};

// ─── Fuel estimator ───────────────────────────────────────────────────────────
const estimateFuel = (distKm, mileageKmpl = 35, pricePerL = 105) => {
  if (!distKm) return null;
  const litres = distKm / mileageKmpl;
  const cost   = litres * pricePerL;
  return { litres: litres.toFixed(1), cost: Math.round(cost) };
};

// ─── Pre-trip checklist items ─────────────────────────────────────────────────
const CHECKLIST = [
  { id: 'license',   label: 'Driving License & RC' },
  { id: 'insurance', label: 'Vehicle Insurance' },
  { id: 'helmet',    label: 'Helmet & Gear' },
  { id: 'toolkit',   label: 'Toolkit & Puncture Kit' },
  { id: 'firstaid',  label: 'First-Aid Kit' },
  { id: 'fuel',      label: 'Full Tank' },
  { id: 'water',     label: 'Water & Snacks' },
  { id: 'maps',      label: 'Offline Maps Downloaded' },
];

// ─────────────────────────────────────────────────────────────────────────────
const TripDetailView = () => {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { user }   = useContext(AuthContext);

  const [trip,         setTrip]         = useState(null);
  const [expenses,     setExpenses]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [activeTab,    setActiveTab]    = useState('overview');
  const [checklist,    setChecklist]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(`checklist_${id}`)) || {}; } catch { return {}; }
  });

  // Waypoints
  const [showWpModal,  setShowWpModal]  = useState(false);
  const [wpName,       setWpName]       = useState('');
  const [wpType,       setWpType]       = useState('checkpoint');
  const [wpNote,       setWpNote]       = useState('');
  const [wpTime,       setWpTime]       = useState('');
  const [wpLoading,    setWpLoading]    = useState(false);

  // Members
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberEmail,     setMemberEmail]     = useState('');
  const [memberError,     setMemberError]     = useState('');
  const [loadingMember,   setLoadingMember]   = useState(false);

  // Expenses
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseDesc,      setExpenseDesc]      = useState('');
  const [expenseAmount,    setExpenseAmount]    = useState('');
  const [expensePayer,     setExpensePayer]     = useState('');
  const [expenseSplit,     setExpenseSplit]     = useState([]);
  const [expenseError,     setExpenseError]     = useState('');
  const [loadingExpense,   setLoadingExpense]   = useState(false);

  // Notes
  const [notes,       setNotes]       = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const notesTimer = useRef(null);

  // SOS
  const [sosActive, setSosActive] = useState(false);

  // ─── Load trip ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchTripDetails();
  }, [id]);

  const fetchTripDetails = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/trips/${id}`);
      setTrip(res.data.trip);
      setExpenses(res.data.expenses);
      setNotes(res.data.trip.notes || '');
      if (res.data.trip) {
        setExpensePayer(user._id);
        setExpenseSplit(res.data.trip.members.map(m => m._id));
      }
    } catch (err) {
      setError('Failed to fetch convoy details.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Checklist persist ──────────────────────────────────────────────────────
  const toggleCheck = (itemId) => {
    const next = { ...checklist, [itemId]: !checklist[itemId] };
    setChecklist(next);
    localStorage.setItem(`checklist_${id}`, JSON.stringify(next));
  };

  // ─── Status change ──────────────────────────────────────────────────────────
  const handleStatusChange = async (newStatus) => {
    try {
      await axios.patch(`/trips/${id}/status`, { status: newStatus });
      setTrip(prev => ({ ...prev, status: newStatus }));
    } catch (e) {
      alert(e.response?.data?.message || 'Could not update status.');
    }
  };

  // ─── Notes auto-save ────────────────────────────────────────────────────────
  const handleNotesChange = (val) => {
    setNotes(val);
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      setNotesSaving(true);
      try { await axios.patch(`/trips/${id}/notes`, { notes: val }); } catch {}
      setNotesSaving(false);
    }, 1200);
  };

  // ─── Waypoints ──────────────────────────────────────────────────────────────
  const handleAddWaypoint = async (e) => {
    e.preventDefault();
    if (!wpName.trim()) return;
    setWpLoading(true);
    try {
      const res = await axios.post(`/trips/${id}/waypoints`, {
        name: wpName, type: wpType, note: wpNote, estimatedTime: wpTime
      });
      setTrip(prev => ({ ...prev, waypoints: res.data }));
      setShowWpModal(false);
      setWpName(''); setWpType('checkpoint'); setWpNote(''); setWpTime('');
    } catch { alert('Could not add waypoint.'); }
    setWpLoading(false);
  };

  const toggleWpReached = async (wpId) => {
    try {
      const res = await axios.patch(`/trips/${id}/waypoints/${wpId}/reached`);
      setTrip(prev => ({ ...prev, waypoints: res.data }));
    } catch { alert('Could not update waypoint.'); }
  };

  const deleteWaypoint = async (wpId) => {
    if (!window.confirm('Remove this stop?')) return;
    try {
      const res = await axios.delete(`/trips/${id}/waypoints/${wpId}`);
      setTrip(prev => ({ ...prev, waypoints: res.data }));
    } catch { alert('Could not delete waypoint.'); }
  };

  // ─── Members ────────────────────────────────────────────────────────────────
  const handleAddMember = async (e) => {
    e.preventDefault();
    setMemberError('');
    if (!memberEmail) { setMemberError('Email is required.'); return; }
    setLoadingMember(true);
    try {
      const res = await axios.post(`/trips/${id}/members`, { email: memberEmail });
      setTrip(res.data);
      setMemberEmail('');
      setShowMemberModal(false);
      setExpenseSplit(res.data.members.map(m => m._id));
    } catch (err) {
      setMemberError(err.response?.data?.message || 'Error adding member.');
    }
    setLoadingMember(false);
  };

  // ─── Expenses ───────────────────────────────────────────────────────────────
  const handleAddExpense = async (e) => {
    e.preventDefault();
    setExpenseError('');
    if (!expenseDesc || !expenseAmount || !expensePayer || expenseSplit.length === 0) {
      setExpenseError('Please fill all fields.');
      return;
    }
    setLoadingExpense(true);
    try {
      const res = await axios.post(`/trips/${id}/expenses`, {
        description: expenseDesc, amount: expenseAmount,
        paidById: expensePayer, splitAmongIds: expenseSplit
      });
      setExpenses(prev => [...prev, res.data]);
      setExpenseDesc(''); setExpenseAmount('');
      setShowExpenseModal(false);
    } catch (err) {
      setExpenseError(err.response?.data?.message || 'Error adding expense.');
    }
    setLoadingExpense(false);
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await axios.delete(`/trips/${id}/expenses/${expenseId}`);
      setExpenses(expenses.filter(e => e._id !== expenseId));
    } catch { alert('Error deleting expense.'); }
  };

  // ─── Balance calc ────────────────────────────────────────────────────────────
  const calculateBalances = () => {
    if (!trip) return { totalCost: 0, settlements: [] };
    const balances = {};
    let totalCost = 0;
    trip.members.forEach(m => { balances[m._id] = { name: m.name, amount: 0 }; });
    if (trip.admin && !balances[trip.admin._id]) {
      balances[trip.admin._id] = { name: trip.admin.name, amount: 0 };
    }
    expenses.forEach(exp => {
      totalCost += exp.amount;
      if (balances[exp.paidBy._id]) balances[exp.paidBy._id].amount += exp.amount;
      const splits = exp.splitAmong || [];
      if (splits.length > 0) {
        const share = exp.amount / splits.length;
        splits.forEach(s => { if (balances[s._id]) balances[s._id].amount -= share; });
      }
    });
    const debtors   = Object.keys(balances).filter(id => balances[id].amount < -0.01)
                        .map(id => ({ id, name: balances[id].name, amount: Math.abs(balances[id].amount) }))
                        .sort((a, b) => b.amount - a.amount);
    const creditors = Object.keys(balances).filter(id => balances[id].amount > 0.01)
                        .map(id => ({ id, name: balances[id].name, amount: balances[id].amount }))
                        .sort((a, b) => b.amount - a.amount);
    const settlements = [];
    let dIdx = 0, cIdx = 0;
    while (dIdx < debtors.length && cIdx < creditors.length) {
      const t = Math.min(debtors[dIdx].amount, creditors[cIdx].amount);
      settlements.push({ from: debtors[dIdx].name, to: creditors[cIdx].name, amount: +t.toFixed(2) });
      debtors[dIdx].amount -= t;
      creditors[cIdx].amount -= t;
      if (debtors[dIdx].amount < 0.01) dIdx++;
      if (creditors[cIdx].amount < 0.01) cIdx++;
    }
    return { totalCost, settlements };
  };

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const isAdmin        = trip?.admin?._id === user?._id;
  const statusCfg      = STATUS_CONFIG[trip?.status] || STATUS_CONFIG.planning;
  const { totalCost, settlements } = calculateBalances();
  const reached        = trip?.waypoints?.filter(w => w.reached).length || 0;
  const totalWp        = trip?.waypoints?.length || 0;
  const fuelEst        = estimateFuel(trip?.distanceKm);
  const checkDone      = CHECKLIST.filter(c => checklist[c.id]).length;

  // ─── Loading / Error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0b0d]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400 text-sm animate-pulse">Loading convoy data...</p>
        </div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="max-w-md mx-auto px-4 pt-20 text-center">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white">Access Denied</h2>
        <p className="text-gray-400 text-sm mt-2">{error || 'Convoy not found.'}</p>
        <Link to="/" className="inline-block mt-6 px-5 py-2.5 bg-blue-500 text-black rounded-xl text-sm font-semibold">
          Back to Hub
        </Link>
      </div>
    );
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'stops',    label: `Stops${totalWp ? ` (${reached}/${totalWp})` : ''}` },
    { key: 'ledger',   label: 'Ledger'   },
    { key: 'crew',     label: 'Crew'     },
  ];

  return (
    <div className="bg-[#0a0b0d] text-white min-h-screen overflow-x-hidden antialiased pb-28">

      {/* ── STICKY HEADER ── */}
      <header className="sticky top-0 z-50 bg-[#0a0b0d]/90 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center justify-between px-5 h-14 max-w-screen-sm mx-auto">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft size={17} />
          </button>

          <div className="text-center">
            <h1 className="text-[15px] font-bold truncate max-w-[180px]">{trip.title}</h1>
            <div className={`inline-flex items-center gap-1.5 mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusCfg.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${trip.status === 'active' ? 'animate-pulse' : ''}`} />
              <span className={statusCfg.color}>{statusCfg.label}</span>
            </div>
          </div>

          <button
            onClick={() => navigate(`/map/${trip._id}`)}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 active:scale-95 transition-all cursor-pointer text-blue-400"
            title="Open Live Map"
          >
            <Navigation size={16} />
          </button>
        </div>
      </header>

      <div className="max-w-screen-sm mx-auto px-4 pt-4 space-y-4">

        {/* ── HERO CARD ── */}
        <div className="bg-[#131416] border border-white/8 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 font-mono">Route</p>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className="text-emerald-400 truncate max-w-[90px]">{trip.origin}</span>
                <span className="text-gray-600">→</span>
                <span className="text-red-400 truncate max-w-[90px]">{trip.destination}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 font-mono">Start Date</p>
              <p className="text-sm font-semibold text-white">
                {trip.startDate ? new Date(trip.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
              </p>
            </div>
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/4 rounded-xl p-3 text-center">
              <p className="text-[9px] uppercase text-gray-500 font-mono mb-1">Members</p>
              <p className="text-lg font-black text-white">{trip.members?.length || 0}</p>
            </div>
            <div className="bg-white/4 rounded-xl p-3 text-center">
              <p className="text-[9px] uppercase text-gray-500 font-mono mb-1">Stops</p>
              <p className="text-lg font-black text-white">{totalWp || '—'}</p>
            </div>
            <div className="bg-white/4 rounded-xl p-3 text-center">
              <p className="text-[9px] uppercase text-gray-500 font-mono mb-1">Spend</p>
              <p className="text-lg font-black text-white">₹{Math.round(totalCost)}</p>
            </div>
          </div>

          {/* Status control — admin only */}
          {isAdmin && (
            <div className="mt-4 flex gap-2">
              {['planning', 'active', 'completed'].map(s => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer active:scale-95 ${
                    trip.status === s
                      ? `${STATUS_CONFIG[s].badge} ${STATUS_CONFIG[s].color}`
                      : 'bg-white/4 border-white/8 text-gray-500 hover:text-white hover:border-white/15'
                  }`}
                >
                  {STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── TAB NAV ── */}
        <div className="flex gap-1 p-1 bg-white/4 rounded-xl border border-white/8">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-2 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === t.key
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════ OVERVIEW TAB ══════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-4">

            {/* Pre-trip Checklist */}
            <div className="bg-[#131416] border border-white/8 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-white">Pre-Trip Checklist</h2>
                  <p className="text-[10px] text-gray-500 mt-0.5">{checkDone}/{CHECKLIST.length} items ready</p>
                </div>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black border ${
                  checkDone === CHECKLIST.length ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 text-gray-400'
                }`}>
                  {checkDone === CHECKLIST.length ? '✓' : checkDone}
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-white/5 rounded-full h-1 mb-4 overflow-hidden">
                <div
                  className="h-1 rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${(checkDone / CHECKLIST.length) * 100}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {CHECKLIST.map(item => (
                  <button
                    key={item.id}
                    onClick={() => toggleCheck(item.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer active:scale-95 ${
                      checklist[item.id]
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                        : 'bg-white/3 border-white/8 text-gray-400 hover:text-white hover:border-white/15'
                    }`}
                  >
                    {checklist[item.id]
                      ? <CheckCircle2 size={13} className="shrink-0" />
                      : <Circle size={13} className="shrink-0 opacity-50" />
                    }
                    <span className="font-medium leading-tight">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Fuel Estimator */}
            <div className="bg-[#131416] border border-white/8 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-white mb-3">⛽ Fuel Estimator</h2>
              {trip.distanceKm ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400">Total Distance</span>
                    <span className="font-bold text-white">{trip.distanceKm} km</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400">Fuel needed <span className="text-gray-600">(avg 35 km/l)</span></span>
                    <span className="font-bold text-yellow-400">{fuelEst?.litres} L</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400">Estimated cost <span className="text-gray-600">(₹105/L)</span></span>
                    <span className="font-bold text-emerald-400">₹{fuelEst?.cost}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400">Per member <span className="text-gray-600">({trip.members?.length} riders)</span></span>
                    <span className="font-bold text-blue-400">₹{Math.round((fuelEst?.cost || 0) / (trip.members?.length || 1))}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">Add distance in km to see fuel estimates. (Set trip distance when creating.)</p>
              )}
            </div>

            {/* Trip Notes */}
            <div className="bg-[#131416] border border-white/8 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-white">Trip Notes</h2>
                <span className={`text-[9px] font-mono transition-opacity ${notesSaving ? 'text-blue-400 opacity-100' : 'text-gray-600 opacity-0'}`}>
                  Saving...
                </span>
              </div>
              <textarea
                value={notes}
                onChange={e => handleNotesChange(e.target.value)}
                placeholder="Emergency contacts, meetup points, important reminders..."
                rows={4}
                className="w-full bg-white/4 border border-white/8 rounded-xl p-3 text-xs text-white placeholder-gray-600 resize-none outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all"
              />
            </div>

            {/* SOS Section */}
            <div className="bg-[#131416] border border-red-500/20 rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <AlertTriangle size={15} className="text-red-400" /> SOS / Emergency
                  </h2>
                  <p className="text-[10px] text-gray-500 mt-1">Alert all crew members of an emergency</p>
                </div>
                <button
                  onClick={() => {
                    setSosActive(true);
                    setTimeout(() => setSosActive(false), 5000);
                    alert('🚨 SOS signal would be broadcast to all crew! (Connect to your socket for real dispatch)');
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer active:scale-95 ${
                    sosActive
                      ? 'bg-red-500 border-red-400 text-white animate-pulse'
                      : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                  }`}
                >
                  {sosActive ? '🚨 SOS SENT' : '🆘 SOS'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ STOPS TAB ══════════════════ */}
        {activeTab === 'stops' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-semibold text-white">Planned Stops</h2>
                <p className="text-[10px] text-gray-500 mt-0.5">{reached} of {totalWp} reached</p>
              </div>
              <button
                onClick={() => setShowWpModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-xl text-xs font-bold cursor-pointer hover:bg-blue-500/30 active:scale-95 transition-all"
              >
                <Plus size={13} /> Add Stop
              </button>
            </div>

            {trip.waypoints?.length === 0 && (
              <div className="text-center py-12 text-gray-600">
                <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No stops added yet.</p>
                <p className="text-xs mt-1 text-gray-700">Add fuel stops, food breaks, and checkpoints.</p>
              </div>
            )}

            {/* Timeline */}
            <div className="relative pl-5 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-0.5 before:bg-white/8">
              {trip.waypoints?.map((wp, idx) => {
                const cfg = WP_TYPES[wp.type] || WP_TYPES.custom;
                return (
                  <motion.div
                    key={wp._id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="relative mb-4 last:mb-0"
                  >
                    {/* Timeline dot */}
                    <button
                      onClick={() => toggleWpReached(wp._id)}
                      className={`absolute -left-[23px] top-3 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] transition-all cursor-pointer ${
                        wp.reached
                          ? 'bg-emerald-500 border-emerald-400 text-white'
                          : 'bg-[#131416] border-white/20 text-transparent hover:border-blue-400'
                      }`}
                    >
                      {wp.reached && '✓'}
                    </button>

                    <div className={`bg-[#131416] border rounded-xl p-4 transition-all ${wp.reached ? 'border-emerald-500/20 opacity-75' : 'border-white/8'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className={`shrink-0 text-sm w-7 h-7 rounded-lg flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
                            {cfg.icon}
                          </span>
                          <div className="min-w-0">
                            <p className={`text-xs font-bold truncate ${wp.reached ? 'line-through text-gray-500' : 'text-white'}`}>
                              {wp.name}
                            </p>
                            <p className={`text-[9px] font-mono ${cfg.color} mt-0.5`}>{cfg.label}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {wp.estimatedTime && (
                            <span className="text-[9px] text-gray-500 font-mono">{wp.estimatedTime}</span>
                          )}
                          <button
                            onClick={() => deleteWaypoint(wp._id)}
                            className="w-5 h-5 rounded flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      </div>
                      {wp.note && (
                        <p className="text-[10px] text-gray-500 mt-2 pl-9 leading-relaxed">{wp.note}</p>
                      )}
                      {wp.reached && wp.reachedAt && (
                        <p className="text-[9px] text-emerald-500 mt-1 pl-9 font-mono">
                          ✓ Reached at {new Date(wp.reachedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════ LEDGER TAB ══════════════════ */}
        {activeTab === 'ledger' && (
          <div className="space-y-4">

            {/* Total */}
            <div className="bg-[#131416] border border-blue-500/20 rounded-2xl p-5 flex justify-between items-center">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">Total Convoy Spend</p>
                <p className="text-3xl font-black text-white">₹{totalCost.toFixed(2)}</p>
              </div>
              <button
                onClick={() => setShowExpenseModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-xl text-xs font-bold cursor-pointer hover:bg-blue-500/30 active:scale-95 transition-all"
              >
                <Plus size={14} /> Add
              </button>
            </div>

            {/* Settlements */}
            {settlements.length > 0 && (
              <div className="bg-[#131416] border border-white/8 rounded-2xl p-5">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Settlement Plan</h3>
                <div className="space-y-2">
                  {settlements.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-white/3 rounded-xl border border-white/6 text-xs">
                      <div>
                        <span className="text-white font-semibold">{s.from}</span>
                        <span className="text-gray-500 mx-1.5">→</span>
                        <span className="text-white font-semibold">{s.to}</span>
                      </div>
                      <span className="text-emerald-400 font-bold">₹{s.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expenses list */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Logged Payments</h3>
              {expenses.length === 0 ? (
                <div className="text-center py-10 text-gray-600">
                  <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No expenses logged yet.</p>
                </div>
              ) : (
                expenses.map(exp => {
                  const isPayer = exp.paidBy._id === user._id;
                  const isAdm   = trip.admin._id === user._id;
                  return (
                    <div key={exp._id} className="flex items-center justify-between p-3.5 bg-[#131416] border border-white/8 rounded-xl group hover:border-white/12 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/8">
                          <CreditCard size={13} className="text-gray-400" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">{exp.description}</p>
                          <p className="text-[9px] text-gray-500 mt-0.5">
                            {exp.paidBy.name} • {exp.date ? new Date(exp.date).toLocaleDateString('en-IN') : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">₹{exp.amount.toFixed(2)}</span>
                        {(isPayer || isAdm) && (
                          <button
                            onClick={() => handleDeleteExpense(exp._id)}
                            className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ══════════════════ CREW TAB ══════════════════ */}
        {activeTab === 'crew' && (
          <div className="space-y-4">

            {/* Invite — admin only */}
            {isAdmin && (
              <div className="bg-[#131416] border border-white/8 rounded-2xl p-5">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Invite Rider</h3>
                <form onSubmit={handleAddMember} className="flex gap-2">
                  <input
                    type="email"
                    value={memberEmail}
                    onChange={e => setMemberEmail(e.target.value)}
                    placeholder="rider@example.com"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/40 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={loadingMember}
                    className="px-4 py-2.5 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-xl text-xs font-bold cursor-pointer hover:bg-blue-500/30 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {loadingMember ? <div className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" /> : <><UserPlus size={12} /> Invite</>}
                  </button>
                </form>
                {memberError && <p className="text-[10px] text-red-400 mt-2">{memberError}</p>}
              </div>
            )}

            {/* Crew grid */}
            <div className="grid grid-cols-2 gap-3">
              {trip.members?.map(member => (
                <div key={member._id} className="bg-[#131416] border border-white/8 rounded-2xl p-4 flex flex-col items-center text-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xl">
                    {member.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">{member.name}</p>
                    <p className="text-[9px] text-gray-500 truncate max-w-[110px]">{member.email}</p>
                    {trip.admin._id === member._id && (
                      <span className="inline-block mt-1 text-[8px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                        Lead
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ══════════════════ ADD WAYPOINT MODAL ══════════════════ */}
      <AnimatePresence>
        {showWpModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8 bg-black/60 backdrop-blur-md" onClick={() => setShowWpModal(false)}>
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="bg-[#131416] border border-white/10 rounded-3xl p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-base font-bold text-white mb-4">Add Stop</h2>
              <form onSubmit={handleAddWaypoint} className="space-y-3">
                <input
                  type="text"
                  value={wpName}
                  onChange={e => setWpName(e.target.value)}
                  placeholder="Stop name (e.g. HP Petrol, Udupi Hotel)"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/40 transition-all"
                />

                {/* Type selector */}
                <div className="grid grid-cols-5 gap-1.5">
                  {Object.entries(WP_TYPES).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setWpType(key)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[9px] font-bold transition-all cursor-pointer ${
                        wpType === key ? `${cfg.bg} ${cfg.border} ${cfg.color}` : 'bg-white/3 border-white/8 text-gray-500'
                      }`}
                    >
                      <span className="text-base">{cfg.icon}</span>
                      <span className="truncate w-full text-center">{cfg.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={wpTime}
                    onChange={e => setWpTime(e.target.value)}
                    placeholder="Est. time (e.g. 2:00 PM)"
                    className="bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/40 transition-all"
                  />
                  <input
                    type="text"
                    value={wpNote}
                    onChange={e => setWpNote(e.target.value)}
                    placeholder="Note (optional)"
                    className="bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/40 transition-all"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowWpModal(false)}
                    className="flex-1 py-3 rounded-xl border border-white/10 text-xs font-bold text-gray-400 hover:text-white cursor-pointer transition-all">
                    Cancel
                  </button>
                  <button type="submit" disabled={wpLoading}
                    className="flex-1 py-3 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {wpLoading ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <><Plus size={13} /> Add Stop</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════ ADD EXPENSE MODAL ══════════════════ */}
      <AnimatePresence>
        {showExpenseModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8 bg-black/60 backdrop-blur-md" onClick={() => setShowExpenseModal(false)}>
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="bg-[#131416] border border-white/10 rounded-3xl p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-base font-bold text-white mb-4">Log Expense</h2>
              {expenseError && <p className="text-xs text-red-400 mb-3 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{expenseError}</p>}
              <form onSubmit={handleAddExpense} className="space-y-3">
                <input type="text" value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)}
                  placeholder="Description (e.g. Fuel, Dinner)" required
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/40 transition-all" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="0.01" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)}
                    placeholder="Amount (₹)" required
                    className="bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/40 transition-all" />
                  <select value={expensePayer} onChange={e => setExpensePayer(e.target.value)}
                    className="bg-[#1a1b1e] border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white outline-none focus:border-blue-500/40 transition-all cursor-pointer">
                    {trip.members?.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[9px] uppercase text-gray-500 font-mono mb-2">Split Among</p>
                  <div className="flex flex-wrap gap-1.5">
                    {trip.members?.map(m => {
                      const sel = expenseSplit.includes(m._id);
                      return (
                        <button key={m._id} type="button"
                          onClick={() => setExpenseSplit(sel ? expenseSplit.filter(x => x !== m._id) : [...expenseSplit, m._id])}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer transition-all active:scale-95 ${
                            sel ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'bg-white/4 border-white/10 text-gray-500 hover:text-white'
                          }`}>
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowExpenseModal(false)}
                    className="flex-1 py-3 rounded-xl border border-white/10 text-xs font-bold text-gray-400 hover:text-white cursor-pointer transition-all">
                    Cancel
                  </button>
                  <button type="submit" disabled={loadingExpense}
                    className="flex-1 py-3 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {loadingExpense ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Log Expense'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default TripDetailView;
