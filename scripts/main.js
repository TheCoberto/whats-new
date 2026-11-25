import {
	world,
	system,
	Player,
	CommandPermissionLevel,
	CustomCommandStatus,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
// Namespace import: dedicatedServer may not exist in every beta, and a missing named
// import would stop the whole script from loading.
import * as admin from "@minecraft/server-admin";

// What's New: a menu of what changed in the latest server update. Players see it once
// when they join after an update (until they close it) and any time with
// /thecoberto:whatsnew.
//
// The text is the server's whats-new.md, put in the Bedrock Dedicated Server's
// config/<this pack's script module uuid>/variables.json as the "whats_new" variable
// (a string, or a list of lines). bds-server's publish-whats-new.ps1 does that. Format:
//
//   # Title of the update               menu title
//   update: 2026-11-24                  change this and everyone sees the menu again
//   Intro text, on the contents page.
//   ## Page title                       each ## starts a page
//   ### Small heading
//   - bullet, with **bold** and `commands`
//   > a grey note
//   <!-- comments are left out -->

const VARIABLE = "whats_new";
const SEEN = "thecoberto:whatsnew_seen";
const MODULE_UUID = "911336de-f70b-4030-b030-4e15eb9fae6a";
const JOIN_DELAY_TICKS = 100; // 5 seconds after spawning
const PREFIX = "§8[§6What's New§8]§r ";

// ---------- The text ----------------------------------------------------------------

let doc; // read on first use, after the world has loaded

function current() {
	if (!doc) doc = parse(readVariable());
	return doc;
}

function readVariable() {
	try {
		const value = admin.variables?.get(VARIABLE);
		if (Array.isArray(value)) return value.map(String).join("\n");
		if (typeof value === "string") return value;
	} catch (e) {
		console.warn(`[What's New] Couldn't read the ${VARIABLE} variable: ${e}`);
	}
	return "";
}

function reload() {
	try {
		admin.dedicatedServer?.reloadScriptingConfig();
	} catch (e) {
		console.warn(`[What's New] Couldn't reload the script config, so a restart may be needed: ${e}`);
	}
	doc = parse(readVariable());
	const message = describe(doc);
	console.log(`[What's New] Reloaded. ${message}`);
	return message;
}

function describe(d) {
	if (d.empty) {
		return `No text, so nothing is shown. Put whats-new.md in config/${MODULE_UUID}/variables.json as "${VARIABLE}".`;
	}
	return `Update "${d.update}": ${d.title}, ${d.pages.length} page(s).`;
}

function parse(markdown) {
	const text = markdown.replace(/\r/g, "").replace(/<!--[\s\S]*?-->/g, "");
	let title = "What's New";
	let update = "";
	let sawTitle = false;
	const intro = [];
	const pages = [];
	let lines = intro;

	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (line.startsWith("## ")) {
			lines = [];
			pages.push({ title: line.slice(3).trim(), lines });
			continue;
		}
		if (line.startsWith("# ") && !sawTitle) {
			title = line.slice(2).trim();
			sawTitle = true;
			continue;
		}
		const updateLine = /^update\s*:\s*(.+)$/i.exec(line);
		if (updateLine && pages.length === 0 && !update) {
			update = updateLine[1].trim();
			continue;
		}
		if (!line) {
			// One blank line between blocks, none at the start
			if (lines.length && lines[lines.length - 1] !== "") lines.push("");
		} else if (line.startsWith("### ")) {
			lines.push(`§6§l${plain(line.slice(4))}§r`);
		} else if (line.startsWith("- ") || line.startsWith("* ")) {
			lines.push(`§6• §r${inline(line.slice(2).trim())}`);
		} else if (line.startsWith(">")) {
			lines.push(`§7§o${plain(line.slice(1))}§r`);
		} else {
			lines.push(inline(line));
		}
	}

	const trim = (l) => {
		while (l.length && l[l.length - 1] === "") l.pop();
	};
	trim(intro);
	for (const p of pages) trim(p.lines);
	const empty = pages.length === 0 && intro.length === 0;
	// No update line: use the title, so a new title still counts as a new update
	if (!update && !empty) update = title;
	return { title, update, intro, pages, empty: empty || !update };
}

