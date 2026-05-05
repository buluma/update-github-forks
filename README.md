# Update GitHub Forks

Sync your forked GitHub repositories with their upstream repositories in two steps (takes less than 5 minutes).

## Motivation

Keeping your forked repositories up-to-date with the upstream repository is important but doing it manually for many forks is tedious. You have to visit each repository and click "Sync fork" or use git commands.

Using these scripts, you can fetch a list of your GitHub forks and sync them all in one go.

## Requirements

- **Node.js 20+** — [Download here](https://nodejs.org/)
- **Git** — For conflict resolution

## Getting Started

Clone this repository.

```sh
$ npm install
$ cp src/config.json.example src/config.json
```

Add your GitHub username and access token to `config.json`. To get the access token, go to [this page](https://github.com/settings/tokens/new) and create a token that has the following permission: `public_repo`.

## Usage

Firstly, run the following command to fetch all your forked repositories.

```sh
$ npm run fetch # Writes to a src/repos.json file
```

A JSON file, `src/repos.json` containing an array of your repositories will be written into the same directory. Manually inspect it and remove the forked repositories that you **don't** want to update. **The repositories that remain inside `src/repos.json` will be updated on the next command**.

```sh
$ npm run update # Reads from src/repos.json and updates the repos inside it.
```

And all the repositories within `src/repos.json` will be synced with their upstream! It's that easy.

**Note:** This uses GitHub's merge-upstream API to sync forks. Ensure you have no uncommitted changes in your fork, as the merge may fail if there are conflicts.

### Handling Merge Conflicts

If a fork has diverged from its upstream (you have commits the upstream doesn't have, or vice versa), the merge will fail with a conflict error. The script handles this gracefully:

- Automatically skips conflicted repos and continues with others
- Generates a `resolve-conflicts.sh` script in the project root
- The generated script contains git commands to manually resolve each conflict

Review the generated script, then run:

```sh
$ ./resolve-conflicts.sh
```

It will guide you through resolving each conflict interactively. After resolving conflicts in a repo, it will automatically rebase and push.

The scripts can be potentially modified to work on an organization's repositories as well just by changing the URLs. Pull requests to support this feature are welcome.

## License

MIT
