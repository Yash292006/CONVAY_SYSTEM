import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Map, { Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { io } from 'socket.io-client';
import { Navigation, Search, Crosshair, Layers, Compass, ArrowLeft } from 'lucide-react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const MapView = () => {
  const navigate = useNavigate();
  const [riders, setRiders] = useState([]);
  const [speed, setSpeed] = useState(0);
  const socketRef = useRef(null);
  
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

    // 2. Real GPS Tracking
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed: gpsSpeed } = position.coords;
          const currentSpeedKmH = gpsSpeed ? Math.round(gpsSpeed * 3.6) : 0;
          setSpeed(currentSpeedKmH);

          // Automatically center the map on YOUR location as you drive
          setViewState(prev => ({ ...prev, latitude, longitude }));

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

  return (
    <div className="w-full h-screen relative bg-[#131315] select-none text-[#e5e1e4]">
      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/dark-v11" // Dark mode map!
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        {/* Render real-time markers for every rider on actual roads */}
        {riders.map((rider) => (
          <Marker 
            key={rider.userId} 
            longitude={rider.lng} 
            latitude={rider.lat} 
            anchor="bottom"
          >
            {/* Your glowing cyberpunk UI elements go right here inside the Mapbox Marker */}
            <div className="flex flex-col items-center pointer-events-auto">
              <div className="relative flex justify-center items-center">
                <div className="absolute w-8 h-8 bg-[#3b82f6]/40 rounded-full animate-ping" />
                <div className="relative w-4 h-4 bg-white border-2 border-[#3b82f6] rounded-full shadow-[0_0_15px_rgba(59,130,246,0.8)]" />
              </div>
              <div className="mt-2 bg-[#1c1b1d]/85 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 text-xs font-bold text-white whitespace-nowrap shadow-lg">
                {rider.name} • {rider.speed} km/h
              </div>
            </div>
          </Marker>
        ))}
      </Map>

      {/* Floating Back Button */}
      <button 
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 z-30 pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center bg-[#201f22]/60 backdrop-blur-md border border-white/10 hover:border-white/25 text-white active:scale-95 transition-all cursor-pointer"
        title="Back to Dashboard"
      >
        <ArrowLeft size={18} />
      </button>

      {/* --- HUD OVERLAY --- */}
      <div className="absolute inset-0 z-10 pointer-events-none p-4 flex flex-col justify-between pb-28">
        
        {/* Top Search Bar */}
        <div className="pointer-events-auto w-full max-w-md mx-auto mt-safe pt-4 pl-12">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-[#8c909f]" />
            </div>
            <label htmlFor="map-search" className="sr-only">Search route or rider</label>
            <input 
              type="text" 
              id="map-search"
              name="search"
              placeholder="Search route or rider..." 
              className="w-full bg-[#201f22]/60 backdrop-blur-xl border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-[#8c909f] shadow-lg focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 transition-all text-sm outline-none"
            />
          </div>
        </div>

        {/* Middle Section: Right Action Buttons */}
        <div className="absolute right-4 top-1/3 flex flex-col gap-4 pointer-events-auto">
          {[
            { icon: <Crosshair size={20} />, active: true },
            { icon: <Layers size={20} /> },
            { icon: <Compass size={20} /> }
          ].map((btn, i) => (
            <button 
              key={i}
              onClick={() => alert(`Radar widget ${i+1} activated.`)}
              className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border cursor-pointer active:scale-90 transition-all ${
                btn.active 
                  ? 'bg-[#3b82f6]/20 border-[#3b82f6]/50 text-[#3b82f6] shadow-[0_0_20px_rgba(59,130,246,0.3)]' 
                  : 'bg-[#201f22]/60 border-white/10 text-white/70 hover:text-white'
              }`}
            >
              {btn.icon}
            </button>
          ))}
        </div>

        {/* Put your Telemetry HUD overlay down here so it floats over the map */}
        <div className="pointer-events-auto w-full max-w-md mx-auto mb-2 bg-[#201f22]/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl relative overflow-hidden flex justify-between items-center text-white">
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
        </div>

      </div>
    </div>
  );
};

export default MapView;
