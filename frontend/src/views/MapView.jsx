import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { io } from 'socket.io-client';
import { Navigation, Search, Crosshair, Layers, Compass, ArrowLeft, X, AlertTriangle, Wifi, Activity, Users, Locate, Battery } from 'lucide-react';
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
// Helpers for Web Audio API Audio and Siren
// ──────────────────────────────────────────────────────────────────────────────
const getHaversineDistance = (coords1, coords2) => {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371; // Earth's radius in km
  const dLat = toRad(coords2.latitude - coords1.latitude);
  const dLng = toRad(coords2.longitude - coords1.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coords1.latitude)) *
      Math.cos(toRad(coords2.latitude)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const playBeep = (freq = 800, type = 'sine', duration = 0.15) => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.error('AudioContext beep failed:', e);
  }
};

let sirenAudioContext = null;
let sirenOscillator = null;
let sirenGainNode = null;
let sirenLfo = null;

const startSiren = () => {
  if (sirenAudioContext) return; // already playing
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    sirenAudioContext = new AudioContextClass();
    
    sirenOscillator = sirenAudioContext.createOscillator();
    sirenOscillator.type = 'sawtooth';
    sirenOscillator.frequency.setValueAtTime(600, sirenAudioContext.currentTime);
    
    sirenLfo = sirenAudioContext.createOscillator();
    sirenLfo.type = 'sine';
    sirenLfo.frequency.setValueAtTime(2, sirenAudioContext.currentTime); // 2Hz wail
    
    const lfoGain = sirenAudioContext.createGain();
    lfoGain.gain.setValueAtTime(150, sirenAudioContext.currentTime);
    
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOscillator.frequency);
    
    sirenGainNode = sirenAudioContext.createGain();
    sirenGainNode.gain.setValueAtTime(0.25, sirenAudioContext.currentTime);
    
    sirenOscillator.connect(sirenGainNode);
    sirenGainNode.connect(sirenAudioContext.destination);
    
    sirenOscillator.start();
    sirenLfo.start();
  } catch (e) {
    console.error('Failed to play synthetic siren:', e);
  }
};

