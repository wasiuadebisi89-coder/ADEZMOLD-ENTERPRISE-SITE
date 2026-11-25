import { Download, EllipsisVertical, Share, SquarePlus } from 'lucide-react';
import { useState } from 'react';
import { promptInstall, useInstallMode } from '../lib/installApp';
import { cn } from '../lib/utils';
import { Button, type ButtonProps } from './ui/button';
import { Dialog } from './ui/dialog';

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function IosSteps() {
  return (
    <ol className="space-y-3 text-sm text-slate-700">
      <Step n={1}>Open this page in Safari.</Step>
      <Step n={2}>
        Tap the Share button{' '}
        <Share className="inline size-4 align-text-bottom" aria-label="Share" /> at the bottom (or
        top) of the screen.
      </Step>
      <Step n={3}>
        Scroll down and tap <strong>Add to Home Screen</strong>{' '}
        <SquarePlus className="inline size-4 align-text-bottom" aria-hidden />.
      </Step>
      <Step n={4}>
        Tap <strong>Add</strong>. BMS now opens from its icon on your home screen.
      </Step>
    </ol>
  );
}

function ManualSteps() {
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <div>
        <h3 className="mb-2 font-semibold text-slate-900">Android phone or tablet</h3>
        <ol className="space-y-3">
          <Step n={1}>Open this page in Google Chrome.</Step>
          <Step n={2}>
            Tap the menu{' '}
            <EllipsisVertical className="inline size-4 align-text-bottom" aria-label="menu" /> at
            the top right.
          </Step>
          <Step n={3}>
            Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>), then{' '}
            <strong>Install</strong>.
          </Step>
        </ol>
      </div>
      <div>
        <h3 className="mb-2 font-semibold text-slate-900">Computer</h3>
        <p>
          In Google Chrome or Microsoft Edge, click the install icon at the right end of the address
          bar, or open the browser menu and choose <strong>Install Adezmold BMS</strong>.
        </p>
      </div>
    </div>
  );
}

/**
 * "Install app" button. Opens the browser's install dialog where there is one; otherwise shows
 * the steps for this device. Hidden when BMS is already running as the installed app.
 */
export function InstallAppButton({
  className,
  variant = 'secondary',
  size = 'md',
  label = 'Install app',
}: {
  className?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  label?: string;
}) {
  const mode = useInstallMode();
  const [open, setOpen] = useState(false);
  if (mode === 'installed') return null;

  const onClick = () => {
    if (mode === 'prompt') void promptInstall();
    else setOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn(className)}
        onClick={onClick}
      >
        <Download className="size-4" aria-hidden /> {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Install the BMS app"
        description="Open BMS from an icon on your phone or computer, in its own window, without typing the web address."
      >
        {mode === 'ios' ? <IosSteps /> : <ManualSteps />}
        <div className="mt-6 flex justify-end">
          <Button type="button" onClick={() => setOpen(false)}>
            Got it
          </Button>
        </div>
      </Dialog>
    </>
  );
}
