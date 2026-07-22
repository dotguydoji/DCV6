import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { TYPING_SPEED_DATA } from '../data/typingSpeedData';
import { TestStatus, TimeMode, TimerDuration, SoundMode, RuleMode } from '../lib/typingSpeedTypes';
import { RefreshCcw, Trophy, Facebook, Instagram, Link as LinkIcon, Check, ShieldCheck, Clock, X } from 'lucide-react';

// --- Sound Engine ---
const SoundEngine = {
  ctx: null as AudioContext | null,
  compressor: null as DynamicsCompressorNode | null,

  init() {
    if (!this.ctx) {
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          this.ctx = new AudioCtxClass();
          this.compressor = this.ctx.createDynamicsCompressor();
          this.compressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
          this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
          this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
          this.compressor.attack.setValueAtTime(0, this.ctx.currentTime);
          this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
          this.compressor.connect(this.ctx.destination);
        }
      } catch (e) {
        console.warn('Audio Context not supported or blocked');
      }
    }
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  },

  play(type: SoundMode | 'error' | 'success') {
    if (type === SoundMode.None) return;

    this.init();
    if (!this.ctx || !this.compressor) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.compressor);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };

      switch (type) {
        case SoundMode.Click:
          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, now);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
          osc.start(now);
          osc.stop(now + 0.1);
          break;
        case SoundMode.Mechanical:
          osc.type = 'square';
          osc.frequency.setValueAtTime(400, now);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.start(now);
          osc.stop(now + 0.08);
          break;
        case SoundMode.Typewriter:
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(1000, now);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          osc.start(now);
          osc.stop(now + 0.05);
          break;
        case 'error':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(150, now);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          osc.start(now);
          osc.stop(now + 0.15);
          break;
        case 'success': {
          const osc2 = this.ctx.createOscillator();
          const gain2 = this.ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(this.compressor);

          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, now);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(783.99, now + 0.1);
          gain2.gain.setValueAtTime(0.2, now + 0.1);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

          osc2.onended = () => {
            osc2.disconnect();
            gain2.disconnect();
          };

          osc.start(now);
          osc.stop(now + 0.1);
          osc2.start(now + 0.1);
          osc2.stop(now + 0.2);
          break;
        }
      }
    } catch (e) {
      // Ignore audio playback errors
    }
  }
};

// --- Sub-Components ---