// **bold**, `code` and [links](url) (shown as their text)
function inline(s) {
	return (
		s
			.replace(/§/g, "")
			.replace(/\*\*(.+?)\*\*/g, "§e§l$1§r")
			.replace(/`([^`]+)`/g, "§b$1§r")
			.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") + "§r"
	);
}

function plain(s) {
	return s
		.replace(/§/g, "")
		.replace(/\*\*(.+?)\*\*/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.trim();
}

// ---------- Seen ----------------------------------------------------------------------

function hasSeen(player, d) {
	return player.getDynamicProperty(SEEN) === d.update;
}

function markSeen(player, d) {
	if (player.isValid) player.setDynamicProperty(SEEN, d.update);
}

// ---------- The menu --------------------------------------------------------------------

// Forms can't open over chat or a loading screen (UserBusy), so keep trying.
// Returns undefined if it never got shown.
async function show(player, form, tries) {
	for (let attempt = 0; attempt < tries; attempt++) {
		if (!player.isValid) return undefined;
		const response = await form.show(player);
		if (response.cancelationReason !== FormCancelationReason.UserBusy) return response;
		await system.waitTicks(10);
	}
	return undefined;
}

// screen -1 is the contents, 0.. are pages.
async function open(player, screen, tries = 10) {
	const d = current();
	if (d.empty) {
		player.sendMessage(`${PREFIX}§7Nothing new right now.`);
		return;
	}

	const form = new ActionFormData();
	const actions = []; // what each button does, in order

	if (screen < 0 || screen >= d.pages.length) {
		let body = d.intro.join("\n");
		if (d.pages.length) body += (body ? "\n\n" : "") + "§7Pick a section, or start from the top.";
		form.title(d.title).body(body);
		if (d.pages.length) {
			form.button("§2Start reading");
			actions.push(() => open(player, 0));
			d.pages.forEach((page, i) => {
				form.button(page.title);
				actions.push(() => open(player, i));
			});
		}
		form.button("Close");
		actions.push(() => markSeen(player, d));
	} else {
		const page = d.pages[screen];
		const last = screen === d.pages.length - 1;
		form.title(page.title).body(`${page.lines.join("\n")}\n\n§8Page ${screen + 1} of ${d.pages.length}`);
		if (!last) {
			form.button(`§2Next: ${d.pages[screen + 1].title}`);
			actions.push(() => open(player, screen + 1));
		}
		form.button("Contents");
		actions.push(() => open(player, -1));
		form.button(last ? "Done" : "Close");
		actions.push(() => markSeen(player, d));
	}

	const response = await show(player, form, tries);
	if (!response) return; // never shown: they'll get it next time
	if (response.canceled) {
		markSeen(player, d); // closed with X
		return;
	}
	actions[response.selection]?.();
}

// ---------- Joining ------------------------------------------------------------------------

world.afterEvents.worldLoad.subscribe(() => {
	console.log(`[What's New] ${describe(current())}`);
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
	if (!initialSpawn) return;
	system.runTimeout(() => {
		if (!player.isValid) return;
		const d = current();
		if (d.empty || hasSeen(player, d)) return;
		// Loading screens can keep it busy for a while: try for about a minute
		open(player, -1, 120).catch((e) => console.warn(`[What's New] ${e}`));
	}, JOIN_DELAY_TICKS);
});

// ---------- Commands ------------------------------------------------------------------------

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
	customCommandRegistry.registerCommand(
		{
			name: "thecoberto:whatsnew",
			description: "See what's new on the server",
			permissionLevel: CommandPermissionLevel.Any,
			cheatsRequired: false,
		},
		(origin) => {
			const player = origin.sourceEntity;
			if (!(player instanceof Player)) {
				return { status: CustomCommandStatus.Success, message: describe(current()) };
			}
			// Chat is still open right after a command; show() waits for it to close.
			system.run(() => open(player, -1, 40).catch((e) => console.warn(`[What's New] ${e}`)));
			return { status: CustomCommandStatus.Success, message: "Close chat to see what's new." };
		}
	);

	customCommandRegistry.registerCommand(
		{
			name: "thecoberto:whatsnewreload",
			description: "Re-read the What's New text from the server's config",
			permissionLevel: CommandPermissionLevel.GameDirectors,
			cheatsRequired: false,
		},
		(origin) => {
			const player = origin.sourceEntity;
			// Reloading can't happen inside a command, so it runs next tick.
			system.run(() => {
				const message = reload();
				if (player instanceof Player && player.isValid) player.sendMessage(`${PREFIX}${message}`);
			});
			return { status: CustomCommandStatus.Success };
		}
	);
});

// The server console (and publish-whats-new.ps1) can run: scriptevent thecoberto:whatsnew_reload
system.afterEvents.scriptEventReceive.subscribe(({ id }) => {
	if (id === "thecoberto:whatsnew_reload") reload();
});
