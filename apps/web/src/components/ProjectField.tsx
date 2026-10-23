import { Field, Select } from './ui/form';
import { useCompany } from '../lib/company';
import { useProjects } from '../lib/services';

/** An optional project tag for a cost or journal; any active project may be chosen. */
export function ProjectField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (projectId: string) => void;
  error?: string;
}) {
  const { companyId, can } = useCompany();
  const enabled = can('projects.read');
  const projects = useProjects(companyId, enabled);
  const active = projects.data.filter((p) => p.status === 'active');
  if (!enabled || active.length === 0) return null;
  return (
    <Field label="Project (optional)" error={error}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No project</option>
        {active.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} · {p.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
