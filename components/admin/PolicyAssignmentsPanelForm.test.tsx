import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PolicyAssignmentsPanelForm } from './PolicyAssignmentsPanelForm';

vi.mock('@/app/(admin)/policies/[id]/actions', () => ({
  bulkAssignToDepartmentAction: vi.fn(),
}));

const POLICY_ID = '00000000-0000-4000-8000-000000000001';

describe('PolicyAssignmentsPanelForm', () => {
  it('renders disabled empty-departments controls with fallback copy', () => {
    render(<PolicyAssignmentsPanelForm policyId={POLICY_ID} departments={[]} />);

    const select = screen.getByLabelText('No departments available');
    expect(select).toBeDisabled();
    expect(select).toHaveTextContent('No departments available');

    const button = screen.getByRole('button', { name: 'Assign to department' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Create a department first');
    expect(screen.getByText('Create a department first.')).toBeInTheDocument();
  });

  it('keeps submit disabled until a department is selected', () => {
    render(
      <PolicyAssignmentsPanelForm
        policyId={POLICY_ID}
        departments={[{ id: '00000000-0000-4000-8000-000000000002', name: 'HR' }]}
      />,
    );

    const button = screen.getByRole('button', { name: 'Assign to department' });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '00000000-0000-4000-8000-000000000002' },
    });
    expect(button).toBeEnabled();
  });
});
