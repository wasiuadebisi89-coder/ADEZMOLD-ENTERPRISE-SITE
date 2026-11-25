import { OPTIONAL_MODULES } from '../lib/modules';

/**
 * Checkboxes for what the business does. Buying and selling goods is always on; each extra
 * choice adds its area to the menu for members whose role allows it.
 */
export function BusinessTypePicker({
  value,
  onChange,
  disabled,
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (type: string) =>
    onChange(value.includes(type) ? value.filter((t) => t !== type) : [...value, type]);
  return (
    <fieldset className="grid gap-2 sm:grid-cols-3">
      <legend className="sr-only">What the business does</legend>
      <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
        <input type="checkbox" className="mt-0.5" checked disabled />
        <span>
          <span className="font-medium">Buying and selling goods</span>
          <span className="block text-xs text-slate-500">
            Sales, purchasing, stock and accounting. Always on.
          </span>
        </span>
      </label>
      {OPTIONAL_MODULES.map((m) => (
        <label
          key={m.type}
          className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm"
        >
          <input
            type="checkbox"
            className="mt-0.5 accent-brand-600"
            checked={value.includes(m.type)}
            onChange={() => toggle(m.type)}
            disabled={disabled}
          />
          <span>
            <span className="font-medium">{m.label}</span>
            <span className="block text-xs text-slate-500">{m.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
