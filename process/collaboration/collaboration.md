Collaboration conventions for coordinating work across multiple developers and agents.

## Locks

The `locks/` directory contains lock files that signal active work on files or directories.

### Before reading files

Consult the `locks/` directory to check if any lock files cover the files you intend to read. If a lock exists, be aware that those files may change while you are reading them. Proceed with caution and note any active locks in your reasoning.

### Before writing to files

Add a lock file to the `locks/` directory before writing. The lock file should contain:

- **who**: An identifier for the developer or agent holding the lock.
- **what**: The files or directories being locked.
- **until**: When the lock is anticipated to be released.

Name the lock file descriptively (e.g., `engine-chris.md`, `game-claude-session-abc.md`).

Example lock file:

```
who: claude-session-abc123
what: engine/
until: 2026-03-26T04:30:00Z
```

### After completing writes

Remove your lock file from the `locks/` directory once you have finished writing.

## Ports

All npm scripts that launch or watch served applications require a `port` parameter.

### Before launching a server

Check `locks/` for any lock files that claim a port. Choose a port that is not already claimed.

### When claiming a port

Add a lock file to `locks/` before starting the server. The lock file should include:

- **who**: An identifier for the developer or agent.
- **what**: The port number and the script being run.
- **until**: When the port is anticipated to be released.

Example lock file:

```
who: chris
what: port 3000 (npm run dev)
until: 2026-03-26T06:00:00Z
```

### After stopping a server

Remove your lock file from `locks/` once the server is stopped.
