import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useApp } from './lib/store.jsx';
import { Layout } from './components/Layout.jsx';
import { Spinner } from './components/Common.jsx';
import { Translator } from './lib/Translator.jsx';
import { ScrollManager } from './lib/ScrollManager.jsx';

import { CatalogPage, SearchPage } from './pages/Catalog.jsx';
import { PropertyPage } from './pages/Property.jsx';
import { MapPage } from './pages/MapPage.jsx';
import { TourPage } from './pages/Tour.jsx';
import { AgentPage } from './pages/Agent.jsx';
import { AboutPage } from './pages/About.jsx';
import { ComparePage } from './pages/Compare.jsx';
const Tour3DPage = lazy(() => import('./pages/Tour3D.jsx').then((m) => ({ default: m.Tour3DPage })));
import { MessagesPage } from './pages/Messages.jsx';
import { AuthPage } from './pages/Auth.jsx';
import {
  FavoritesPage, HistoryPage, BookingsPage, TrackersPage,
  RequestsPage, RecommendationsPage, ProfilePage,
} from './pages/Personal.jsx';
import { DashboardPage } from './pages/Dashboard.jsx';
import { AdminPage } from './pages/Admin.jsx';
import { SellerPage } from './pages/Seller.jsx';
import { NotFound } from './pages/NotFound.jsx';

export function App() {
  const { ready } = useApp();
  if (!ready) return <div style={{ minHeight: '100vh', display: 'grid', placeContent: 'center' }}><Spinner big /></div>;
  return (
    <>
      <Translator />
      <ScrollManager />
      <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/agent" element={<AgentPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/properties/:id" element={<PropertyPage />} />
        <Route path="/properties/:id/tour" element={<TourPage />} />
        <Route path="/properties/:id/tour3d" element={<Suspense fallback={<div style={{ minHeight: '70vh', display: 'grid', placeContent: 'center' }}><Spinner big /></div>}><Tour3DPage /></Suspense>} />
        <Route path="/sellers/:id" element={<SellerPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/trackers" element={<TrackersPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </>
  );
}
