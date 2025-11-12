import { disk } from "../../index.d.ts";

export async function listDisks(): Promise<disk[]> {
    const cmd = new Deno.Command("lsblk", { args: ["-J", '-b', "-o", "NAME,SIZE,TYPE,FSTYPE,PARTTYPE"] });
    const { stdout } = await cmd.output();
    const { blockdevices } = JSON.parse(new TextDecoder().decode(stdout));

    // deno-lint-ignore no-explicit-any
    return blockdevices.filter((d: any) => d.type === "disk").map((d: any) => ({
        name: `/dev/${d.name}`.replace("/dev//dev/", '/dev/'),
        size: parseFloat((d.size / (1024 ** 3)).toFixed(2)),
        bytes: d.size,
        children: (d.children || []).map((child: { name: string; size: number; fstype: string; }) => ({
            name: `/dev/${child.name}`.replace("/dev//dev/", '/dev/'),
            size: child.size,
            fileSystem: child.fstype === 'vfat' ? 'fat32' : (child.fstype || 'unknown'),
            mountPoint: null,
            erase: false
        }))
    }));
}