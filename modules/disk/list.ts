import { disk } from "../../index.d.ts";
import { toDev } from "./replace.ts";

export async function listDisks(): Promise<disk[]> {
    const cmd = new Deno.Command("lsblk", { args: ["-J", '-b', "-o", "NAME,SIZE,TYPE,FSTYPE,PARTTYPE,UUID"] });
    const { stdout } = await cmd.output();
    const { blockdevices } = JSON.parse(new TextDecoder().decode(stdout));

    // deno-lint-ignore no-explicit-any
    return blockdevices.filter((d: any) => d.type === "disk").map((d: any) => ({
        name: toDev(d.name),
        size: parseFloat((d.size / (1024 ** 3)).toFixed(2)),
        bytes: d.size,
        children: (d.children || []).map((child: { name: string; size: number; mountPoint: string; fstype: string; uuid: string }) => ({
            name: toDev(child.name),
            size: child.size,
            fileSystem: child.fstype === 'vfat' ? 'fat32' : (child.fstype || 'unknown'),
            mountPoint: child.mountPoint || null,
            erase: false,
            use: true,
            UUID: child.uuid || null,
        }))
    }));
}