import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { io } from 'socket.io-client';
import { Navigation, Search, Crosshair, Layers, Compass, ArrowLeft, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';


const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const STYLES = [
  { name: 'Dark Mode',         url: 'mapbox://styles/mapbox/dark-v11' },
  { name: 'Satellite Streets', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
  { name: 'Standard Streets',  url: 'mapbox://styles/mapbox/streets-v12' }
];

// ──────────────────────────────────────────────────────────────────────────────
// Helper: call Mapbox Directions API and return { routeGeoJSON, km, eta, arrival }
// ──────────────────────────────────────────────────────────────────────────────
const getDirections = async (fromLng, fromLat, toLng, toLat) => {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLng},${fromLat};${toLng},${toLat}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`;
  const res  = await fetch(url);
  const json = await res.json();
  if (!json.routes?.length) return null;

  const route       = json.routes[0];
  const durationSec = route.duration;
  const distM       = route.distance;
  const km          = (distM / 1000).toFixed(1);
  const totalMins   = Math.round(durationSec / 60);
  const hrs         = Math.floor(totalMins / 60);
  const mins        = totalMins % 60;
  const etaStr      = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  const arrivalDate = new Date(Date.now() + durationSec * 1000);
  const arrivalStr  = arrivalDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // First step instruction for next turn
  const nextStep    = route.legs?.[0]?.steps?.[0]?.maneuver?.instruction || '';

  return {
    routeGeoJSON: { type: 'Feature', geometry: route.geometry },
    km,
    etaStr,
    arrivalStr,
    nextStep
  };
};

// ──────────────────────────────────────────────────────────────────────────────
const MapView = () => {
  const navigate   = useNavigate();
  const { id: tripId } = useParams(); // /map/:id

  // Core map state
  const [riders,        setRiders]        = useState([]);
  const [speed,         setSpeed]         = useState(0);
  const [userLocation,  setUserLocation]  = useState(null);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [selectedRider, setSelectedRider] = useState(null);
  const [mapStyle,      setMapStyle]      = useState(STYLES[0].url);

  // Ping
  const [incomingPing, setIncomingPing] = useState(null);
  const [pingSent,     setPingSent]     = useState(false);

  // ── Destination (loaded from backend trip)
  const [destination, setDestination] = useState(null); // { name, lat, lng }

  // ── Route to destination (blue)
  const [destRoute,      setDestRoute]      = useState(null);
  const [destEta,        setDestEta]        = useState(null);
  const [destKm,         setDestKm]         = useState(null);
  const [destArrival,    setDestArrival]    = useState(null);
  const [destNextStep,   setDestNextStep]   = useState('');

  // ── Route to selected rider (emerald)
  const [riderRoute,     setRiderRoute]     = useState(null);
  const [riderEta,       setRiderEta]       = useState(null);
  const [riderKm,        setRiderKm]        = useState(null);
  const [riderArrival,   setRiderArrival]   = useState(null);
  const [riderNextStep,  setRiderNextStep]  = useState('');
  const [routingToRider, setRoutingToRider] = useState(false);

  // Refs
  const socketRef          = useRef(null);
  const mapRef             = useRef(null);
  const hasCenteredRef     = useRef(false);
  const lastDestFetchRef   = useRef(0);
  const headingRef         = useRef(0); // last known bearing from GPS

  const [viewState, setViewState] = useState({
    longitude: 75.0078,
    latitude:  15.4589,
    zoom:      12,
    pitch:     45,
    bearing:   0,
  });

  // ── 1. Load trip destination from backend ────────────────────────────────────
  useEffect(() => {
    if (!tripId) return;
    const load = async () => {
      try {
        const res = await axios.get(`/trips/${tripId}`);
        const dest = res.data?.trip?.destination;
        if (dest && typeof dest === 'string' && dest.trim()) {
          // Geocode the destination name → lat/lng via Mapbox Geocoding API
          const geoRes = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(dest)}.json?limit=1&access_token=${MAPBOX_TOKEN}`
          );
          const geoJson = await geoRes.json();
          const [lng, lat] = geoJson.features?.[0]?.center || [];
          if (lat && lng) {
            setDestination({ name: dest, lat, lng });
          }
        }
      } catch (e) {
        console.warn('Could not load trip destination:', e);
      }
    };
    load();
  }, [tripId]);

  // ── 2. Socket + GPS ──────────────────────────────────────────────────────────
  useEffect(() => {
    let backendUrl = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace('/api', '')
      : 'http://localhost:5000';
    if (Capacitor.isNativePlatform()) {
      if (backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1')) {
        backendUrl = backendUrl.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
      }
    }
    socketRef.current = io(backendUrl);


    const searchParams   = new URLSearchParams(window.location.search);
    const activeTripId   = tripId || searchParams.get('trip') || 'demo-trip-room';
    socketRef.current.emit('joinTrip', activeTripId);

    socketRef.current.on('riderMoved', (incoming) => {
      setRiders((prev) => {
        const exists = prev.find(r => r.userId === incoming.userId);
        return exists
          ? prev.map(r => r.userId === incoming.userId ? incoming : r)
          : [...prev, incoming];
      });
    });

    socketRef.current.on('pingReceived', (data) => {
      setIncomingPing(data);
      setTimeout(() => setIncomingPing(null), 5000);
    });

    // GPS watch
    let watchId = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, speed: gpsSpeed, heading } = pos.coords;
          const kmH = gpsSpeed ? Math.round(gpsSpeed * 3.6) : 0;
          setSpeed(kmH);
          setUserLocation({ latitude, longitude });
          if (heading !== null) headingRef.current = heading;

          if (!hasCenteredRef.current) {
            setViewState(prev => ({ ...prev, latitude, longitude }));
            hasCenteredRef.current = true;
          }

          // Refresh destination route every 2 min
          const now = Date.now();
          if (now - lastDestFetchRef.current > 120_000) {
            lastDestFetchRef.current = now;
            // will be called in separate effect once destination is set
            refreshDestRoute(latitude, longitude);
          }

          const activeUser = JSON.parse(localStorage.getItem('convoyUser'));
          if (activeUser) {
            socketRef.current.emit('updateLocation', {
              tripId: activeTripId,
              userId: activeUser.id,
              name:   activeUser.name,
              lat:    latitude,
              lng:    longitude,
              speed:  kmH
            });
          }
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
      );
    }

    return () => {
      socketRef.current?.disconnect();
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // ── 3. Fetch destination route whenever destination or userLocation set ───────
  const refreshDestRoute = useCallback(async (lat, lng) => {
    if (!destination || !lat || !lng) return;
    try {
      const result = await getDirections(lng, lat, destination.lng, destination.lat);
      if (result) {
        setDestRoute(result.routeGeoJSON);
        setDestEta(result.etaStr);
        setDestKm(result.km);
        setDestArrival(result.arrivalStr);
        setDestNextStep(result.nextStep);
      }
    } catch (e) { console.error(e); }
  }, [destination]);

  useEffect(() => {
    if (destination && userLocation) {
      refreshDestRoute(userLocation.latitude, userLocation.longitude);
    }
  }, [destination, userLocation?.latitude, userLocation?.longitude, refreshDestRoute]);

  // ── 4. RECENTER in navigation mode (zoom 17, pitch 60, bearing = GPS heading) ─
  const recenterOnUser = () => {
    const loc = userLocation || { latitude: 15.4589, longitude: 75.0078 };
    mapRef.current?.flyTo({
      center:   [loc.longitude, loc.latitude],
      zoom:     17,
      pitch:    60,
      bearing:  headingRef.current || 0,
      duration: 1500,
    });
  };

  // ── 5. Route to a rider ───────────────────────────────────────────────────────
  const routeToRider = async (rider) => {
    if (!userLocation) return;
    setRoutingToRider(true);
    setRiderRoute(null);
    setRiderEta(null);
    try {
      const result = await getDirections(
        userLocation.longitude, userLocation.latitude,
        rider.lng, rider.lat
      );
      if (result) {
        setRiderRoute(result.routeGeoJSON);
        setRiderEta(result.etaStr);
        setRiderKm(result.km);
        setRiderArrival(result.arrivalStr);
        setRiderNextStep(result.nextStep);
      }
    } catch (e) { console.error(e); }
    setRoutingToRider(false);
  };

  // When selecting a rider: open drawer + fetch route to them
  const handleSelectRider = (rider) => {
    setSelectedRider(rider);
    mapRef.current?.flyTo({ center: [rider.lng, rider.lat], zoom: 15, duration: 1500 });
    routeToRider(rider);
  };

  // Clear rider selection + rider route
  const clearRider = () => {
    setSelectedRider(null);
    setRiderRoute(null);
    setRiderEta(null);
    setRiderKm(null);
    setRiderArrival(null);
    setRiderNextStep('');
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const cycleMapStyle = () => {
    const idx = STYLES.findIndex(s => s.url === mapStyle);
    setMapStyle(STYLES[(idx + 1) % STYLES.length].url);
  };

  const resetCompass = () => {
    setViewState(prev => ({ ...prev, bearing: 0, pitch: 0 }));
  };

  const filteredRiders = searchQuery.trim() === ''
    ? []
    : riders.filter(r => r.name?.toLowerCase().includes(searchQuery.toLowerCase()));

  const currentStyleName = STYLES.find(s => s.url === mapStyle)?.name || 'Map Style';

  // Active next turn: rider route overrides destination route when a rider is selected
  const activeNextStep = selectedRider ? riderNextStep : destNextStep;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-screen relative bg-[#131315] select-none text-[#e5e1e4] overflow-hidden">

      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        {/* ── DESTINATION route (blue) — only when trip has a destination ── */}
        {destRoute && !selectedRider && (
          <Source id="dest-route" type="geojson" data={destRoute}>
            <Layer id="dest-route-glow" type="line"
              paint={{ 'line-color': '#3b82f6', 'line-width': 10, 'line-opacity': 0.18, 'line-blur': 4 }}
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            />
            <Layer id="dest-route-line" type="line"
              paint={{ 'line-color': '#60a5fa', 'line-width': 4, 'line-opacity': 0.95 }}
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            />
          </Source>
        )}

        {/* ── RIDER route (emerald) — shown while a rider is selected ── */}
        {riderRoute && (
          <Source id="rider-route" type="geojson" data={riderRoute}>
            <Layer id="rider-route-glow" type="line"
              paint={{ 'line-color': '#10b981', 'line-width': 10, 'line-opacity': 0.18, 'line-blur': 4 }}
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            />
            <Layer id="rider-route-line" type="line"
              paint={{ 'line-color': '#34d399', 'line-width': 4, 'line-opacity': 0.95 }}
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            />
          </Source>
        )}

        {/* ── DESTINATION pin — only when destination loaded ── */}
        {destination && (
          <Marker longitude={destination.lng} latitude={destination.lat} anchor="bottom">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-red-500/20 border-2 border-red-400 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse">
                <span className="text-sm">📍</span>
              </div>
              <div className="mt-1 bg-[#1c1b1d]/90 backdrop-blur-md px-2 py-0.5 rounded-lg border border-red-500/20 text-[9px] font-bold text-red-300 whitespace-nowrap">
                {destination.name}
              </div>
            </div>
          </Marker>
        )}

        {/* ── USER GPS marker ── */}
        {userLocation && (
          <Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="center">
            <div className="relative flex justify-center items-center">
              <span className="absolute inline-flex h-8 w-8 rounded-full bg-emerald-500/30 animate-ping" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-400 border-2 border-white shadow-[0_0_10px_#10b981]" />
            </div>
          </Marker>
        )}

        {/* ── RIDER markers ── */}
        {riders.map((rider) => (
          <Marker key={rider.userId} longitude={rider.lng} latitude={rider.lat} anchor="bottom">
            <div
              onClick={() => handleSelectRider(rider)}
              className="flex flex-col items-center cursor-pointer pointer-events-auto group"
            >
              <div className="relative flex justify-center items-center">
                <div className="absolute w-8 h-8 bg-[#3b82f6]/40 rounded-full animate-ping group-hover:bg-[#3b82f6]/60 transition-all" />
                <div className={`relative w-4 h-4 border-2 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.8)] transition-all ${selectedRider?.userId === rider.userId ? 'bg-emerald-400 border-emerald-300' : 'bg-white border-[#3b82f6]'}`} />
              </div>
              <div className="mt-2 bg-[#1c1b1d]/85 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 text-[10px] font-bold text-white whitespace-nowrap shadow-lg">
                {rider.name} • {rider.speed} km/h
              </div>
            </div>
          </Marker>
        ))}
      </Map>

      {/* ── BACK BUTTON ── */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 z-30 pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center bg-[#201f22]/60 backdrop-blur-md border border-white/10 hover:border-white/25 text-white active:scale-95 transition-all cursor-pointer shadow-lg"
        title="Back to Dashboard"
      >
        <ArrowLeft size={18} />
      </button>

      {/* ── NEXT TURN BANNER (like Google Maps) ── */}
      <AnimatePresence>
        {activeNextStep && (
          <motion.div
            key="next-turn"
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-[#1c1b1d]/95 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-3 shadow-2xl max-w-xs w-[90%]"
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${selectedRider ? 'bg-emerald-500/20 border border-emerald-500/40' : 'bg-[#3b82f6]/20 border border-[#3b82f6]/40'}`}>
              ↗
            </div>
            <p className="text-xs font-semibold text-white leading-snug line-clamp-2">{activeNextStep}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HUD OVERLAY ── */}
      <div className="absolute inset-0 z-10 pointer-events-none p-4 flex flex-col justify-between pb-28">

        {/* Search bar */}
        <div className="pointer-events-auto w-full max-w-md mx-auto mt-safe pt-4 pl-12 relative">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-[#8c909f]" />
            </div>
            <label htmlFor="map-search" className="sr-only">Search rider</label>
            <input
              type="text"
              id="map-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rider..."
              className="w-full bg-[#201f22]/60 backdrop-blur-xl border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-[#8c909f] shadow-lg focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 transition-all text-sm outline-none"
            />
          </div>

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
                      onClick={() => { setSearchQuery(''); handleSelectRider(r); }}
                      className="flex justify-between items-center px-4 py-3 hover:bg-[#3b82f6]/20 active:bg-[#3b82f6]/30 rounded-xl cursor-pointer text-left text-xs text-white font-medium transition-colors border border-transparent hover:border-white/5"
                    >
                      <span className="font-bold">{r.name}</span>
                      <span className="text-[#3b82f6] font-mono bg-[#3b82f6]/10 px-2 py-0.5 rounded border border-[#3b82f6]/20">{r.speed} km/h</span>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right-side controls */}
        <div className="absolute right-4 top-1/3 flex flex-col gap-4 pointer-events-auto">
          <button
            onClick={recenterOnUser}
            className="w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border cursor-pointer active:scale-90 transition-all bg-[#201f22]/60 border-white/10 text-white/70 hover:text-white hover:border-white/30"
            title="Navigation Mode"
          >
            <Crosshair size={20} />
          </button>

          <button
            onClick={cycleMapStyle}
            className="w-12 h-12 rounded-full flex flex-col items-center justify-center backdrop-blur-md border cursor-pointer active:scale-90 transition-all bg-[#201f22]/60 border-white/10 text-white/70 hover:text-white hover:border-white/30 gap-0.5"
            title={`Layer: ${currentStyleName}`}
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

        {/* ── BOTTOM HUD ── */}
        <div className="pointer-events-auto w-full max-w-md mx-auto mb-2 relative min-h-[96px] flex items-end">
          <AnimatePresence mode="wait">

            {/* A: Selected Rider Drawer */}
            {selectedRider ? (
              <motion.div
                key="rider-drawer"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="w-full bg-[#1c1b1d]/95 backdrop-blur-xl border border-white/15 p-5 rounded-2xl shadow-2xl flex flex-col gap-4 text-white relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />

                {/* Header */}
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center font-bold text-emerald-400 text-sm">
                      {selectedRider.name?.substring(0, 2).toUpperCase() || 'RM'}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white">{selectedRider.name}</h3>
                      <p className="text-[8px] font-mono text-gray-400 uppercase tracking-widest">
                        {routingToRider ? '⏳ Calculating route...' : riderEta ? `${riderKm} km • Arrive ${riderArrival}` : 'Active Crew Member'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={clearRider}
                    className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 hover:text-white transition-all cursor-pointer font-bold text-[10px]"
                  >
                    ✕
                  </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#201f22]/60 border border-white/5 p-3 rounded-xl flex flex-col gap-1">
                    <span className="text-[8px] uppercase tracking-wider text-gray-400 font-mono">TELEMETRY</span>
                    <span className="text-xl font-black text-emerald-400 font-sans">{selectedRider.speed} <span className="text-xs font-bold text-gray-400">km/h</span></span>
                  </div>
                  <div className="bg-[#201f22]/60 border border-white/5 p-3 rounded-xl flex flex-col gap-1">
                    <span className="text-[8px] uppercase tracking-wider text-gray-400 font-mono">
                      {riderEta ? 'ETA' : 'GPS COORDS'}
                    </span>
                    {riderEta ? (
                      <span className="text-xl font-black text-emerald-400">{riderEta}</span>
                    ) : (
                      <span className="text-[9px] font-bold text-white font-mono truncate">
                        {selectedRider.lat?.toFixed(5)}, {selectedRider.lng?.toFixed(5)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2.5">
                  <button
                    onClick={() => routeToRider(selectedRider)}
                    className="flex-1 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                  >
                    <Navigation size={13} /> Navigate to Rider
                  </button>
                  <button
                    onClick={() => {
                      const activeUser = JSON.parse(localStorage.getItem('convoyUser'));
                      const searchParams = new URLSearchParams(window.location.search);
                      const tId = tripId || searchParams.get('trip') || 'demo-trip-room';
                      socketRef.current?.emit('pingRider', {
                        tripId: tId,
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
              /* B: Main Telemetry HUD */
              <motion.div
                key="telemetry-hud"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="w-full bg-[#201f22]/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl relative overflow-hidden flex justify-between items-center text-white"
              >
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#3b82f6]/50 to-transparent" />

                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#8c909f] mb-1">TELEMETRY</p>
                  <p className="text-3xl font-black text-white">{speed} <span className="text-sm font-bold text-[#3b82f6]">km/h</span></p>
                </div>

                <div className="text-right flex flex-col items-end gap-1.5">
                  {destination ? (
                    <>
                      <div className="flex items-center gap-2 bg-[#3b82f6]/10 px-3 py-1.5 rounded-lg border border-[#3b82f6]/20">
                        <Navigation size={13} className="text-[#3b82f6] transform rotate-45 animate-pulse shrink-0" />
                        <span className="text-xs font-bold text-white truncate max-w-[120px]">{destination.name}</span>
                      </div>
                      {destEta ? (
                        <div className="text-right">
                          <p className="text-[18px] font-black text-[#3b82f6] leading-none">{destEta}</p>
                          <p className="text-[9px] text-gray-400 font-mono mt-0.5">
                            {destKm} km · Arrive {destArrival}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[9px] text-gray-500 font-mono animate-pulse">Calculating route...</p>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                      <Navigation size={13} className="text-gray-500 shrink-0" />
                      <span className="text-xs text-gray-500">No destination set</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* ── INCOMING PING TOAST ── */}
      <AnimatePresence>
        {incomingPing && (
          <motion.div
            initial={{ y: -80, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -80, opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm bg-[#1c1b1d]/95 backdrop-blur-xl border border-emerald-500/40 rounded-2xl p-4 shadow-[0_0_30px_rgba(16,185,129,0.3)] flex items-start gap-3"
          >
            <div className="relative shrink-0 mt-0.5">
              <span className="absolute inline-flex h-8 w-8 rounded-full bg-emerald-500/30 animate-ping" />
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
