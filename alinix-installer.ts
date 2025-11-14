import { existsSync } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { banner } from "./modules/banner.ts";
import { selectUbuntuRepo } from "./modules/ubuntu.ts";
import { choiceTimezone } from "./modules/timezone.ts";
import RequestUser from "./modules/users.ts";
import { choiceDesktop } from "./modules/desktop.ts";
import ChoiceDisk from "./modules/disk.ts";
import { choiceApps } from "./modules/apps.ts";
import SummaryInstallation from "./modules/summary.ts";
import InstallProcess from "./scripts/install.ts";

const args = Deno.args


if (args.includes('-d') || args.includes('--debug')) {
    const cmd = ["script", "-c", Deno.execPath(), "/tmp/alinix.log"];
    const process = new Deno.Command(cmd[0], {
        args: cmd.slice(1),
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    });

    const status = await process.output();
    Deno.exit(status.code);
}

if (Deno.uid() !== 0) {
    const cmd = ["sudo", Deno.execPath(), ...Deno.args];
    const process = new Deno.Command(cmd[0], {
        args: cmd.slice(1),
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    });
    const status = await process.output();
    Deno.exit(status.code);
}

globalThis.encode = new TextEncoder();
globalThis.user = {};
globalThis.disks = [];
globalThis.timezone = null;
globalThis.repos = [];
globalThis.apps = [];
globalThis.desktop = null;
globalThis.tmpFolder = "/mnt/alinix-temp";

if (args[0] == "--json") {
    const input = args[1];
    let data;
    if (!input) {
        console.error("X > Use: alinix-installer --json <arquivo|json>");
        Deno.exit(1);
    }

    if (existsSync(String(input))) {
        console.log(`Lendo JSON do arquivo ${input}`);
        const file = Deno.readTextFileSync(input);
        try {
            data = JSON.parse(String(file));
            console.log("OK > JSON válido:", data);
        } catch {
            console.error(`X > "${file}" não é um JSON válido.`);
            Deno.exit(1);
        }
    } else {
        try {
            data = JSON.parse(String(input));
            console.log("OK > JSON válido:", data);
        } catch {
            console.error(`X > "${input}" não é um JSON válido.`);
            Deno.exit(1);
        }
    }

    globalThis.user = data.user;
    globalThis.disks = data.disks;
    globalThis.timezone = data.timezone;
    globalThis.repos = data.repos;
    globalThis.apps = data.apps;
    globalThis.desktop = data.desktop;

    await InstallProcess();

    Deno.exit(0);
}

if (import.meta.main) {
    console.log(banner);

    await RequestUser();
    await choiceTimezone();
    await selectUbuntuRepo();
    await choiceDesktop();
    await choiceApps();
    await ChoiceDisk();
    await SummaryInstallation();
}
