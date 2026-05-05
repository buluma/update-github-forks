const axios = require('axios');
const config = require('./config');
const fs = require('fs');
const readline = require('readline');

async function getRepoInfo(fullName) {
  try {
    const res = await axios.get(`${config.api_url}/repos/${fullName}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${config.access_token}`,
      },
    });
    return res.data;
  } catch (err) {
    console.error(`Error fetching info for ${fullName}: ${err.message}`);
    return null;
  }
}

function generateShellScript(conflicts) {
  const scriptLines = [
    '#!/bin/bash',
    '# Script to resolve merge conflicts for forked repositories',
    '# Generated automatically - review before running',
    '',
    '# Instructions:',
    '# 1. Run this script: ./resolve-conflicts.sh',
    '# 2. It will pause before each rebase to let you resolve conflicts',
    '# 3. After resolving conflicts in each repo, continue with Ctrl+C or wait',
    '',
    'set -e',
    '',
  ];

  conflicts.forEach(({ repo, upstreamUrl, defaultBranch, upstreamName }) => {
    scriptLines.push(
      `echo "========================================"`,
      `echo "Processing conflict for ${repo}"`,
      `echo "Fork: ${repo}"`,
      `echo "Upstream: ${upstreamName}"`,
      `echo "Branch: ${defaultBranch}"`,
      `echo "========================================"`,
      '',
      `if [ ! -d "${repo.split('/')[1]}" ]; then`,
      `  git clone "https://github.com/${repo}.git"`,
      `fi`,
      '',
      `cd "${repo.split('/')[1]}"`,
      '',
      `if git remote | grep -q "^upstream$"; then`,
      `  git remote set-url upstream "${upstreamUrl}"`,
      `else`,
      `  git remote add upstream "${upstreamUrl}"`,
      `fi`,
      '',
      `git fetch upstream`,
      '',
      `echo "Attempting to rebase ${defaultBranch} onto upstream/${defaultBranch}..."`,
      `echo "If conflicts occur, resolve them, then stage changes and continue."`,
      `echo "Press Enter to continue or Ctrl+C to abort"`,
      `read`,
      '',
      `git rebase upstream/${defaultBranch} || {`,
      `  echo "Rebase encountered conflicts."`,
      `  echo "Please resolve the conflicts manually, then:"`,
      `  echo "  git add <resolved-files>"`,
      `  echo "  git rebase --continue"`,
      `  echo "After resolving, run this script again for this repo."`,
      `  exit 1`,
      `}`,
      '',
      `git push origin ${defaultBranch} --force-with-lease`,
      '',
      `echo "✅ ${repo} successfully synced with upstream!"`,
      `cd ..`,
      '',
    );
  });

  scriptLines.push('echo "All done!"');

  return scriptLines.join('\n');
}

async function updateRepos(repos) {
  let updated = 0;
  let skipped = 0;
  const conflicts = [];

  for (let i = 0; i < repos.length; i++) {
    const repo = repos[i];
    const URL = `${config.api_url}/repos/${repo}/merge-upstream`;

    try {
      await axios.post(URL, {}, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `token ${config.access_token}`,
        },
      });
      updated++;
      console.log(`${repo} updated!`);
    } catch (err) {
      if (err.response?.status === 409) {
        skipped++;
        console.warn(`⚠️  ${repo} has merge conflicts — will add to manual fix script`);
        conflicts.push({ repo });
      } else {
        skipped++;
        console.error(`❌ Error updating ${repo}: ${err.response?.data?.message || err.message}`);
      }
    }
  }

  if (updated > 0) {
    console.log(`\n✅ ${updated} repo(s) updated successfully!`);
  }

  if (conflicts.length > 0) {
    console.log(`\n⚠️  ${conflicts.length} repo(s) have merge conflicts and need manual resolution.`);
    console.log('Fetching upstream metadata for conflicted repos...');

    for (const conflict of conflicts) {
      const info = await getRepoInfo(conflict.repo);
      if (info) {
        conflict.upstreamUrl = info.source?.clone_url || `https://github.com/${info.source?.full_name || 'unknown'}.git`;
        conflict.defaultBranch = info.default_branch || 'main';
        conflict.upstreamName = info.source?.full_name || 'unknown/unknown';
      } else {
        conflict.upstreamUrl = 'unknown';
        conflict.defaultBranch = 'main';
        conflict.upstreamName = 'unknown';
      }
    }

    const scriptContent = generateShellScript(conflicts);
    fs.writeFileSync('resolve-conflicts.sh', scriptContent);
    fs.chmodSync('resolve-conflicts.sh', 0o755);

    console.log('\n📝 Generated resolve-conflicts.sh script!');
    console.log('Review it, then run:');
    console.log('  $ ./resolve-conflicts.sh');
  }

  if (skipped > 0 && conflicts.length === 0) {
    console.log(`\nSkipped ${skipped} repo(s) due to errors.`);
  }
}

function run() {
  const reposForUpdate = require('./repos');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  console.log('The following repos will be updated (synced with upstream):');
  console.log(reposForUpdate.map((repo) => `- ${repo}`).join('\n'));
  console.log();
  console.log('Are you sure you want to update the following repos? y/n');

  rl.on('line', async function (line) {
    if (line.trim().toLowerCase() === 'y') {
      console.log();
      await updateRepos(reposForUpdate);
    }
    rl.close();
  });
}

// Export both the pure function and the runner
module.exports = {
  updateRepos,
  run,
};

// If called directly, run the interactive mode
if (require.main === module) {
  run();
}
