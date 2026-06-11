import React, { useState, useEffect, useRef, useContext } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthContext } from '../App';
import { useNavigate } from 'react-router-dom';
import { Mail, Key, User, Shield, ArrowRight, HelpCircle } from 'lucide-react';
import axios from 'axios';

const LoginView = () => {
  const [activeTab, setActiveTab] = useState('signin'); // 'signin', 'join', 'forgot', or 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [moto, setMoto] = useState('');
  
  // Reset States
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  
  // OAuth Simulation States
  const [oauthProvider, setOauthProvider] = useState(null); // 'Google' | 'GitHub' | 'Apple' | null
  const [oauthEmail, setOauthEmail] = useState('');
  const [oauthPassword, setOauthPassword] = useState('');
  const [oauthName, setOauthName] = useState('');
  const [oauthStep, setOauthStep] = useState('input'); // 'input' | 'authorizing' | 'success'
  const [oauthLogs, setOauthLogs] = useState([]);

  const [error, setError] = useState('');
  const [loadingForm, setLoadingForm] = useState(false);

  const shaderCanvasRef = useRef(null);
  const threeContainerRef = useRef(null);
  
  const { login, register, token, loginWithGoogle } = useContext(AuthContext);
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

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (!email) {
      setError('Please enter your CALLSIGN / EMAIL to verify identity.');
      return;
    }
    setLoadingForm(true);
    try {
      const res = await axios.post('/auth/forgot-password', { email });
      setLoadingForm(false);
      setOtpSent(true);
      setActiveTab('reset');
      alert(`Override instructions dispatched! Use override code: ${res.data.otp}`);
    } catch (err) {
      setLoadingForm(false);
      setError(err.response?.data?.message || 'Password recovery failed. Check connection.');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (!otp || !newPassword) {
      setError('Both override OTP code and new access code are required.');
      return;
    }
    setLoadingForm(true);
    try {
      await axios.post('/auth/reset-password', { email, otp, newPassword });
      setLoadingForm(false);
      alert('Override code authorized! Access code updated successfully.');
      setActiveTab('signin');
      setOtpSent(false);
      setOtp('');
      setNewPassword('');
    } catch (err) {
      setLoadingForm(false);
      setError(err.response?.data?.message || 'Code override authorization failed.');
    }
  };

  const handleOAuthSubmit = async (e) => {
    e.preventDefault();
    if (!oauthEmail || !oauthPassword) {
      alert('Please fill in both email and password credentials.');
      return;
    }
    setOauthStep('authorizing');
    setOauthLogs(['Handshaking with ' + oauthProvider + ' servers...']);
    
    // Add realistic security authorization step-logs
    setTimeout(() => {
      setOauthLogs(prev => [...prev, 'Authenticating user: ' + oauthEmail]);
    }, 500);

    setTimeout(() => {
      setOauthLogs(prev => [...prev, 'Verifying secure cryptographic credentials...']);
    }, 1000);

    setTimeout(() => {
      setOauthLogs(prev => [...prev, 'Exchanging secure JWT session tokens...']);
    }, 1500);

    setTimeout(async () => {
      try {
        const defaultName = oauthName || oauthEmail.split('@')[0].toUpperCase();
        const res = await loginWithGoogle(oauthEmail, defaultName);
        if (res.success) {
          setOauthStep('success');
          setOauthLogs(prev => [...prev, '✓ Secure Authorization Granted!']);
          setTimeout(() => {
            setOauthProvider(null);
            setOauthStep('input');
            setOauthEmail('');
            setOauthPassword('');
            setOauthName('');
            setOauthLogs([]);
            navigate('/');
          }, 1000);
        } else {
          setOauthStep('input');
          alert(res.message);
        }
      } catch (err) {
        setOauthStep('input');
        alert('Authentication failed.');
      }
    }, 2200);
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
        {(activeTab === 'signin' || activeTab === 'join') && (
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
        )}

        {/* Card Forms Content */}
        <div className="p-6 sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="font-display-lg text-display-lg text-on-surface uppercase tracking-tighter mb-1">THE CONVOY</h1>
            <p className="font-label-caps text-label-caps text-on-surface-variant opacity-70">
              {activeTab === 'signin' && 'SECURE COMMLINK ACCESS'}
              {activeTab === 'join' && 'CREW REGISTRATION PIPELINE'}
              {activeTab === 'forgot' && 'SECURITY CREDENTIAL OVERRIDE'}
              {activeTab === 'reset' && 'COMM OVERRIDE ACCESS CODES'}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* A. SIGN IN / JOIN CREW FORMS */}
          {(activeTab === 'signin' || activeTab === 'join') && (
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
                      onClick={() => setActiveTab('forgot')}
                      className="font-label-caps text-[10px] text-primary hover:text-primary-fixed transition-colors cursor-pointer"
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
          )}

          {/* B. FORGOT PASSWORD FORM */}
          {activeTab === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <p className="text-xs text-gray-400 font-mono leading-relaxed">
                Provide your registered Call Sign / Email commlink. We will dispatch a simulated bypass code override sequence.
              </p>
              
              <div className="space-y-1">
                <label htmlFor="recovery-email" className="block font-label-caps text-label-caps text-on-surface-variant">REGISTERED EMAIL</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 h-4 w-4 text-on-surface-variant/50" />
                  <input 
                    type="email" 
                    id="recovery-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="RIDER@CONVOY.NET"
                    className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-3 pl-10 pr-4 text-on-surface font-label-caps text-label-caps outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(77,142,255,0.3)] transition-all"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loadingForm}
                className="btn-neon mt-4 w-full rounded-lg bg-primary/20 border border-primary py-3.5 font-headline-lg-mobile text-title-md text-primary hover:bg-primary hover:text-on-primary transition-all duration-300 group flex items-center justify-center gap-2 cursor-pointer"
              >
                {loadingForm ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                ) : (
                  <>
                    <span>DISPATCH OVERRIDE CODE</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('signin'); setError(''); }}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-300 font-mono mt-2 transition-colors cursor-pointer"
              >
                ← BACK TO SECURE COMMLINK SIGN IN
              </button>
            </form>
          )}

          {/* C. RESET PASSWORD FORM */}
          {activeTab === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <p className="text-xs text-emerald-400 font-mono leading-relaxed">
                ✓ Override sequence dispatched! Use code `123456` to authenticate the override.
              </p>

              <div className="space-y-1">
                <label htmlFor="otp-code" className="block font-label-caps text-label-caps text-on-surface-variant">OVERRIDE CODE (OTP)</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-3.5 h-4 w-4 text-on-surface-variant/50" />
                  <input 
                    type="text" 
                    id="otp-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="123456"
                    className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-3 pl-10 pr-4 text-on-surface font-label-caps text-label-caps outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(77,142,255,0.3)] transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="new-password" className="block font-label-caps text-label-caps text-on-surface-variant">NEW ACCESS CODE</label>
                <div className="relative">
                  <Key className="absolute left-3 top-3.5 h-4 w-4 text-on-surface-variant/50" />
                  <input 
                    type="password" 
                    id="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-3 pl-10 pr-4 text-on-surface font-label-caps text-label-caps outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(77,142,255,0.3)] transition-all"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loadingForm}
                className="btn-neon mt-4 w-full rounded-lg bg-emerald-500/20 border border-emerald-500 py-3.5 font-headline-lg-mobile text-title-md text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all duration-300 group flex items-center justify-center gap-2 cursor-pointer"
              >
                {loadingForm ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                ) : (
                  <>
                    <span>ACTIVATE CODE OVERRIDE</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('signin'); setError(''); }}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-300 font-mono mt-2 transition-colors cursor-pointer"
              >
                ← CANCEL OVERRIDE & SIGN IN
              </button>
            </form>
          )}

          {/* D. SOCIAL SIGN IN BUTTONS */}
          {(activeTab === 'signin' || activeTab === 'join') && (
            <div className="mt-6 pt-6 border-t border-surface-variant/20 text-center">
              <p className="font-label-caps text-[10px] text-on-surface-variant opacity-60 mb-4 uppercase tracking-widest font-mono">
                OR SECURE TELEMETRY LINK
              </p>
              <div className="flex justify-center gap-3">
                {/* Google Sign In */}
                <button
                  type="button"
                  onClick={() => { setOauthProvider('Google'); setOauthStep('input'); }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl text-xs font-bold text-white transition-all active:scale-95 cursor-pointer shadow-lg w-1/3"
                  title="Authenticate via Google Gateway"
                >
                  <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.706 0 3.267.615 4.477 1.625l2.437-2.435C17.387 1.696 14.996 1 12.24 1c-5.523 0-10 4.477-10 10s4.477 10 10 10c5.733 0 9.87-4.014 9.87-9.872 0-.67-.06-1.3-.176-1.843H12.24z" />
                  </svg>
                  <span>Google</span>
                </button>

                {/* GitHub Sign In */}
                <button
                  type="button"
                  onClick={() => { setOauthProvider('GitHub'); setOauthStep('input'); }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl text-xs font-bold text-white transition-all active:scale-95 cursor-pointer shadow-lg w-1/3"
                  title="Authenticate via GitHub Gateway"
                >
                  <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                  </svg>
                  <span>GitHub</span>
                </button>

                {/* Apple Sign In */}
                <button
                  type="button"
                  onClick={() => { setOauthProvider('Apple'); setOauthStep('input'); }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl text-xs font-bold text-white transition-all active:scale-95 cursor-pointer shadow-lg w-1/3"
                  title="Authenticate via Apple Keyring"
                >
                  <span className="text-sm font-black leading-none text-gray-300"></span>
                  <span>Apple</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── GOOGLE / GITHUB / APPLE SECURE OAUTH POPUP SIMULATION ── */}
      <AnimatePresence>
        {oauthProvider && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 30 }}
              className="w-full max-w-md bg-[#131315] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Virtual Browser Top Address Bar */}
              <div className="bg-[#1c1b1d] border-b border-white/10 px-4 py-3 flex items-center gap-3">
                {/* Windows dots */}
                <div className="flex gap-1.5 shrink-0">
                  <span className="w-3 h-3 rounded-full bg-red-500/80 block" />
                  <span className="w-3 h-3 rounded-full bg-yellow-500/80 block" />
                  <span className="w-3 h-3 rounded-full bg-green-500/80 block" />
                </div>
                {/* Navigation helpers */}
                <div className="flex gap-2 text-gray-500 text-xs shrink-0 select-none">
                  <span>←</span>
                  <span>→</span>
                  <span>↻</span>
                </div>
                {/* Secure URL bar */}
                <div className="flex-1 bg-[#0a0b0d] border border-white/10 rounded-lg py-1 px-3 flex items-center gap-1.5 text-[10px] font-mono text-gray-400 truncate">
                  <span className="text-emerald-500">🔒</span>
                  <span className="text-emerald-400 select-none">https://</span>
                  <span className="text-white truncate">
                    {oauthProvider === 'Google' && 'accounts.google.com/o/oauth2/v2/auth'}
                    {oauthProvider === 'GitHub' && 'github.com/login/oauth/authorize'}
                    {oauthProvider === 'Apple' && 'appleid.apple.com/auth/authorize'}
                  </span>
                </div>
                {/* Close window */}
                <button
                  type="button"
                  onClick={() => setOauthProvider(null)}
                  className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer text-xs transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>

              {/* Viewport Content */}
              <div className="p-6 md:p-8 bg-[#0a0b0d] min-h-[340px] flex flex-col justify-center">
                <AnimatePresence mode="wait">
                  {oauthStep === 'input' && (
                    <motion.div
                      key="oauth-input"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="space-y-4"
                    >
                      <div className="text-center mb-4">
                        {/* Logo header */}
                        {oauthProvider === 'Google' && (
                          <div className="flex justify-center mb-2">
                            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.706 0 3.267.615 4.477 1.625l2.437-2.435C17.387 1.696 14.996 1 12.24 1c-5.523 0-10 4.477-10 10s4.477 10 10 10c5.733 0 9.87-4.014 9.87-9.872 0-.67-.06-1.3-.176-1.843H12.24z" fill="#4285F4"/>
                            </svg>
                          </div>
                        )}
                        {oauthProvider === 'GitHub' && (
                          <div className="flex justify-center mb-2">
                            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                            </svg>
                          </div>
                        )}
                        {oauthProvider === 'Apple' && (
                          <div className="flex justify-center mb-2">
                            <span className="text-3xl font-black text-white"></span>
                          </div>
                        )}
                        <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wider">Authorize with {oauthProvider}</h4>
                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">Secure commlink mapping verification required</p>
                      </div>

                      {/* Credentials Input */}
                      <form onSubmit={handleOAuthSubmit} className="space-y-3">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-mono text-gray-400 uppercase">{oauthProvider} CALLSIGN / EMAIL</label>
                          <input
                            type="email"
                            required
                            placeholder="rider@provider.net"
                            value={oauthEmail}
                            onChange={(e) => setOauthEmail(e.target.value)}
                            className="w-full bg-[#131315] border border-white/10 rounded-lg py-2.5 px-3 text-xs text-white focus:outline-none focus:border-primary font-mono"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] font-mono text-gray-400 uppercase">ACCESS CODE / PASSWORD</label>
                          <input
                            type="password"
                            required
                            placeholder="••••••••"
                            value={oauthPassword}
                            onChange={(e) => setOauthPassword(e.target.value)}
                            className="w-full bg-[#131315] border border-white/10 rounded-lg py-2.5 px-3 text-xs text-white focus:outline-none focus:border-primary font-mono"
                          />
                        </div>

                        {/* Optional name */}
                        <div className="space-y-1">
                          <label className="block text-[10px] font-mono text-gray-400 uppercase">DISPLAY NAME (OPTIONAL)</label>
                          <input
                            type="text"
                            placeholder="RIDER_ALIAS"
                            value={oauthName}
                            onChange={(e) => setOauthName(e.target.value)}
                            className="w-full bg-[#131315] border border-white/10 rounded-lg py-2.5 px-3 text-xs text-white focus:outline-none focus:border-primary font-mono"
                          />
                        </div>

                        {/* Fast Select Demo Accounts */}
                        <div className="bg-[#1c1b1d]/40 border border-white/5 rounded-xl p-3 space-y-2">
                          <p className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">Fast Simulation Presets</p>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setOauthEmail(oauthProvider === 'Google' ? 'yash.chavan.google@gmail.com' : oauthProvider === 'GitHub' ? 'github.rider@convoy.net' : 'apple.rider@convoy.net');
                                setOauthPassword('securepass123');
                                setOauthName(oauthProvider === 'Google' ? 'Yash Chavan' : oauthProvider === 'GitHub' ? 'GitHub Rider' : 'Apple Rider');
                              }}
                              className="text-[9px] font-mono bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 rounded text-gray-300 cursor-pointer"
                            >
                              🚀 Load Mock Profile
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOauthEmail('john.doe.google@gmail.com');
                                setOauthPassword('password123');
                                setOauthName('John Doe');
                              }}
                              className="text-[9px] font-mono bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 rounded text-gray-300 cursor-pointer"
                            >
                              🏍️ John Doe
                            </button>
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full py-3 bg-primary/20 border border-primary hover:bg-primary hover:text-on-primary text-primary text-xs font-bold rounded-xl transition-all cursor-pointer font-mono uppercase tracking-wider mt-4"
                        >
                          Verify & Authorize
                        </button>
                      </form>
                    </motion.div>
                  )}

                  {oauthStep === 'authorizing' && (
                    <motion.div
                      key="oauth-authorizing"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.1 }}
                      className="flex flex-col items-center justify-center space-y-6"
                    >
                      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                      <div className="w-full bg-[#131315]/50 border border-white/5 rounded-xl p-4 min-h-[120px] font-mono text-[10px] text-gray-400 space-y-1 overflow-y-auto">
                        {oauthLogs.map((log, index) => (
                          <div key={index} className="flex gap-1.5 items-center">
                            <span className="text-emerald-500">▶</span>
                            <span>{log}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {oauthStep === 'success' && (
                    <motion.div
                      key="oauth-success"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center justify-center space-y-4"
                    >
                      <div className="h-16 w-16 bg-emerald-500/20 border border-emerald-500/50 rounded-full flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse">
                        ✓
                      </div>
                      <h4 className="text-sm font-bold text-emerald-400 font-mono uppercase tracking-widest animate-pulse">Authorization Success</h4>
                      <p className="text-[10px] text-gray-500 font-mono text-center">Syncing radar coordinates and vehicle telemetry...</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LoginView;
