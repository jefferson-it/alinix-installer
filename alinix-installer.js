import { banner } from "./modules/banner.js";
import { selectUbuntuRepo } from "./modules/ubuntu.js";
import { choiceTimezone } from "./modules/timezone.js";
import RequestUser from "./modules/users.js";
import { choiceDesktop } from "./modules/desktop.js";
import ChoiceDisk from "./modules/disk.js";
import { choiceApps } from "./modules/apps.js";
import SummaryInstallation from "./modules/summary.js";

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

globalThis.user = { name: null, hostname: 'alinix', password: null, username: null }
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