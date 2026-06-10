import React, { useState, useEffect, useRef, useContext } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthContext } from '../App';
import { useNavigate } from 'react-router-dom';
import { Mail, Key, User, Shield, ArrowRight, HelpCircle } from 'lucide-react';

const LoginView = () => {
  const [activeTab, setActiveTab] = useState('signin'); // 'signin' or 'join'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [moto, setMoto] = useState('');
  const [error, setError] = useState('');
  const [loadingForm, setLoadingForm] = useState(false);

  const shaderCanvasRef = useRef(null);
  const threeContainerRef = useRef(null);
  
  const { login, register, token } = useContext(AuthContext);
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (token) {
      navigate('/');
    }
  }, [token, navigate]);

  // 1. WebGL Liquid Zinc Background Shader
  useEffect(() => {
    if (!shaderCanvasRef.current) return;

    const canvas = shaderCanvasRef.current;
    let gl;
    try {
      gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    } catch (e) {
      console.error('WebGL context creation failed:', e);
      return;
    }

    if (!gl) return;

    // Handle scaling
    const syncSize = () => {
      const w = canvas.clientWidth || 1280;
      const h = canvas.clientHeight || 720;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    syncSize();

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(syncSize);
      resizeObserver.observe(canvas);
    }

    const vs = `
      attribute vec2 a_position;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fs = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform float u_time;
      uniform vec2 u_resolution;

      float random(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = random(i);
          float b = random(i + vec2(1.0, 0.0));
          float c = random(i + vec2(0.0, 1.0));
          float d = random(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      void main() {
          vec2 uv = v_texCoord;
          float n = noise(uv * 3.5 + u_time * 0.15);
          n += 0.5 * noise(uv * 7.0 - u_time * 0.2);
          
          // The Convoy Liquid Zinc Palette
          vec3 color1 = vec3(0.07, 0.07, 0.08); // Deep surface (#131315)
          vec3 color2 = vec3(0.15, 0.15, 0.18); // Zinc highlight
          vec3 color3 = vec3(0.23, 0.51, 0.96); // Electric Blue (#3b82f6)
          
          vec3 color = mix(color1, color2, n);
          color = mix(color, color3, pow(n, 5.0) * 0.4);
          
          gl_FragColor = vec4(color, 1.0);
      }
    `;

    const cs = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const prog = gl.createProgram();
    const vertexShader = cs(gl.VERTEX_SHADER, vs);
    const fragmentShader = cs(gl.FRAGMENT_SHADER, fs);

    gl.attachShader(prog, vertexShader);
    gl.attachShader(prog, fragmentShader);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');

    let mouse = { x: canvas.width / 2, y: canvas.height / 2 };
    const handleMouseMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        const nx = (event.clientX - rect.left) / rect.width;
        const ny = 1.0 - (event.clientY - rect.top) / rect.height;
        mouse.x = nx * canvas.width;
        mouse.y = ny * canvas.height;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);

    let animFrameId;
    const render = (t) => {
      syncSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      if (uMouse) gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animFrameId = requestAnimationFrame(render);
    };
    animFrameId = requestAnimationFrame(render);

    // Clean up
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animFrameId);
      if (resizeObserver) resizeObserver.disconnect();
      
      gl.deleteBuffer(buf);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteProgram(prog);
    };
  }, []);

  // 2. Three.js Helmet Silhouette Animation
  useEffect(() => {
    if (!threeContainerRef.current) return;

    const container = threeContainerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Scene
    const scene = new THREE.Scene();
    
    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();

    // Helmet Shell
    const shellGeo = new THREE.SphereGeometry(1.5, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.85);
    const shellMat = new THREE.MeshPhongMaterial({ 
        color: 0x1c1b1d, 
        specular: 0x3b82f6, 
        shininess: 100,
        side: THREE.DoubleSide
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.rotation.x = -Math.PI * 0.1;
    group.add(shell);

    // Visor (Electric Blue)
    const visorGeo = new THREE.SphereGeometry(1.52, 32, 32, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.2, Math.PI * 0.35);
    const visorMat = new THREE.MeshPhongMaterial({ 
        color: 0x3b82f6, 
        transparent: true, 
        opacity: 0.7,
        shininess: 200
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.rotation.x = -Math.PI * 0.05;
    group.add(visor);

    // Mechanical base ring
    const ringGeo = new THREE.TorusGeometry(1.4, 0.1, 16, 100);
    const ringMat = new THREE.MeshPhongMaterial({ color: 0x0e0e10 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = -0.4;
    group.add(ring);

    scene.add(group);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x3b82f6, 1.5);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    const secondaryLight = new THREE.PointLight(0xffffff, 0.5);
    secondaryLight.position.set(-5, -5, 2);
    scene.add(secondaryLight);

    let mouseX = 0;
    let mouseY = 0;

    const handleMouseMove = (e) => {
        mouseX = (e.clientX / window.innerWidth) - 0.5;
        mouseY = (e.clientY / window.innerHeight) - 0.5;
    };
    window.addEventListener('mousemove', handleMouseMove);

    let animId;
    const animate = () => {
        animId = requestAnimationFrame(animate);
        
        group.rotation.y += 0.005;
        group.rotation.y += mouseX * 0.05;
        group.rotation.x = (Math.sin(Date.now() * 0.001) * 0.1) + (mouseY * 0.05);
        
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
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      
      shellGeo.dispose();
      shellMat.dispose();
      visorGeo.dispose();
      visorMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
      
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password || (activeTab === 'join' && !name)) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoadingForm(true);

    try {
      let res;
      if (activeTab === 'join') {
        res = await register(name, email, password, moto);
      } else {
        res = await login(email, password);
      }

      setLoadingForm(false);

      if (res.success) {
        if (activeTab === 'join') {
          alert('Account created! Please sign in.');
          setActiveTab('signin');
        } else {
          navigate('/');
        }
      } else {
        setError(res.message);
      }
    } catch (err) {
      setLoadingForm(false);
      setError('Connection failed. Is the server running?');
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background font-body-md text-on-background selection:bg-primary selection:text-on-primary antialiased flex flex-col items-center justify-center p-6">
      
      {/* WebGL zinc shader background */}
      <canvas ref={shaderCanvasRef} className="fixed inset-0 z-0 w-full h-full opacity-60 pointer-events-none" />

      {/* Grid texture scan overlay */}
      <div className="fixed inset-0 z-0 opacity-20 pointer-events-none mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E\")" }} />

      {/* 3D Helmet Container */}
      <div className="absolute top-0 left-0 w-full h-64 md:h-96 z-10 pointer-events-none opacity-80 mix-blend-screen">
        <div ref={threeContainerRef} className="w-full h-full bg-transparent" />
      </div>

      {/* Login Card overlay */}
      <div className="animate-float relative z-20 w-full max-w-md overflow-hidden rounded-xl border border-surface-variant/50 bg-surface-container-low/80 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] before:absolute before:inset-0 before:z-[-1] before:rounded-xl before:border before:border-primary/20 before:shadow-[inset_0_0_20px_rgba(77,142,255,0.05)]">
        
        {/* Sign In & Register Tabs */}
        <div className="flex border-b border-surface-variant/50">
          <button 
            className={`w-1/2 py-4 text-center font-label-caps text-label-caps transition-all focus:outline-none cursor-pointer ${
              activeTab === 'signin' 
                ? 'text-primary border-b-2 border-primary bg-primary/5' 
                : 'text-on-surface-variant hover:text-on-surface'
            }`} 
            onClick={() => {
              setActiveTab('signin');
              setError('');
            }}
          >
            SIGN IN
          </button>
          
          <button 
            className={`w-1/2 py-4 text-center font-label-caps text-label-caps transition-all focus:outline-none cursor-pointer ${
              activeTab === 'join' 
                ? 'text-primary border-b-2 border-primary bg-primary/5' 
                : 'text-on-surface-variant hover:text-on-surface'
            }`} 
            onClick={() => {
              setActiveTab('join');
              setError('');
            }}
          >
            JOIN CREW
          </button>
        </div>

        {/* Card Forms Content */}
        <div className="p-6 sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="font-display-lg text-display-lg text-on-surface uppercase tracking-tighter mb-1">THE CONVOY</h1>
            <p className="font-label-caps text-label-caps text-on-surface-variant opacity-70">
              {activeTab === 'signin' ? 'SECURE COMMLINK ACCESS' : 'CREW REGISTRATION PIPELINE'}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Conditional Registration Fields */}
            {activeTab === 'join' && (
              <>
                <div className="space-y-1">
                  <label htmlFor="rider-name" className="block font-label-caps text-label-caps text-on-surface-variant">RIDER ALIAS</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3.5 h-4 w-4 text-on-surface-variant/50" />
                    <input 
                      type="text" 
                      id="rider-name"
                      name="name"
                      autocomplete="username"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="VALKYRIE_99"
                      className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-3 pl-10 pr-4 text-on-surface font-label-caps text-label-caps outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(77,142,255,0.3)] transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="primary-machine" className="block font-label-caps text-label-caps text-on-surface-variant">PRIMARY MACHINE</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3.5 text-xs text-on-surface-variant/50">🏍️</span>
                    <input 
                      type="text" 
                      id="primary-machine"
                      name="moto"
                      value={moto}
                      onChange={(e) => setMoto(e.target.value)}
                      placeholder="V4-S PANIGALE"
                      className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-3 pl-10 pr-4 text-on-surface font-label-caps text-label-caps outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(77,142,255,0.3)] transition-all"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Email Field */}
            <div className="space-y-1">
              <label htmlFor="rider-email" className="block font-label-caps text-label-caps text-on-surface-variant">
                {activeTab === 'signin' ? 'CALLSIGN / EMAIL' : 'COMMLINK (EMAIL)'}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-on-surface-variant/50" />
                <input 
                  type="email" 
                  id="rider-email"
                  name="email"
                  autocomplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={activeTab === 'signin' ? 'GHOST_RIDER_01' : 'RIDER@CONVOY.NET'}
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-3 pl-10 pr-4 text-on-surface font-label-caps text-label-caps outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(77,142,255,0.3)] transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label htmlFor="rider-password" className="block font-label-caps text-label-caps text-on-surface-variant">
                  {activeTab === 'signin' ? 'ACCESS CODE' : 'CREW ACCESS CODE'}
                </label>
                {activeTab === 'signin' && (
                  <button 
                    type="button" 
                    onClick={() => alert('Secure commlinks require manual override. Contact coordinator.')} 
                    className="font-label-caps text-[10px] text-primary hover:text-primary-fixed transition-colors"
                  >
                    FORGOT?
                  </button>
                )}
              </div>
              <div className="relative">
                <Key className="absolute left-3 top-3.5 h-4 w-4 text-on-surface-variant/50" />
                <input 
                  type="password" 
                  id="rider-password"
                  name="password"
                  autocomplete={activeTab === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-3 pl-10 pr-4 text-on-surface font-label-caps text-label-caps outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(77,142,255,0.3)] transition-all"
                />
              </div>
            </div>

            {/* CTA Button */}
            <button 
              type="submit" 
              disabled={loadingForm}
              className="btn-neon mt-4 w-full rounded-lg bg-primary/20 border border-primary py-3.5 font-headline-lg-mobile text-title-md text-primary hover:bg-primary hover:text-on-primary transition-all duration-300 group flex items-center justify-center gap-2 cursor-pointer"
            >
              {loadingForm ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
              ) : (
                <>
                  <span>{activeTab === 'signin' ? 'ENTER THE CONVOY' : 'INITIALIZE REGISTRATION'}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

    </div>
  );
};

export default LoginView;
