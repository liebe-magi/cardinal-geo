import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

/**
 * Wrapper component that redirects unauthenticated users to the landing page.
 * Used to protect routes that require login (e.g., /play, /quiz, /result).
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
