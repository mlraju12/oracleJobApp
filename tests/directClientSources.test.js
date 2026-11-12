const { PUBLIC_BOARDS } = require('../src/services/catalog');

const END_USERS = [
  'Vanderbilt University',
  'Baylor University',
  'Northwell Health',
  'Morrisons',
  'ADT',
  'Verisk',
  'Jungbunzlauer',
  'Arqiva',
  'WMATA',
  'BGIS',
  'Nokia',
  'E.ON',
  'University of Windsor',
  'InvoCare',
  'OSU Medical Center',
  'Norfolk County Council',
];

describe('direct client sources', () => {
  const byName = new Map(PUBLIC_BOARDS.map((board) => [board.name, board]));

  test('keeps Oracle Cloud HCM customers as end-user boards without invented listings', () => {
    for (const name of END_USERS) {
      const board = byName.get(name);
      expect(board).toBeTruthy();
      expect(board.hiringContext).toBe('direct_client');
      expect(board.employerType).toBe('end_user');
      expect(board.careerSiteUrl).toMatch(/^https:\/\//);
      expect(board.adapterConfig.listings).toBeUndefined();
    }
    const pico = byName.get('Pico');
    expect(pico.hiringContext).toBe('direct_client');
    expect(pico.adapterType).toBe('greenhouse-job-board');
    expect(pico.status || 'enabled').toBe('enabled');
  });

  test('keeps catalog keys unique', () => {
    const keys = PUBLIC_BOARDS.map((board) => board.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
