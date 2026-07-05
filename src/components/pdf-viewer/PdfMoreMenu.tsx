import React from 'react';
import {
  Columns2,
  Expand,
  Info,
  Keyboard,
  LogOut,
  MessageCircleWarning,
  Minimize,
  RotateCw,
  Rows3,
  Scan,
  ScanLine
} from 'lucide-react';

interface PdfMoreMenuProps {
  scrollMode: 'continuous' | 'single';
  isFullscreen: boolean;
  onFitWidth: () => void;
  onFitPage: () => void;
  onRotate: () => void;
  onToggleFullscreen: () => void;
  onToggleScrollMode: () => void;
  onShowBookInfo: () => void;
  onReportProblem: () => void;
  onShowShortcuts: () => void;
  onExit: () => void;
}

const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-3 w-full px-4 py-3 text-left text-sm font-bold text-white hover:bg-white/5 transition-colors"
  >
    {icon}
    {label}
  </button>
);

export const PdfMoreMenu: React.FC<PdfMoreMenuProps> = ({
  scrollMode,
  isFullscreen,
  onFitWidth,
  onFitPage,
  onRotate,
  onToggleFullscreen,
  onToggleScrollMode,
  onShowBookInfo,
  onReportProblem,
  onShowShortcuts,
  onExit
}) => (
  <div className="absolute right-4 top-16 z-30 w-60 bg-[#242829] border border-white/10 rounded-sm shadow-2xl overflow-hidden">
    <MenuItem icon={<ScanLine size={16} className="text-brand-muted" />} label="Fit Width" onClick={onFitWidth} />
    <MenuItem icon={<Scan size={16} className="text-brand-muted" />} label="Fit Page" onClick={onFitPage} />
    <MenuItem icon={<RotateCw size={16} className="text-brand-muted" />} label="Rotate Page" onClick={onRotate} />
    <MenuItem
      icon={
        isFullscreen ? (
          <Minimize size={16} className="text-brand-muted" />
        ) : (
          <Expand size={16} className="text-brand-muted" />
        )
      }
      label={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
      onClick={onToggleFullscreen}
    />
    <MenuItem
      icon={
        scrollMode === 'continuous' ? (
          <Columns2 size={16} className="text-brand-muted" />
        ) : (
          <Rows3 size={16} className="text-brand-muted" />
        )
      }
      label={scrollMode === 'continuous' ? 'Single Page View' : 'Continuous Scroll'}
      onClick={onToggleScrollMode}
    />
    <div className="border-t border-white/10" />
    <MenuItem icon={<Info size={16} className="text-brand-muted" />} label="Book Information" onClick={onShowBookInfo} />
    <MenuItem
      icon={<MessageCircleWarning size={16} className="text-brand-muted" />}
      label="Report a Problem"
      onClick={onReportProblem}
    />
    <MenuItem icon={<Keyboard size={16} className="text-brand-muted" />} label="Keyboard Shortcuts" onClick={onShowShortcuts} />
    <div className="border-t border-white/10" />
    <MenuItem icon={<LogOut size={16} className="text-brand-muted" />} label="Exit Reader" onClick={onExit} />
  </div>
);
