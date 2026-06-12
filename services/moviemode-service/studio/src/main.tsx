import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import MovieModePage from './pages/moviemode/MovieModePage';
import './studio.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/studio">
      <Routes>
        <Route path="/" element={<MovieModePage />} />
        <Route path="/:projectId" element={<MovieModePage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