const stopSiren = () => {
  try {
    if (sirenOscillator) {
      sirenOscillator.stop();
      sirenOscillator.disconnect();
      sirenOscillator = null;
    }
    if (sirenLfo) {
      sirenLfo.stop();
      sirenLfo.disconnect();
      sirenLfo = null;
    }
    if (sirenAudioContext) {
      sirenAudioContext.close();
      sirenAudioContext = null;
    }
  } catch (e) {
    console.error('Failed to stop siren:', e);
  }
};


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

  // ── Upgraded features states
  const [pois,          setPois]          = useState([]); // Waze-style hazards
  const [showCrewPanel, setShowCrewPanel] = useState(false);
  const [poiMenuOpen,   setPoiMenuOpen]   = useState(false);
  const [followRider,   setFollowRider]   = useState(false); // Follow-cam for selected rider

  // Odometer & Trip duration states
  const [rideDistance,  setRideDistance]  = useState(0);
  const [rideDuration,  setRideDuration]  = useState(0);
  const [incomingSOS,   setIncomingSOS]   = useState(null);

  // Real-world telemetry states
  const [gpsAccuracy,   setGpsAccuracy]   = useState(null);
  const [gpsHeading,    setGpsHeading]    = useState(null);
  const [deviceBattery, setDeviceBattery] = useState(null);

  // Real device battery monitor
  useEffect(() => {
    if (navigator.getBattery) {
      navigator.getBattery().then((battery) => {
        setDeviceBattery(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => {
          setDeviceBattery(Math.round(battery.level * 100));
        });
      });
    }
  }, []);

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const avgSpeed = rideDuration > 0 ? Math.round((rideDistance / (rideDuration / 3600))) : 0;

  const getCompassDirection = (deg) => {
    if (deg === null || deg === undefined || isNaN(deg)) return 'N';
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(((deg % 360) / 22.5)) % 16;
    return directions[index];
  };

  // Refs
  const socketRef        = useRef(null);
  const mapRef           = useRef(null);
  const hasCenteredRef   = useRef(false);
  const lastDestFetchRef = useRef(0);
  const headingRef       = useRef(0); // last known bearing from GPS
  const prevRiderPosRef  = useRef(null); // for computing bearing in follow-cam

  // Ride Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setRideDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch active hazards from backend on mount
  useEffect(() => {
    if (!tripId || tripId === 'live') return;
    const loadPois = async () => {
      try {
        const res = await axios.get(`/trips/${tripId}/pois`);
        setPois(res.data);
      } catch (err) {
        console.warn('Could not load POIs from backend:', err);
      }
    };
    loadPois();
  }, [tripId]);

  // Clean-up expired POIs periodically (5 minutes lifetime)
  useEffect(() => {
    const interval = setInterval(() => {
      const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
      setPois((prev) => prev.filter(p => new Date(p.timestamp).getTime() > fiveMinsAgo));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleReportPOI = async (type) => {
    if (!userLocation) return;
    const activeUser = JSON.parse(localStorage.getItem('convoyUser'));
    const searchParams = new URLSearchParams(window.location.search);
    const activeTripId = tripId || searchParams.get('trip') || 'demo-trip-room';

    const tempId = `${activeUser?.id || 'anon'}-${Date.now()}`;
    const newPOI = {
      id: tempId,
      type,
      lat: userLocation.latitude,
      lng: userLocation.longitude,
      reportedBy: activeUser?.name || 'Teammate',
      timestamp: Date.now()
    };

    if (tripId && tripId !== 'live') {
      try {
        const res = await axios.post(`/trips/${tripId}/pois`, newPOI);
        const savedPoi = res.data;
        setPois(prev => [...prev, savedPoi]);
        if (socketRef.current) {
          socketRef.current.emit('reportPOI', {
            tripId: activeTripId,
            ...savedPoi,
            id: savedPoi._id
          });
        }
      } catch (err) {
        console.error('Failed to save POI:', err);
        setPois(prev => [...prev, newPOI]);
        if (socketRef.current) {
          socketRef.current.emit('reportPOI', {
            tripId: activeTripId,
            ...newPOI
          });
        }
      }
    } else {
      setPois(prev => [...prev, newPOI]);
      if (socketRef.current) {
        socketRef.current.emit('reportPOI', {
          tripId: activeTripId,
          ...newPOI
        });
      }
    }

    setPoiMenuOpen(false);
  };

  const handleDeletePOI = async (poiId) => {
    if (!window.confirm("Remove this hazard/POI marker?")) return;
    setPois(prev => prev.filter(p => p.id !== poiId && p._id !== poiId));

    const activeTripId = tripId || new URLSearchParams(window.location.search).get('trip') || 'demo-trip-room';
    if (socketRef.current) {
      socketRef.current.emit('deletePOI', {
        tripId: activeTripId,
        poiId
      });
    }

    if (tripId && tripId !== 'live') {
      try {
        await axios.delete(`/trips/${tripId}/pois/${poiId}`);
      } catch (err) {
        console.error('Failed to delete POI:', err);
      }
    }
  };

  const handleTriggerSOS = () => {
    if (!window.confirm("🚨 WARNING: Are you sure you want to broadcast an emergency SOS alert to all convoy riders?")) return;
    
    const activeUser = JSON.parse(localStorage.getItem('convoyUser'));
    const searchParams = new URLSearchParams(window.location.search);
    const activeTripId = tripId || searchParams.get('trip') || 'demo-trip-room';

    if (socketRef.current) {
      socketRef.current.emit('sosAlert', {
        tripId: activeTripId,
        userId: activeUser?.id || 'anon',
        name: activeUser?.name || 'Convoy Pilot',
        lat: userLocation?.latitude || 15.4589,
        lng: userLocation?.longitude || 75.0078
      });
    }
  };

  const [viewState, setViewState] = useState({
    longitude: 75.0078,
    latitude:  15.4589,
    zoom:      12,
    pitch:     45,
    bearing:   0,
  });

  // ── 1. Load trip destination from backend ────────────────────────────────────
  useEffect(() => {
    if (!tripId || tripId === 'live') return;
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

  const [locationError, setLocationError] = useState(null);

  // ── 2. Socket + GPS ──────────────────────────────────────────────────────────
  useEffect(() => {
    let backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace('/api', '')
      : 'http://localhost:5000');
    if (Capacitor.isNativePlatform()) {
      const currentIP = import.meta.env.VITE_LOCAL_IP || '10.0.2.2';
      if (backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1')) {
        backendUrl = backendUrl.replace('localhost', currentIP).replace('127.0.0.1', currentIP);
      }
    }

    socketRef.current = io(backendUrl, { timeout: 10000 });

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
      const activeUser = JSON.parse(localStorage.getItem('convoyUser'));
      if (data.targetUserId === activeUser?.id) {
        playBeep(880, 'sine', 0.15);
        setIncomingPing(data);
        setTimeout(() => setIncomingPing(null), 5000);
      }
    });

    socketRef.current.on('poiReceived', (incomingPOI) => {
      playBeep(440, 'triangle', 0.2);
      setPois((prev) => {
        const exists = prev.find(p => p.id === incomingPOI.id || p._id === incomingPOI._id || (incomingPOI._id && p.id === incomingPOI._id) || (p._id && p._id === incomingPOI.id));
        if (exists) return prev;
        return [...prev, incomingPOI];
      });
    });

    socketRef.current.on('poiDeleted', ({ poiId }) => {
      setPois((prev) => prev.filter(p => p.id !== poiId && p._id !== poiId));
    });

    socketRef.current.on('sosReceived', (data) => {
      setIncomingSOS(data);
      startSiren();
    });

    // GPS watch
    let watchId = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, speed: gpsSpeed, heading, accuracy } = pos.coords;
          const kmH = gpsSpeed ? Math.round(gpsSpeed * 3.6) : 0;
          setSpeed(kmH);
          setGpsAccuracy(accuracy);
          if (heading !== null && heading !== undefined) {
            setGpsHeading(heading);
            headingRef.current = heading;
          }
          
          setUserLocation((prev) => {
            const next = { latitude, longitude };
            if (prev) {
              const dist = getHaversineDistance(prev, next);
              // Only add if user actually moved a significant amount (e.g. > 2 meters to filter GPS jitter)
              if (dist > 0.002) {
                setRideDistance((d) => d + dist);
              }
            }
            return next;
          });
          setLocationError(null);

          if (!hasCenteredRef.current) {
            setViewState(prev => ({ ...prev, latitude, longitude }));
            hasCenteredRef.current = true;
          }

          // Refresh destination route every 2 min
          const now = Date.now();
          if (now - lastDestFetchRef.current > 120_000) {
            lastDestFetchRef.current = now;
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
        (err) => {
          console.error('Geolocation Error:', err);
          setLocationError('Please enable GPS/Location access');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    } else {
      setLocationError('Geolocation not supported on this device');
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

  // When selecting a rider: enable follow-cam + fetch route to them
  const handleSelectRider = (rider) => {
    prevRiderPosRef.current = null;
    setSelectedRider(rider);
    setFollowRider(true);
    mapRef.current?.flyTo({
      center:   [rider.lng, rider.lat],
      zoom:     16,
      pitch:    55,
      duration: 1500
    });
    routeToRider(rider);
  };

  // Clear rider selection + rider route + follow-cam
  const clearRider = () => {
    setFollowRider(false);
    prevRiderPosRef.current = null;
    setSelectedRider(null);
    setRiderRoute(null);
    setRiderEta(null);
    setRiderKm(null);
    setRiderArrival(null);
    setRiderNextStep('');
  };

  // ── Follow-cam: smoothly pan/rotate map to track selected rider ─────────────
  useEffect(() => {
    if (!followRider || !selectedRider) return;

    const riderLng = selectedRider.lng;
    const riderLat = selectedRider.lat;

    // Compute bearing from last known position
    let bearing = headingRef.current;
    if (prevRiderPosRef.current) {
      const { lat: pLat, lng: pLng } = prevRiderPosRef.current;
      const dy = riderLat - pLat;
      const dx = riderLng - pLng;
      if (Math.abs(dx) > 1e-7 || Math.abs(dy) > 1e-7) {
        bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
        if (bearing < 0) bearing += 360;
      }
    }
    prevRiderPosRef.current = { lat: riderLat, lng: riderLng };

    mapRef.current?.easeTo({
      center:   [riderLng, riderLat],
      bearing,
      zoom:     16,
      pitch:    55,
      duration: 800,
      easing:   (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t, // ease-in-out
    });
  }, [selectedRider?.lat, selectedRider?.lng, followRider]);

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

        {/* ── HAZARD/POI markers ── */}
        {pois.map((poi) => {
          const timestampMs = poi.timestamp ? new Date(poi.timestamp).getTime() : Date.now();
          const timeLeftMins = Math.max(0, Math.round((5 * 60 * 1000 - (Date.now() - timestampMs)) / 60000));
          return (
            <Marker key={poi.id || poi._id} longitude={poi.lng} latitude={poi.lat} anchor="bottom">
              <div className="flex flex-col items-center select-none pointer-events-auto">
                <div className="relative flex justify-center items-center">
                  <div className={`absolute w-10 h-10 rounded-full animate-ping ${
                    poi.type === 'police' ? 'bg-blue-500/30' :
                    poi.type === 'traffic' ? 'bg-amber-500/30' :
                    poi.type === 'fuel' ? 'bg-cyan-500/30' : 'bg-red-500/30'
                  }`} />
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm shadow-lg ${
                    poi.type === 'police' ? 'bg-[#1e293b]/95 border-blue-500 text-blue-400' :
                    poi.type === 'traffic' ? 'bg-[#1e293b]/95 border-amber-500 text-amber-400' :
                    poi.type === 'fuel' ? 'bg-[#1e293b]/95 border-cyan-500 text-cyan-400' :
                    'bg-[#1e293b]/95 border-red-500 text-red-400'
                  }`}>
                    {poi.type === 'police' ? '👮' :
                     poi.type === 'traffic' ? '🚗' :
                     poi.type === 'fuel' ? '⛽' : '🚧'}
                  </div>
                </div>
                <div className="mt-1 bg-[#1c1b1d]/90 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/10 text-[8px] text-gray-300 font-bold whitespace-nowrap shadow flex items-center gap-1.5">
                  <span>{poi.reportedBy} • {timeLeftMins}m left</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePOI(poi.id || poi._id);
                    }}
                    className="w-3.5 h-3.5 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white rounded-full flex items-center justify-center text-[9px] font-black cursor-pointer transition-colors border border-red-500/20"
                    title="Remove hazard"
                  >
                    ×
                  </button>
                </div>
              </div>
            </Marker>
          );
        })}
      </Map>

      {/* ── BACK BUTTON ── */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 z-25 pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center bg-[#201f22]/60 backdrop-blur-md border border-white/10 hover:border-white/25 text-white active:scale-95 transition-all cursor-pointer shadow-lg"
        title="Back to Dashboard"
      >
        <ArrowLeft size={18} />
      </button>

      {/* ── CREW SIDEBAR TOGGLE BUTTON ── */}
      <button
        onClick={() => setShowCrewPanel(!showCrewPanel)}
        className="absolute top-6 left-20 z-25 pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center bg-[#201f22]/60 backdrop-blur-md border border-white/10 hover:border-white/25 text-white active:scale-95 transition-all cursor-pointer shadow-lg"
        title="Crew Telemetry Sidebar"
      >
        <Users size={18} />
        {riders.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-blue-500 text-[8px] font-black text-white h-4 w-4 rounded-full flex items-center justify-center border border-[#131315]">
            {riders.length}
          </span>
        )}
      </button>



      {/* ── NEXT TURN BANNER (like Google Maps) ── */}
      <AnimatePresence>
        {activeNextStep && searchQuery.trim() === '' && (
          <motion.div
            key="next-turn"
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-[#1c1b1d]/95 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-3 shadow-2xl max-w-xs w-[90%]"
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${selectedRider ? 'bg-emerald-500/20 border border-emerald-500/40' : 'bg-[#3b82f6]/20 border border-[#3b82f6]/40'}`}>
              ↗
            </div>
            <p className="text-xs font-semibold text-white leading-snug line-clamp-2">{activeNextStep}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── RIDE STATS HUD ── */}
      <div className="absolute top-20 right-6 z-30 bg-[#1c1b1d]/90 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-xl max-w-xs w-72 flex flex-col gap-2.5 pointer-events-auto">
        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
          <Activity size={16} className="text-[#3b82f6] animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-[#3b82f6] font-mono">Ride Statistics</span>
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center p-2 bg-white/5 rounded-xl border border-white/5">
            <span className="text-[8px] uppercase tracking-wider text-gray-400 font-mono">Distance</span>
            <span className="text-xs font-black text-white mt-1">{rideDistance.toFixed(2)} <span className="text-[8px] font-normal text-gray-400">km</span></span>
          </div>
          <div className="flex flex-col items-center p-2 bg-white/5 rounded-xl border border-white/5">
            <span className="text-[8px] uppercase tracking-wider text-gray-400 font-mono">Duration</span>
            <span className="text-xs font-black text-white mt-1">{(() => {
              const hrs = Math.floor(rideDuration / 3600);
              const mins = Math.floor((rideDuration % 3600) / 60);
              const secs = rideDuration % 60;
              const pad = (n) => String(n).padStart(2, '0');
              return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
            })()}</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-white/5 rounded-xl border border-white/5">
            <span className="text-[8px] uppercase tracking-wider text-gray-400 font-mono">Avg Speed</span>
            <span className="text-xs font-black text-white mt-1">
              {rideDuration > 0 ? (rideDistance / (rideDuration / 3600)).toFixed(1) : '0.0'} <span className="text-[8px] font-normal text-gray-400">km/h</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── COLLAPSIBLE CREW TELEMETRY SIDEBAR ── */}
      <AnimatePresence>
        {showCrewPanel && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCrewPanel(false)}
              className="absolute inset-0 bg-black/60 z-50 pointer-events-auto"
            />

            {/* Sidebar drawer */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="absolute top-0 left-0 h-screen w-80 bg-[#1c1b1d]/95 backdrop-blur-xl border-r border-white/10 z-55 p-6 flex flex-col text-white pointer-events-auto"
            >
              {/* Header */}
              <div className="flex justify-between items-center border-b border-white/5 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <Activity size={18} className="text-emerald-400 animate-pulse" />
                  <span className="font-bold text-sm uppercase tracking-wider">Convoy Radar Crew</span>
                </div>
                <button
                  onClick={() => setShowCrewPanel(false)}
                  className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Members List */}
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
                {/* User Self Card */}
                <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl flex flex-col gap-2 relative overflow-hidden">
                  <div className="absolute top-0 right-0 px-2 py-0.5 bg-blue-500/20 text-[7px] font-black uppercase tracking-widest text-blue-400 rounded-bl border-l border-b border-blue-500/20">
                    You (Pilot)
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full border border-blue-500/30 bg-blue-500/10 flex items-center justify-center font-black text-blue-400 text-sm">
                      {JSON.parse(localStorage.getItem('convoyUser'))?.name?.substring(0, 2).toUpperCase() || 'ME'}
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-white">{JSON.parse(localStorage.getItem('convoyUser'))?.name || 'You'}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Wifi size={10} className="text-emerald-400" />
                        <span className="text-[9px] font-mono text-gray-400">Lat: {userLocation?.latitude?.toFixed(4) || '—'}, Lng: {userLocation?.longitude?.toFixed(4) || '—'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-[#131315]/50 border border-white/5 px-3 py-1.5 rounded-xl mt-1">
                    <span className="text-[9px] font-mono text-gray-400 uppercase">Speed</span>
                    <span className="text-sm font-black text-emerald-400">
                      {speed} km/h
                    </span>
                  </div>
                </div>

                {/* Other Riders */}
                <div className="text-[10px] uppercase font-mono tracking-widest text-gray-400 mb-1 mt-2">Active Teammates ({riders.length})</div>
                {riders.length === 0 ? (
                  <div className="text-xs text-gray-500 text-center py-6">No other riders on radar. Share this trip frequency to join up!</div>
                ) : (
                  riders.map((r) => {
                    const randomPing = Math.floor(Math.random() * 20) + 15; // mock ping latency 15-35ms
                    return (
                      <div key={r.userId} className="bg-white/[0.03] border border-white/5 hover:border-white/10 p-3 rounded-2xl flex flex-col gap-2.5 transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full border border-gray-500/20 bg-gray-500/10 flex items-center justify-center font-bold text-gray-300 text-xs">
                              {r.name?.substring(0, 2).toUpperCase() || 'R'}
                            </div>
                            <div>
                              <h4 className="font-bold text-xs text-white">{r.name}</h4>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Wifi size={10} className={randomPing < 25 ? 'text-emerald-400' : 'text-amber-400'} />
                                <span className="text-[8px] font-mono text-gray-400">Ping: {randomPing} ms</span>
                              </div>
                            </div>
                          </div>
                          <span className={`text-xs font-mono font-black px-2 py-0.5 rounded border ${
                            r.speed === 0 ? 'bg-white/5 border-white/10 text-gray-400' :
                            'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          }`}>
                            {r.speed} km/h
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSelectRider(r)}
                            className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                          >
                            <Compass size={11} /> Locate
                          </button>
                          <button
                            onClick={() => {
                              const activeUser = JSON.parse(localStorage.getItem('convoyUser'));
                              const searchParams = new URLSearchParams(window.location.search);
                              const tId = tripId || searchParams.get('trip') || 'demo-trip-room';
                              socketRef.current?.emit('pingRider', {
                                tripId: tId,
                                targetUserId: r.userId,
                                fromName: activeUser?.name || 'Your teammate',
                                message: `🏍️ ${activeUser?.name || 'A rider'} is calling you on the radar!`
                              });
                            }}
                            className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                          >
                            📡 Ping
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── HAZARD REPORT MENU ── */}
      <div className="absolute right-4 bottom-28 z-25 pointer-events-auto flex flex-col items-end gap-3">
        <AnimatePresence>
          {poiMenuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              className="bg-[#1c1b1d]/95 backdrop-blur-md border border-orange-500/30 p-4 rounded-2xl shadow-[0_0_20px_rgba(249,115,22,0.3)] w-64 flex flex-col gap-3"
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-[10px] uppercase tracking-wider font-bold text-orange-400 flex items-center gap-1">
                  ⚠️ Report Hazard / POI
                </span>
                <button 
                  onClick={() => setPoiMenuOpen(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleReportPOI('traffic')}
                  className="p-3 bg-[#201f22] hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/30 rounded-xl flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-xs text-[#e5e1e4] font-medium"
                >
                  <span className="text-xl">🚗</span>
                  <span>Traffic</span>
                </button>
                <button
                  onClick={() => handleReportPOI('police')}
                  className="p-3 bg-[#201f22] hover:bg-blue-500/10 border border-white/5 hover:border-blue-500/30 rounded-xl flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-xs text-[#e5e1e4] font-medium"
                >
                  <span className="text-xl">👮</span>
                  <span>Police</span>
                </button>
                <button
                  onClick={() => handleReportPOI('blockage')}
                  className="p-3 bg-[#201f22] hover:bg-red-500/10 border border-white/5 hover:border-red-500/30 rounded-xl flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-xs text-[#e5e1e4] font-medium"
                >
                  <span className="text-xl">🚧</span>
                  <span>Hazard</span>
                </button>
                <button
                  onClick={() => handleReportPOI('fuel')}
                  className="p-3 bg-[#201f22] hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/30 rounded-xl flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-xs text-[#e5e1e4] font-medium"
                >
                  <span className="text-xl">⛽</span>
                  <span>Fuel</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── EMERGENCY SOS BUTTON ── */}
        <button
          onClick={handleTriggerSOS}
          className="w-12 h-12 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.5)] active:scale-90 transition-all border border-red-500/40 bg-red-600 hover:bg-red-500 text-white animate-pulse"
          title="Trigger Emergency SOS"
        >
          <span className="text-base font-bold">🆘</span>
        </button>

        <button
          onClick={() => setPoiMenuOpen(!poiMenuOpen)}
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all border ${
            poiMenuOpen 
              ? 'bg-orange-500 text-white border-orange-400' 
              : 'bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30'
          }`}
          title="Report convoy hazard"
        >
          <AlertTriangle size={20} className={poiMenuOpen ? '' : 'animate-bounce'} />
        </button>
      </div>

      {/* ── HUD OVERLAY ── */}
      <div className="absolute inset-0 z-30 pointer-events-none p-4 flex flex-col justify-between pb-28">

        {/* Search bar */}
        <div className="pointer-events-auto w-full max-w-md mx-auto mt-safe pt-4 pl-40 relative">
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
                className="absolute top-18 left-40 right-0 bg-[#201f22]/95 backdrop-blur-md border border-white/10 rounded-2xl max-h-48 overflow-y-auto z-40 shadow-2xl p-2 flex flex-col gap-1"
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
                className="w-full bg-[#1c1b1d]/95 backdrop-blur-xl border border-white/15 p-4 rounded-2xl shadow-2xl flex flex-col gap-3.5 text-white relative overflow-hidden"
              >
                {/* Top glow line - dynamic color based on GPS signal */}
                <div className={`absolute top-0 left-0 w-full h-[1.5px] bg-gradient-to-r from-transparent ${gpsAccuracy && gpsAccuracy <= 15 ? 'via-emerald-500/80' : 'via-blue-500/80'} to-transparent`} />

                {/* Top Row: GPS Signal, Speed, Compass */}
                <div className="flex justify-between items-center px-1">
                  {/* GPS Accuracy Box */}
                  <div className="flex flex-col items-start w-28">
                    <div className="flex items-center gap-1">
                      <Wifi size={12} className={gpsAccuracy && gpsAccuracy <= 15 ? 'text-emerald-400 animate-pulse' : 'text-blue-400'} />
                      <span className="text-[7px] font-mono text-gray-400 uppercase tracking-wider leading-none">GPS RADAR</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-300 font-mono mt-1">
                      {gpsAccuracy !== null 
                        ? (gpsAccuracy <= 15 ? `Strong (±${Math.round(gpsAccuracy)}m)` : `Medium (±${Math.round(gpsAccuracy)}m)`)
                        : 'Searching GPS...'
                      }
                    </span>
                  </div>

                  {/* Speedometer */}
                  <div className="flex-1 flex flex-col items-center">
                    <span className="text-[7px] font-mono text-gray-500 uppercase tracking-widest leading-none">SPEED</span>
                    <span className="text-3xl font-black text-white leading-none mt-1">
                      {speed} <span className="text-xs font-bold text-gray-400">km/h</span>
                    </span>
                  </div>

                  {/* Compass Box */}
                  <div className="flex flex-col items-end w-28">
                    <div className="flex items-center gap-1">
                      <span className="text-[7px] font-mono text-gray-400 uppercase tracking-wider leading-none">COURSE</span>
                      <Compass size={12} className="text-blue-400" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-300 font-mono mt-1">
                      {gpsHeading !== null 
                        ? `${getCompassDirection(gpsHeading)} (${Math.round(gpsHeading)}°)`
                        : 'N/A'
                      }
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-[1px] w-full bg-white/5" />

                {/* Bottom Row: Odometer, Duration, Avg Speed, Battery */}
                <div className="grid grid-cols-4 gap-2">
                  {/* Odometer */}
                  <div className="flex flex-col items-center bg-[#201f22]/40 border border-white/5 p-1.5 rounded-xl">
                    <span className="text-[7px] font-mono text-gray-500 uppercase tracking-wider">ODOMETER</span>
                    <span className="text-[11px] font-extrabold text-gray-300 mt-0.5">{rideDistance.toFixed(2)} km</span>
                  </div>
                  {/* Elapsed Timer */}
                  <div className="flex flex-col items-center bg-[#201f22]/40 border border-white/5 p-1.5 rounded-xl">
                    <span className="text-[7px] font-mono text-gray-500 uppercase tracking-wider">DURATION</span>
                    <span className="text-[11px] font-extrabold text-gray-300 mt-0.5">{formatTime(rideDuration)}</span>
                  </div>
                  {/* Avg Speed */}
                  <div className="flex flex-col items-center bg-[#201f22]/40 border border-white/5 p-1.5 rounded-xl">
                    <span className="text-[7px] font-mono text-gray-500 uppercase tracking-wider">AVG SPEED</span>
                    <span className="text-[11px] font-extrabold text-gray-300 mt-0.5">{avgSpeed} km/h</span>
                  </div>
                  {/* Phone Battery */}
                  <div className="flex flex-col items-center bg-[#201f22]/40 border border-white/5 p-1.5 rounded-xl">
                    <div className="flex items-center gap-0.5">
                      <Battery size={9} className="text-emerald-400" />
                      <span className="text-[7px] font-mono text-gray-500 uppercase tracking-wider">BATTERY</span>
                    </div>
                    <span className="text-[11px] font-extrabold text-gray-300 mt-0.5">
                      {deviceBattery !== null ? `${deviceBattery}%` : '---'}
                    </span>
                  </div>
                </div>

                {/* Destination Banner */}
                <div className="h-[1px] w-full bg-white/5" />
                
                <div className="flex justify-between items-center">
                  {destination ? (
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/25 max-w-[150px]">
                        <Navigation size={10} className="text-blue-400 transform rotate-45 shrink-0" />
                        <span className="text-[9px] font-bold text-blue-300 truncate">{destination.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {destEta ? (
                          <span className="text-[10px] font-bold text-gray-300 font-mono">
                            {destEta} · {destKm} km · {destArrival}
                          </span>
                        ) : (
                          <span className="text-[8px] text-gray-500 font-mono animate-pulse">Calculating route...</span>
                        )}
                        <div className="h-3 w-[1px] bg-white/10" />
                        <div className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[8px] font-bold font-mono">
                          <Users size={8} /> {riders.length + 1} PILOTS
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <Navigation size={10} className="shrink-0" />
                        <span className="text-[9px] font-semibold">No active destination</span>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[8px] font-bold font-mono">
                        <Users size={8} /> {riders.length + 1} PILOTS
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* ── LOCATION ERROR TOAST ── */}
      <AnimatePresence>
        {locationError && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: -100, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 shadow-xl"
          >
            <p className="text-white text-xs font-bold flex items-center gap-2">
              <span className="text-lg">⚠️</span> {locationError}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* ── INCOMING SOS ALERT ── */}
      <AnimatePresence>
        {incomingSOS && (
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-55 w-[92%] max-w-sm bg-[#7f1d1d]/95 backdrop-blur-xl border-2 border-red-500 rounded-2xl p-4 shadow-[0_0_40px_rgba(239,68,68,0.5)] flex flex-col gap-3 text-white pointer-events-auto"
          >
            <div className="flex items-start gap-3">
              <div className="relative shrink-0 mt-1">
                <span className="absolute inline-flex h-10 w-10 rounded-full bg-red-500/30 animate-ping" />
                <span className="relative inline-flex h-10 w-10 rounded-full bg-red-600 border border-red-400 items-center justify-center text-lg shadow-md animate-pulse">🆘</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-red-400 font-mono font-black mb-0.5">EMERGENCY SOS SIGNAL</p>
                <h4 className="font-extrabold text-sm text-white">{incomingSOS.name} is in distress!</h4>
                <p className="text-[10px] text-red-200 mt-1 leading-normal">
                  Rider coordinates: {incomingSOS.lat?.toFixed(5)}, {incomingSOS.lng?.toFixed(5)}
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  mapRef.current?.flyTo({
                    center: [incomingSOS.lng, incomingSOS.lat],
                    zoom: 16,
                    pitch: 55,
                    duration: 1500
                  });
                  routeToRider({ lat: incomingSOS.lat, lng: incomingSOS.lng, name: incomingSOS.name });
                  stopSiren();
                  setIncomingSOS(null);
                }}
                className="flex-1 py-2.5 bg-white text-red-900 rounded-xl text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer shadow-lg hover:bg-red-100"
              >
                <Compass size={13} /> Locate & Navigate
              </button>
              <button
                onClick={() => {
                  stopSiren();
                  setIncomingSOS(null);
                }}
                className="py-2.5 px-4 bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 rounded-xl text-xs font-bold text-red-200 active:scale-95 transition-all cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MapView;
