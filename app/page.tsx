'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  CircleAlert,
  Lightbulb,
  MapPin,
  RotateCcw,
  Search,
  Shield,
  Skull,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type SuspectId =
  | 'andy'
  | 'betty'
  | 'cooper'
  | 'dave'
  | 'elliot'
  | 'francesca'
  | 'gabriella'
  | 'hank'
  | 'vito';

type Mark = 'unknown' | 'outlaw' | 'cleared';

type Suspect = {
  id: SuspectId;
  name: string;
  initials: string;
  clue: string;
  tone: string;
  victim?: boolean;
};

const suspects: Suspect[] = [
  { id: 'andy', name: 'Andy', initials: 'AN', clue: 'He was not on a horse — but at least one person was.', tone: 'sage' },
  { id: 'betty', name: 'Betty', initials: 'BE', clue: 'She was beside a table, exactly one column east of Andy.', tone: 'rose' },
  { id: 'cooper', name: 'Cooper', initials: 'CO', clue: 'Not an outlaw. He was not beside an outlaw.', tone: 'umber' },
  { id: 'dave', name: 'Dave', initials: 'DA', clue: 'He was beside a sack.', tone: 'clay' },
  { id: 'elliot', name: 'Elliot', initials: 'EL', clue: 'He was in a corner of the grid.', tone: 'ink' },
  { id: 'francesca', name: 'Francesca', initials: 'FR', clue: 'She was north of two outlaws and south of a woman outlaw.', tone: 'blue' },
  { id: 'gabriella', name: 'Gabriella', initials: 'GA', clue: 'She was not beside an outside wall. She was alone.', tone: 'gold' },
  { id: 'hank', name: 'Hank', initials: 'HA', clue: "He was in the Director's Office, in the top row.", tone: 'violet' },
  { id: 'vito', name: 'Vito', initials: 'VI', clue: 'The victim. Not an outlaw. He was alone with the murderer.', tone: 'victim', victim: true },
];

const roomByCell = [
  'storage', 'storage', 'director', 'director', 'director', 'director',
  'storage', 'storage', 'director', 'director', 'director', 'director',
  'safe', 'safe', 'lobby', 'lobby', 'lobby', 'lobby',
  'safe', 'safe', 'lobby', 'lobby', 'lobby', 'lobby',
  'safe', 'safe', 'outside', 'outside', 'outside', 'porch',
  'safe', 'safe', 'outside', 'outside', 'outside', 'porch',
] as const;

const roomNames: Record<string, string> = {
  storage: 'Storage', director: "Director's Office", safe: 'Safe Room',
  lobby: 'Lobby', outside: 'Outside', porch: 'Porch',
};

const roomLabels: Record<number, string> = {
  0: 'Storage', 2: "Director's Office", 12: 'Safe Room',
  14: 'Lobby', 26: 'Outside', 29: 'Porch',
};

const objects: Record<number, { symbol: string; label: string }> = {
  24: { symbol: '♞', label: 'horse' },
  3: { symbol: '▤', label: 'table' },
  28: { symbol: '◈', label: 'sack' },
  18: { symbol: '▣', label: 'safe' },
};

const solution: Record<SuspectId, number> = {
  andy: 25, betty: 2, cooper: 16, dave: 29, elliot: 35,
  francesca: 15, gabriella: 7, hank: 5, vito: 24,
};

const outlawIds = new Set<SuspectId>(['andy', 'betty', 'dave']);

const hints = [
  "Start with Hank: only four cells are both in the Director's Office and in the top row.",
  'Elliot must occupy one of the four outer corners. Gabriella cannot be on the outer edge.',
  'Vito shares the Safe Room with exactly one person. That person is the murderer.',
  'Betty is one column east of Andy. Combine that with the table and horse positions.',
  'The three outlaws are Andy, Betty, and Dave. Now use Francesca and the room-pair rule to finish the board.',
];

const initialMarks = Object.fromEntries(
  suspects.map((suspect) => [suspect.id, suspect.victim || suspect.id === 'cooper' ? 'cleared' : 'unknown']),
) as Record<SuspectId, Mark>;

function getRow(cell: number) { return Math.floor(cell / 6); }
function getCol(cell: number) { return cell % 6; }

