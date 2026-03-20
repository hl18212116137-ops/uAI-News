'use client';

import { useState, useRef, useEffect, cloneElement, isValidElement } from 'react';

type TooltipProps = {
  content: string;
  children: React.ReactElement;
  delay?: number;
  excludeSelector?: string;
};

export default function Tooltip({ content, children, delay = 200, excludeSelector }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<NodeJS.Timeout>();
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // 检查是否在排除区域内
    if (excludeSelector && (e.target as HTMLElement).closest(excludeSelector)) {
      setIsVisible(false);
      return;
    }

    let x = e.clientX + 12;
    let y = e.clientY + 12;

    // 边界检测：靠近屏幕右侧时翻转
    if (tooltipRef.current) {
      const tooltipWidth = tooltipRef.current.offsetWidth;
      const tooltipHeight = tooltipRef.current.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (x + tooltipWidth > viewportWidth) {
        x = e.clientX - tooltipWidth - 12;
      }

      if (y + tooltipHeight > viewportHeight) {
        y = e.clientY - tooltipHeight - 12;
      }
    }

    setPosition({ x, y });
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // 克隆子元素并添加事件处理
  const childWithEvents = isValidElement(children)
    ? cloneElement(children, {
        onMouseEnter: (e: React.MouseEvent) => {
          handleMouseEnter();
          (children as React.ReactElement<any>).props.onMouseEnter?.(e);
        },
        onMouseLeave: (e: React.MouseEvent) => {
          handleMouseLeave();
          (children as React.ReactElement<any>).props.onMouseLeave?.(e);
        },
        onMouseMove: (e: React.MouseEvent) => {
          handleMouseMove(e);
          (children as React.ReactElement<any>).props.onMouseMove?.(e);
        },
      } as any)
    : children;

  return (
    <>
      {childWithEvents}

      {isVisible && (
        <div
          ref={tooltipRef}
          className="fixed z-50 px-3 py-2 text-xs text-white bg-[#101828] rounded-lg shadow-lg pointer-events-none whitespace-nowrap opacity-0 animate-fade-in"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            animation: 'fadeIn 0.2s ease-in-out forwards',
          }}
        >
          {content}
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}
