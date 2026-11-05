import { LayoutDashboard, LogOut } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../components/ui/button';
import { useAuth } from '../lib/auth';
import { usePlatformAdmin } from '../lib/platform';

export function TopBar() {
  const { user, signOut } = useAuth();
  const { isAdmin } = usePlatformAdmin();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link to="/companies" className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="size-7" />
          Adezmold BMS
        </Link>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          {isAdmin && (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/platform">
                <LayoutDashboard className="size-4" aria-hidden /> Registrations
              </Link>
            </Button>
          )}
          <span className="hidden sm:inline">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="size-4" aria-hidden /> Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
