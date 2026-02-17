import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { FinalResult } from './components/FinalResult';
import { Login } from './components/Login';
import { ModeSelect } from './components/ModeSelect';
import { Profile } from './components/Profile';
import { QuestionResult } from './components/QuestionResult';
import { Quiz } from './components/Quiz/Quiz';
import { Ranking } from './components/Ranking/Ranking';
import { SetupUsername } from './components/SetupUsername';
import { WeaknessCheck } from './components/WeaknessCheck';

export function App() {
  return (
    <BrowserRouter>
      <div className="w-full max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 min-h-screen">
        <Routes>
          <Route path="/" element={<ModeSelect />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/result" element={<QuestionResult />} />
          <Route path="/result/final" element={<FinalResult />} />
          <Route path="/weakness" element={<WeaknessCheck />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/setup" element={<SetupUsername />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
