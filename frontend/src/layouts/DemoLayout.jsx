import React from 'react';
import NavBar from '../components/NavBar';
import { Outlet } from 'react-router-dom';

const DemoLayout = () => (
  <div className="demo-layout">
    <NavBar />
    <main style={{ padding: '2rem' }}>
      <Outlet />
    </main>
  </div>
);

export default DemoLayout;
