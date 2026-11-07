import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import type { FieldRect, SourcePage } from '../domain/types';

/**
 * One document page. The box keeps the page's aspect ratio and is the positioning parent
 * for fields, so a field at x=0.5 is always halfway across the page at any width.
 * `container-type: inline-size` (see CSS) lets field text scale with the page via `cqw` units.
 */
export const PageView = forwardRef<
  HTMLDivElement,
  { page: SourcePage; index: number; children?: ReactNode; onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void; className?: string }
>(function PageView({ page, index, children, onPointerDown, className }, ref) {
  return (
    <div
      ref={ref}
      className={`page ${className ?? ''}`}
      style={{ aspectRatio: `${page.width} / ${page.height}` }}
      onPointerDown={onPointerDown}
      data-page={index}
    >
      <img src={page.imageUrl} alt={`Page ${index + 1}`} draggable={false} />
      {children}
    </div>
  );
});

/** Converts a fractional rect into CSS percentages. */
export function rectStyle(rect: FieldRect): CSSProperties {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}
