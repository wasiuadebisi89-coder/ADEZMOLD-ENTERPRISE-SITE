import { ArrowLeft, ArrowRight, CircleHelp, Lightbulb, Search } from 'lucide-react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useCompany } from '../lib/company';
import { pageOf, searchTopics, topicsFor, topicsForPage } from '../lib/help/search';
import { HELP_TOPICS, type HelpTopic } from '../lib/help/topics';
import { cn } from '../lib/utils';
import { SupportContact } from './SupportContact';
import { Button, type ButtonProps } from './ui/button';
import { Dialog } from './ui/dialog';

/** Shown when the current page has no topics of its own. */
const POPULAR = [
  'new-sale',
  'print-receipt',
  'record-expense',
  'receive-goods',
  'day-book',
  'fix-mistake',
  'find-your-way',
];

const ADMIN_ROLE = 'company_admin';

/** Renders `**bold**` spans; everything else is plain text. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function TopicList({
  topics,
  onOpen,
  label,
}: {
  topics: HelpTopic[];
  onOpen: (t: HelpTopic) => void;
  label: string;
}) {
  return (
    <section aria-label={label}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h3>
      <ul className="divide-y divide-slate-100 rounded-md ring-1 ring-slate-200">
        {topics.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onOpen(t)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1 font-medium text-slate-800">{t.title}</span>
              <ArrowRight className="size-4 shrink-0 text-slate-400" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopicView({
  topic,
  companyId,
  onBack,
  onClose,
}: {
  topic: HelpTopic;
  companyId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <article aria-labelledby={`help-${topic.id}`} className="space-y-4 text-sm text-slate-700">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> All help
      </button>
      <h3 id={`help-${topic.id}`} className="text-base font-semibold text-slate-900">
        {topic.title}
      </h3>
      <p>
        <Rich text={topic.summary} />
      </p>
      {topic.steps && (
        <ol className="space-y-2">
          {topic.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
                {i + 1}
              </span>
              <span className="pt-0.5">
                <Rich text={s} />
              </span>
            </li>
          ))}
        </ol>
      )}
      {topic.tips?.map((tip, i) => (
        <p key={i} className="flex gap-2 rounded-md bg-amber-50 p-3 text-amber-900">
          <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <Rich text={tip} />
          </span>
        </p>
      ))}
      {topic.link && (
        <Button asChild size="sm">
          <Link to={`/c/${companyId}/${topic.link.to}`} onClick={onClose}>
            {topic.link.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      )}
    </article>
  );
}

export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { companyId, can, member } = useCompany();
  const { pathname } = useLocation();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<HelpTopic | null>(null);

  const isAdmin = member?.roleIds?.includes(ADMIN_ROLE) ?? false;
  const mine = useMemo(() => topicsFor(can, isAdmin), [can, isAdmin]);
  const page = pageOf(pathname);
  const here = useMemo(() => topicsForPage(page, mine).slice(0, 6), [page, mine]);
  const popular = useMemo(
    () => POPULAR.map((id) => mine.find((t) => t.id === id)).filter((t): t is HelpTopic => !!t),
    [mine],
  );
  const results = useMemo(() => searchTopics(query, mine).slice(0, 8), [query, mine]);
  // Only says that something exists outside the member's role, never what it is.
  const outsideRole =
    query.trim() !== '' && results.length === 0 && searchTopics(query, HELP_TOPICS).length > 0;

  const close = () => onOpenChange(false);
  const change = (next: boolean) => {
    if (!next) {
      setQuery('');
      setSelected(null);
    }
    onOpenChange(next);
  };

  let body: ReactNode;
  if (selected) {
    body = (
      <TopicView
        topic={selected}
        companyId={companyId}
        onBack={() => setSelected(null)}
        onClose={close}
      />
    );
  } else if (query.trim()) {
    body =
      results.length > 0 ? (
        <TopicList label="Best matches" topics={results} onOpen={setSelected} />
      ) : (
        <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-700">
          {outsideRole ? (
            <p>That task isn’t part of your role. Ask your Company Admin if you need it.</p>
          ) : (
            <p>No help found for that. Try other words, such as “sale”, “receipt” or “stock”.</p>
          )}
        </div>
      );
  } else {
    body = (
      <div className="space-y-5">
        {here.length > 0 && page !== '' && (
          <TopicList label="Help for this page" topics={here} onOpen={setSelected} />
        )}
        <TopicList
          label={page === '' ? 'Getting started' : 'Popular questions'}
          topics={page === '' ? here : popular.filter((t) => !here.includes(t))}
          onOpen={setSelected}
        />
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={change}
      title="Help"
      description="Answers for the tasks your role can do."
      className="max-w-xl"
    >
      {!selected && (
        <div className="relative mb-4">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to do? e.g. refund a customer"
            aria-label="Search help"
            autoFocus
            className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
          />
        </div>
      )}
      {body}
      <footer className="mt-6 border-t border-slate-200 pt-4 text-center">
        <p className="mb-2 text-xs text-slate-500">Still stuck? Contact Adezmold support.</p>
        <SupportContact subject="BMS help" />
      </footer>
    </Dialog>
  );
}

export function HelpButton({
  className,
  iconOnly,
  ...props
}: Omit<ButtonProps, 'onClick' | 'children'> & { iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        {...props}
        className={cn(iconOnly && 'px-2', className)}
        onClick={() => setOpen(true)}
        aria-label={iconOnly ? 'Help' : undefined}
      >
        <CircleHelp className="size-4" aria-hidden />
        {!iconOnly && 'Help'}
      </Button>
      <HelpDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
