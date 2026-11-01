import { describe, expect, it } from 'vitest';
import { hasErrors, isEmail, passwordIssues, validateLogin, validateRegister, validateTicket } from './validation';

describe('validación de formularios', () => {
  it('valida correos', () => {
    expect(isEmail('admin@demo.pe')).toBe(true);
    expect(isEmail('admin@demo')).toBe(false);
  });

  it('aplica la política de contraseñas del backend', () => {
    expect(passwordIssues('corta')).toMatch(/8/);
    expect(passwordIssues('sinmayuscula1')).toMatch(/mayúscula/);
    expect(passwordIssues('SinNumeros')).toMatch(/número/);
    expect(passwordIssues('Segura123')).toBeUndefined();
  });

  it('login exige correo y contraseña', () => {
    expect(validateLogin({ email: 'x', password: '' })).toEqual({ email: expect.any(String), password: expect.any(String) });
    expect(hasErrors(validateLogin({ email: 'admin@demo.pe', password: 'Demo123!' }))).toBe(false);
  });

  it('registro valida nombre, correo y contraseña', () => {
    const e = validateRegister({ name: 'Al', email: 'a@b.pe', password: 'debil' });
    expect(Object.keys(e).sort()).toEqual(['name', 'password']);
  });

  it('ticket exige título, descripción y prioridad válidos', () => {
    const e = validateTicket({ title: 'Hola', description: 'corta', priority: 'urgente', categoryId: '' });
    expect(Object.keys(e).sort()).toEqual(['description', 'priority', 'title']);
    expect(hasErrors(validateTicket({ title: 'No funciona la VPN', description: 'Se desconecta cada 10 minutos', priority: 'alta', categoryId: '' }))).toBe(false);
  });
});
