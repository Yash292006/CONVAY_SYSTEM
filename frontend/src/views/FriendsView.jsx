import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Search, Plus, Check, MessageSquare, Compass, Shield, UserCheck } from 'lucide-react';

const FriendsView = () => {
  const [friends, setFriends] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);
  const [successId, setSuccessId] = useState(null);

  const threeContainerRef = useRef(null);

  useEffect(() => {
    fetchFriendsAndUsers();
  }, []);

  const fetchFriendsAndUsers = async () => {
    try {
      setLoading(true);
      const [friendsRes, usersRes] = await Promise.all([
        axios.get('/auth/friends'),
        axios.get('/auth/users')
      ]);
      setFriends(friendsRes.data);
      setAllUsers(usersRes.data);
    } catch (err) {
      console.error('Error fetching friends data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (friendId) => {
    setAddingId(friendId);
    try {
      await axios.post('/auth/add-friend', { friendId });
      
      const addedUser = allUsers.find(u => u._id === friendId);
      if (addedUser) {
        setFriends([...friends, addedUser]);
      }
      
      setSuccessId(friendId);
      setTimeout(() => setSuccessId(null), 2000);
    } catch (err) {
      alert(err.response?.data?.message || 'Error adding friend.');
    } finally {
      setAddingId(null);
    }
  };

  // Three.js 3D Particle Star Sphere Background
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

  const friendIds = friends.map(f => f._id);
  const searchResults = allUsers.filter(user => {
    const isNotFriend = !friendIds.includes(user._id);
    const matchesQuery = 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    return isNotFriend && matchesQuery && searchQuery.length > 0;
  });

  const getSimulatedStatus = (index) => {
    const statuses = [
      { label: 'ACTIVE', color: 'bg-primary', glow: 'shadow-[0_0_8px_#adc6ff]' },
      { label: 'STANDBY', color: 'bg-amber-400', glow: 'shadow-[0_0_8px_#f59e0b]' },
      { label: 'OFF-GRID', color: 'bg-gray-500', glow: '' }
    ];
    return statuses[index % statuses.length];
  };

  return (
    <div className="bg-background text-on-background min-h-screen relative font-body-md select-none pb-24">
      
      {/* Three.js Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div ref={threeContainerRef} className="fixed inset-0 w-full h-full bg-transparent" />
      </div>

      <main className="relative z-10 max-w-screen-md mx-auto px-6 pt-8">
        
        {/* Header HUD */}
        <header className="mb-8">
          <h1 className="font-headline-lg-mobile text-2xl font-bold tracking-widest text-white uppercase">COMM MODULE</h1>
          <p className="font-label-caps text-[9px] text-on-surface-variant opacity-70">
            COMMLINK FREQUENCY CHANNELS
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Left panel: Discover / Search */}
          <div className="md:col-span-1 space-y-6">
            <div className="glass-panel p-5 rounded-2xl border border-outline-variant/30 backdrop-blur-md shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              <h3 className="font-label-caps text-[10px] text-primary uppercase tracking-widest mb-4 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" />
                Scan Networks
              </h3>

              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-on-surface-variant/50" />
                <label htmlFor="friend-search" className="sr-only">Scan Networks</label>
                <input
                  type="text"
                  id="friend-search"
                  name="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter alias or email..."
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Search results */}
              <div className="mt-4 space-y-2.5">
                {searchQuery.length > 0 ? (
                  searchResults.length === 0 ? (
                    <p className="text-[10px] text-on-surface-variant italic">No channels found.</p>
                  ) : (
                    searchResults.map((user) => (
                      <div key={user._id} className="p-2.5 rounded-lg bg-surface-container-high/40 border border-outline-variant/20 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-title-md font-bold text-white truncate">{user.name}</p>
                          <p className="font-label-caps text-[8px] text-on-surface-variant truncate mt-0.5">{user.email}</p>
                        </div>
                        <button
                          onClick={() => handleAddFriend(user._id)}
                          disabled={addingId === user._id || successId === user._id}
                          className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary border border-primary/20 hover:border-primary text-primary hover:text-black transition-all flex items-center justify-center cursor-pointer"
                        >
                          {successId === user._id ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : addingId === user._id ? (
                            <div className="w-3.5 h-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    ))
                  )
                ) : (
                  <p className="text-[10px] text-on-surface-variant italic">Search coordinators to link comms.</p>
                )}
              </div>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-outline-variant/30 text-[10px] text-on-surface-variant leading-relaxed flex gap-2.5">
              <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="text-white font-semibold block mb-0.5">Encrypted Nodes</span>
                Commlinks operate over secure, private peer protocols. Telemetry syncs dynamically upon friendship link.
              </div>
            </div>
          </div>

          {/* Right panel: Linked contacts list */}
          <div className="md:col-span-2">
            <div className="glass-panel p-6 rounded-2xl border border-outline-variant/30 backdrop-blur-md shadow-[0_4px_15px_rgba(0,0,0,0.5)]">
              <h3 className="font-headline-lg-mobile text-sm font-bold tracking-wider text-white uppercase mb-6 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Linked Contacts ({friends.length})
              </h3>

              {loading ? (
                <div className="flex justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                </div>
              ) : friends.length === 0 ? (
                <div className="py-16 text-center">
                  <Users className="w-10 h-10 text-outline-variant/40 mx-auto mb-3" />
                  <p className="text-xs text-on-surface-variant">No linked transponders found.</p>
                  <p className="text-[10px] text-outline mt-1">Scan active networks to link coordinates.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {friends.map((friend, idx) => {
                    const status = getSimulatedStatus(idx);
                    return (
                      <motion.div
                        key={friend._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className="p-4 rounded-xl bg-surface-container/60 border border-outline-variant/30 flex flex-col justify-between hover:border-primary/20 transition-all duration-300"
                      >
                        <div>
                          <div className="flex justify-between items-start">
                            <div className="min-w-0">
                              <h4 className="font-title-md text-xs font-bold text-white truncate">{friend.name}</h4>
                              <p className="font-label-caps text-[8px] text-on-surface-variant truncate mt-0.5">{friend.email}</p>
                            </div>
                            
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${status.color} ${status.glow}`} />
                              <span className="text-[8px] font-bold tracking-wider uppercase text-on-surface-variant">
                                {status.label}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 text-[10px] text-on-surface-variant flex items-center gap-1.5 font-label-caps">
                            <Compass className="w-3.5 h-3.5 text-primary" />
                            <span className="truncate">TRANS: <strong className="text-white">ONLINE</strong></span>
                          </div>
                        </div>

                        <div className="mt-4 flex gap-2 border-t border-outline-variant/20 pt-3">
                          <button
                            onClick={() => alert(`Opening secure peer connection with ${friend.name}...`)}
                            className="flex-1 py-1.5 bg-surface-container-high hover:bg-primary/10 border border-outline-variant/30 hover:border-primary text-[9px] font-label-caps text-on-surface hover:text-primary rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                          >
                            <MessageSquare className="w-3 h-3" />
                            COMMS
                          </button>
                          
                          <div className="px-2 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg text-[9px] font-label-caps flex items-center gap-1 select-none">
                            <UserCheck className="w-3 h-3" />
                            LINKED
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

    </div>
  );
};

export default FriendsView;
