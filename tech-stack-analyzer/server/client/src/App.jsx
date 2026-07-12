import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import RiskRanking from './pages/RiskRanking.jsx';
import RepoDetail from './pages/RepoDetail.jsx';
import ProjectPlanner from './pages/ProjectPlanner.jsx';
import LanguageGraph from './pages/LanguageGraph.jsx';
import Guide from './pages/Guide.jsx';
import Reading from './pages/Reading.jsx';

const NAV_H = 56;

const navStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, height: NAV_H,
  background: '#1e293b', borderBottom: '1px solid #334155',
  display: 'flex', alignItems: 'center', padding: '0 24px', gap: 24, zIndex: 100,
};

function NavLink({ to, children }) {
  const { pathname } = useLocation();
  const active = pathname === to || (to !== '/' && pathname.startsWith(to));
  return (
    <Link to={to} style={{ color: active ? '#60a5fa' : '#94a3b8', fontWeight: active ? 600 : 400 }}>
      {children}
    </Link>
  );
}

function Nav() {
  return (
    <nav style={navStyle}>
      <span style={{ color: '#e2e8f0', fontWeight: 700, marginRight: 8 }}>🔍 Tech Stack Analyzer</span>
      <NavLink to="/reading">はじめに</NavLink>
      <NavLink to="/">ダッシュボード</NavLink>
      <NavLink to="/risk-ranking">リスクランキング</NavLink>
      <NavLink to="/language-graph">言語関係グラフ</NavLink>
      <NavLink to="/planner">プランナー</NavLink>
      <NavLink to="/guide">アーキテクチャガイド</NavLink>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <div style={{ paddingTop: NAV_H }}>
        <Routes>
          <Route path="/reading" element={<Reading />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/risk-ranking" element={<RiskRanking />} />
          <Route path="/repos/:id" element={<RepoDetail />} />
          <Route path="/language-graph" element={<LanguageGraph />} />
          <Route path="/planner" element={<ProjectPlanner />} />
          <Route path="/guide" element={<Guide />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
