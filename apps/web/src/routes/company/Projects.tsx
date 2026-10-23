import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { useCustomers } from '../../lib/sales';
import { PROJECT_TONE, useProjects } from '../../lib/services';
import { useAction } from '../../lib/useAction';

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const { companyId } = useCompany();
  const customers = useCustomers(companyId);
  const action = useAction();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [description, setDescription] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('project.create', {
        companyId,
        code,
        name,
        ...(customerId ? { customerId } : {}),
        description,
      });
      onClose();
    } catch {
      /* shown below */
    }
  };
  const f = action.error?.fields ?? {};
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New project"
      description="Sales, purchase invoices and journals can be tagged with the project to see what it earned and cost."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Code" error={f.code}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={20}
            />
          </Field>
          <Field label="Name" error={f.name} className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
        </div>
        <Field
          label="Customer (optional)"
          hint="A project for a customer can be billed only to them."
          error={f.customerId}
        >
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Internal project</option>
            {customers.data
              .filter((c) => c.status === 'active')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Description (optional)" error={f.description}>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={action.pending} disabled={!code || name.trim().length < 2}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Projects() {
  const { companyId, can } = useCompany();
  const projects = useProjects(companyId);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title="Projects"
        description="Jobs and engagements. Each shows the revenue and direct costs posted for it."
        actions={
          can('projects.manage') && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden /> New project
            </Button>
          )
        }
      />
      {projects.loading ? (
        <Spinner />
      ) : projects.data.length === 0 ? (
        <EmptyState title="No projects yet" />
      ) : (
        <Card>
          <Table label="Projects">
            <THead>
              <Tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
              </Tr>
            </THead>
            <TBody>
              {projects.data.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-mono">
                    <Link
                      to={`/c/${companyId}/projects/${p.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {p.code}
                    </Link>
                  </Td>
                  <Td>{p.name}</Td>
                  <Td>{p.customerName ?? 'Internal'}</Td>
                  <Td>
                    <Badge tone={PROJECT_TONE[p.status]}>{p.status}</Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {adding && <NewProjectDialog onClose={() => setAdding(false)} />}
    </>
  );
}
