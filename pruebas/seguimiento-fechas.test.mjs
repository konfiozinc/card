/* KZ-SEGUIMIENTO-001 · Prueba de la lógica del próximo contacto.
   Sin emulador ni navegador: se puede correr con `node --test`.
   Uso: node pruebas/seguimiento-fechas.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hoyISO, diasPara, estadoAgenda, validarProxima,
} from '../admin/seguimiento-fechas.js';

/* Fecha fija para que la prueba no dependa del día en que se ejecute. */
const HOY = new Date(2026, 10, 16, 10, 30); // 16-nov-2026, hora local

test('un prospecto con fecha VENCIDA se marca como vencido', () => {
  assert.equal(estadoAgenda('2026-11-10', HOY), 'vencido');
  assert.equal(diasPara('2026-11-10', HOY), -6);
});

test('el día exacto cuenta como HOY, no como vencido', () => {
  assert.equal(estadoAgenda('2026-11-16', HOY), 'hoy');
  assert.equal(diasPara('2026-11-16', HOY), 0);
});

test('una fecha futura queda al día', () => {
  assert.equal(estadoAgenda('2026-11-20', HOY), 'aldia');
  assert.equal(diasPara('2026-11-20', HOY), 4);
});

test('sin fecha no se inventa estado', () => {
  assert.equal(estadoAgenda('', HOY), 'sin');
  assert.equal(estadoAgenda(null, HOY), 'sin');
  assert.equal(diasPara('', HOY), null);
});

test('una fecha imposible no se acepta (31 de febrero)', () => {
  assert.equal(diasPara('2026-02-31', HOY), null);
  assert.equal(estadoAgenda('2026-02-31', HOY), 'sin');
  assert.throws(() => validarProxima('2026-02-31', HOY), /FECHA_INVALIDA/);
});

test('validarProxima: vacío es legítimo (sin agendar) y se normaliza', () => {
  assert.equal(validarProxima('', HOY), '');
  assert.equal(validarProxima(null, HOY), '');
  assert.equal(validarProxima('  2026-11-20  ', HOY), '2026-11-20');
});

test('validarProxima: rechaza texto que no es fecha', () => {
  for (const malo of ['mañana', '20/11/2026', '2026-11', '20261120', '2026-13-01']) {
    assert.throws(() => validarProxima(malo, HOY), /FECHA_INVALIDA|FECHA_FUERA_DE_RANGO/, 'debería rechazar ' + malo);
  }
});

test('validarProxima: rechaza fechas absurdas fuera de rango', () => {
  assert.throws(() => validarProxima('2010-01-01', HOY), /FECHA_FUERA_DE_RANGO/);
  assert.throws(() => validarProxima('2040-01-01', HOY), /FECHA_FUERA_DE_RANGO/);
});

test('hoyISO devuelve el día local, no el UTC', () => {
  /* 16-nov-2026 a las 23:30 en Colombia: en UTC ya es día 17. Se espera 16. */
  assert.equal(hoyISO(new Date(2026, 10, 16, 23, 30)), '2026-11-16');
  assert.equal(hoyISO(new Date(2026, 0, 5, 0, 5)), '2026-01-05');
});
