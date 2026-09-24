import React, { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { filesFromClipboard, publishPastedFiles } from '../lib/pasteBus.ts';

export function TopBar() {
  const nav = useNavigate();
  return (
    <header className="topbar">
      <button
        className="brand"
        title="Scores"
        onClick={() => nav('/')}
        style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
      >
        <span className="kanji">律</span>
        <span>Ritsu Web</span>
      </button>
      <div className="spacer" />
      <button className="icon-btn" title="Account" onClick={() => nav('/data')}>◉</button>
      <button className="icon-btn" title="Debug" onClick={() => nav('/debug')}>🛠</button>
      <button className="icon-btn" title="Settings" onClick={() => nav('/configs')}>⚙</button>
    </header>
  );
}

export function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="Primary">
      <NavLink to="/" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="pill-btn">♫</span>
        <span>Scores</span>
      </NavLink>
      <NavLink to="/import" title="Import / OCR">
        <span className="fab">📷</span>
      </NavLink>
      <NavLink to="/data" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="pill-btn">📊</span>
        <span>Data</span>
      </NavLink>
    </nav>
  );
}

export function Layout() {
  const nav = useNavigate();
  // Global screenshot paste: Print Screen -> Ctrl+V anywhere (outside text
  // inputs) sends clipboard images straight to Import — no file needed.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const files = filesFromClipboard(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      publishPastedFiles(files);
      nav('/import');
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [nav]);
  return (
    <React.Fragment>
      <TopBar />
      <main className="layout">
        <Outlet />
      </main>
      <BottomNav />
    </React.Fragment>
  );
}
