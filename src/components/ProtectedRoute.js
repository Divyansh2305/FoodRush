import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, authReady } = useAuth();
  const location = useLocation();
  if (!authReady) return <div className="fr-loading-page" role="status" aria-live="polite">Loading your FoodRush account…</div>;
  return user ? children : <Navigate to="/signin" state={{ from: location.pathname }} replace />;
}
