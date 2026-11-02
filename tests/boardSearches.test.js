const {
  BOARD_SEARCHES,
  moduleFilter,
  searchTerms,
  selectedModules,
} = require('../src/services/boardSearches');

describe('board searches', () => {
  test('lists LinkedIn, Indeed, and Glassdoor', () => {
    expect(BOARD_SEARCHES.map((board) => board.id)).toEqual(['linkedin', 'indeed', 'glassdoor']);
  });

  test('builds keyword searches from query and modules', () => {
    const linkedin = BOARD_SEARCHES.find((board) => board.id === 'linkedin');
    const url = linkedin.buildUrl({ q: 'consultant', modules: ['Payroll', 'Absence'] });
    expect(url).toContain('linkedin.com/jobs/search');
    expect(decodeURIComponent(url)).toContain('consultant');
    expect(decodeURIComponent(url)).toContain('Oracle Payroll');
    expect(decodeURIComponent(url)).toContain('Oracle Absence');
  });

  test('defaults the keyword when nothing is selected', () => {
    expect(searchTerms('', [])).toBe('Oracle Cloud HCM');
  });

  test('accepts multiple modules for opportunity filters', () => {
    expect(selectedModules('Payroll,Absence')).toEqual(['Payroll', 'Absence']);
    expect(moduleFilter('Payroll')).toBe('Payroll');
    expect(moduleFilter('Payroll,Absence')).toEqual({ $in: ['Payroll', 'Absence'] });
    expect(moduleFilter('')).toBeNull();
  });
});
