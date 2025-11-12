import { banner } from "./modules/banner.ts";
import { selectUbuntuRepo } from "./modules/ubuntu.ts";
import { choiceTimezone } from "./modules/timezone.ts";
import RequestUser from "./modules/users.ts";
import { choiceDesktop } from "./modules/desktop.ts";
import ChoiceDisk from "./modules/disk.ts";
import { choiceApps } from "./modules/apps.ts";
import SummaryInstallation from "./modules/summary.ts";

if (Deno.args.includes("--debug") || Deno.args.includes("-d")) {
    const cmd = [
        'script', '-c',
        Deno.execPath(),
        '/tmp/alinix.log',
    ]

    const process = new Deno.Command(cmd[0], {
        args: cmd.slice(1),
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit"
    });

    const status = await process.output();
    Deno.exit(status.code);
}

if (Deno.uid() !== 0) {
    const cmd = [
        "sudo",
        Deno.execPath(),
        ...Deno.args
    ]

    const process = new Deno.Command(cmd[0], {
        args: cmd.slice(1),
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit"
    });

    const status = await process.output();
    Deno.exit(status.code);
}

globalThis.encode = new TextEncoder()
globalThis.user = {}
globalThis.disks = []
globalThis.timezone = null
globalThis.repos = []
globalThis.apps = []
globalThis.desktop = null
globalThis.tmpFolder = "/mnt/alinix-temp";

console.log(banner);

await RequestUser();
await choiceTimezone();
await selectUbuntuRepo();
await choiceDesktop();
await choiceApps();
await ChoiceDisk();

await SummaryInstallation();