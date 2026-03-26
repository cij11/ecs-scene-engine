# Project Instructions

## Collaboration & Locks

This project uses a file-based locking system for coordinating work across multiple developers and agents. The full process is documented in `process/collaboration/collaboration.md`.

**Before reading files:** Check `process/collaboration/locks/` for active locks covering the files you intend to read. If locked, note that those files may change under you.

**Before writing files:** Create a lock file in `process/collaboration/locks/` identifying yourself, the files/directories you are locking, and when you expect to release. See `process/collaboration/collaboration.md` for the format.

**After writing files:** Remove your lock file from `process/collaboration/locks/`.
