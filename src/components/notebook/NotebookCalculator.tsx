import React, { useState, useCallback } from 'react';
import { Delete } from 'lucide-react';

type PendingOp = '+' | '-' | '×' | '÷' | null;

const formatDisplay = (value: number): string => {
  if (!Number.isFinite(value)) return 'Error';
  const rounded = Math.round(value * 1e10) / 1e10;
  return rounded.toString();
};

const applyOp = (a: number, b: number, op: PendingOp): number => {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? NaN : a / b;
    default: return b;
  }
};

/** Small self-contained arithmetic calculator - no external deps, keeps its own local input state only. */
export const NotebookCalculator: React.FC = () => {
  const [display, setDisplay] = useState('0');
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<PendingOp>(null);
  const [awaitingNewValue, setAwaitingNewValue] = useState(false);

  const inputDigit = useCallback((digit: string) => {
    setDisplay((prev) => {
      if (awaitingNewValue) {
        setAwaitingNewValue(false);
        return digit;
      }
      if (prev === '0') return digit;
      if (prev.replace('-', '').length >= 15) return prev;
      return prev + digit;
    });
  }, [awaitingNewValue]);

  const inputDecimal = useCallback(() => {
    setDisplay((prev) => {
      if (awaitingNewValue) {
        setAwaitingNewValue(false);
        return '0.';
      }
      return prev.includes('.') ? prev : prev + '.';
    });
  }, [awaitingNewValue]);

  const toggleSign = useCallback(() => {
    setDisplay((prev) => (prev.startsWith('-') ? prev.slice(1) : prev === '0' ? prev : '-' + prev));
  }, []);

  const inputPercent = useCallback(() => {
    setDisplay((prev) => formatDisplay(parseFloat(prev) / 100));
  }, []);

  const clearAll = useCallback(() => {
    setDisplay('0');
    setStoredValue(null);
    setPendingOp(null);
    setAwaitingNewValue(false);
  }, []);

  const backspace = useCallback(() => {
    setDisplay((prev) => {
      if (awaitingNewValue || prev.length <= 1 || (prev.length === 2 && prev.startsWith('-'))) return '0';
      return prev.slice(0, -1);
    });
  }, [awaitingNewValue]);

  const chooseOperator = useCallback((op: Exclude<PendingOp, null>) => {
    const current = parseFloat(display);
    if (storedValue !== null && pendingOp && !awaitingNewValue) {
      const result = applyOp(storedValue, current, pendingOp);
      setStoredValue(result);
      setDisplay(formatDisplay(result));
    } else {
      setStoredValue(current);
    }
    setPendingOp(op);
    setAwaitingNewValue(true);
  }, [display, storedValue, pendingOp, awaitingNewValue]);

  const calculateResult = useCallback(() => {
    if (storedValue === null || !pendingOp) return;
    const current = parseFloat(display);
    const result = applyOp(storedValue, current, pendingOp);
    setDisplay(formatDisplay(result));
    setStoredValue(null);
    setPendingOp(null);
    setAwaitingNewValue(true);
  }, [display, storedValue, pendingOp]);

  const btnClass = 'flex items-center justify-center h-12 rounded-sm text-base font-medium border border-border-hairline bg-surface text-text-primary hover:bg-surface-secondary active:scale-95 transition-all';
  const opBtnClass = 'flex items-center justify-center h-12 rounded-sm text-base font-bold border border-border-strong bg-surface-inverted text-text-inverted hover:opacity-90 active:scale-95 transition-all';
  const utilBtnClass = 'flex items-center justify-center h-12 rounded-sm text-sm font-bold border border-border-hairline bg-surface-secondary text-text-secondary hover:text-text-primary active:scale-95 transition-all';

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-surface-secondary border border-border-hairline rounded-sm p-4 text-right">
        {pendingOp && (
          <div className="text-xs text-text-secondary mb-1 truncate">
            {formatDisplay(storedValue ?? 0)} {pendingOp}
          </div>
        )}
        <div className="text-3xl font-semibold text-text-primary truncate" aria-live="polite">{display}</div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button type="button" onClick={clearAll} className={utilBtnClass}>AC</button>
        <button type="button" onClick={toggleSign} className={utilBtnClass}>+/-</button>
        <button type="button" onClick={inputPercent} className={utilBtnClass}>%</button>
        <button type="button" onClick={() => chooseOperator('÷')} className={opBtnClass}>÷</button>

        <button type="button" onClick={() => inputDigit('7')} className={btnClass}>7</button>
        <button type="button" onClick={() => inputDigit('8')} className={btnClass}>8</button>
        <button type="button" onClick={() => inputDigit('9')} className={btnClass}>9</button>
        <button type="button" onClick={() => chooseOperator('×')} className={opBtnClass}>×</button>

        <button type="button" onClick={() => inputDigit('4')} className={btnClass}>4</button>
        <button type="button" onClick={() => inputDigit('5')} className={btnClass}>5</button>
        <button type="button" onClick={() => inputDigit('6')} className={btnClass}>6</button>
        <button type="button" onClick={() => chooseOperator('-')} className={opBtnClass}>-</button>

        <button type="button" onClick={() => inputDigit('1')} className={btnClass}>1</button>
        <button type="button" onClick={() => inputDigit('2')} className={btnClass}>2</button>
        <button type="button" onClick={() => inputDigit('3')} className={btnClass}>3</button>
        <button type="button" onClick={() => chooseOperator('+')} className={opBtnClass}>+</button>

        <button type="button" onClick={() => inputDigit('0')} className={`${btnClass} col-span-2`}>0</button>
        <button type="button" onClick={inputDecimal} className={btnClass}>.</button>
        <button type="button" onClick={calculateResult} className={opBtnClass}>=</button>
      </div>

      <button type="button" onClick={backspace} aria-label="Backspace" className={`${utilBtnClass} w-full flex items-center justify-center gap-2`}>
        <Delete className="w-4 h-4" /> Backspace
      </button>
    </div>
  );
};
