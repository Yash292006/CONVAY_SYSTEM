import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthContext } from '../App';
import { 
  ArrowLeft, Plus, MapPin, Calendar, CreditCard, Trash2, 
  Users, UserPlus, DollarSign, Compass, Activity, ShieldAlert, CheckSquare 
} from 'lucide-react';

const TripDetailView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [trip, setTrip] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('waypoints'); // 'waypoints' | 'ledger' | 'crew'

  // Modals
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberError, setMemberError] = useState('');
  const [loadingMember, setLoadingMember] = useState(false);

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePayer, setExpensePayer] = useState('');
  const [expenseSplit, setExpenseSplit] = useState([]);
  const [expenseError, setExpenseError] = useState('');
  const [loadingExpense, setLoadingExpense] = useState(false);

  // Simulated Waypoints state
  const [waypoints, setWaypoints] = useState([
    { id: 1, name: 'Origin Checkout', time: '08:00 AM', distance: '0 mi', done: true },
    { id: 2, name: 'Golden Gate Viewpoint', time: '10:15 AM', distance: '45 mi', done: true, fuel: true, food: true },
    { id: 3, name: 'Highway 1 Diner', time: '01:00 PM', distance: '120 mi', done: false, food: true },
    { id: 4, name: 'Coastal Ghat Entry', time: '03:45 PM', distance: '210 mi', done: false },
    { id: 5, name: 'Beach Stay Terminal', time: '05:30 PM', distance: '280 mi', done: false }
  ]);

  const threeContainerRef = useRef(null);

  useEffect(() => {
    fetchTripDetails();
  }, [id]);

  const fetchTripDetails = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/trips/${id}`);
      setTrip(res.data.trip);
      setExpenses(res.data.expenses);
      
      if (res.data.trip) {
        setExpensePayer(user._id);
        setExpenseSplit(res.data.trip.members.map(m => m._id));
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch convoy details.');
    } finally {
      setLoading(false);
    }
  };

  // 1. Three.js Topographical Grid Background
  useEffect(() => {
    if (!threeContainerRef.current) return;

    const container = threeContainerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Scene setup
    const scene = new THREE.Scene();
    
    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 15;
    camera.position.y = 5;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Topographical Grid Geometry
    const geometry = new THREE.PlaneGeometry(100, 100, 50, 50);
    const material = new THREE.MeshPhongMaterial({
      color: 0x3b82f6,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.5
    });

    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 2.5;
    scene.add(plane);

    // Deform plane to create topography wave
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = Math.sin(x * 0.2) * Math.cos(y * 0.2) * 2 + Math.random() * 0.5;
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x3b82f6, 1);
    pointLight.position.set(0, 10, 10);
    scene.add(pointLight);

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      
      plane.position.z += 0.05;
      if (plane.position.z > 5) {
        plane.position.z = 0;
      }
      
      plane.rotation.z += 0.001;
      
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Members invite submit handler
  const handleAddMember = async (e) => {
    e.preventDefault();
    setMemberError('');
    if (!memberEmail) {
      setMemberError('Email is required.');
      return;
    }

    setLoadingMember(true);
    try {
      const res = await axios.post(`/trips/${id}/members`, { email: memberEmail });
      setTrip(res.data);
      setMemberEmail('');
      setShowMemberModal(false);
      setExpenseSplit(res.data.members.map(m => m._id));
    } catch (err) {
      setMemberError(err.response?.data?.message || 'Error adding member.');
    } finally {
      setLoadingMember(false);
    }
  };

  // Expense logging handler
  const handleAddExpense = async (e) => {
    e.preventDefault();
    setExpenseError('');
    if (!expenseDesc || !expenseAmount || !expensePayer || expenseSplit.length === 0) {
      setExpenseError('Please enter description, amount, payer, and select splits.');
      return;
    }

    setLoadingExpense(true);
    try {
      const res = await axios.post(`/trips/${id}/expenses`, {
        description: expenseDesc,
        amount: expenseAmount,
        paidById: expensePayer,
        splitAmongIds: expenseSplit
      });
      setExpenses([...expenses, res.data]);
      setExpenseDesc('');
      setExpenseAmount('');
      setShowExpenseModal(false);
    } catch (err) {
      setExpenseError(err.response?.data?.message || 'Error adding expense.');
    } finally {
      setLoadingExpense(false);
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Delete this expense log?')) return;

    try {
      await axios.delete(`/trips/${id}/expenses/${expenseId}`);
      setExpenses(expenses.filter(e => e._id !== expenseId));
    } catch (err) {
      alert('Error deleting expense.');
    }
  };

  // ── Splitting math calculator ─────────────────────────────────────────────
  const calculateBalances = () => {
    if (!trip) return { balances: {}, totalCost: 0, settlements: [] };

    const balances = {};
    let totalCost = 0;

    trip.members.forEach(m => {
      balances[m._id] = { name: m.name, email: m.email, amount: 0 };
    });

    if (trip.admin && !balances[trip.admin._id]) {
      balances[trip.admin._id] = { name: trip.admin.name, email: trip.admin.email, amount: 0 };
    }

    expenses.forEach(exp => {
      const amount = exp.amount;
      const payerId = exp.paidBy._id;
      const splits = exp.splitAmong || [];

      totalCost += amount;

      if (balances[payerId]) {
        balances[payerId].amount += amount;
      }

      if (splits.length > 0) {
        const share = amount / splits.length;
        splits.forEach(s => {
          if (balances[s._id]) {
            balances[s._id].amount -= share;
          }
        });
      }
    });

    const debtors = [];
    const creditors = [];

    Object.keys(balances).forEach(id => {
      const amt = balances[id].amount;
      if (amt < -0.01) {
        debtors.push({ id, name: balances[id].name, amount: Math.abs(amt) });
      } else if (amt > 0.01) {
        creditors.push({ id, name: balances[id].name, amount: amt });
      }
    });

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements = [];
    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const transferAmount = Math.min(debtor.amount, creditor.amount);

      settlements.push({
        from: debtor.name,
        to: creditor.name,
        amount: parseFloat(transferAmount.toFixed(2))
      });

      debtor.amount -= transferAmount;
      creditor.amount -= transferAmount;

      if (debtor.amount < 0.01) dIdx++;
      if (creditor.amount < 0.01) cIdx++;
    }

    return { balances, totalCost, settlements };
  };

  const toggleWaypoint = (id) => {
    setWaypoints(prev =>
      prev.map(wp => wp.id === id ? { ...wp, done: !wp.done } : wp)
    );
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0b0d]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="max-w-md mx-auto px-4 pt-20 text-center">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white">Access Violation</h2>
        <p className="text-gray-400 text-sm mt-2">{error || 'Convoy not found.'}</p>
        <Link to="/" className="inline-block mt-6 px-5 py-2.5 btn-neon text-black rounded-xl text-sm font-semibold">
          Return to Hub
        </Link>
      </div>
    );
  }

  const { balances, totalCost, settlements } = calculateBalances();

  // Compute overall run progress
  const doneCount = waypoints.filter(wp => wp.done).length;
  const progressPct = Math.round((doneCount / waypoints.length) * 100);

  return (
    <div className="bg-background text-on-background overflow-x-hidden font-body-md antialiased selection:bg-primary/30 relative min-h-screen">
      
      {/* 3D Topography Engine Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div ref={threeContainerRef} className="fixed inset-0 w-full h-full bg-transparent" />
      </div>

      {/* Main Content Canvas */}
      <main className="relative z-10 flex flex-col min-h-screen pb-24">
        
        {/* Glassmorphic Header */}
        <header className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 shadow-[0_4px_20px_rgba(59,130,246,0.15)] pointer-events-auto">
          <div className="flex items-center justify-between px-6 h-16 w-full max-w-screen-md mx-auto">
            <button 
              onClick={() => navigate('/')}
              aria-label="Back" 
              className="text-primary hover:text-primary-fixed-dim active:scale-95 transition-transform flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 border border-primary/20 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center">
              <h1 className="font-headline-lg-mobile text-[18px] font-bold tracking-tighter uppercase text-on-surface">
                {trip.title}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_#adc6ff]"></span>
                <span className="font-label-caps text-[10px] text-primary uppercase">{trip.status}</span>
              </div>
            </div>

            <button
              onClick={() => navigate(`/map/${trip._id}`)}
              className="p-1 rounded-lg border border-outline-variant/50 overflow-hidden cursor-pointer"
              title="Telemetry Map"
            >
              🧭
            </button>
          </div>

          {/* Quick Stats Bar */}
          <div className="flex justify-between px-6 py-2 bg-surface-container/50 border-t border-outline-variant/20 max-w-screen-md mx-auto w-full">
            <div className="flex flex-col">
              <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Destination</span>
              <span className="font-title-md text-sm text-primary truncate max-w-[150px]">{trip.destination}</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Start Date</span>
              <span className="font-title-md text-sm text-on-surface">
                {trip.startDate ? new Date(trip.startDate).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        </header>

        {/* Content Area Wrapper */}
        <div className="w-full max-w-screen-md mx-auto px-6 mt-32 flex-grow flex flex-col gap-6">
          
          {/* Floating Hero Card */}
          <section className="bg-surface-container/60 backdrop-blur-2xl border border-outline-variant/40 rounded-xl p-5 relative overflow-hidden animate-float shadow-[0_0_15px_rgba(173,198,255,0.2)]">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
            <div className="absolute bottom-0 right-0 w-16 h-1 bg-primary"></div>
            
            <div className="absolute top-4 right-4 text-outline-variant/30">
              <Compass className="w-8 h-8 opacity-40 animate-spin" style={{ animationDuration: '20s' }} />
            </div>

            <h2 className="font-label-caps text-[10px] text-on-surface-variant tracking-wider uppercase mb-1">CONVOY PROGRESS</h2>
            <div className="flex items-end gap-1.5 mb-3">
              <span className="font-display-lg text-4xl font-extrabold text-on-surface">{progressPct}</span>
              <span className="font-title-md text-sm text-primary pb-1">% completed</span>
            </div>

            <div className="w-full bg-surface-container-highest rounded-full h-1.5 mb-1.5 overflow-hidden">
              <div className="bg-primary h-1.5 rounded-full shadow-[0_0_10px_rgba(173,198,255,0.5)] transition-all duration-500" style={{ width: `${progressPct}%` }}></div>
            </div>
            <p className="font-label-caps text-[9px] text-on-surface-variant text-right">
              {doneCount} of {waypoints.length} Sector Waypoints Passed
            </p>
          </section>

          {/* Tab Navigation */}
          <nav className="flex p-1 bg-surface-container-low rounded-lg border border-outline-variant/30 pointer-events-auto">
            <button 
              className={`flex-1 py-2 font-label-caps text-xs text-center rounded transition-all duration-300 cursor-pointer ${
                activeTab === 'waypoints'
                  ? 'bg-primary/20 text-primary border border-primary/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                  : 'text-on-surface-variant hover:text-on-surface border border-transparent'
              }`} 
              onClick={() => setActiveTab('waypoints')}
            >
              WAYPOINTS
            </button>
            <button 
              className={`flex-1 py-2 font-label-caps text-xs text-center rounded transition-all duration-300 cursor-pointer ${
                activeTab === 'ledger'
                  ? 'bg-primary/20 text-primary border border-primary/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                  : 'text-on-surface-variant hover:text-on-surface border border-transparent'
              }`} 
              onClick={() => setActiveTab('ledger')}
            >
              LEDGER
            </button>
            <button 
              className={`flex-1 py-2 font-label-caps text-xs text-center rounded transition-all duration-300 cursor-pointer ${
                activeTab === 'crew'
                  ? 'bg-primary/20 text-primary border border-primary/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                  : 'text-on-surface-variant hover:text-on-surface border border-transparent'
              }`} 
              onClick={() => setActiveTab('crew')}
            >
              CREW
            </button>
          </nav>

          {/* Tab Contents */}
          <div className="relative min-h-[400px] pointer-events-auto">
            
            {/* WAYPOINTS Tab */}
            {activeTab === 'waypoints' && (
              <div className="pl-6 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-outline-variant/30">
                {waypoints.map((wp) => (
                  <div key={wp.id} className="relative mb-6 last:mb-0">
                    {/* Tick checkbox */}
                    <button 
                      onClick={() => toggleWaypoint(wp.id)}
                      className={`absolute -left-[35px] top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all ${
                        wp.done 
                          ? 'bg-primary border-primary shadow-[0_0_10px_rgba(173,198,255,0.4)] text-black' 
                          : 'bg-background border-outline-variant text-transparent hover:border-primary/50'
                      }`}
                    >
                      {wp.done && <span className="text-[10px] font-bold">✓</span>}
                    </button>

                    <div className={`bg-surface-container border rounded-lg p-4 transition-all ${
                      wp.done 
                        ? 'border-primary/40 shadow-[0_4px_15px_rgba(59,130,246,0.08)] opacity-90' 
                        : 'border-outline-variant/20 opacity-60'
                    }`}>
                      <div className="flex justify-between items-start">
                        <h3 className={`font-title-md text-sm ${wp.done ? 'text-primary' : 'text-on-surface'}`}>
                          {wp.name}
                        </h3>
                        <MapPin className={`w-4 h-4 ${wp.done ? 'text-primary' : 'text-gray-500'}`} />
                      </div>
                      
                      <p className="font-label-caps text-[10px] text-on-surface-variant mt-1">
                        Est. {wp.time} • {wp.distance}
                      </p>

                      {(wp.fuel || wp.food) && (
                        <div className="flex gap-2 mt-3">
                          {wp.fuel && (
                            <span className="px-2 py-0.5 bg-surface-container-high rounded text-[9px] font-label-caps text-secondary-fixed flex items-center gap-1 border border-outline-variant/30">
                              ⛽ Fuel
                            </span>
                          )}
                          {wp.food && (
                            <span className="px-2 py-0.5 bg-surface-container-high rounded text-[9px] font-label-caps text-secondary-fixed flex items-center gap-1 border border-outline-variant/30">
                              🍽️ Food
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* LEDGER Tab */}
            {activeTab === 'ledger' && (
              <div className="space-y-4">
                
                {/* Total Cost Display */}
                <div className="bg-primary/5 border border-primary/30 rounded-xl p-5 flex flex-col items-center justify-center shadow-[0_0_15px_rgba(173,198,255,0.15)]">
                  <span className="font-label-caps text-[10px] text-primary uppercase tracking-wider mb-0.5">Total Trip Cost</span>
                  <span className="font-display-lg text-4xl font-extrabold text-on-surface tracking-tight">
                    Rs. {totalCost.toFixed(2)}
                  </span>
                </div>

                {/* Net Debt settlement suggestions */}
                <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                  <h4 className="font-label-caps text-[10px] text-primary uppercase tracking-widest mb-3">Settlement Ledger</h4>
                  {settlements.length === 0 ? (
                    <p className="text-xs text-on-surface-variant italic">All accounts fully balanced. No transfers needed.</p>
                  ) : (
                    <div className="space-y-2">
                      {settlements.map((s, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-surface-container-high border border-outline-variant/30 flex items-center justify-between text-xs">
                          <div>
                            <strong className="text-white">{s.from}</strong>
                            <span className="text-gray-400 mx-1">pays</span>
                            <strong className="text-white">{s.to}</strong>
                          </div>
                          <span className="text-primary font-bold">Rs. {s.amount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actual MERN Expenses List */}
                <div className="space-y-2">
                  <h4 className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">Logged Payments</h4>
                  
                  {expenses.length === 0 ? (
                    <p className="text-xs text-on-surface-variant italic py-6 text-center">No transactions logged yet.</p>
                  ) : (
                    expenses.map((exp) => {
                      const isPayer = exp.paidBy._id === user._id;
                      const isAdmin = trip.admin._id === user._id;
                      
                      return (
                        <div key={exp._id} className="flex items-center justify-between p-3.5 bg-surface-container/50 border border-outline-variant/20 rounded-lg group hover:border-primary/20 transition-all">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center border border-outline-variant">
                              <CreditCard className="w-4 h-4 text-on-surface-variant" />
                            </div>
                            <div>
                              <p className="font-title-md text-xs text-on-surface">{exp.description}</p>
                              <p className="font-label-caps text-[9px] text-on-surface-variant mt-0.5">
                                {exp.paidBy.name} • {exp.date ? new Date(exp.date).toLocaleDateString() : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-stats-lg text-sm text-on-surface">Rs. {exp.amount.toFixed(2)}</span>
                            {(isPayer || isAdmin) && (
                              <button 
                                onClick={() => handleDeleteExpense(exp._id)}
                                className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-500/5 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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

            {/* CREW Tab */}
            {activeTab === 'crew' && (
              <div className="space-y-6">
                
                {/* Admin options - invite members */}
                {trip.admin._id === user._id && (
                  <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <h4 className="font-label-caps text-[10px] text-primary uppercase tracking-widest mb-3">Invite Coordinator</h4>
                    <form onSubmit={handleAddMember} className="flex gap-2">
                      <label htmlFor="member-email" className="sr-only">Invite Coordinator Email</label>
                      <input 
                        type="email" 
                        id="member-email"
                        name="email"
                        autocomplete="email"
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        placeholder="rider@convoy.net"
                        className="flex-grow rounded-lg border border-outline-variant bg-surface-container-lowest py-2 px-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary text-white"
                      />
                      <button 
                        type="submit"
                        disabled={loadingMember}
                        className="px-4 bg-primary/20 hover:bg-primary border border-primary text-primary hover:text-black font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {loadingMember ? (
                          <div className="h-4 w-4 animate-spin rounded-full border border-current border-t-transparent"></div>
                        ) : (
                          <>
                            <UserPlus className="w-3.5 h-3.5" />
                            Invite
                          </>
                        )}
                      </button>
                    </form>
                    {memberError && <p className="text-[10px] text-red-400 mt-2">{memberError}</p>}
                  </div>
                )}

                {/* Grid of Crew members */}
                <div className="grid grid-cols-2 gap-4">
                  {trip.members?.map((member) => (
                    <div key={member._id} className="bg-surface-container/60 border border-outline-variant/30 rounded-lg p-4 flex flex-col items-center text-center">
                      <div className="w-16 h-16 rounded-full mb-3 border-2 border-outline-variant p-0.5 shadow-[0_0_10px_rgba(173,198,255,0.1)] flex items-center justify-center bg-surface-container-highest">
                        <span className="text-2xl text-on-surface-variant">👤</span>
                      </div>
                      
                      <h3 className="font-title-md text-sm text-on-surface truncate w-full">{member.name}</h3>
                      <p className="font-label-caps text-[9px] text-primary mt-1 truncate w-full">{member.email}</p>
                      
                      {trip.admin._id === member._id && (
                        <span className="text-[8px] font-bold uppercase bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded mt-2">
                          Lead Admin
                        </span>
                      )}
                    </div>
                  ))}
                </div>

              </div>
            )}

          </div>
        </div>

        {/* Contextual FAB for adding expense (visible when Ledger tab is active) */}
        {activeTab === 'ledger' && (
          <button 
            onClick={() => setShowExpenseModal(true)}
            className="fixed bottom-6 right-6 w-14 h-14 bg-primary text-on-primary rounded-full shadow-[0_0_20px_rgba(59,130,246,0.6)] flex items-center justify-center hover:bg-primary-fixed transition-all active:scale-95 duration-200 z-50 cursor-pointer"
          >
            <Plus className="w-7 h-7 text-black" />
          </button>
        )}

      </main>

      {/* Add Expense Modal */}
      <AnimatePresence>
        {showExpenseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-md rounded-3xl p-6 border border-white/10 shadow-2xl backdrop-blur-2xl pointer-events-auto"
            >
              <h2 className="text-lg font-bold text-white mb-4">Log New Expense</h2>

              {expenseError && (
                <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs text-red-400">
                  {expenseError}
                </div>
              )}

              <form onSubmit={handleAddExpense} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="expense-description" className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</label>
                  <input
                    type="text"
                    id="expense-description"
                    name="description"
                    value={expenseDesc}
                    onChange={(e) => setExpenseDesc(e.target.value)}
                    placeholder="e.g. Fuel Stop #1, Dinner"
                    className="glass-input w-full py-2 px-3 text-xs text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="expense-amount" className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount (Rs)</label>
                    <input
                      type="number"
                      step="0.01"
                      id="expense-amount"
                      name="amount"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="0.00"
                      className="glass-input w-full py-2 px-3 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="expense-payer" className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Paid By</label>
                    <select
                      id="expense-payer"
                      name="paidBy"
                      value={expensePayer}
                      onChange={(e) => setExpensePayer(e.target.value)}
                      className="glass-input w-full py-2 px-3 text-xs text-white bg-[#12141c]"
                    >
                      {trip.members?.map(m => (
                        <option key={m._id} value={m._id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Split Among</label>
                  <div className="max-h-28 overflow-y-auto p-2 rounded-xl bg-white/3 border border-white/5 space-y-2">
                    {trip.members?.map((m) => {
                      const isChecked = expenseSplit.includes(m._id);
                      return (
                        <label key={m._id} className="flex items-center gap-2 text-xs text-white cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setExpenseSplit(expenseSplit.filter(id => id !== m._id));
                              } else {
                                setExpenseSplit([...expenseSplit, m._id]);
                              }
                            }}
                            className="rounded border-gray-600 text-emerald-500 focus:ring-emerald-500 bg-black"
                          />
                          <span>{m.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowExpenseModal(false)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold border border-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loadingExpense}
                    className="flex-1 py-2 btn-neon text-black rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    {loadingExpense ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent"></div>
                    ) : (
                      'Log Expense'
                    )}
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
