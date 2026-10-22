import { iconPaths } from './icon-paths.js';

// Decorative Material Symbols icon as inline SVG (self-hosted; see scripts/build-icons.mjs).
// Sized by font-size (e.g. className="text-[20px]") and coloured by text colour, like the
// icon font it replaces. Always hidden from screen readers: give the control its own text.
export default function Icon({ name, className = '' }) {
  const d = iconPaths[name];
  if (!d) {
    if (import.meta.env?.DEV) console.warn(`Icon "${name}" missing: run npm run build:icons`);
    return null;
  }
  return (
    <svg className={`icon ${className}`} viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
