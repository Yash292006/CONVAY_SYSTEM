import React, { useState, useEffect, useRef, useContext } from 'react';
import axios from 'axios';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { IndianRupee, Plus, Receipt, User, Clock, ShieldAlert } from 'lucide-react';
import { AuthContext } from '../App';

const LedgerView = () => {
  const { user } = useContext(AuthContext);
  const [expenses, setExpenses] = useState([]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const threeContainerRef = useRef(null);

  // 1. Fetch expenses on mount
  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/expenses');
      setExpenses(res.data);
    } catch (err) {
      console.error("Failed to load ledger:", err);
      setError("Failed to sync secure transaction ledger.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Submit new expense
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description || !amount) {
      setError('Please provide description and amount.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post('/expenses', {
        description,
        amount: parseFloat(amount)
      });
      setExpenses([res.data, ...expenses]);
      setDescription('');
      setAmount('');
      setShowForm(false);
    } catch (err) {
      console.error("Failed to add expense:", err);
      setError("Failed to write transaction record to database.");
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Three.js 3D Grid Wave Data Visualization Background
  useEffect(() => {
    if (!threeContainerRef.current) return;

    const container = threeContainerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 10;
    camera.position.y = 2;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Create wave grid
    const gridGeometry = new THREE.BufferGeometry();
    const count = 40;
    const positions = new Float32Array(count * count * 3);
    const colors = new Float32Array(count * count * 3);

    const color1 = new THREE.Color(0x10b981); // Emerald
    const color2 = new THREE.Color(0x3b82f6); // Blue

    let index = 0;
    for (let x = 0; x < count; x++) {
      for (let z = 0; z < count; z++) {
        // Grid points centered on 0,0
        positions[index * 3] = (x - count / 2) * 0.8;
        positions[index * 3 + 1] = 0;
        positions[index * 3 + 2] = (z - count / 2) * 0.8;

        const mixVal = (x + z) / (count * 2);
        const ptColor = color1.clone().lerp(color2, mixVal);
        colors[index * 3] = ptColor.r;
        colors[index * 3 + 1] = ptColor.g;
        colors[index * 3 + 2] = ptColor.b;

        index++;
      }
    }

    gridGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    gridGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Particle Canvas Texture
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 16;
    pCanvas.height = 16;
    const pCtx = pCanvas.getContext('2d');
    const grad = pCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, 16, 16);
    const pTexture = new THREE.CanvasTexture(pCanvas);

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      map: pTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particles = new THREE.Points(gridGeometry, particleMaterial);
    scene.add(particles);

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Wave physics simulation
      const posAttr = gridGeometry.attributes.position;
      const time = Date.now() * 0.0015;

      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const y = Math.sin(x * 0.2 + time) * Math.cos(z * 0.2 + time) * 0.8;
        posAttr.setY(i, y - 2);
      }
      posAttr.needsUpdate = true;

      particles.rotation.y = time * 0.02;

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

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      gridGeometry.dispose();
      particleMaterial.dispose();
      pTexture.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const totalCost = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="bg-background text-on-background min-h-screen relative font-body-md select-none pb-28">
      
      {/* 3D Visualizer Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div ref={threeContainerRef} className="fixed inset-0 w-full h-full bg-transparent" />
      </div>

      <main className="relative z-10 max-w-screen-md mx-auto px-6 pt-8">
        
        {/* Header HUD */}
        <header className="mb-8 flex justify-between items-center bg-surface-container-low/50 border border-outline-variant/30 backdrop-blur-md rounded-2xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="font-headline-lg-mobile text-sm font-bold tracking-widest text-white uppercase">Ledger Hub</h1>
              <p className="font-label-caps text-[9px] text-on-surface-variant opacity-75">
                SECURE TRANSACTION MATRIX
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="btn-neon bg-emerald-500/20 hover:bg-emerald-500 border border-emerald-500 text-emerald-400 hover:text-black font-semibold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Log Charge
          </button>
        </header>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 flex items-center gap-2">
            <ShieldAlert size={14} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Total cost stats panel */}
          <div className="md:col-span-1 space-y-4">
            <div className="glass-panel p-6 rounded-2xl border border-outline-variant/30 backdrop-blur-md text-center shadow-[0_4px_10px_rgba(0,0,0,0.3)] bg-emerald-500/5">
              <span className="font-label-caps text-[10px] text-emerald-400 uppercase tracking-widest block mb-2">Total Convoy Cost</span>
              <div className="flex items-center justify-center text-3xl font-extrabold text-white">
                <IndianRupee size={24} className="text-emerald-400 mr-0.5" />
                <span className="font-display-lg font-black tracking-tight">{totalCost.toLocaleString('en-IN')}</span>
              </div>
            </div>
            
            <div className="glass-panel p-4 rounded-xl border border-outline-variant/30 text-[10px] text-on-surface-variant leading-relaxed">
              <span className="text-white font-semibold block mb-1">Global Audit Ledger</span>
              This channel lists all expenses logged globally across all convoy runs. Charge authorizations are secured via JWT bearer tokens and validated at nodes.
            </div>
          </div>

          {/* Transactions list */}
          <div className="md:col-span-2 space-y-3">
            <h3 className="font-label-caps text-xs text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock size={14} /> Transactions Ledger
            </h3>

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
              </div>
            ) : expenses.length === 0 ? (
              <div className="bg-surface-container-low/40 border border-outline-variant/20 rounded-xl p-10 text-center flex flex-col items-center shadow-[0_4px_15px_rgba(0,0,0,0.2)]">
                <Receipt className="w-10 h-10 text-outline-variant/50 mb-3 animate-pulse" />
                <h3 className="font-title-md text-sm text-on-surface">No transactions verified</h3>
                <p className="text-xs text-on-surface-variant mt-1 max-w-xs leading-relaxed">
                  Start by logging a new convoy expense. Your charge will broadcast dynamically across secure channels.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {expenses.map((exp) => (
                  <motion.div
                    key={exp._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel p-4 rounded-xl flex justify-between items-center bg-[#201f22]/60 hover:bg-[#201f22]/80 border border-outline-variant/30 hover:border-emerald-500/20 transition-all duration-300 shadow-[0_4px_10px_rgba(0,0,0,0.2)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                        <Receipt size={14} />
                      </div>
                      <div>
                        <p className="font-title-md text-xs text-white">{exp.description}</p>
                        <p className="font-label-caps text-[8px] text-on-surface-variant mt-0.5 flex items-center gap-1">
                          <User size={8} />
                          Paid by <span className="text-emerald-400 font-bold">{exp.paidBy?.name || 'Unknown'}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center text-sm font-bold text-white font-stats-lg">
                      <IndianRupee size={12} className="text-emerald-400 mr-0.5" />
                      {exp.amount.toFixed(2)}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

        </div>

      </main>

      {/* Add Expense Modal Form */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-md rounded-2xl p-6 border border-white/10 shadow-2xl backdrop-blur-2xl"
            >
              <h2 className="font-headline-lg-mobile text-sm font-bold text-white mb-2 uppercase tracking-wider">Log Charge Log</h2>
              <p className="text-[11px] text-on-surface-variant mb-4 font-label-caps">PROMPT LEDGER DIRECTIVES</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="ledger-description" className="block font-label-caps text-[10px] text-on-surface-variant">DESCRIPTION</label>
                  <input
                    type="text"
                    id="ledger-description"
                    name="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Fuel Stop Hubli, Dinner Split"
                    className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 px-3 text-xs text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="ledger-amount" className="block font-label-caps text-[10px] text-on-surface-variant">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    id="ledger-amount"
                    name="amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 px-3 text-xs text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold border border-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                  >
                    ABORT
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2 btn-neon bg-emerald-500/20 hover:bg-emerald-500 border border-emerald-500 text-emerald-400 hover:text-black rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    {submitting ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent"></div>
                    ) : (
                      'SAVE RECORD'
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

export default LedgerView;
