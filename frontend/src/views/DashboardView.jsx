import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as THREE from 'three';
import { AuthContext } from '../App';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MapPin, Users, Calendar, Compass, Activity, ArrowRight, LogOut } from 'lucide-react';

const DashboardView = () => {
  const { user, logout } = useContext(AuthContext);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Form State
  const [title, setTitle] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [formError, setFormError] = useState('');
  const [loadingForm, setLoadingForm] = useState(false);

  const navigate = useNavigate();
  const threeContainerRef = useRef(null);

  useEffect(() => {
    fetchTrips();
  }, []);

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

  // Three.js 3D Rotating Radar Grid Background
  useEffect(() => {
    if (!threeContainerRef.current) return;

    const container = threeContainerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 10;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Create a group of concentric radar grid rings
    const group = new THREE.Group();

    const ringCount = 4;
    const materials = [];
    const geometries = [];

    for (let i = 1; i <= ringCount; i++) {
      const radius = i * 2;
      const ringGeo = new THREE.RingGeometry(radius - 0.05, radius + 0.05, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.15 / i,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      
      // Rotate to lie flat
      ring.rotation.x = Math.PI / 2.2;
      
      group.add(ring);
      geometries.push(ringGeo);
      materials.push(ringMat);
    }

    // Add some cross grid lines
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.05
    });
    
    const points = [];
    points.push(new THREE.Vector3(-10, 0, 0));
    points.push(new THREE.Vector3(10, 0, 0));
    points.push(new THREE.Vector3(0, 0, -10));
    points.push(new THREE.Vector3(0, 0, 10));
    
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const gridLines = new THREE.LineSegments(lineGeo, lineMat);
    gridLines.rotation.x = Math.PI / 2.2;
    group.add(gridLines);
    geometries.push(lineGeo);
    materials.push(lineMat);

    scene.add(group);

    // Add ambient lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Subtle rotation and tilt breathing
      group.rotation.z += 0.002;
      group.rotation.y = Math.sin(Date.now() * 0.0005) * 0.15;
      
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
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handleCreateTrip = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!title || !origin || !destination) {
      setFormError('Required coordinates not completed.');
      return;
    }

    setLoadingForm(true);
    try {
      const res = await axios.post('/trips', {
        title,
        description,
        origin,
        destination,
        startDate
      });
      setTrips([res.data, ...trips]);
      setShowCreateModal(false);
      setTitle('');
      setOrigin('');
      setDestination('');
      setDescription('');
      setStartDate('');
      
      navigate(`/trips/${res.data._id}`);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Error deploying route.');
    } finally {
      setLoadingForm(false);
    }
  };

  const activeCount = trips.filter(t => t.status === 'active').length;

  return (
    <div className="bg-background text-on-background min-h-screen relative font-body-md select-none pb-24">
      
      {/* 3D Radar Grid Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div ref={threeContainerRef} className="fixed inset-0 w-full h-full bg-transparent" />
      </div>

      <main className="relative z-10 max-w-screen-md mx-auto px-6 pt-8">
        
        {/* Header HUD Bar */}
        <header className="flex justify-between items-center mb-8 bg-surface-container-low/50 border border-outline-variant/30 backdrop-blur-md rounded-2xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full border border-primary/20 bg-primary/10 flex items-center justify-center">
              <Compass className="w-5 h-5 text-primary animate-spin" style={{ animationDuration: '10s' }} />
            </div>
            <div>
              <h1 className="font-headline-lg-mobile text-sm font-bold tracking-widest text-white uppercase">MISSION CONTROL</h1>
              <p className="font-label-caps text-[9px] text-on-surface-variant opacity-75">
                AGENT ID: <span className="text-white">{user?.name || 'COORDINATOR'}</span>
              </p>
            </div>
          </div>
          
          <button 
            onClick={logout}
            className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-400 transition-all cursor-pointer flex items-center justify-center"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </header>

        {/* Dashboard Vector HUD stats */}
        <section className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-surface-container/60 border border-outline-variant/30 rounded-xl p-4 flex flex-col justify-between shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
            <span className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider">ACTIVE CONVOYS</span>
            <div className="flex items-end gap-1 mt-2">
              <span className="font-display-lg text-3xl font-extrabold text-primary">{activeCount}</span>
              <span className="font-label-caps text-[10px] text-primary pb-1">RUNNING</span>
            </div>
          </div>
          <div className="bg-surface-container/60 border border-outline-variant/30 rounded-xl p-4 flex flex-col justify-between shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
            <span className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider">TOTAL INITIATED</span>
            <div className="flex items-end gap-1 mt-2">
              <span className="font-display-lg text-3xl font-extrabold text-on-surface">{trips.length}</span>
              <span className="font-label-caps text-[10px] text-on-surface-variant pb-1">ROUTES</span>
            </div>
          </div>
        </section>

        {/* Action Button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-label-caps text-xs text-on-surface-variant uppercase tracking-widest">Route Directives</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-neon bg-primary/20 hover:bg-primary border border-primary text-primary hover:text-black font-semibold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Initialize Route
          </button>
        </div>

        {/* Trips List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          </div>
        ) : trips.length === 0 ? (
          <div className="bg-surface-container-low/40 border border-outline-variant/20 rounded-xl p-10 text-center flex flex-col items-center shadow-[0_4px_15px_rgba(0,0,0,0.2)]">
            <Activity className="w-10 h-10 text-outline-variant/50 mb-3 animate-pulse" />
            <h3 className="font-title-md text-sm text-on-surface">No active coordinates</h3>
            <p className="text-xs text-on-surface-variant mt-1 max-w-xs leading-relaxed">
              Initialize a new convoy run directive to begin coordinating routes, splitting crew expenses, and monitoring live telemetry.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {trips.map((trip, idx) => (
              <motion.div
                key={trip._id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => navigate(`/trips/${trip._id}`)}
                className="bg-surface-container/60 hover:bg-surface-container-high border border-outline-variant/30 hover:border-primary/40 rounded-xl p-5 shadow-[0_4px_15px_rgba(0,0,0,0.3)] hover:shadow-[0_0_15px_rgba(173,198,255,0.15)] relative overflow-hidden group cursor-pointer transition-all duration-300"
              >
                {/* Header status */}
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-title-md text-sm text-white group-hover:text-primary transition-colors">
                      {trip.title}
                    </h3>
                    {trip.description && (
                      <p className="text-[11px] text-on-surface-variant line-clamp-1 mt-0.5 max-w-[80%]">
                        {trip.description}
                      </p>
                    )}
                  </div>
                  
                  <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                    trip.status === 'active' 
                      ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_8px_rgba(173,198,255,0.3)] animate-pulse' 
                      : 'bg-surface-container-highest text-on-surface-variant border border-outline-variant/30'
                  }`}>
                    {trip.status}
                  </span>
                </div>

                {/* Footer specs */}
                <div className="flex justify-between items-center border-t border-outline-variant/25 pt-4 text-[10px] text-on-surface-variant font-label-caps">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    <span className="truncate max-w-[140px]">{trip.origin} → {trip.destination}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[9px]">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      {trip.startDate ? new Date(trip.startDate).toLocaleDateString() : 'TBD'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-violet-400" />
                      {trip.members?.length || 1} Crew
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-primary group-hover:translate-x-1.5 transition-transform" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

      </main>

      {/* Create Trip Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-md rounded-2xl p-6 border border-white/10 shadow-2xl backdrop-blur-2xl"
            >
              <h2 className="font-headline-lg-mobile text-sm font-bold text-white mb-2 uppercase tracking-wider">Initialize Convoy Run</h2>
              <p className="text-[11px] text-on-surface-variant mb-4 font-label-caps">PROMPT VECTOR DIRECTIVES</p>

              {formError && (
                <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs text-red-400">
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreateTrip} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="trip-title" className="block font-label-caps text-[10px] text-on-surface-variant">RUN LABEL</label>
                  <input
                    type="text"
                    id="trip-title"
                    name="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Gokarna Coastal Run"
                    className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 px-3 text-xs text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="trip-origin" className="block font-label-caps text-[10px] text-on-surface-variant">ORIGIN</label>
                    <input
                      type="text"
                      id="trip-origin"
                      name="origin"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder="e.g. Bangalore"
                      className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 px-3 text-xs text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="trip-destination" className="block font-label-caps text-[10px] text-on-surface-variant">DESTINATION</label>
                    <input
                      type="text"
                      id="trip-destination"
                      name="destination"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="e.g. Gokarna"
                      className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 px-3 text-xs text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="trip-startdate" className="block font-label-caps text-[10px] text-on-surface-variant">DEPLOY DATE</label>
                  <input
                    type="date"
                    id="trip-startdate"
                    name="startDate"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 px-3 text-xs text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="trip-description" className="block font-label-caps text-[10px] text-on-surface-variant">CHECKLIST DIRECTIVES</label>
                  <textarea
                    id="trip-description"
                    name="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Route instructions, radar checkpoints..."
                    rows="3"
                    className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 px-3 text-xs text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold border border-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                  >
                    ABORT
                  </button>
                  <button
                    type="submit"
                    disabled={loadingForm}
                    className="flex-1 py-2 btn-neon text-black rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    {loadingForm ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent"></div>
                    ) : (
                      'DEPLOY'
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

export default DashboardView;
