import React, { useState, useEffect } from 'react';
import { CardId, CreatureType, GameState } from '../types';
import { CARDS, getRandomElement } from '../constants';
import { generateRandomAiDeck } from '../services/gameEngine';
import { multiplayerService, RemotePlayerInfo, ConnectionStatus } from '../services/multiplayer';

interface MultiplayerLobbyProps {
  playerName: string;
  onStartGame: (initialState: GameState, myId: string, isHost: boolean) => void;
  onBack: () => void;
  onOpenDeckBuilder: () => void;
  customDeck: CardId[];
  creatureType: CreatureType;
  size: 'Small' | 'Medium' | 'Big';
}

const CREATURE_ICONS: Record<CreatureType, string> = {
  [CreatureType.Mammal]: '🐻 Mammal',
  [CreatureType.Reptile]: '🦎 Reptile',
  [CreatureType.Avian]: '🦅 Avian',
  [CreatureType.Amphibian]: '🐸 Amphibian',
};

const generateRandomRoomCode = (): string => {
  const words = ['CLASH', 'FANG', 'ROAR', 'BEAST', 'CLAW', 'VIPER', 'HAWK', 'WOLF', 'BEAR', 'SHARK', 'APEX'];
  const prefix = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${prefix}${num}`;
};

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  playerName,
  onStartGame,
  onBack,
  onOpenDeckBuilder,
  customDeck,
  creatureType,
  size,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [createdRoomCode] = useState(generateRandomRoomCode());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [opponent, setOpponent] = useState<RemotePlayerInfo | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Deck mode: 'custom' or 'random'
  const hasCustomDeck = customDeck && customDeck.length >= 10;
  const [deckMode, setDeckMode] = useState<'custom' | 'random'>(hasCustomDeck ? 'custom' : 'random');

  // Random setup generated on demand or mount
  const [randomSetup, setRandomSetup] = useState(() => {
    const types = [CreatureType.Mammal, CreatureType.Reptile, CreatureType.Avian, CreatureType.Amphibian];
    const sizes: ('Small' | 'Medium' | 'Big')[] = ['Small', 'Medium', 'Big'];
    const rType = getRandomElement(types);
    const rSize = getRandomElement(sizes);
    return {
      type: rType,
      size: rSize,
      deck: generateRandomAiDeck(rType, rSize),
    };
  });

  const rollNewRandomDeck = () => {
    const types = [CreatureType.Mammal, CreatureType.Reptile, CreatureType.Avian, CreatureType.Amphibian];
    const sizes: ('Small' | 'Medium' | 'Big')[] = ['Small', 'Medium', 'Big'];
    const rType = getRandomElement(types);
    const rSize = getRandomElement(sizes);
    setRandomSetup({
      type: rType,
      size: rSize,
      deck: generateRandomAiDeck(rType, rSize),
    });
  };

  // Resolve current active setup for this player
  const activeCreatureType = deckMode === 'custom' && hasCustomDeck ? creatureType : randomSetup.type;
  const activeSize = deckMode === 'custom' && hasCustomDeck ? size : randomSetup.size;
  const activeDeck = deckMode === 'custom' && hasCustomDeck ? customDeck : randomSetup.deck;

  // Check URL parameters for ?room=CODE
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const roomParam = searchParams.get('room');
    if (roomParam) {
      setRoomCodeInput(roomParam.trim().toUpperCase());
      setActiveTab('join');
    }
  }, []);

  // Cleanup multiplayer on unmount if not in game
  useEffect(() => {
    return () => {
      if (connectionStatus !== 'in_game') {
        multiplayerService.leaveRoom();
      }
    };
  }, [connectionStatus]);

  const handleCreateRoom = () => {
    const myId = `host_${Date.now().toString(36)}`;
    const localPlayer: RemotePlayerInfo = {
      id: myId,
      name: playerName || 'Host',
      creatureType: activeCreatureType,
      size: activeSize,
      deckCards: activeDeck,
    };

    multiplayerService.init(createdRoomCode, true, localPlayer, {
      onStatusChange: (status, msg) => {
        setConnectionStatus(status);
        if (msg) setStatusMessage(msg);
      },
      onOpponentJoined: (opp) => {
        setOpponent(opp);
      },
      onOpponentLeft: () => {
        setOpponent(null);
        setStatusMessage('Opponent has disconnected.');
      },
      onGameStarted: (initialState) => {
        onStartGame(initialState, myId, true);
      },
      onRemoteAction: () => {},
      onStateSync: () => {},
      onEmoteReceived: () => {},
      onRematchRequested: () => {},
    });
  };

  const handleJoinRoom = () => {
    if (!roomCodeInput.trim()) {
      setStatusMessage('Please enter a room code.');
      return;
    }

    const myId = `guest_${Date.now().toString(36)}`;
    const localPlayer: RemotePlayerInfo = {
      id: myId,
      name: playerName || 'Challenger',
      creatureType: activeCreatureType,
      size: activeSize,
      deckCards: activeDeck,
    };

    multiplayerService.init(roomCodeInput.trim(), false, localPlayer, {
      onStatusChange: (status, msg) => {
        setConnectionStatus(status);
        if (msg) setStatusMessage(msg);
      },
      onOpponentJoined: (opp) => {
        setOpponent(opp);
      },
      onOpponentLeft: () => {
        setOpponent(null);
        setStatusMessage('Host has disconnected.');
      },
      onGameStarted: (initialState) => {
        onStartGame(initialState, myId, false);
      },
      onRemoteAction: () => {},
      onStateSync: () => {},
      onEmoteReceived: () => {},
      onRematchRequested: () => {},
    });
  };

  const handleStartHostBattle = () => {
    if (!opponent) return;
    multiplayerService.startHostGame();
  };

  const handleCopyInviteLink = () => {
    const code = activeTab === 'create' ? createdRoomCode : roomCodeInput;
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleCancel = () => {
    multiplayerService.leaveRoom();
    setConnectionStatus('idle');
    setOpponent(null);
    setStatusMessage('');
  };

  const isConnectedToRoom = connectionStatus === 'waiting_for_opponent' || connectionStatus === 'ready' || connectionStatus === 'connecting';

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-4 text-white relative">
      <div className="max-w-xl w-full bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl p-6 md:p-8 animate-fade-in relative z-10">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6 border-b border-stone-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🌐</span>
            <div>
              <h1 className="text-2xl font-black text-amber-500 uppercase tracking-wider">Online Multiplayer</h1>
              <p className="text-xs text-stone-400">Live PvP creature battle • Vercel Ready</p>
            </div>
          </div>
          <button
            onClick={onBack}
            className="text-stone-400 hover:text-white text-xs font-bold px-3 py-1.5 bg-stone-800 rounded-lg border border-stone-700 transition cursor-pointer"
          >
            ← Menu
          </button>
        </div>

        {/* Deck Selection & Chosen Creature Display Bar */}
        <div className="mb-6 p-4 bg-stone-950/80 border border-stone-800 rounded-2xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-800/80 pb-3">
            <div>
              <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Your Battler: </span>
              <span className="font-black text-amber-400 text-sm ml-1">{playerName || 'Player'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400">Chosen Creature:</span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-1">
                {CREATURE_ICONS[activeCreatureType]}
                <span className="text-stone-300 font-normal">({activeSize})</span>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex gap-2">
              {hasCustomDeck && (
                <button
                  onClick={() => setDeckMode('custom')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    deckMode === 'custom'
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  My Custom Deck ({CREATURE_ICONS[creatureType]})
                </button>
              )}
              <button
                onClick={() => setDeckMode('random')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  deckMode === 'random'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                }`}
              >
                🎲 Random Deck ({CREATURE_ICONS[randomSetup.type]}, {randomSetup.size})
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {deckMode === 'random' && (
                <button
                  onClick={rollNewRandomDeck}
                  className="text-stone-400 hover:text-amber-400 font-bold underline cursor-pointer text-[11px]"
                  title="Re-roll a new random creature type and size"
                >
                  🔄 Re-roll Creature
                </button>
              )}
              <button
                onClick={onOpenDeckBuilder}
                className="text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer text-[11px]"
              >
                Deck Builder
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        {!isConnectedToRoom ? (
          <div>
            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 mb-6 p-1 bg-stone-950 rounded-xl border border-stone-800">
              <button
                onClick={() => setActiveTab('create')}
                className={`py-2.5 rounded-lg font-black text-sm tracking-wide transition cursor-pointer ${
                  activeTab === 'create'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                CREATE ROOM
              </button>
              <button
                onClick={() => setActiveTab('join')}
                className={`py-2.5 rounded-lg font-black text-sm tracking-wide transition cursor-pointer ${
                  activeTab === 'join'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                JOIN ROOM
              </button>
            </div>

            {/* Tab: Create Room */}
            {activeTab === 'create' && (
              <div className="space-y-4">
                <div className="p-5 bg-stone-950/70 rounded-2xl border border-stone-800 text-center">
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-1.5">
                    Your Room Code
                  </label>
                  <div className="text-4xl font-black text-amber-400 tracking-widest font-mono">
                    {createdRoomCode}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-2">
                    Playing as <span className="font-bold text-amber-300">{CREATURE_ICONS[activeCreatureType]} ({activeSize})</span> with a {activeDeck.length}-card deck
                  </p>
                </div>

                <button
                  onClick={handleCreateRoom}
                  className="w-full py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black text-lg rounded-xl shadow-lg transition transform hover:scale-[1.01] active:scale-95 border-b-4 border-orange-800 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>⚔️</span> CREATE ROOM & WAIT FOR CHALLENGER
                </button>
              </div>
            )}

            {/* Tab: Join Room */}
            {activeTab === 'join' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">
                    Enter Room Code
                  </label>
                  <input
                    type="text"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. CLASH72"
                    maxLength={10}
                    className="w-full px-4 py-3.5 bg-black/60 rounded-xl border border-stone-700 text-amber-400 text-2xl font-black tracking-widest text-center uppercase focus:border-amber-500 outline-none font-mono"
                  />
                  <p className="text-center text-[11px] text-stone-500 mt-1.5">
                    Entering as <span className="font-bold text-amber-300">{CREATURE_ICONS[activeCreatureType]} ({activeSize})</span>
                  </p>
                </div>

                <button
                  onClick={handleJoinRoom}
                  disabled={!roomCodeInput.trim()}
                  className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:hover:scale-100 text-white font-black text-lg rounded-xl shadow-lg transition transform hover:scale-[1.01] active:scale-95 border-b-4 border-emerald-800 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>🔗</span> JOIN ROOM
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Waiting / Room Lobby State */
          <div className="space-y-6">
            <div className="p-4 bg-stone-950/80 rounded-2xl border border-stone-800 text-center">
              <div className="text-xs uppercase font-bold text-stone-400 tracking-wider mb-1">
                Active Room
              </div>
              <div className="text-4xl font-black text-amber-400 tracking-widest font-mono select-all">
                {activeTab === 'create' ? createdRoomCode : roomCodeInput}
              </div>

              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  onClick={handleCopyInviteLink}
                  className="px-4 py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg text-xs font-bold text-stone-200 transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>{copySuccess ? '✓ Copied Link!' : '📋 Copy Invite Link'}</span>
                </button>
              </div>
            </div>

            {/* Players Status Cards displaying each player's chosen creature type */}
            <div className="grid grid-cols-2 gap-3">
              {/* Local Player */}
              <div className="p-4 bg-stone-950/70 border-2 border-amber-500/40 rounded-2xl text-center shadow-lg">
                <span className="text-2xl block mb-1">👑</span>
                <div className="text-xs text-amber-400 font-black uppercase tracking-wider">
                  {playerName || 'You'} {activeTab === 'create' ? '(HOST)' : ''}
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-850 rounded-full border border-stone-700 text-xs font-bold text-amber-300 my-2">
                  <span>{CREATURE_ICONS[activeCreatureType]}</span>
                  <span className="text-stone-400 font-normal">({activeSize})</span>
                </div>
                <div className="text-[11px] text-stone-400 font-mono">
                  {activeDeck.length} Cards in Deck
                </div>
                <div className="mt-2 text-[10px] text-emerald-400 font-black tracking-wider uppercase">
                  READY (YOU)
                </div>
              </div>

              {/* Opponent Player */}
              <div className={`p-4 rounded-2xl border-2 text-center shadow-lg transition-all ${
                opponent
                  ? 'bg-stone-950/70 border-emerald-500/50 text-stone-200'
                  : 'bg-stone-950/30 border-dashed border-stone-800 text-stone-500'
              }`}>
                <span className="text-2xl block mb-1">{opponent ? '⚔️' : '⏳'}</span>
                <div className="text-xs font-black uppercase tracking-wider">
                  {opponent ? opponent.name : 'Waiting for Challenger...'}
                </div>
                {opponent ? (
                  <>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-850 rounded-full border border-stone-700 text-xs font-bold text-emerald-300 my-2">
                      <span>{CREATURE_ICONS[opponent.creatureType]}</span>
                      <span className="text-stone-400 font-normal">({opponent.size})</span>
                    </div>
                    <div className="text-[11px] text-stone-400 font-mono">
                      {opponent.deckCards.length} Cards in Deck
                    </div>
                    <div className="mt-2 text-[10px] text-emerald-400 font-black tracking-wider uppercase animate-pulse">
                      CHALLENGER READY
                    </div>
                  </>
                ) : (
                  <div className="py-4 text-xs text-stone-500 italic">
                    Waiting for someone to join...
                  </div>
                )}
              </div>
            </div>

            {/* Status Message */}
            {statusMessage && (
              <div className="text-center text-xs text-stone-300 bg-stone-900/60 p-2.5 rounded-lg border border-stone-800">
                {statusMessage}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2">
              {activeTab === 'create' ? (
                <button
                  onClick={handleStartHostBattle}
                  disabled={!opponent}
                  className="w-full py-4 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 disabled:opacity-40 disabled:hover:scale-100 text-white font-black text-lg rounded-xl shadow-[0_0_25px_rgba(220,38,38,0.4)] transition transform hover:scale-[1.01] active:scale-95 border-b-4 border-red-800 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>⚔️</span> START BATTLE
                </button>
              ) : (
                <div className="text-center p-3 text-xs text-stone-400 italic">
                  Waiting for host to launch the match...
                </div>
              )}

              <button
                onClick={handleCancel}
                className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs rounded-xl border border-stone-700 transition cursor-pointer"
              >
                Leave Room
              </button>
            </div>
          </div>
        )}

        {/* Back to Single Player */}
        <div className="mt-6 pt-4 border-t border-stone-800 flex justify-between items-center text-xs text-stone-500">
          <button
            onClick={onBack}
            className="hover:text-stone-300 font-bold transition cursor-pointer"
          >
            ← Back to Main Menu
          </button>
          <span>Real-time WebSocket PvP</span>
        </div>
      </div>
    </div>
  );
};
