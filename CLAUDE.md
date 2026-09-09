# SparkReels – Claude Code Instructions

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

## Product names — check copy against this list

Most copy bugs in this repo have been one of two things: **a name that changed
in the app but not on the landing page**, or **two features described in each
other's words**. Both are cheap to avoid and expensive to find. When you touch
`app/page.tsx`, `app/(dashboard)/help/page.tsx`, or any user-facing string,
check the name against this table first.

Left column is the name. Right column is what it is **not** called any more —
if you find one of those in copy, it is stale.

| Use this | Never this | What it is |
|---|---|---|
| **Create** | Create Video | The nav item and the page at `/create` |
| **My Content** | My Videos | `/videos` — holds videos, blog posts and drafts |
| **Your Share Kit** | Post copy & blog · Content Pack · Titles & captions | Editor step 5. Title, description, hashtags, Instagram caption, LinkedIn post, email blurb **and the blog article** |
| **Spark Video** | Generate · Generate Video | The button that renders and spends an allowance |
| **Use My Avatar** | SparkReels makes it · AI avatar | Row 1 tile |
| **Film On Camera** | I'll film it · On camera | Row 1 tile |
| **Blog post** | — | Row 1 tile. A first-class output, not a by-product |
| **AI writes it / Paste my script / My listings/My photos** | My script | Row 2, the script sources |
| **Speak naturally** | — | Camera-side source: no script, no teleprompter |
| **I'll record it** | — | Third answer to *who's on screen*; the free exit from the render screen |
| **Photo reel** | — | Free FFmpeg slideshow, not a HeyGen render |
| **Branded Look** | — | Record-time compositing: logo, name bar, end card |
| **AI Answer Blocks** | — | Research tool: what buyers ask AI, turned into video topics |
| **short video / long video** | credit | The two plan allowances. Billing has never sold credits |

### Two traps specifically

**Answer Blocks and the blog are not the same thing.** Answer Blocks decides
*what is worth saying*; the blog article is *the long version of whatever you
then make*. Describing either with the other's words ("a text block for your
website") has now been fixed three separate times.

**"Free" is not the same as "included".** Camera recording, blog posts and all
eight AI Tools are gated by `freeTrialGateResponse` — unlocked by generating
the free video, then 30 days, then a plan. Paid tiers and admins are never
gated. So write **"included on every paid plan"**, not "free on every plan".
The claim that stays true everywhere is that blog posts **never use a video
from your plan**.
