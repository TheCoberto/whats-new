# whats-new

**What's New** is a Minecraft Bedrock add-on for Bedrock Dedicated Servers: a menu of what changed in the latest server update. Players see it once when they join after an update, page through it, and close it. It stays closed until the next update. `/thecoberto:whatsnew` opens it any time.

- The first screen is the update's title, an intro and a button for each page (plus **Start reading**).
- Each page has **Next: <page>**, **Contents** and **Close** (**Done** on the last page).
- Closing it (Close, Done or the X) marks this update as read for that player. A menu that couldn't open (a loading screen in the way for over a minute) shows again next time.

Requires the **Beta APIs** experiment, because the text is read with the beta `@minecraft/server-admin` module, which only works on a Bedrock Dedicated Server. Beta versions change with Minecraft updates, so after an update the versions in `manifest.json` may need bumping (look up the `beta` tag of `@minecraft/server`, `@minecraft/server-ui` and `@minecraft/server-admin` on npm).

## The text

Bedrock scripts can't read files, so the text is a server variable: the `whats_new` variable in the server's `config/911336de-f70b-4030-b030-4e15eb9fae6a/variables.json` (that's this pack's script module UUID), as a string or a list of lines. [bds-server](https://github.com/TheCoberto/bds-server)'s `publish-whats-new.ps1` writes and uploads it from `whats-new.md`.

```markdown
# The Big Update                     <- the menu's title
update: 2026-11-24                   <- change this and everyone sees the menu again

Intro text, on the first screen.
> Grey note

## New Add-ons                       <- each ## starts a page
### Small heading
- A bullet with **bold** and `a command`
<!-- left out of the menu -->
```

Without an `update:` line the title is used, so a new title also counts as a new update. Fixing a typo without changing `update:` doesn't show the menu again to players who closed it.

After changing the file on the server, run `scriptevent thecoberto:whatsnew_reload` in the console (or `/thecoberto:whatsnewreload` as an operator) so the add-on re-reads it; the console prints the update it now has. If it still shows the old one, restart the server.

## Commands

| Command | Who | What |
| --- | --- | --- |
| `/thecoberto:whatsnew` (`/whatsnew`) | everyone | Opens the menu |
| `/thecoberto:whatsnewreload` | operators | Re-reads the text from the server config |
| `scriptevent thecoberto:whatsnew_reload` | console | Same, for scripts like `publish-whats-new.ps1` |

Which update a player has read is saved on the player (`thecoberto:whatsnew_seen`).

## Building

Use `package.ps1` from [bedrock-tools](https://github.com/TheCoberto/bedrock-tools), cloned next to this repo:

```powershell
powershell -ExecutionPolicy Bypass -File ..\bedrock-tools\package.ps1
```
