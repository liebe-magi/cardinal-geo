import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

/**
 * Wrapper component that redirects unauthenticated users to the landing page.
 * Used to protect routes that require login (e.g., /play, /quiz, /result).
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return <p role="status">Loading…</p>;

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
