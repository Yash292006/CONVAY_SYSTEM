import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as THREE from 'three';
import { AuthContext } from '../App';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MapPin, Users, Calendar, ArrowRight, LogOut, Bike, Activity } from 'lucide-react';

const STATUS_COLOR = {
  planning:  'text-yellow-400 bg-yellow-400/10 border-yellow-400/25',
  active:    'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
  completed: 'text-blue-400   bg-blue-400/10   border-blue-400/25',
};

const RadarBackground = () => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    let animId;
    const container = ref.current;
    if (!container) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    camera.position.z = 10;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    const geos = [], mats = [];

    for (let i = 1; i <= 4; i++) {
      const geo = new THREE.RingGeometry(i * 2 - 0.05, i * 2 + 0.05, 64);
      const mat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.12 / i, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = Math.PI / 2.2;
      group.add(ring);
      geos.push(geo); mats.push(mat);
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-10, 0, 0), new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(0, 0, -10), new THREE.Vector3(0, 0, 10),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.05 });
    const grid = new THREE.LineSegments(lineGeo, lineMat);
    grid.rotation.x = Math.PI / 2.2;
    group.add(grid);
    geos.push(lineGeo); mats.push(lineMat);
    scene.add(group);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    const animate = () => {
      animId = requestAnimationFrame(animate);
      group.rotation.z += 0.002;
      group.rotation.y = Math.sin(Date.now() * 0.0005) * 0.15;
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const nw = container.clientWidth, nh = container.clientHeight;
      camera.aspect = nw / nh; camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animId);
      geos.forEach(g => g.dispose());
      mats.forEach(m => m.dispose());
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);
  return <div ref={ref} className="fixed inset-0 w-full h-full bg-transparent pointer-events-none" />;
};