const TypingDisplay = memo(({ paragraph, userInput, status, fontSize, isStrictError }: any) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCharRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      if (activeCharRef.current && containerRef.current) {
        const container = containerRef.current;
        const cursor = activeCharRef.current;
        const cursorOffset = cursor.offsetTop;
        const containerHeight = container.clientHeight;
        const containerScroll = container.scrollTop;

        if (cursorOffset > containerScroll + containerHeight - 60) {
          container.scrollTo({ top: cursorOffset - containerHeight / 2, behavior: 'smooth' });
        } else if (cursorOffset < containerScroll + 40) {
          container.scrollTo({ top: cursorOffset - 60, behavior: 'smooth' });
        }
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [userInput.length, paragraph]);

  return (
    <div
      ref={containerRef}
      className={`font-mono leading-relaxed break-words whitespace-pre-wrap transition-all duration-200 h-[150px] sm:h-[180px] md:h-[220px] overflow-y-auto no-scrollbar w-full ${
        isStrictError ? 'animate-pulse' : ''
      }`}
      style={{ fontSize: `${fontSize}px`, fontVariantLigatures: 'none' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {paragraph.split('').map((char: string, index: number) => {
        let colorClass = 'text-text-secondary/60';
        let bgClass = 'bg-transparent';
        if (index < userInput.length) {
          const userChar = userInput[index];
          if (userChar === char) {
            colorClass = 'text-text-primary';
          } else {
            colorClass = 'text-red-500';
            bgClass = 'bg-red-500/10';
          }
        }
        const isCursor = index === userInput.length;
        return (
          <span key={index} ref={isCursor ? activeCharRef : null} className={`relative ${colorClass} ${bgClass}`}>
            {isCursor && status !== TestStatus.Finished && (
              <span className="absolute left-0 -top-1 bottom-0 w-0.5 bg-orange-500 animate-pulse"></span>
            )}
            {char}
          </span>
        );
      })}
    </div>
  );
}, (prev, next) => {
  return prev.userInput === next.userInput &&
    prev.paragraph === next.paragraph &&
    prev.status === next.status &&
    prev.fontSize === next.fontSize &&
    prev.isStrictError === next.isStrictError;
});

const Timer = memo(({ time }: { time: number }) => (
  <div className="flex items-center justify-center gap-2 text-orange-500 font-mono text-xl font-bold w-20">
    <Clock className="w-5 h-5" />
    <span>{time}s</span>
  </div>
));

const WPMDisplay = memo(({ wpm }: { wpm: number }) => (
  <div className="flex flex-col items-center w-20">
    <span className="text-xs text-text-secondary font-bold uppercase tracking-wider">{TYPING_SPEED_DATA.ui.wpm}</span>
    <span className="text-2xl font-black text-text-primary">{Math.round(wpm)}</span>
  </div>
));

const MistakesCounter = memo(({ count }: { count: number }) => (
  <div className="flex flex-col items-center w-20">
    <span className="text-xs text-text-secondary font-bold uppercase tracking-wider">{TYPING_SPEED_DATA.ui.errors}</span>
    <span className={`text-2xl font-black ${count > 0 ? 'text-red-500' : 'text-text-primary'}`}>{count}</span>
  </div>
));

const ProgressBar = memo(({ progress }: { progress: number }) => (
  <div className="w-full h-1 bg-surface-secondary rounded-full overflow-hidden mt-4">
    <div className="h-full bg-orange-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
  </div>
));

const ToggleSwitch = memo(({ label, isOn, onToggle }: any) => (
  <button onClick={onToggle} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors ml-2">
    <div className={`w-8 h-4 rounded-full relative transition-colors ${isOn ? 'bg-orange-500' : 'bg-border-hairline'}`}>
      <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-surface rounded-full transition-transform ${isOn ? 'translate-x-4' : 'translate-x-0'}`} />
    </div>
    {label}
  </button>
));

const Settings = memo(({ timeMode, onTimeModeChange, timerDuration, onTimerDurationChange, soundMode, onSoundModeChange, fontSize, onFontSizeChange, ruleMode, onRuleModeChange }: any) => {
  const [copied, setCopied] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const url = 'https://dojicreates.com/typing-speed';

  const handleShare = (platform: string) => {
    if (platform === 'facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'width=600,height=400,noopener,noreferrer');
    } else if (platform === 'instagram') {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        window.open('https://instagram.com', '_blank', 'noopener,noreferrer');
      }
    } else {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
      }
    }
  };

  return (
    <>
      <div className="bg-surface border border-border-hairline p-4 rounded-sm w-full flex flex-col lg:flex-row gap-4 lg:gap-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 flex-grow">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase text-text-secondary font-bold tracking-widest">Mode</label>
            <div className="flex gap-1 bg-surface-secondary p-1 rounded-sm">
              {[TimeMode.Timer, TimeMode.Stopwatch].map(m => (
                <button key={m} onClick={() => onTimeModeChange(m)} className={`flex-1 py-1 text-xs rounded-sm ${timeMode === m ? 'bg-orange-500 text-white' : 'text-text-secondary'}`}>{m === TimeMode.Timer ? 'Timer' : 'Stop'}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase text-text-secondary font-bold tracking-widest">Time</label>
            <div className="flex gap-1 bg-surface-secondary p-1 rounded-sm">
              {[15, 30, 60, 120].map(t => (
                <button key={t} onClick={() => onTimerDurationChange(t)} disabled={timeMode !== TimeMode.Timer} className={`flex-1 py-1 text-xs rounded-sm ${timerDuration === t && timeMode === TimeMode.Timer ? 'bg-orange-500 text-white' : 'text-text-secondary disabled:opacity-60'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase text-text-secondary font-bold tracking-widest">Sound</label>
            <select value={soundMode} onChange={(e) => onSoundModeChange(e.target.value)} className="bg-surface-secondary text-text-primary text-xs p-2 rounded-sm border-none focus:ring-1 focus:ring-orange-500 outline-none cursor-pointer h-full">
              <option value={SoundMode.None}>Mute</option>
              <option value={SoundMode.Click}>Click</option>
              <option value={SoundMode.Mechanical}>Mech</option>
              <option value={SoundMode.Typewriter}>Type</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase text-text-secondary font-bold tracking-widest">Size</label>
            <div className="flex gap-1 bg-surface-secondary p-1 rounded-sm">
              {['small', 'medium', 'large'].map((s: any) => (
                <button key={s} onClick={() => onFontSizeChange(s)} className={`flex-1 py-1 text-xs rounded-sm ${fontSize === s ? 'bg-orange-500 text-white' : 'text-text-secondary'}`}>{s.charAt(0).toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase text-text-secondary font-bold tracking-widest">Rules</label>
            <div className="flex gap-1 bg-surface-secondary p-1 rounded-sm">
              {[RuleMode.Continuous, RuleMode.Strict].map(r => (
                <button key={r} onClick={() => onRuleModeChange(r)} className={`flex-1 py-1 text-xs rounded-sm ${ruleMode === r ? 'bg-orange-500 text-white' : 'text-text-secondary'}`}>{r === RuleMode.Continuous ? 'Free' : 'Strict'}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="hidden lg:block w-px bg-border-hairline self-stretch opacity-50"></div>
        <div className="lg:hidden h-px w-full bg-border-hairline opacity-50"></div>

        <div className="flex flex-col gap-2 min-w-max justify-center">
          <label className="text-[10px] uppercase text-text-secondary font-bold tracking-widest lg:text-right">Share & Info</label>
          <div className="flex gap-2">
            <button onClick={() => handleShare('facebook')} className="p-2 bg-surface-secondary hover:bg-[#1877F2] hover:text-white text-text-secondary rounded-sm transition-all duration-300"><Facebook className="w-4 h-4" /></button>
            <button onClick={() => handleShare('instagram')} className="relative p-2 bg-surface-secondary hover:bg-[#E1306C] hover:text-white text-text-secondary rounded-sm transition-all duration-300 group">
              <Instagram className="w-4 h-4" />
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-inverted text-text-inverted text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-border-hairline shadow-xl z-10">Copy & Open IG</span>
            </button>
            <button onClick={() => handleShare('link')} className="p-2 bg-surface-secondary hover:bg-orange-500 hover:text-white text-text-secondary rounded-sm transition-all duration-300">
              {copied ? <Check className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
            </button>
            <div className="w-px bg-border-hairline/50 my-1 mx-1"></div>
            <button onClick={() => setShowPrivacy(true)} className="p-2 bg-surface-secondary hover:bg-surface-secondary text-text-secondary hover:text-green-500 rounded-sm transition-all duration-300" title="Privacy Info">
              <ShieldCheck className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {showPrivacy && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowPrivacy(false)}>
          <div className="bg-surface border border-border-hairline rounded-sm p-6 max-w-sm w-full shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 left-0 w-full h-1 bg-green-500"></div>
            <button onClick={() => setShowPrivacy(false)} className="absolute top-4 right-4 text-text-secondary hover:text-text-primary transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center text-center gap-4 pt-2">
              <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20">
                <ShieldCheck className="w-7 h-7 text-green-500" />
              </div>
              <h3 className="text-xl font-bold text-text-primary uppercase tracking-tight">Privacy Notice</h3>
              <p className="text-text-secondary text-sm leading-relaxed font-medium">
                All performance metrics and typing data are processed and stored <span className="text-green-500 font-bold">100% locally</span> on your device.
              </p>
              <button onClick={() => setShowPrivacy(false)} className="mt-4 w-full py-3 bg-surface-secondary hover:bg-border-hairline border border-border-hairline rounded-sm text-xs font-bold uppercase tracking-widest text-text-primary transition-colors">
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

const KeyCap = memo(({ label, isActive, flex = 1 }: { label: string, isActive: boolean, flex?: number }) => (
  <div
    style={{ flex }}
    className={`relative min-w-0 h-12 sm:h-14 flex items-center justify-center font-mono font-bold uppercase text-xs sm:text-sm transition-all duration-75 select-none border-r border-b border-border-hairline/60 last:border-r-0 ${isActive ? 'bg-orange-500 text-white' : 'bg-surface-secondary/60 text-text-secondary hover:bg-surface-secondary hover:text-text-primary'}`}
  >
    {label}
  </div>
));

const Keyboard = memo(({ lastKeyPressed }: any) => {
  const row1 = '1234567890qwertyuiop'.split('');
  const row2Chars = 'asdfghjklzxcvbnm'.split('');

  return (
    <div className="w-full mt-6 flex flex-col border-t border-l border-border-hairline/60 rounded-sm overflow-hidden bg-surface-secondary/20 backdrop-blur-sm">
      <div className="flex w-full">
        {row1.map(key => {
          const isActive = lastKeyPressed?.key.toLowerCase() === key && (Date.now() - lastKeyPressed.timestamp < 300);
          return <KeyCap key={key} label={key} isActive={isActive} />;
        })}
      </div>
      <div className="flex w-full">
        {row2Chars.map(key => {
          const isActive = lastKeyPressed?.key.toLowerCase() === key && (Date.now() - lastKeyPressed.timestamp < 300);
          return <KeyCap key={key} label={key} isActive={isActive} />;
        })}
        <KeyCap
          label="SPACE"
          isActive={lastKeyPressed?.key === ' ' && (Date.now() - lastKeyPressed.timestamp < 300)}
          flex={4}
        />
      </div>
    </div>
  );
});

const ResultsCard = memo(({ wpm, accuracy, time, onReset }: any) => {
  return (
    <div className="bg-surface border border-border-hairline p-8 rounded-sm shadow-2xl max-w-lg w-full">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-orange-500/20 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4"><Trophy className="w-8 h-8" /></div>
        <h2 className="text-3xl font-black text-text-primary uppercase tracking-tighter">{TYPING_SPEED_DATA.ui.testComplete}</h2>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-surface-secondary p-4 rounded-sm border border-border-hairline text-center">
          <div className="text-text-secondary text-xs font-bold uppercase tracking-widest mb-1">{TYPING_SPEED_DATA.ui.wpm}</div>
          <div className="text-4xl font-black text-text-primary">{wpm}</div>
        </div>
        <div className="bg-surface-secondary p-4 rounded-sm border border-border-hairline text-center">
          <div className="text-text-secondary text-xs font-bold uppercase tracking-widest mb-1">Accuracy</div>
          <div className="text-4xl font-black text-text-primary">{accuracy}%</div>
        </div>
        <div className="col-span-2 bg-surface-secondary p-4 rounded-sm border border-border-hairline text-center">
          <div className="text-text-secondary text-xs font-bold uppercase tracking-widest mb-1">{TYPING_SPEED_DATA.ui.time}</div>
          <div className="text-2xl font-mono text-text-primary">{time}s</div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onReset} className="flex-1 py-4 bg-orange-500 text-white font-bold uppercase tracking-widest rounded-sm hover:bg-orange-400 transition-colors flex items-center justify-center gap-2 shadow-lg">
          <RefreshCcw className="w-4 h-4" /> {TYPING_SPEED_DATA.ui.tryAgain}
        </button>
      </div>
      <p className="text-center text-text-secondary/50 text-xs mt-6 font-mono">{TYPING_SPEED_DATA.ui.pressEnter}</p>
    </div>
  );
});

// --- Main Component ---

type FontSize = 'small' | 'medium' | 'large';
const fontSizeMap: Record<FontSize, number> = { small: 18, medium: 22, large: 26 };

const DEFAULT_PARAGRAPH = 'The quick brown fox jumps over the lazy dog. Practice makes progress, one keystroke at a time.';

export const TypingSpeedTest: React.FC = () => {
  const [paragraph, setParagraph] = useState<string>('');
  const [userInput, setUserInput] = useState<string>('');
  const [status, setStatus] = useState<TestStatus>(TestStatus.Idle);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [results, setResults] = useState<{ wpm: number; accuracy: number; time: number } | null>(null);
  const [realtimeWpm, setRealtimeWpm] = useState<number>(0);
  const [mistypedIndices, setMistypedIndices] = useState<Set<number>>(new Set());
  const [showResultsToggle, setShowResultsToggle] = useState<boolean>(true);
  const [highScore, setHighScore] = useState<number>(0);

  const statusRef = useRef(status); statusRef.current = status;
  const showResultsToggleRef = useRef(showResultsToggle); showResultsToggleRef.current = showResultsToggle;

  const [category, setCategory] = useState<string>('English');
  const [level, setLevel] = useState<string>('normal');
  const [timeMode, setTimeMode] = useState<TimeMode>(TimeMode.Stopwatch);
  const [timerDuration, setTimerDuration] = useState<TimerDuration>(30);
  const [soundMode, setSoundMode] = useState<SoundMode>(SoundMode.Click);
  const [fontSize, setFontSize] = useState<FontSize>('medium');
  const [ruleMode, setRuleMode] = useState<RuleMode>(RuleMode.Continuous);
  const [isStrictError, setIsStrictError] = useState(false);

  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [lastKeyPressed, setLastKeyPressed] = useState<{ key: string; timestamp: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const startTimeRef = useRef<number>(0);
  const intervalIdRef = useRef<number | null>(null);
  const isFinishingRef = useRef(false);

  useEffect(() => {
    try {
      const savedRecord = localStorage.getItem('typing_speed_record');
      if (savedRecord) {
        const parsed = parseInt(savedRecord, 10);
        if (!isNaN(parsed)) setHighScore(parsed);
      }
    } catch (e) {}
  }, []);

  const getRandomParagraph = useCallback((excludeParagraph: string = '') => {
    const categoryParagraphs = TYPING_SPEED_DATA.paragraphs[category as keyof typeof TYPING_SPEED_DATA.paragraphs] || TYPING_SPEED_DATA.paragraphs['English'];
    const levelParagraphs = categoryParagraphs[level as keyof typeof categoryParagraphs] || categoryParagraphs['normal'];

    if (!levelParagraphs || levelParagraphs.length === 0) return DEFAULT_PARAGRAPH;
    if (levelParagraphs.length === 1) return levelParagraphs[0];

    let newPara = '';
    let attempts = 0;
    do {
      newPara = levelParagraphs[Math.floor(Math.random() * levelParagraphs.length)];
      attempts++;
    } while (newPara === excludeParagraph && attempts < 10);

    return newPara || DEFAULT_PARAGRAPH;
  }, [category, level]);

  const stopTimer = () => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
  };

  const resetTest = useCallback(() => {
    stopTimer();
    isFinishingRef.current = false;
    setStatus(TestStatus.Idle);
    setParagraph(prevPara => getRandomParagraph(prevPara));
    setUserInput('');
    setElapsedTime(0);
    setResults(null);
    setRealtimeWpm(0);
    setMistypedIndices(new Set());

    setTimeout(() => { inputRef.current?.focus(); }, 10);
  }, [getRandomParagraph]);

  const finishTest = useCallback((finalInput: string, finalDurationSeconds: number) => {
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;

    const totalChars = finalInput.length;
    const errorCount = ruleMode === RuleMode.Strict ? 0 : mistypedIndices.size;
    const correctChars = ruleMode === RuleMode.Strict ? totalChars : Math.max(0, totalChars - errorCount);

    const safeDuration = Math.max(0.1, finalDurationSeconds);
    const timeInMinutes = safeDuration / 60;
    const wpm = (correctChars / 5) / timeInMinutes;

    const accuracy = totalChars > 0 ? (correctChars / totalChars) * 100 : 0;

    const finalWpm = Math.max(0, Math.round(wpm));
    const finalAccuracy = Math.round(accuracy);
    const finalTime = Math.round(finalDurationSeconds);

    SoundEngine.play('success');

    try {
      const currentHigh = parseInt(localStorage.getItem('typing_speed_record') || '0', 10);
      if (finalWpm > currentHigh && !isNaN(finalWpm)) {
        localStorage.setItem('typing_speed_record', finalWpm.toString());
        setHighScore(finalWpm);
      }
    } catch (e) {}

    setResults({ wpm: finalWpm, accuracy: finalAccuracy, time: finalTime });
    setStatus(TestStatus.Finished);
    stopTimer();

    if (!showResultsToggleRef.current) setTimeout(() => { resetTest(); }, 200);
  }, [mistypedIndices, ruleMode, resetTest]);

  const finishTestRef = useRef(finishTest);
  finishTestRef.current = finishTest;

  useEffect(() => { resetTest(); }, [resetTest, timeMode, timerDuration, category, level, ruleMode]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => { if (e.key === 'CapsLock' && e.isTrusted) setIsCapsLockOn(e.getModifierState('CapsLock')); };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  useEffect(() => {
    if (status === TestStatus.Running && !intervalIdRef.current) {
      startTimeRef.current = Date.now();
      intervalIdRef.current = window.setInterval(() => {
        const now = Date.now();
        const diffSeconds = (now - startTimeRef.current) / 1000;
        setElapsedTime(diffSeconds);

        if (timeMode === TimeMode.Timer && diffSeconds >= timerDuration) {
          finishTestRef.current(inputRef.current?.value || '', timerDuration);
        }
      }, 100);
    }
    return () => stopTimer();
  }, [status, timeMode, timerDuration]);

  useEffect(() => {
    if (elapsedTime < 2) {
      setRealtimeWpm(0);
      return;
    }

    const currentInput = inputRef.current?.value || '';
    const totalChars = currentInput.length;
    const errorCount = ruleMode === RuleMode.Strict ? 0 : mistypedIndices.size;
    const correctChars = Math.max(0, totalChars - errorCount);
    const timeMins = elapsedTime / 60;

    const currentWpm = timeMins > 0 ? (correctChars / 5) / timeMins : 0;
    setRealtimeWpm(currentWpm);
  }, [elapsedTime, mistypedIndices.size, ruleMode]);

  useEffect(() => {
    const handleRestartKey = (e: KeyboardEvent) => {
      if (status === TestStatus.Finished && e.key === 'Enter') {
        e.preventDefault();
        resetTest();
      }
    };

    if (status === TestStatus.Finished) {
      window.addEventListener('keydown', handleRestartKey);
    }
    return () => window.removeEventListener('keydown', handleRestartKey);
  }, [status, resetTest]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (status === TestStatus.Finished) {
      e.preventDefault();
      return;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
      e.preventDefault();
      return;
    }

    setIsCapsLockOn(e.getModifierState('CapsLock'));
    setLastKeyPressed({ key: e.key, timestamp: Date.now() });

    if (status === TestStatus.Idle && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setStatus(TestStatus.Running);
      SoundEngine.init();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (status === TestStatus.Finished || isFinishingRef.current) return;
    if (value.length > paragraph.length) return;

    const isAdding = value.length > userInput.length;

    if (isAdding && value.length > userInput.length + 1) {
      return;
    }

    const charIndex = value.length - 1;
    const charTyped = value.slice(-1);

    if (isAdding) {
      if (ruleMode === RuleMode.Strict) {
        if (charTyped !== paragraph[charIndex]) {
          SoundEngine.play('error');
          setIsStrictError(true);
          setTimeout(() => setIsStrictError(false), 300);
          return;
        }
      } else {
        if (charTyped !== paragraph[charIndex]) {
          setMistypedIndices(prev => { const n = new Set(prev); n.add(charIndex); return n; });
        }
      }
    } else {
      setMistypedIndices(prev => {
        const newSet = new Set<number>();
        prev.forEach(idx => {
          if (idx < value.length) newSet.add(idx);
        });
        return newSet;
      });
    }

    SoundEngine.play(soundMode);
    setUserInput(value);

    if (value.length === paragraph.length) {
      const finalTime = Math.max(0.1, (Date.now() - startTimeRef.current) / 1000);
      finishTest(value, finalTime);
    }
  };

  const displayTime = timeMode === TimeMode.Timer ? Math.max(0, timerDuration - elapsedTime) : elapsedTime;
  const progress = paragraph.length > 0 ? (userInput.length / paragraph.length) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 pt-10 bg-surface overflow-hidden">
      <div className={`w-full max-w-7xl flex flex-col items-center gap-6 transition-all duration-300 ${status === TestStatus.Finished && showResultsToggle ? 'blur-sm' : ''}`}>
        {highScore > 0 && (
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-orange-500">
            <Trophy className="w-4 h-4" /> Best: {highScore} WPM
          </div>
        )}
        <div className="w-full bg-surface border border-orange-500/20 rounded-sm shadow-2xl p-6 md:p-8 cursor-text" onClick={() => inputRef.current?.focus()}>
          <div className="relative">
            <TypingDisplay paragraph={paragraph} userInput={userInput} status={status} fontSize={fontSizeMap[fontSize]} isStrictError={isStrictError} />
            <input
              ref={inputRef}
              type="text"
              value={userInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              onMouseDown={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
              className="absolute top-0 left-0 w-full h-full opacity-0 cursor-text select-none"
              autoFocus
              disabled={status === TestStatus.Finished}
              maxLength={paragraph.length}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              aria-label="Type the text to begin the test"
            />
          </div>
          <div className="mt-4"><ProgressBar progress={progress} /></div>
          <div className="flex flex-col xl:flex-row items-center justify-between mt-4 gap-4">
            <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 md:gap-x-6">
              <Timer time={Math.floor(displayTime)} /> <div className="h-8 w-px bg-border-hairline self-center hidden sm:block" aria-hidden="true" />
              <WPMDisplay wpm={realtimeWpm} /> <div className="h-8 w-px bg-border-hairline self-center hidden sm:block" aria-hidden="true" />
              <MistakesCounter count={ruleMode === RuleMode.Strict ? 0 : mistypedIndices.size} /> <div className="h-8 w-px bg-border-hairline self-center hidden sm:block" aria-hidden="true" />
              <ToggleSwitch label={TYPING_SPEED_DATA.ui.result} isOn={showResultsToggle} onToggle={() => setShowResultsToggle(!showResultsToggle)} />
              {isCapsLockOn && <div className="w-full md:w-auto text-center md:ml-4 text-red-400 font-bold text-xs sm:text-sm bg-red-500/10 px-2 py-1 rounded-sm animate-pulse">{TYPING_SPEED_DATA.ui.capsLock}</div>}
            </div>
            <div className="flex flex-wrap justify-center items-center gap-2 p-1 bg-surface-secondary/50 rounded-sm border border-border-hairline/30">
              <div className="flex gap-1 bg-surface-secondary/50 p-1 rounded-sm">
                {Object.keys(TYPING_SPEED_DATA.paragraphs).map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)} className={`px-2 py-1 text-[10px] font-bold uppercase rounded-sm transition-all ${category === cat ? 'bg-orange-500 text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}>{cat}</button>
                ))}
              </div>
              <div className="h-4 w-px bg-border-hairline/50 self-center hidden sm:block" aria-hidden="true" />
              <div className="flex gap-1 bg-surface-secondary/50 p-1 rounded-sm">
                {['easy', 'normal', 'hard'].map(lvl => (
                  <button key={lvl} onClick={() => setLevel(lvl)} className={`px-2 py-1 text-[10px] font-bold uppercase rounded-sm transition-all ${level === lvl ? 'bg-surface-inverted text-text-inverted shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}>{lvl}</button>
                ))}
              </div>
            </div>
            <button onClick={resetTest} className="bg-transparent border border-border-hairline hover:bg-surface-secondary text-text-secondary font-bold py-2 px-6 rounded-sm transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-orange-500/50">{TYPING_SPEED_DATA.ui.reset}</button>
          </div>
        </div>
        <div className="w-full mx-auto flex flex-col items-center gap-4">
          <Settings timeMode={timeMode} onTimeModeChange={setTimeMode} timerDuration={timerDuration} onTimerDurationChange={setTimerDuration} soundMode={soundMode} onSoundModeChange={setSoundMode} fontSize={fontSize} onFontSizeChange={setFontSize} ruleMode={ruleMode} onRuleModeChange={setRuleMode} />
        </div>
        <div className="w-full hidden md:block"><Keyboard lastKeyPressed={lastKeyPressed} /></div>
      </div>
      {status === TestStatus.Finished && results && showResultsToggle && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <ResultsCard
            wpm={results.wpm}
            accuracy={results.accuracy}
            time={results.time}
            onReset={resetTest}
          />
        </div>
      )}
    </div>
  );
};
