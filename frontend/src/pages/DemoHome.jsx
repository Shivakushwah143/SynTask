import React from 'react';
import { Link } from 'react-router-dom';

const DemoHome = () => (
  <div style={{ padding: '2rem', textAlign: 'center' }}>
    <h1 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '2.5rem', marginBottom: '1rem' }}>
      Welcome to SynTask Demo
    </h1>
    <p style={{ fontSize: '1.125rem', color: '#555', marginBottom: '2rem' }}>
      Explore the core features of SynTask. Use the navigation above to browse dashboards, tasks, leads, and more.
    </p>
    <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
      <Link to="/dashboard" style={buttonStyle}>Dashboard</Link>
      <Link to="/tasks" style={buttonStyle}>Tasks</Link>
      <Link to="/crm/leads" style={buttonStyle}>Leads</Link>
      <Link to="/settings" style={buttonStyle}>Settings</Link>
    </div>
  </div>
);

const buttonStyle = {
  padding: '0.75rem 1.5rem',
  background: 'linear-gradient(135deg, hsl(210, 80%, 60%), hsl(230, 70%, 55%))',
  color: '#fff',
  borderRadius: '0.5rem',
  textDecoration: 'none',
  fontWeight: 500,
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  transition: 'transform 0.2s, box-shadow 0.2s'
};

export default DemoHome;
