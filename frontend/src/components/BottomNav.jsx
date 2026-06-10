import React, { useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Map, Users, Receipt, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { AuthContext } from '../App';

const BottomNav = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { logout, user } = useContext(AuthContext);

  const navItems = [
    { path: '/',        icon: LayoutDashboard, label: 'Home'    },
    { path: '/friends', icon: Users,           label: 'Crew'    },
    { path: '/ledger',  icon: Receipt,         label: 'Ledger'  },
  ];

  const isActive = (item) => {
    if (item.path === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/trips/');
    }
    return location.pathname.startsWith(item.path);
  };

  // Don't show nav on map pages or trip pages with /map
  const hideNav = location.pathname.startsWith('/map/');
  if (hideNav) return null;

  return (
    <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-5">
      <div className="flex items-center gap-1 bg-[#131416]/95 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">

        {navItems.map((item) => {
          const active = isActive(item);
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl group cursor-pointer transition-all"
            >
              {active && (
                <motion.div
                  layoutId="navIndicator"
                  className="absolute inset-0 bg-blue-500/15 border border-blue-500/25 rounded-xl"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <item.icon
                size={20}
                className={`transition-colors duration-200 relative z-10 ${
                  active ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-300'
                }`}
              />
              <span className={`text-[9px] font-semibold transition-colors duration-200 relative z-10 ${
                active ? 'text-blue-400' : 'text-gray-600 group-hover:text-gray-400'
              }`}>
                {item.label}
              </span>
            </button>
          );
        })}

        {/* Divider */}
        <div className="w-px h-8 bg-white/8 mx-1" />

        {/* Logout */}
        <button
          onClick={logout}
          className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl group cursor-pointer"
          title={`Logged in as ${user?.name || ''}`}
        >
          <LogOut size={18} className="text-gray-600 group-hover:text-red-400 transition-colors" />
          <span className="text-[9px] font-semibold text-gray-600 group-hover:text-red-400 transition-colors">Exit</span>
        </button>

      </div>
    </div>
  );
};

export default BottomNav;
