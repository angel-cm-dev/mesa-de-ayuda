import { describe, expect, it } from 'vitest';
import { dueText, formatBytes, formatDuration, formatPct, initials, ticketCode } from './format';

describe('format', () => {
  it('genera el código legible del ticket', () => {
    expect(ticketCode(7)).toBe('HD-0007');
    expect(ticketCode(12345)).toBe('HD-12345');
  });

  it('formatea duraciones en min, h y días', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(125)).toBe('2 h 5 min');
    expect(formatDuration(60 * 27)).toBe('1 d 3 h');
    expect(formatDuration(-90)).toBe('1 h 30 min');
  });

  it('describe el vencimiento según el estado del SLA', () => {
    expect(dueText(90, 'a_tiempo')).toBe('Vence en 1 h 30 min');
    expect(dueText(-30, 'incumplido')).toBe('Vencido hace 30 min');
    expect(dueText(500, 'pausado')).toBe('Pausado (en espera)');
    expect(dueText(-10, 'cumplido')).toBe('Cumplido');
  });

  it('formatea bytes, porcentajes e iniciales', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(formatPct(null)).toBe('—');
    expect(formatPct(87.5)).toBe('87.5 %');
    expect(initials('lucía torres vega')).toBe('LT');
  });
});
