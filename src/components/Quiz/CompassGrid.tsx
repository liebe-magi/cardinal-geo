import { useSettingsStore } from '../../stores/settingsStore';
import type { QuadDirection } from '../../types/game';

interface CompassGridProps {
  userGuess: QuadDirection;
  onSelect: (guess: QuadDirection) => void;
  cityAName: string;
  cityBName: string;
}

export function CompassGrid({ userGuess, onSelect, cityAName, cityBName }: CompassGridProps) {
  const { t } = useSettingsStore();

  const quadrants: { ns: 'N' | 'S'; ew: 'E' | 'W'; pos: string }[] = [
    { ns: 'N', ew: 'W', pos: 'pos-nw' },
    { ns: 'N', ew: 'E', pos: 'pos-ne' },
    { ns: 'S', ew: 'W', pos: 'pos-sw' },
    { ns: 'S', ew: 'E', pos: 'pos-se' },
  ];

  // Determine which quadrant the target card should appear in
  const selectedPos =
    userGuess.ns && userGuess.ew
      ? `pos-${userGuess.ns.toLowerCase()}${userGuess.ew.toLowerCase()}`
      : null;

  return (
    <div className="quiz-container">
      {/* Compass labels */}
      <div className="compass-label compass-n">{t.directions.N}</div>
      <div className="compass-label compass-s">{t.directions.S}</div>
      <div className="compass-label compass-e">{t.directions.E}</div>
      <div className="compass-label compass-w">{t.directions.W}</div>

      {/* Quadrant buttons */}
      {quadrants.map(({ ns, ew, pos }) => {
        const isSelected = userGuess.ns === ns && userGuess.ew === ew;
        return (
          <button
            key={pos}
            className={`quadrant-btn ${pos} ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelect({ ns, ew })}
          />
        );
      })}

      {/* Target city card — shown in the selected quadrant */}
      {selectedPos && (
        <div className={`city-card target ${selectedPos}`}>
          <span className="city-role">Target</span>
          <span className="city-name">{cityAName}</span>
        </div>
      )}

      {/* Origin city card — always at center */}
      <div className="city-card origin">
        <span className="city-role">Origin</span>
        <span className="city-name">{cityBName}</span>
      </div>
    </div>
  );
}
