import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PriorityBadge, SlaBadge, StatusBadge } from './Badges';
import { Button, ErrorState, Pagination } from './index';

describe('componentes de UI', () => {
  it('los badges muestran etiquetas legibles', () => {
    render(
      <>
        <StatusBadge status="en_progreso" />
        <PriorityBadge priority="critica" />
        <SlaBadge state="incumplido" />
      </>,
    );
    expect(screen.getByText('En progreso')).toBeInTheDocument();
    expect(screen.getByText('Crítica')).toBeInTheDocument();
    expect(screen.getByText('Incumplido')).toBeInTheDocument();
  });

  it('la paginación deshabilita los extremos y notifica el cambio', () => {
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={3} total={25} onChange={onChange} />);
    expect(screen.getByLabelText('Página anterior')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Página siguiente'));
    expect(onChange).toHaveBeenCalledWith(2);
    expect(screen.getByText('25 resultados')).toBeInTheDocument();
  });

  it('el botón en carga se deshabilita', () => {
    render(<Button loading>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('el estado de error permite reintentar', () => {
    const retry = vi.fn();
    render(<ErrorState error={new Error('Servidor caído')} onRetry={retry} />);
    expect(screen.getByText('Servidor caído')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalled();
  });
});
