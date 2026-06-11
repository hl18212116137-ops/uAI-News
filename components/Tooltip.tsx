'use client';

import { useState, useRef, useEffect, cloneElement, isValidElement } from 'react';

type TooltipProps = {
  content: string;
  children: React.ReactElement<React.HTMLAttributes<Element>>;
  delay?: number;
  excludeSelector?: string;
};

export default function Tooltip({ content, children, delay = 200, excludeSelector }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef({ x: 0, y: 0 });
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);

  const applyTooltipPosition = (clientX: number, clientY: number) => {
    let x = clientX + 12;
    let y = clientY + 12;
    const tooltip = tooltipRef.current;

    if (tooltip) {
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (x + tooltipWidth > viewportWidth) {
        x = clientX - tooltipWidth - 12;
      }

      if (y + tooltipHeight > viewportHeight) {
        y = clientY - tooltipHeight - 12;
      }
    }

    positionRef.current = { x, y };
    if (tooltip) {
      tooltip.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  };

  const queueTooltipPosition = (clientX: number, clientY: number) => {
    pendingPointerRef.current = { x: clientX, y: clientY };
    if (rafRef.current != null) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pointer = pendingPointerRef.current;
      if (!pointer) return;
      applyTooltipPosition(pointer.x, pointer.y);
    });
  };

  const handleMouseEnter = (e: React.MouseEvent<Element>) => {
    queueTooltipPosition(e.clientX, e.clientY);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingPointerRef.current = null;
    setIsVisible(false);
  };

  const handleMouseMove = (e: React.MouseEvent<Element>) => {
    // 检查是否在排除区域内
    if (excludeSelector && (e.target as HTMLElement).closest(excludeSelector)) {
      setIsVisible(false);
      return;
    }

    queueTooltipPosition(e.clientX, e.clientY);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const pointer = pendingPointerRef.current;
    if (!pointer) return;
    const frame = requestAnimationFrame(() => {
      applyTooltipPosition(pointer.x, pointer.y);
    });
    return () => cancelAnimationFrame(frame);
  }, [isVisible]);

  // 克隆子元素并添加事件处理
  const childProps = children.props;
  const childWithEvents = isValidElement(children)
    ? cloneElement(children, {
        onMouseEnter: (e: React.MouseEvent) => {
          handleMouseEnter(e);
          childProps.onMouseEnter?.(e);
        },
        onMouseLeave: (e: React.MouseEvent) => {
          handleMouseLeave();
          childProps.onMouseLeave?.(e);
        },
        onMouseMove: (e: React.MouseEvent) => {
          handleMouseMove(e);
          childProps.onMouseMove?.(e);
        },
      })
    : children;

  return (
    <>
      {childWithEvents}

      {isVisible && (
        <div
          ref={tooltipRef}
          className="pointer-events-none fixed left-0 top-0 z-50 whitespace-nowrap rounded-md bg-[#101828] px-3 py-2 text-xs text-white shadow-lg will-change-transform"
          style={{
            transform: `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0)`,
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}
