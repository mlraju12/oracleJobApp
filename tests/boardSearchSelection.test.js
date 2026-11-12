const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadBoardSearches() {
  const source = fs.readFileSync(path.join(__dirname, '../client/src/boardSearches.js'), 'utf8')
    .replace(/^export function /gm, 'function ')
    .replace(/^export const /gm, 'const ');
  const module = { exports: {} };
  vm.runInNewContext(
    `${source}\nmodule.exports = { toggleBoardSelection };`,
    { module, exports: module.exports },
  );
  return module.exports;
}

describe('Also search on selection', () => {
  const { toggleBoardSelection } = loadBoardSearches();

  test('clicking a board selects it and keeps boards already selected', () => {
    const withLinkedIn = toggleBoardSelection([], 'linkedin');
    const withBoth = toggleBoardSelection(withLinkedIn, 'indeed');
    expect(withLinkedIn).toEqual(['linkedin']);
    expect(withBoth).toEqual(['linkedin', 'indeed']);
  });

  test('clicking a selected board clears only that board', () => {
    const selected = ['linkedin', 'indeed', 'glassdoor'];
    expect(toggleBoardSelection(selected, 'indeed')).toEqual(['linkedin', 'glassdoor']);
    expect(toggleBoardSelection(['glassdoor'], 'glassdoor')).toEqual([]);
  });

  test('ignores a board that is not in the list', () => {
    expect(toggleBoardSelection(['linkedin'], 'dice')).toEqual(['linkedin']);
    expect(toggleBoardSelection(['linkedin'], '')).toEqual(['linkedin']);
  });
});