const DashboardView = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [trips,           setTrips]           = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus,    setFilterStatus]    = useState('all');

  const [title,       setTitle]       = useState('');
  const [origin,      setOrigin]      = useState('');
  const [destination, setDestination] = useState('');
  const [description, setDescription] = useState('');
  const [startDate,   setStartDate]   = useState('');
  const [distanceKm,  setDistanceKm]  = useState('');
  const [formError,   setFormError]   = useState('');
  const [loadingForm, setLoadingForm] = useState(false);

  useEffect(() => { fetchTrips(); }, []);

  const fetchTrips = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/trips');
      setTrips(res.data);
    } catch (err) {
      console.error('Error fetching trips:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTrip = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!title || !origin || !destination) {
      setFormError('Title, origin and destination are required.');
      return;
    }
    setLoadingForm(true);
    try {
      const res = await axios.post('/trips', {
        title, description, origin, destination, startDate,
        distanceKm: distanceKm ? parseFloat(distanceKm) : undefined
      });
      setTrips([res.data, ...trips]);
      setShowCreateModal(false);
      setTitle(''); setOrigin(''); setDestination('');
      setDescription(''); setStartDate(''); setDistanceKm('');
      navigate(`/trips/${res.data._id}`);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Could not create trip.');
    } finally {
      setLoadingForm(false);
    }
  };

  const activeCount    = trips.filter(t => t.status === 'active').length;
  const planningCount  = trips.filter(t => t.status === 'planning').length;
  const completedCount = trips.filter(t => t.status === 'completed').length;
  const filteredTrips  = filterStatus === 'all' ? trips : trips.filter(t => t.status === filterStatus);

  return (
    <div className="bg-[#0a0b0d] text-white min-h-screen antialiased pb-28 relative">

      {/* 3D Radar Grid Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <RadarBackground />
      </div>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 bg-[#0a0b0d]/80 backdrop-blur-xl border-b border-white/5 px-5 py-4">
        <div className="max-w-screen-sm mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                <Bike size={14} className="text-blue-400" />
              </div>
              <span className="text-[11px] font-bold text-blue-400 uppercase tracking-widest">Convoy</span>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">Welcome back, <span className="text-white font-semibold">{user?.name}</span></p>
          </div>
          <button
            onClick={logout}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer active:scale-95"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <div className="relative z-10 max-w-screen-sm mx-auto px-4 pt-5 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Active',   count: activeCount,    color: 'text-emerald-400', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]' },
            { label: 'Planning', count: planningCount,  color: 'text-yellow-400',  glow: '' },
            { label: 'Done',     count: completedCount, color: 'text-blue-400',    glow: '' },
          ].map(s => (
            <div key={s.label} className={`bg-[#131416]/80 border border-white/8 rounded-xl p-3 text-center backdrop-blur-md ${s.glow}`}>
              <p className={`text-2xl font-black ${s.color}`}>{s.count}</p>
              <p className="text-[9px] uppercase text-gray-500 font-mono mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter + New */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {['all', 'active', 'planning', 'completed'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer capitalize ${
                  filterStatus === s
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                    : 'bg-white/4 border-white/8 text-gray-500 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-xs font-bold cursor-pointer active:scale-95 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)]"
          >
            <Plus size={13} /> New Trip
          </button>
        </div>

        {/* Trips list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="text-center py-16 border border-white/5 rounded-2xl bg-black/20 backdrop-blur-sm">
            <Activity className="w-10 h-10 mx-auto mb-3 text-gray-700" />
            <p className="text-sm text-gray-500">No trips here yet.</p>
            <p className="text-xs text-gray-700 mt-1">Tap "New Trip" to plan your convoy.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTrips.map((trip, idx) => (
              <motion.div
                key={trip._id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => navigate(`/trips/${trip._id}`)}
                className="bg-[#131416]/80 border border-white/8 hover:border-blue-500/30 rounded-2xl p-4 cursor-pointer group transition-all relative overflow-hidden backdrop-blur-md hover:shadow-[0_0_20px_rgba(59,130,246,0.08)]"
              >
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-white group-hover:text-blue-400 transition-colors truncate">{trip.title}</h3>
                    {trip.description && (
                      <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{trip.description}</p>
                    )}
                  </div>
                  <span className={`ml-3 shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold border capitalize flex items-center gap-1 ${STATUS_COLOR[trip.status] || STATUS_COLOR.planning}`}>
                    {trip.status === 'active' && <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />}
                    {trip.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-gray-500">
                  <div className="flex items-center gap-1">
                    <MapPin size={10} className="text-blue-400 shrink-0" />
                    <span className="truncate max-w-[160px]">{trip.origin} → {trip.destination}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {trip.startDate && (
                      <span className="flex items-center gap-1">
                        <Calendar size={10} className="text-yellow-400" />
                        {new Date(trip.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users size={10} className="text-purple-400" />
                      {trip.members?.length || 1}
                    </span>
                    <ArrowRight size={12} className="text-gray-600 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create Trip Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8 bg-black/70 backdrop-blur-md" onClick={() => setShowCreateModal(false)}>
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="bg-[#131416] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-[0_0_60px_rgba(0,0,0,0.8)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
              <h2 className="text-base font-bold text-white mb-1">New Trip</h2>
              <p className="text-[10px] text-gray-500 mb-4">Plan a new convoy run with your crew.</p>

              {formError && (
                <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{formError}</div>
              )}

              <form onSubmit={handleCreateTrip} className="space-y-3">
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Trip name (e.g. Gokarna Weekend Run)" required
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/40 transition-all" />

                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={origin} onChange={e => setOrigin(e.target.value)}
                    placeholder="From (e.g. Pune)" required
                    className="bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/40 transition-all" />
                  <input type="text" value={destination} onChange={e => setDestination(e.target.value)}
                    placeholder="To (e.g. Gokarna)" required
                    className="bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/40 transition-all" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-gray-600 uppercase font-mono block mb-1 pl-1">Start Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white outline-none focus:border-blue-500/40 transition-all" />
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-600 uppercase font-mono block mb-1 pl-1">Distance (km)</label>
                    <input type="number" value={distanceKm} onChange={e => setDistanceKm(e.target.value)}
                      placeholder="e.g. 520" min="0"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/40 transition-all" />
                  </div>
                </div>

                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Short description (optional)" rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/40 resize-none transition-all" />

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-3 rounded-xl border border-white/10 text-xs font-bold text-gray-400 hover:text-white cursor-pointer transition-all">
                    Cancel
                  </button>
                  <button type="submit" disabled={loadingForm}
                    className="flex-1 py-3 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {loadingForm
                      ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <><Plus size={13} /> Create Trip</>}
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

export default DashboardView;
