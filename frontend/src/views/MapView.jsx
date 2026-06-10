import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Map, { Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { io } from 'socket.io-client';
import { Navigation, Search, Crosshair, Layers, Compass, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const STYLES = [
  { name: 'Dark Mode', url: 'mapbox://styles/mapbox/dark-v11' },
  { name: 'Satellite Streets', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
  { name: 'Standard Streets', url: 'mapbox://styles/mapbox/streets-v12' }
];

const MapView = () => {
  const navigate = useNavigate();
  const [riders, setRiders] = useState([]);
  const [speed, setSpeed] = useState(0);
  const [userLocation, setUserLocation] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRider, setSelectedRider] = useState(null);
  const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/dark-v11');
  const [incomingPing, setIncomingPing] = useState(null); // { fromName, message }
  const [pingSent, setPingSent] = useState(false);
  
  const socketRef = useRef(null);
  const mapRef = useRef(null);
  const hasCenteredRef = useRef(false);
  
  // Define where the camera starts (e.g., Dharwad or center of India)
  const [viewState, setViewState] = useState({
    longitude: 75.0078,
    latitude: 15.4589,
    zoom: 12,
    pitch: 45, // Tilts the camera for a 3D view!
  });

  useEffect(() => {
    // 1. Connect to your radar tower
    const backendUrl = import.meta.env.VITE_API_URL 
      ? import.meta.env.VITE_API_URL.replace('/api', '') 
      : 'http://localhost:5000';
    socketRef.current = io(backendUrl);
    
    // Join room logic...
    const searchParams = new URLSearchParams(window.location.search);
    const activeTripId = searchParams.get('trip') || 'demo-trip-room';
    socketRef.current.emit('joinTrip', activeTripId);

    socketRef.current.on('riderMoved', (incomingData) => {
      setRiders((prev) => {
        const exists = prev.find(r => r.userId === incomingData.userId);
        if (exists) {
          return prev.map(r => r.userId === incomingData.userId ? incomingData : r);
        }
        return [...prev, incomingData];
      });
    });

    // Listen for incoming ping from another rider
    socketRef.current.on('pingReceived', (data) => {
      setIncomingPing(data);
      // Auto-dismiss after 5 seconds
      setTimeout(() => setIncomingPing(null), 5000);
    });

    // 2. Real GPS Tracking
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed: gpsSpeed } = position.coords;
          const currentSpeedKmH = gpsSpeed ? Math.round(gpsSpeed * 3.6) : 0;
          setSpeed(currentSpeedKmH);
          setUserLocation({ latitude, longitude });

          // Automatically center the map on YOUR location as you drive (only on first lock)
          if (!hasCenteredRef.current) {
            setViewState(prev => ({ ...prev, latitude, longitude }));
            hasCenteredRef.current = true;
          }

          const activeUser = JSON.parse(localStorage.getItem('convoyUser'));
          if (activeUser) {
            socketRef.current.emit('updateLocation', {
              tripId: activeTripId,
              userId: activeUser.id,
              name: activeUser.name,
              lat: latitude,
              lng: longitude,
              speed: currentSpeedKmH
            });
          }
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // Recenter map on user's current GPS location
  const recenterOnUser = () => {
    const loc = userLocation || { latitude: 15.4589, longitude: 75.0078 };
    mapRef.current?.flyTo({
      center: [loc.longitude, loc.latitude],
      zoom: 14,
      pitch: 45,
      bearing: 0,
      duration: 1500
    });
  };

  // Toggle map base layer styles
  const cycleMapStyle = () => {
    const idx = STYLES.findIndex(s => s.url === mapStyle);
    const nextIdx = (idx + 1) % STYLES.length;
    setMapStyle(STYLES[nextIdx].url);
  };

  // Reset compass orientation to north
  const resetCompass = () => {
    setViewState(prev => ({
      ...prev,
      bearing: 0,
      pitch: 0
    }));
  };

  // Filter riders based on search text input
  const filteredRiders = searchQuery.trim() === ''
    ? []
    : riders.filter(r => r.name?.toLowerCase().includes(searchQuery.toLowerCase()));

  const currentStyleName = STYLES.find(s => s.url === mapStyle)?.name || 'Map Style';

  return (
    <div className="w-full h-screen relative bg-[#131315] select-none text-[#e5e1e4] overflow-hidden">
      
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle={mapStyle} 
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        {/* User's own GPS marker */}
        {userLocation && (
          <Marker 
            longitude={userLocation.longitude} 
            latitude={userLocation.latitude} 
            anchor="center"
          >
            <div className="relative flex justify-center items-center">
              <span className="absolute inline-flex h-8 w-8 rounded-full bg-emerald-500/30 animate-ping"></span>
              <span className="relative inline-flex rounded-full h-4.5 w-4.5 bg-emerald-400 border-2 border-white shadow-[0_0_10px_#10b981]"></span>
            </div>
          </Marker>
        )}

        {/* Render real-time markers for every rider on actual roads */}
        {riders.map((rider) => (
          <Marker 
            key={rider.userId} 
            longitude={rider.lng} 
            latitude={rider.lat} 
            anchor="bottom"
          >
            <div 
              onClick={() => {
                setSelectedRider(rider);
                mapRef.current?.flyTo({ center: [rider.lng, rider.lat], zoom: 14, duration: 1500 });
              }}
              className="flex flex-col items-center cursor-pointer pointer-events-auto group"
            >
              <div className="relative flex justify-center items-center">
                <div className="absolute w-8 h-8 bg-[#3b82f6]/40 rounded-full animate-ping group-hover:bg-[#3b82f6]/60 transition-all" />
                <div className="relative w-4 h-4 bg-white border-2 border-[#3b82f6] rounded-full shadow-[0_0_15px_rgba(59,130,246,0.8)]" />
              </div>
              <div className="mt-2 bg-[#1c1b1d]/85 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 text-[10px] font-bold text-white whitespace-nowrap shadow-lg">
                {rider.name} • {rider.speed} km/h
              </div>
            </div>
          </Marker>
        ))}
      </Map>

      {/* Floating Back Button */}
      <button 
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 z-30 pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center bg-[#201f22]/60 backdrop-blur-md border border-white/10 hover:border-white/25 text-white active:scale-95 transition-all cursor-pointer shadow-lg"
        title="Back to Dashboard"
      >
        <ArrowLeft size={18} />
      </button>

      {/* --- HUD OVERLAY --- */}
      <div className="absolute inset-0 z-10 pointer-events-none p-4 flex flex-col justify-between pb-28">
        
        {/* Top Search Bar */}
        <div className="pointer-events-auto w-full max-w-md mx-auto mt-safe pt-4 pl-12 relative">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-[#8c909f]" />
            </div>
            <label htmlFor="map-search" className="sr-only">Search route or rider</label>
            <input 
              type="text" 
              id="map-search"
              name="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rider..." 
              className="w-full bg-[#201f22]/60 backdrop-blur-xl border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-[#8c909f] shadow-lg focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 transition-all text-sm outline-none"
            />
          </div>

          {/* Search Dropdown Panel */}
          <AnimatePresence>
            {searchQuery.trim() !== '' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-18 left-12 right-0 bg-[#201f22]/95 backdrop-blur-md border border-white/10 rounded-2xl max-h-48 overflow-y-auto z-40 shadow-2xl p-2 flex flex-col gap-1"
              >
                {filteredRiders.length === 0 ? (
                  <div className="text-xs text-gray-500 py-4 text-center">No matching riders found</div>
                ) : (
                  filteredRiders.map((r) => (
                    <button
                      key={r.userId}
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedRider(r);
                        mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 14, duration: 1500 });
                      }}
                      className="flex justify-between items-center px-4 py-3 hover:bg-[#3b82f6]/20 active:bg-[#3b82f6]/30 rounded-xl cursor-pointer text-left text-xs text-white font-medium transition-colors border border-transparent hover:border-white/5"
                    >
                      <span className="font-bold text-white">{r.name}</span>
                      <span className="text-[#3b82f6] font-mono bg-[#3b82f6]/10 px-2 py-0.5 rounded border border-[#3b82f6]/20">{r.speed} km/h</span>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Middle Section: Right Action Buttons */}
        <div className="absolute right-4 top-1/3 flex flex-col gap-4 pointer-events-auto">
          <button 
            onClick={recenterOnUser}
            className="w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border cursor-pointer active:scale-90 transition-all bg-[#201f22]/60 border-white/10 text-white/70 hover:text-white hover:border-white/30"
            title="Recenter on My Location"
          >
            <Crosshair size={20} />
          </button>
          
          <button 
            onClick={cycleMapStyle}
            className="w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border cursor-pointer active:scale-90 transition-all bg-[#201f22]/60 border-white/10 text-white/70 hover:text-white hover:border-white/30 flex-col gap-0.5"
            title={`Toggle Layer: Current (${currentStyleName})`}
          >
            <Layers size={20} />
            <span className="text-[7px] font-bold text-blue-400 leading-none">LAY</span>
          </button>

          <button 
            onClick={resetCompass}
            className="w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border cursor-pointer active:scale-90 transition-all bg-[#201f22]/60 border-white/10 text-white/70 hover:text-white hover:border-white/30"
            title="Reset Compass (North)"
          >
            <Compass size={20} />
          </button>
        </div>

        {/* Sliding Bottom HUD Panels */}
        <div className="pointer-events-auto w-full max-w-md mx-auto mb-2 relative min-h-[96px] flex items-end">
          <AnimatePresence mode="wait">
            
            {/* Case A: Selected Rider Details Drawer */}
            {selectedRider ? (
              <motion.div
                key="rider-drawer"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="w-full bg-[#1c1b1d]/95 backdrop-blur-xl border border-white/15 p-5 rounded-2xl shadow-2xl flex flex-col gap-4 text-white relative overflow-hidden"
              >
                {/* Edge accent */}
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#3b82f6] to-transparent" />
                
                {/* Header info */}
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/10 flex items-center justify-center font-bold text-[#3b82f6] text-sm">
                      {selectedRider.name?.substring(0, 2).toUpperCase() || 'RM'}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white">{selectedRider.name}</h3>
                      <p className="text-[8px] font-mono text-gray-400 uppercase tracking-widest">Active Crew Member</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedRider(null)}
                    className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 hover:text-white transition-all cursor-pointer font-bold text-[10px]"
                    title="Close Details"
                  >
                    ✕
                  </button>
                </div>

                {/* Specs Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#201f22]/60 border border-white/5 p-3 rounded-xl flex flex-col gap-1">
                    <span className="text-[8px] uppercase tracking-wider text-gray-400 font-mono">TELEMETRY</span>
                    <span className="text-xl font-black text-[#3b82f6] font-sans">{selectedRider.speed} <span className="text-xs font-bold text-gray-400">km/h</span></span>
                  </div>
                  <div className="bg-[#201f22]/60 border border-white/5 p-3 rounded-xl flex flex-col gap-1 overflow-hidden">
                    <span className="text-[8px] uppercase tracking-wider text-gray-400 font-mono">GPS COORDINATES</span>
                    <span className="text-[9px] font-bold text-white font-mono truncate">{selectedRider.lat?.toFixed(5)}, {selectedRider.lng?.toFixed(5)}</span>
                  </div>
                </div>

                {/* Drawer Action Triggers */}
                <div className="flex gap-2.5">
                  <button
                    onClick={() => mapRef.current?.flyTo({ center: [selectedRider.lng, selectedRider.lat], zoom: 15, duration: 1200 })}
                    className="flex-1 py-2.5 bg-[#3b82f6] hover:bg-[#3b82f6]/95 text-black hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                  >
                    <Compass size={14} /> Center Map
                  </button>
                  <button
                    onClick={() => {
                      const activeUser = JSON.parse(localStorage.getItem('convoyUser'));
                      const searchParams = new URLSearchParams(window.location.search);
                      const tripId = searchParams.get('trip') || 'demo-trip-room';
                      socketRef.current?.emit('pingRider', {
                        tripId,
                        targetUserId: selectedRider.userId,
                        fromName: activeUser?.name || 'Your teammate',
                        message: `🏍️ ${activeUser?.name || 'A rider'} is calling you on the radar!`
                      });
                      setPingSent(true);
                      setTimeout(() => setPingSent(false), 2000);
                    }}
                    className={`flex-1 py-2.5 border rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                      pingSent
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                        : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'
                    }`}
                  >
                    {pingSent ? '✓ Ping Sent!' : '📡 Ping Device'}
                  </button>
                </div>
              </motion.div>
            ) : (
              /* Case B: Main Telemetry HUD */
              <motion.div 
                key="telemetry-hud"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="w-full bg-[#201f22]/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl relative overflow-hidden flex justify-between items-center text-white"
              >
                {/* Glass edge highlight */}
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#3b82f6]/50 to-transparent" />
                
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#8c909f] mb-1">TELEMETRY</p>
                  <p className="text-3xl font-black text-white">{speed} <span className="text-sm font-bold text-[#3b82f6]">km/h</span></p>
                </div>

                <div className="text-right flex flex-col items-end">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#8c909f] mb-1">Target</span>
                  <div className="flex items-center gap-2 bg-[#3b82f6]/10 px-3 py-1.5 rounded-lg border border-[#3b82f6]/20">
                    <Navigation size={14} className="text-[#3b82f6] transform rotate-45 animate-pulse" />
                    <span className="text-sm font-bold text-white">Gokarna Beach</span>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </div>

      {/* Incoming Ping Toast Notification */}
      <AnimatePresence>
        {incomingPing && (
          <motion.div
            initial={{ y: -80, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -80, opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm bg-[#1c1b1d]/95 backdrop-blur-xl border border-emerald-500/40 rounded-2xl p-4 shadow-[0_0_30px_rgba(16,185,129,0.3)] flex items-start gap-3"
          >
            {/* Pulsing radar icon */}
            <div className="relative shrink-0 mt-0.5">
              <span className="absolute inline-flex h-8 w-8 rounded-full bg-emerald-500/30 animate-ping"></span>
              <span className="relative inline-flex h-8 w-8 rounded-full bg-emerald-500/20 border border-emerald-500/50 items-center justify-center text-base">📡</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-mono font-bold mb-0.5">INCOMING SIGNAL</p>
              <p className="text-xs font-bold text-white leading-snug">{incomingPing.message}</p>
            </div>
            <button
              onClick={() => setIncomingPing(null)}
              className="shrink-0 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer text-[10px] font-bold transition-all"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MapView;
