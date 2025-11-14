import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { partitionDisk } from "./partDisk.ts";
import { toDev } from "../../modules/disk/replace.ts";

export async function createDiskScript() {
    const encode = new TextEncoder();
    const diskScript: string[] = ["#!/bin/bash", "set -e"];

    const tmpFolder: string = (globalThis.tmpFolder as string) || "/tmp/mnt";

    for (const disk of disks) {
        const sc = await partitionDisk(disk);
        diskScript.push(...sc);

        const sortedParts = (disk.children || [])
            .filter((p) => p.mountPoint)
            .sort((a, b) =>
                (a.mountPoint?.length ?? 0) - (b.mountPoint?.length ?? 0)
            );

        for (const part of sortedParts) {
            const devName = part.name;
            if (!part.mountPoint) continue;

            const pathDir = path.join(tmpFolder, part.mountPoint);
            diskScript.push(`mkdir -p ${pathDir}`);

            if (part.mountPoint === '/boot/efi') {

                const deviceExpr = part.UUID ? `$(blkid -U ${part.UUID} 2>/dev/null || echo ${toDev(devName)})` : `${toDev(devName)}`;

                diskScript.push(`mount -t vfat ${deviceExpr} ${pathDir} || echo '[!] Falha ao montar EFI: ${deviceExpr}'`);

                continue;
            }

            if (part.UUID) {
                diskScript.push(`mount -U ${part.UUID} ${pathDir} || mount ${toDev(devName)} ${pathDir} || echo '[!] Falha ao montar: UUID=${part.UUID} or ${toDev(devName)}'`);
            } else {
                diskScript.push(`mount ${toDev(devName)} ${pathDir} || echo '[!] Falha ao montar: ${toDev(devName)}'`);
            }
        }

        diskScript.push(`mount | grep ${toDev(disk.name)}`);
    }

    Deno.writeFileSync('./disk.sh', encode.encode(diskScript.join('\n')), { mode: 0o755 });
}