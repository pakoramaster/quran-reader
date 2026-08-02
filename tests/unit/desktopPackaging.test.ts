import packageJson from '../../package.json';

describe('desktop packaging', () => {
  it('re-includes Expo assets emitted beneath dist/assets/node_modules', () => {
    const files = packageJson.build.files;
    const exclusion = files.indexOf('!node_modules/**/*');
    const exportedAssets = files.indexOf('dist/assets/node_modules/**/*');

    expect(exclusion).toBeGreaterThanOrEqual(0);
    expect(exportedAssets).toBeGreaterThan(exclusion);
  });
});
