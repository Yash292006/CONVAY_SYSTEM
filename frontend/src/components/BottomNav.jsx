import React, { useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Map, Users, LogOut, Receipt } from 'lucide-react';
import { motion } from 'framer-motion';
import { AuthContext } from '../App';

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useContext(AuthContext);

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/map/live', icon: Map, label: 'Live Map' },
    { path: '/friends', icon: Users, label: 'Friends' },
    { path: '/ledger', icon: Receipt, label: 'Ledger' },
  ];

  const handleNav = (path) => {
    navigate(path);
  };

  return (
    <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4">
      <div className="glass-panel flex items-center justify-between w-full max-w-md px-6 py-3 rounded-2xl shadow-lg border border-white/10 backdrop-blur-xl">
        {navItems.map((item) => {
          const isActive = 
            item.path === '/' 
              ? location.pathname === '/' || location.pathname.startsWith('/trips/')
              : location.pathname.startsWith(item.path.split('/')[1]);

          return (
            <button
              key={item.label}
              onClick={() => handleNav(item.path)}
              className="relative flex flex-col items-center gap-1 group cursor-pointer"
            >
              <div className="relative p-2 rounded-xl transition-all duration-300">
                {isActive && (
                  <motion.div
                    layoutId="activeNavIndicator"
                    className="absolute inset-0 bg-emerald-500/10 border border-emerald-500/25 rounded-xl -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <item.icon 
                  className={`w-6 h-6 transition-colors duration-300 ${
                    isActive 
                      ? 'text-emerald-400 filter drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
                      : 'text-gray-400 group-hover:text-white'
                  }`} 
                />
              </div>
              <span className={`text-[10px] font-medium transition-all duration-300 ${
                isActive ? 'text-emerald-400' : 'text-gray-400 group-hover:text-white'
              }`}>
                {item.label}
              </span>
              {isActive && (
                <span className="absolute -top-1 w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_#10b981]" />
              )}
            </button>
          );
        })}

        {/* Logout Button */}
        <button
          onClick={logout}
          className="flex flex-col items-center gap-1 group cursor-pointer"
          title={`Logged in as ${user?.name || ''}`}
        >
          <div className="p-2 rounded-xl transition-all duration-300">
            <LogOut className="w-6 h-6 text-gray-400 group-hover:text-red-400 transition-colors" />
          </div>
          <span className="text-[10px] font-medium text-gray-400 group-hover:text-red-400 transition-colors">
            Exit
          </span>
        </button>
      </div>
    </div>
  );
};

export default BottomNav;
