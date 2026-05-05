const nock = require('nock');

// Disable all real network connections; unmatched requests throw immediately
nock.disableNetConnect();

// Mock fs before any imports
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  chmodSync: jest.fn(),
  existsSync: jest.fn(() => false),
  unlinkSync: jest.fn(),
}));

// Mock config
jest.mock('../src/config', () => ({
  api_url: 'https://api.github.com',
  access_token: 'fake-token',
  github_username: 'testuser',
}));

const fs = require('fs');
const { updateRepos } = require('../src/updateRepos');

describe('updateRepos', () => {
  const apiUrl = 'https://api.github.com';
  const token = 'fake-token';

  beforeEach(() => {
    nock.cleanAll();
    jest.clearAllMocks();
  });

  it('should update repos successfully', async () => {
    const repos = ['user/repo1', 'user/repo2'];

    nock(apiUrl)
      .post('/repos/user/repo1/merge-upstream')
      .reply(200, { message: 'Merged' });

    nock(apiUrl)
      .post('/repos/user/repo2/merge-upstream')
      .reply(200, { message: 'Merged' });

    await updateRepos(repos);

    // No conflicts script should be generated
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should skip repos with merge conflicts and generate script', async () => {
    const repos = ['user/repo1', 'user/repo2'];

    // repo1 succeeds
    nock(apiUrl)
      .post('/repos/user/repo1/merge-upstream')
      .reply(200, { message: 'Merged' });

    // repo2 has conflict
    nock(apiUrl)
      .post('/repos/user/repo2/merge-upstream')
      .reply(409, {
        message: 'This repository has diverged from the upstream repository.',
      });

    // Mock repo info fetch for repo2
    nock(apiUrl)
      .get('/repos/user/repo2')
      .reply(200, {
        source: { clone_url: 'https://github.com/original/repo2.git', full_name: 'original/repo2' },
        default_branch: 'main',
      });

    await updateRepos(repos);

    // Should have written the script
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'resolve-conflicts.sh',
      expect.stringContaining('Processing conflict for user/repo2')
    );
    expect(fs.chmodSync).toHaveBeenCalledWith('resolve-conflicts.sh', 0o755);
  });

  it('should not generate script when all updates succeed', async () => {
    const repos = ['user/repo1'];

    nock(apiUrl)
      .post('/repos/user/repo1/merge-upstream')
      .reply(200);

    await updateRepos(repos);

    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(fs.chmodSync).not.toHaveBeenCalled();
  });

  it('should handle API errors without script generation', async () => {
    const repos = ['user/repo1'];

    nock(apiUrl)
      .post('/repos/user/repo1/merge-upstream')
      .reply(500, { message: 'Server error' });

    await updateRepos(repos);

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should include proper headers in API requests', async () => {
    const repos = ['user/repo1'];

    nock(apiUrl, {
      reqheaders: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })
      .post('/repos/user/repo1/merge-upstream')
      .reply(200);

    await updateRepos(repos);
  });

  it('should generate correct script content with proper git commands', async () => {
    const repos = ['user/repo-conflict'];

    nock(apiUrl)
      .post('/repos/user/repo-conflict/merge-upstream')
      .reply(409);

    nock(apiUrl)
      .get('/repos/user/repo-conflict')
      .reply(200, {
        source: { clone_url: 'https://github.com/original/repo.git', full_name: 'original/repo' },
        default_branch: 'main',
      });

    await updateRepos(repos);

    const scriptContent = fs.writeFileSync.mock.calls[0][1];
    expect(scriptContent).toContain('git clone "https://github.com/user/repo-conflict.git"');
    expect(scriptContent).toContain('git remote add upstream "https://github.com/original/repo.git"');
    expect(scriptContent).toContain('git fetch upstream');
    expect(scriptContent).toContain('git rebase upstream/main');
    expect(scriptContent).toContain('git push origin main --force-with-lease');
  });
});