type ModelContext = {
  registerTool: (tool: {
    name: string;
    title: string;
    description: string;
    inputSchema: object;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    execute: (input: unknown) => Promise<unknown>;
  }, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

declare global {
  interface Document { modelContext?: ModelContext }
}

export default function Home() {
  const [selected, setSelected] = useState<SuspectId | null>('hank');
  const [placements, setPlacements] = useState<Partial<Record<SuspectId, number>>>({});
  const [marks, setMarks] = useState<Record<SuspectId, Mark>>(initialMarks);
  const [hintCount, setHintCount] = useState(0);
  const [notice, setNotice] = useState('Hank is selected. Choose a square on the map.');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [accuseOpen, setAccuseOpen] = useState(false);
  const [result, setResult] = useState<'idle' | 'win' | 'wrong' | 'incomplete'>('idle');

  const occupantByCell = useMemo(() => {
    const entries: Record<number, SuspectId> = {};
    for (const [id, cell] of Object.entries(placements)) {
      if (cell !== undefined) entries[cell] = id as SuspectId;
    }
    return entries;
  }, [placements]);

  const placedCount = Object.keys(placements).length;
  const markedOutlaws = suspects.filter((suspect) => marks[suspect.id] === 'outlaw').length;

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const names = suspects.map((suspect) => suspect.id);

    void Promise.resolve(context.registerTool({
      name: 'submit_bank_heist_solution',
      title: 'Submit Bank Heist solution',
      description: 'Place every suspect, mark the three outlaws, and submit a murder accusation in one action.',
      inputSchema: {
        type: 'object',
        properties: {
          placements: {
            type: 'object',
            description: 'Every suspect mapped to a 1-based [row, column] position on the 6×6 map.',
            properties: Object.fromEntries(names.map((name) => [name, {
              type: 'array', items: { type: 'integer', minimum: 1, maximum: 6 }, minItems: 2, maxItems: 2,
            }])),
            required: names,
            additionalProperties: false,
          },
          outlaws: { type: 'array', items: { type: 'string', enum: names }, minItems: 3, maxItems: 3, uniqueItems: true },
          accused: { type: 'string', enum: names.filter((name) => name !== 'vito') },
        },
        required: ['placements', 'outlaws', 'accused'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(rawInput) {
        const input = rawInput as { placements?: Record<string, number[]>; outlaws?: string[]; accused?: string };
        if (!input.placements || !Array.isArray(input.outlaws) || typeof input.accused !== 'string') {
          throw new Error('Placements, three outlaws, and an accusation are required.');
        }
        const cells = names.map((name) => {
          const point = input.placements?.[name];
          if (!Array.isArray(point) || point.length !== 2 || point.some((value) => !Number.isInteger(value) || value < 1 || value > 6)) {
            throw new Error(`Invalid position for ${name}. Use [row, column] values from 1 to 6.`);
          }
          return (point[0] - 1) * 6 + point[1] - 1;
        });
        if (new Set(cells).size !== cells.length) throw new Error('Two suspects cannot occupy the same square.');
        if (input.outlaws.length !== 3 || new Set(input.outlaws).size !== 3 || input.outlaws.some((id) => !names.includes(id as SuspectId))) {
          throw new Error('Choose exactly three different suspects as outlaws.');
        }
        const nextPlacements = Object.fromEntries(names.map((name, index) => [name, cells[index]])) as Record<SuspectId, number>;
        const nextMarks = Object.fromEntries(names.map((name) => [name, input.outlaws?.includes(name) ? 'outlaw' : 'cleared'])) as Record<SuspectId, Mark>;
        const solved = names.every((name) => nextPlacements[name] === solution[name])
          && names.every((name) => outlawIds.has(name) === input.outlaws?.includes(name));
        const outcome = solved ? (input.accused === 'andy' ? 'win' : 'wrong') : 'incomplete';
        setPlacements(nextPlacements);
        setMarks(nextMarks);
        setSelected(null);
        setResult(outcome);
        setAccuseOpen(true);
        setNotice(solved ? 'The evidence is complete. The sheriff is reviewing your accusation.' : 'The submitted evidence contains contradictions.');
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        return { outcome, positionsCorrect: names.filter((name) => nextPlacements[name] === solution[name]).length };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    return () => lifecycle.abort();
  }, []);

  function chooseSuspect(id: SuspectId) {
    setSelected(id);
    const cell = placements[id];
    setNotice(cell === undefined
      ? `${suspects.find((suspect) => suspect.id === id)?.name} selected. Choose a square.`
      : `${suspects.find((suspect) => suspect.id === id)?.name} is in ${roomNames[roomByCell[cell]]}. Choose another square to move them.`);
  }

  function placeOnCell(cell: number) {
    const occupyingId = occupantByCell[cell];
    if (!selected) {
      if (occupyingId) chooseSuspect(occupyingId);
      return;
    }

    const selectedName = suspects.find((suspect) => suspect.id === selected)?.name;
    setPlacements((current) => {
      const next = { ...current };
      const oldCell = next[selected];
      if (occupyingId && occupyingId !== selected) {
        if (oldCell === undefined) delete next[occupyingId];
        else next[occupyingId] = oldCell;
      }
      next[selected] = cell;
      return next;
    });
    setNotice(`${selectedName} placed in ${roomNames[roomByCell[cell]]}.`);
    const nextUnplaced = suspects.find((suspect) => suspect.id !== selected && placements[suspect.id] === undefined && suspect.id !== occupyingId);
    setSelected(nextUnplaced?.id ?? null);
  }

  function removeSuspect(id: SuspectId) {
    setPlacements((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSelected(id);
    setNotice(`${suspects.find((suspect) => suspect.id === id)?.name} returned to the dossier.`);
  }

  function cycleMark(id: SuspectId) {
    if (id === 'vito' || id === 'cooper') return;
    setMarks((current) => {
      const next: Mark = current[id] === 'unknown' ? 'outlaw' : current[id] === 'outlaw' ? 'cleared' : 'unknown';
      return { ...current, [id]: next };
    });
  }

  function checkWork() {
    const positionHits = suspects.filter((suspect) => placements[suspect.id] === solution[suspect.id]).length;
    const statusHits = suspects.filter((suspect) =>
      outlawIds.has(suspect.id) ? marks[suspect.id] === 'outlaw' : marks[suspect.id] === 'cleared',
    ).length;
    setNotice(placedCount === 0
      ? 'Place a few suspects first, then check your deductions.'
      : `${positionHits} of 9 positions and ${statusHits} of 9 identities are correct.`);
  }

  function revealHint() {
    const next = Math.min(hintCount + 1, hints.length);
    setHintCount(next);
    setNotice(next === hints.length ? 'Final hint revealed.' : `Hint ${next} added to your notebook.`);
  }

  function resetGame() {
    setPlacements({});
    setMarks(initialMarks);
    setHintCount(0);
    setSelected('hank');
    setResult('idle');
    setNotice('Case reset. Hank is selected.');
  }

  function accuse(id: SuspectId) {
    const boardSolved = suspects.every((suspect) => placements[suspect.id] === solution[suspect.id]);
    const identitiesSolved = suspects.every((suspect) =>
      outlawIds.has(suspect.id) ? marks[suspect.id] === 'outlaw' : marks[suspect.id] === 'cleared',
    );
    if (!boardSolved || !identitiesSolved) setResult('incomplete');
    else if (id === 'andy') setResult('win');
    else setResult('wrong');
    setAccuseOpen(true);
  }

  return (
    <main className="case-shell">
      <header className="case-header">
        <div className="case-title-lockup">
          <span className="case-number">CASE 24</span>
          <div>
            <h1>The Bank Heist</h1>
            <p>Place the nine witnesses. Find the three outlaws. Name the murderer.</p>
          </div>
        </div>
        <div className="header-actions">
          <Button variant="ghost" size="lg" onClick={() => setRulesOpen(true)}><BookOpen /> How to play</Button>
          <Button variant="ghost" size="lg" onClick={resetGame}><RotateCcw /> Reset</Button>
        </div>
      </header>

      <section className="case-status" aria-live="polite">
        <span className="status-pin"><Search /></span>
        <p>{notice}</p>
        <div className="status-counts">
          <span><MapPin /> {placedCount}/9 placed</span>
          <span><Skull /> {markedOutlaws}/3 marked</span>
        </div>
      </section>

      <div className="game-layout">
        <section className="map-panel" aria-label="Bank map">
          <div className="panel-heading">
            <div><span className="eyebrow">Crime scene</span><h2>Last known positions</h2></div>
            <div className="map-legend"><span><b>♞</b> Horse</span><span><b>▤</b> Table</span><span><b>◈</b> Sack</span></div>
          </div>

          <div className="map-frame">
            <div className="bank-grid">
              {roomByCell.map((room, cell) => {
                const occupantId = occupantByCell[cell];
                const occupant = suspects.find((suspect) => suspect.id === occupantId);
                const object = objects[cell];
                return (
                  <button
                    type="button"
                    key={cell}
                    className={`map-cell room-${room} ${occupant ? 'occupied' : ''}`}
                    onClick={() => placeOnCell(cell)}
                    aria-label={`${roomNames[room]}, row ${getRow(cell) + 1}, column ${getCol(cell) + 1}${occupant ? `, occupied by ${occupant.name}` : ''}`}
                  >
                    {roomLabels[cell] && <span className="room-label">{roomLabels[cell]}</span>}
                    {object && <span className="map-object" title={object.label}>{object.symbol}</span>}
                    {occupant && (
                      <span className={`map-token tone-${occupant.tone} ${selected === occupant.id ? 'selected' : ''}`}>
                        <span>{occupant.initials}</span><small>{occupant.name}</small>
                        {marks[occupant.id] === 'outlaw' && <Skull aria-label="Marked outlaw" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="compass" aria-hidden="true"><span>N</span><i /></div>
          </div>

          <div className="map-actions">
            <Button size="lg" variant="outline" onClick={checkWork}><Check /> Check deductions</Button>
            <Button size="lg" variant="outline" onClick={revealHint} disabled={hintCount === hints.length}>
              <Lightbulb /> {hintCount === hints.length ? 'All hints shown' : 'Reveal a hint'}
            </Button>
          </div>

          {hintCount > 0 && (
            <aside className="hint-note"><Lightbulb /><div><span>Notebook hint {hintCount}</span><p>{hints[hintCount - 1]}</p></div></aside>
          )}
        </section>

        <aside className="dossier-panel" aria-label="Suspect dossier">
          <div className="panel-heading dossier-heading">
            <div><span className="eyebrow">Witness statements</span><h2>Suspect dossier</h2></div>
            <span className="dossier-tip">Tap card → tap map</span>
          </div>

          <div className="suspect-list">
            {suspects.map((suspect) => {
              const cell = placements[suspect.id];
              const mark = marks[suspect.id];
              return (
                <article key={suspect.id} className={`suspect-card ${selected === suspect.id ? 'active' : ''} ${suspect.victim ? 'victim' : ''}`}>
                  <button className="suspect-main" type="button" onClick={() => chooseSuspect(suspect.id)}>
                    <span className={`portrait tone-${suspect.tone}`}><UserRound /></span>
                    <span className="suspect-copy">
                      <strong>{suspect.name}{suspect.victim && <em>Victim</em>}</strong>
                      <small>{suspect.clue}</small>
                    </span>
                  </button>
                  <div className="suspect-tools">
                    <button
                      type="button"
                      className={`identity-mark mark-${mark}`}
                      onClick={() => cycleMark(suspect.id)}
                      disabled={suspect.id === 'vito' || suspect.id === 'cooper'}
                      aria-label={`${suspect.name}: ${mark}. Change identity mark.`}
                    >
                      {mark === 'outlaw' ? <Skull /> : mark === 'cleared' ? <Shield /> : <CircleAlert />}
                      {mark === 'outlaw' ? 'Outlaw' : mark === 'cleared' ? 'Cleared' : 'Unknown'}
                    </button>
                    {cell !== undefined && (
                      <button type="button" className="location-chip" onClick={() => removeSuspect(suspect.id)}>{getRow(cell) + 1}·{getCol(cell) + 1} ×</button>
                    )}
                    {!suspect.victim && <button type="button" className="accuse-link" onClick={() => accuse(suspect.id)}>Accuse</button>}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="case-facts">
            <span className="sheriff-star">★</span>
            <div><strong>Case facts</strong><p>There are exactly 3 outlaws. Each outlaw was alone in a room with one non-outlaw.</p></div>
          </div>
        </aside>
      </div>

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="rules-dialog">
          <DialogHeader>
            <span className="eyebrow">Field guide</span><DialogTitle>How to solve the case</DialogTitle>
            <DialogDescription>Every clue describes the final positions at the bank.</DialogDescription>
          </DialogHeader>
          <ol className="rules-list">
            <li><b>Place suspects.</b> Select a dossier card, then choose a map square. One person fits in each square.</li>
            <li><b>Mark identities.</b> Cycle Unknown → Outlaw → Cleared on each card. Cooper and Vito are already cleared.</li>
            <li><b>Read spatial clues.</b> “Beside” means directly north, south, east, or west. “North of” can be anywhere in a higher row.</li>
            <li><b>Read room clues.</b> “Alone” means the only person in a room. “Alone with” means exactly two people occupy that room.</li>
            <li><b>Close the case.</b> Place everyone, identify all three outlaws, then accuse Vito’s room-mate.</li>
          </ol>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      <Dialog open={accuseOpen} onOpenChange={setAccuseOpen}>
        <DialogContent className={`result-dialog result-${result}`}>
          <DialogHeader>
            {result === 'win' ? <Shield className="result-icon" /> : <Skull className="result-icon" />}
            <DialogTitle>{result === 'win' ? 'Case closed' : result === 'wrong' ? 'Wrong suspect' : 'The evidence is not ready'}</DialogTitle>
            <DialogDescription>
              {result === 'win'
                ? 'Andy was alone with Vito in the Safe Room. The other outlaws were Betty and Dave.'
                : result === 'wrong'
                  ? 'That suspect was not alone with Vito. Recheck the room pairs.'
                  : 'All nine positions and identities must be correct before the sheriff accepts an accusation.'}
            </DialogDescription>
          </DialogHeader>
          {result === 'win' && <div className="solution-strip"><span><b>Vito</b> + <b>Andy</b></span><i>Safe Room</i><strong>Andy is the murderer</strong></div>}
          <DialogFooter>
            {result === 'win' && <Button onClick={resetGame}><RotateCcw /> Play again</Button>}
            <Button variant="outline" onClick={() => setAccuseOpen(false)}>Return to evidence</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
