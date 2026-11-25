import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { initInstallPrompt, resetInstallStateForTests } from '../lib/installApp';
import { InstallAppButton } from './InstallAppButton';

initInstallPrompt();

describe('InstallAppButton', () => {
  afterEach(() => {
    cleanup();
    resetInstallStateForTests();
  });

  it('shows install steps when the browser offers no install dialog', async () => {
    render(<InstallAppButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Install app' }));
    expect(screen.getByRole('dialog', { name: 'Install the BMS app' })).toBeInTheDocument();
    expect(screen.getByText('Android phone or tablet')).toBeInTheDocument();
  });

  it('disappears once the app is installed', () => {
    render(<InstallAppButton />);
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  });
});
