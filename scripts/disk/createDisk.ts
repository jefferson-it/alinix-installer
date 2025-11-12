import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { partitionDisk } from "./partDisk.ts";
import { toDev } from "../../modules/disk/replace.ts";

export async function createDiskScript() {
    const diskScript = [
        "#!/bin/bash",
        "set -e"
    ];

    for (const disk of disks) {
        const sc = await partitionDisk(disk);
        diskScript.push(...sc);

        // Ordenar partições por profundidade do mountpoint
        const sortedParts = disk.children
            .filter(part => part.mountPoint && (part.fileSystem || part.erase))
            .sort((a, b) =>
                (a.mountPoint?.split('/').length ?? 0) -
                (b.mountPoint?.split('/').length ?? 0)
            );

        for (const part of sortedParts) {
            const devName = part.name;
            if (part.mountPoint) {
                const pathDir = path.join(tmpFolder, part.mountPoint);

                diskScript.push(`mkdir -p ${pathDir}`);

                if (part.mountPoint === '/boot/efi') {
                    //  Montagem reforçada com verificação de FS
                    diskScript.push(`
                blkid ${toDev(devName)} | grep -q 'vfat' || mkfs.vfat -F32 ${toDev(devName)}
                mount -t vfat ${toDev(devName)} ${pathDir} || echo '[!] Falha ao montar EFI: ${toDev(devName)}'
            `);
                    continue;
                }

                diskScript.push(`mount ${toDev(devName)} ${pathDir}`);
            }
        }

    }

    Deno.writeFileSync('./disk.sh', encode.encode(diskScript.join('\n')), { mode: 0o755 });
}
