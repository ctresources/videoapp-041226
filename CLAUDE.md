# XpressReel – Claude Code Instructions

## Git Workflow

**Always push to both branches after every commit.**

Development happens on `claude/extract-usb-zip-rkpNo`. After pushing there, immediately push the same change to `master` as well. Do this without being asked — it is a standing rule for every session.

The two branches have diverged histories (different commit hashes for equivalent changes), so push to each separately rather than cherry-picking:

```bash
# After committing on the feature branch:
git push -u origin claude/extract-usb-zip-rkpNo

# Then switch to master, apply the same change, commit, and push:
git checkout master
# ... apply change ...
git add <files>
git commit -m "<same message>"
git push -u origin master

# Return to feature branch to continue work:
git checkout claude/extract-usb-zip-rkpNo
```

If the master version of a file is significantly different from the feature branch base, adapt the change to master's version rather than blind cherry-picking.
