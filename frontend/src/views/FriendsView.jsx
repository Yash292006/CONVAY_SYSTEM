import React, { useState, useEffect, useRef, useContext } from 'react';
import axios from 'axios';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Search, Plus, Check, UserCheck, Bike, X } from 'lucide-react';
import { AuthContext } from '../App';

const FriendsView = () => {
  const { user: currentUser } = useContext(AuthContext);
  const [friends,   setFriends]   = useState([]);
  const [allUsers,  setAllUsers]  = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading,   setLoading]   = useState(true);
  const [addingId,  setAddingId]  = useState(null);
  const [successId, setSuccessId] = useState(null);

  const threeContainerRef = useRef(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [friendsRes, usersRes] = await Promise.all([
        axios.get('/auth/friends'),
        axios.get('/auth/users'),
      ]);
      setFriends(friendsRes.data);
      setAllUsers(usersRes.data);
    } catch (err) {
      console.error('Friends fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Three.js Particle Star Sphere Background
  useEffect(() => {
    if (!threeContainerRef.current) return;

    const container = threeContainerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 8;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Create particle network
    const count = 80;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const c1 = new THREE.Color(0x3b82f6); // Electric Blue
    const c2 = new THREE.Color(0x8b5cf6); // Violet

    for (let i = 0; i < count; i++) {
      // Points inside a sphere shell
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 2.5 + Math.random() * 0.5;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const colorMix = Math.random();
      const pointColor = c1.clone().lerp(c2, colorMix);
      colors[i * 3] = pointColor.r;
      colors[i * 3 + 1] = pointColor.g;
      colors[i * 3 + 2] = pointColor.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

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

    const material = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      map: pTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Linking lines between nearby particles
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.08
    });
    
    const linePositions = [];
    for (let i = 0; i < count; i++) {
      const v1 = new THREE.Vector3(positions[i*3], positions[i*3+1], positions[i*3+2]);
      for (let j = i + 1; j < count; j++) {
        const v2 = new THREE.Vector3(positions[j*3], positions[j*3+1], positions[j*3+2]);
        if (v1.distanceTo(v2) < 1.2) {
          linePositions.push(v1.x, v1.y, v1.z);
          linePositions.push(v2.x, v2.y, v2.z);
        }
      }
    }
    
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const connections = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(connections);

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      particles.rotation.y += 0.003;
      particles.rotation.x += 0.001;
      
      connections.rotation.y += 0.003;
      connections.rotation.x += 0.001;

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
      geometry.dispose();
      material.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      pTexture.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handleAddFriend = async (friendId) => {
    setAddingId(friendId);
    try {
      await axios.post('/auth/add-friend', { friendId });
      const added = allUsers.find(u => u._id === friendId);
      if (added) setFriends(prev => [...prev, added]);
      setSuccessId(friendId);
      setTimeout(() => setSuccessId(null), 2000);
    } catch (err) {
      alert(err.response?.data?.message || 'Error adding rider.');
    } finally {
      setAddingId(null);
    }
  };

  const friendIds = friends.map(f => f._id);

  const searchResults = allUsers.filter(u => {
    if (friendIds.includes(u._id)) return false;
    if (!searchQuery.trim()) return false;
    return (
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="bg-[#0a0b0d] text-white min-h-screen antialiased pb-28 relative">
      
      {/* 3D Particle Sphere Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div ref={threeContainerRef} className="fixed inset-0 w-full h-full bg-transparent" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0b0d]/90 backdrop-blur-xl border-b border-white/5 px-5 py-4">
        <div className="max-w-screen-sm mx-auto">
          <h1 className="text-base font-bold text-white">Crew Network</h1>
          <p className="text-[10px] text-gray-500 mt-0.5">{friends.length} rider{friends.length !== 1 ? 's' : ''} in your network</p>
        </div>
      </header>

      <div className="relative z-10 max-w-screen-sm mx-auto px-4 pt-5 space-y-5">

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search riders by name or email..."
            className="w-full bg-[#131416]/80 border border-white/8 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/40 transition-all backdrop-blur-md"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white cursor-pointer">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Search results */}
        <AnimatePresence>
          {searchQuery.trim() && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-[#131416]/90 border border-white/8 rounded-2xl overflow-hidden backdrop-blur-md"
            >
              {searchResults.length === 0 ? (
                <p className="text-xs text-gray-600 italic py-5 text-center">No riders found matching "{searchQuery}"</p>
              ) : (
                <div className="divide-y divide-white/5">
                  {searchResults.map(u => (
                    <div key={u._id} className="flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-sm font-bold text-gray-300">
                          {u.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">{u.name}</p>
                          <p className="text-[9px] text-gray-500">{u.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddFriend(u._id)}
                        disabled={addingId === u._id || successId === u._id}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer active:scale-95 disabled:opacity-60 ${
                          successId === u._id
                            ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                            : 'bg-blue-500/20 border-blue-500/30 text-blue-400 hover:bg-blue-500/30'
                        }`}
                      >
                        {successId === u._id ? (
                          <span className="flex items-center gap-1"><Check size={11} /> Added</span>
                        ) : addingId === u._id ? (
                          <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="flex items-center gap-1"><Plus size={11} /> Add</span>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Friends list */}
        <div>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Your Riders</h2>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : friends.length === 0 ? (
            <div className="text-center py-16 border border-white/5 rounded-2xl bg-white/2">
              <Users className="w-10 h-10 mx-auto mb-3 text-gray-700" />
              <p className="text-sm text-gray-500">No riders in your network yet.</p>
              <p className="text-xs text-gray-700 mt-1">Search above to add crew members.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map((friend, idx) => (
                <motion.div
                  key={friend._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="bg-[#131416]/80 border border-white/8 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-white/15 transition-all backdrop-blur-md"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400 shrink-0">
                    {friend.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white">{friend.name}</p>
                    <p className="text-[9px] text-gray-500 truncate">{friend.email}</p>
                    {friend.bikeModel && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Bike size={8} className="text-gray-600" />
                        <span className="text-[8px] text-gray-600">{friend.bikeModel}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1">
                    <UserCheck size={10} className="text-emerald-400" />
                    <span className="text-[9px] text-emerald-400 font-semibold">Crew</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FriendsView;
