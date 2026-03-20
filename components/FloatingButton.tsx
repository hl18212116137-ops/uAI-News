import Tooltip from "./Tooltip";

type FloatingButtonProps = {
  onClick: () => void;
};

export default function FloatingButton({ onClick }: FloatingButtonProps) {
  return (
    <Tooltip content="生成你的 AI 周报">
      <button
        onClick={onClick}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50 animate-slide-in-right overflow-hidden rounded-l-xl"
        style={{ width: 40, height: 137 }}
        aria-label="周报定制"
      >
      {/* Dark gradient background matching Figma */}
      <div
        className="absolute inset-0 rounded-l-xl border border-[rgba(215,162,32,0.3)]"
        style={{
          background: 'linear-gradient(to bottom, #261405, #180b03 45%, #221204)',
          boxShadow: '0px 3px 16px 0px rgba(12,5,1,0.4)',
        }}
      />
      {/* Inner top highlight */}
      <div
        className="absolute inset-0 rounded-l-xl pointer-events-none"
        style={{ boxShadow: 'inset 0px 1px 0px 0px rgba(255,215,80,0.09)' }}
      />
      {/* Star icon */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#f0c030">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      </div>
      {/* Vertical text */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: 42, writingMode: 'vertical-rl', letterSpacing: '3.6px' }}
      >
        <span className="text-[#f0c030] text-xs font-bold">周报定制</span>
      </div>
      {/* Divider line */}
      <div
        className="absolute"
        style={{
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 16,
          height: 1,
          background: 'linear-gradient(to right, transparent, rgba(175,128,22,0.35), transparent)',
        }}
      />
    </button>
    </Tooltip>
  );
}
