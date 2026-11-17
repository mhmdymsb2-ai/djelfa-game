import { useCallback, useEffect, useRef, useState } from 'react';
import { BriefingModal } from './components/BriefingModal';
import { EndScreen } from './components/EndScreen';
import { GameHud } from './components/GameHud';
import { ShopModal } from './components/ShopModal';
import { TitleScreen } from './components/TitleScreen';
import { GameEngine } from './game/GameEngine';
import { loadSavedProgress, SavedProgress } from './game/saveSystem';
import { MISSIONS } from './game/storyData';
import {
  ChatChoice,
  GamePhase,
  HudState,
  RadioMessage,
  ShopDefinition,
  ShopItem,
  WeaponId,
} from './game/types';

const INITIAL_HUD: HudState = {
  hp: 100,
  maxHp: 100,
  armor: 0,
  cash: 5000,
  wantedLevel: 0,
  districtName: 'حي المصلى · الجلفة 17',
  inVehicle: false,
  vehicleName: '',
  vehiclePlate: '',
  vehicleHp: 0,
  vehicleMaxHp: 1,
  speedKmh: 0,
  activeWeapon: 'beretta',
  unlockedWeapons: ['beretta'],
  ammoInMag: { beretta: 15, ak47: 30, shotgun: 8 },
  reserveAmmo: { beretta: 999, ak47: 150, shotgun: 40 },
  isReloading: false,
  missionIndex: 0,
  missionTitle: MISSIONS[0].title,
  missionObjective: MISSIONS[0].objectiveText,
  missionProgressText: '',
  interactionPrompt: null,
  playerX: 16,
  playerZ: 62,
  playerYaw: Math.PI,
  targetX: MISSIONS[0].targetPos.x,
  targetZ: MISSIONS[0].targetPos.z,
  minimapEntities: [],
  isFreeRoam: false,
  kills: 0,
  hitMarkerTimer: 0,
  damageFlashTimer: 0,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [callout, setCallout] = useState<string | null>(null);
  const [radioMsg, setRadioMsg] = useState<RadioMessage | null>(null);
  const [activeShop, setActiveShop] = useState<ShopDefinition | null>(null);
  const [muted, setMuted] = useState(false);
  const [savedGame, setSavedGame] = useState<SavedProgress | null>(() => loadSavedProgress());
  const [finalStats, setFinalStats] = useState({ kills: 0, cash: 5000 });
  const calloutTimerRef = useRef<number | null>(null);
  const radioTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const engine = new GameEngine(el, {
      onHudUpdate: (nextHud) => setHud(nextHud),
      onMissionComplete: () => {
        setSavedGame(loadSavedProgress());
        setPhase('briefing');
      },
      onVictory: (kills, cash) => {
        setSavedGame(loadSavedProgress());
        setFinalStats({ kills, cash });
        setPhase('victory');
      },
      onDefeat: () => {
        setPhase('defeat');
      },
      onCallout: (text) => {
        setCallout(text);
        if (calloutTimerRef.current) window.clearTimeout(calloutTimerRef.current);
        calloutTimerRef.current = window.setTimeout(() => setCallout(null), 3200);
      },
      onRadioMessage: (msg) => {
        setRadioMsg(msg);
        if (radioTimerRef.current) window.clearTimeout(radioTimerRef.current);
        radioTimerRef.current = window.setTimeout(() => setRadioMsg(null), 5500);
      },
      onOpenShop: (shop) => {
        setActiveShop(shop);
      },
    });
    engineRef.current = engine;

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        setActiveShop((currShop) => {
          if (currShop) {
            engine.setPhase('playing');
            return null;
          }
          setPhase((prev) => {
            if (prev === 'playing') {
              engine.setPhase('paused');
              return 'paused';
            }
            if (prev === 'paused') {
              engine.setPhase('playing');
              return 'playing';
            }
            return prev;
          });
          return null;
        });
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      if (calloutTimerRef.current) window.clearTimeout(calloutTimerRef.current);
      if (radioTimerRef.current) window.clearTimeout(radioTimerRef.current);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleStartStory = () => {
    setActiveShop(null);
    engineRef.current?.startNewGame(false);
    setSavedGame(loadSavedProgress());
    setPhase('briefing');
  };

  const handleContinueSave = () => {
    const save = loadSavedProgress();
    if (!save) {
      handleStartStory();
      return;
    }
    setActiveShop(null);
    engineRef.current?.continueFromSave(save);
    setPhase('playing');
  };

  const handleStartFreeRoam = () => {
    setActiveShop(null);
    engineRef.current?.startNewGame(true);
    setPhase('playing');
  };

  const handleContinueBriefing = () => {
    engineRef.current?.setPhase('playing');
    setPhase('playing');
  };

  const handleToggleMute = () => {
    setMuted((m) => {
      const next = !m;
      engineRef.current?.setMuted(next);
      return next;
    });
  };

  const handleSaveProgress = () => {
    engineRef.current?.saveNow(true);
    setSavedGame(loadSavedProgress());
  };

  const handlePause = () => {
    engineRef.current?.setPhase('paused');
    setPhase('paused');
  };

  const handleResume = () => {
    engineRef.current?.setPhase('playing');
    setPhase('playing');
  };

  const handleMainMenu = () => {
    setActiveShop(null);
    setSavedGame(loadSavedProgress());
    engineRef.current?.setPhase('title');
    setPhase('title');
  };

  const handleCloseShop = () => {
    setActiveShop(null);
    engineRef.current?.stopDialogueSpeech();
    engineRef.current?.setPhase('playing');
  };

  const handleBuyShopItem = (shop: ShopDefinition, item: ShopItem) => {
    if (!engineRef.current) return { ok: false, message: 'خطأ في المحرك' };
    return engineRef.current.purchaseShopItem(shop, item);
  };

  const handleSpeakLine = useCallback(
    (text: string, portrait: 'mosaab' | 'ally' | 'mafia' | 'cover') => {
      engineRef.current?.speakDialogueLine(text, portrait);
    },
    []
  );

  const handleStopSpeak = useCallback(() => {
    engineRef.current?.stopDialogueSpeech();
  }, []);

  const handleSelectChatChoice = (choice: ChatChoice) => {
    engineRef.current?.applyChatChoice(choice);
  };

  const activeMission = MISSIONS[hud.missionIndex] || MISSIONS[0];

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0c0e13]">
      <div ref={mountRef} className="w-full h-full" />

      {phase === 'title' && (
        <TitleScreen
          savedGame={savedGame}
          onContinueSave={handleContinueSave}
          onStartStory={handleStartStory}
          onStartFreeRoam={handleStartFreeRoam}
        />
      )}

      {phase === 'briefing' && (
        <BriefingModal
          key={activeMission.id}
          mission={activeMission}
          onSpeakLine={handleSpeakLine}
          onStopSpeak={handleStopSpeak}
          onContinue={handleContinueBriefing}
        />
      )}

      {phase === 'playing' && !activeShop && (
        <GameHud
          hud={hud}
          callout={callout}
          radioMsg={radioMsg}
          muted={muted}
          onToggleMute={handleToggleMute}
          onPause={handlePause}
          onSaveProgress={handleSaveProgress}
          onSelectChatChoice={handleSelectChatChoice}
          onSwitchWeapon={(w: WeaponId) => engineRef.current?.equipWeapon(w)}
          onReload={() => engineRef.current?.triggerReload()}
          onInteract={() => engineRef.current?.triggerInteract('all')}
          onShoot={() => engineRef.current?.triggerShoot()}
        />
      )}

      {activeShop && (
        <ShopModal
          shop={activeShop}
          cash={hud.cash}
          onBuy={handleBuyShopItem}
          onClose={handleCloseShop}
        />
      )}

      {(phase === 'paused' || phase === 'victory' || phase === 'defeat') && !activeShop && (
        <EndScreen
          mode={phase}
          kills={phase === 'victory' ? finalStats.kills : hud.kills}
          cash={phase === 'victory' ? finalStats.cash : hud.cash}
          onResume={phase === 'paused' ? handleResume : undefined}
          onSave={phase === 'paused' && !hud.isFreeRoam ? handleSaveProgress : undefined}
          onRetry={handleStartStory}
          onFreeRoam={handleStartFreeRoam}
          onMainMenu={handleMainMenu}
        />
      )}
    </div>
  );
}
