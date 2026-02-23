import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { About } from './components/About';
import { FinalResult } from './components/FinalResult';
import { GlobalStats } from './components/GlobalStats';
import { LandingPage } from './components/LandingPage';
import { Login } from './components/Login';
import { ModeSelect } from './components/ModeSelect';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { Profile } from './components/Profile';
import { ProtectedRoute } from './components/ProtectedRoute';
import { QuestionResult } from './components/QuestionResult';
import { Quiz } from './components/Quiz/Quiz';
import { Ranking } from './components/Ranking/Ranking';
import { SetupUsername } from './components/SetupUsername';

export function App() {
  return (
    <BrowserRouter>
      <div className="w-full max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8 min-h-[100dvh]">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/weakness" element={<Navigate to="/profile" replace />} />
          <Route path="/login" element={<Login />} />

          {/* Protected routes — redirect to LP if not authenticated */}
          <Route
            path="/play"
            element={
              <ProtectedRoute>
                <ModeSelect />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quiz"
            element={
              <ProtectedRoute>
                <Quiz />
              </ProtectedRoute>
            }
          />
          <Route
            path="/result"
            element={
              <ProtectedRoute>
                <QuestionResult />
              </ProtectedRoute>
            }
          />
          <Route
            path="/result/final"
            element={
              <ProtectedRoute>
                <FinalResult />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ranking"
            element={
              <ProtectedRoute>
                <Ranking />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stats"
            element={
              <ProtectedRoute>
                <GlobalStats />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/setup"
            element={
              <ProtectedRoute>
                <SetupUsername />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
