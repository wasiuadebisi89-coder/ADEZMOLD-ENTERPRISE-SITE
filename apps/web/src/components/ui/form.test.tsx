import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field, Input } from './form';

describe('Field', () => {
  it('links the label, hint and error to the control', () => {
    render(
      <Field label="Email" hint="Work email" error="Enter a valid email">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Work email Enter a valid email');
  });
});
