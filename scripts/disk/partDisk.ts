import { disk } from "../../index.d.ts";
import { toDev } from "../../modules/disk/replace.ts";
import { isUEFI } from "./verify.ts";

export async function partitionDisk(disk: disk) {
    const script: string[] = [];

    const diskBaseName = disk.name.replace('/dev/', '');
    const systemIsUEFI = await isUEFI();
    const labelType = systemIsUEFI ? "gpt" : "msdos";

    const allPartitionsNew = disk.children.filter(p => p.use).every(p => !p.UUID) || disk.wipe;
    const needsWipe = allPartitionsNew;

    if (needsWipe) {
        script.push(`# Limpando disco completamente (todas partições são novas)`);
        // desmonta apenas filhos do disco, em vez de umount /dev/sda*
        script.push(`# Desmontando todas as partições filhas de ${disk.name} (se existirem)`);
        script.push(`for part in $(lsblk -ln -o NAME ${disk.name} | tail -n +2); do umount /dev/$part 2>/dev/null || true; done`);
        script.push(`parted -s ${disk.name} mklabel ${labelType}`);
        script.push(`# Disco ${disk.name} limpo e pronto para particionamento`);
    } else {
        script.push(`# Mantendo estrutura existente em ${disk.name}`);
        script.push(`parted -s ${disk.name} print || true`);
    }

    // start em MiB (iniciamos em 1 MiB para alinhamento)
    let startMiB = 1;
    let partNumber = 1;

    for (let idx = 0; idx < disk.children.length; idx++) {
        const part = disk.children[idx];

        if (part.use === false) {
            script.push(`# Ignorando ${part.name || part.UUID || 'partição'} (use: false)`);
            continue;
        }

        if (!part.fileSystem) {
            script.push(`# Ignorando ${part.name || part.UUID || 'partição'} (sem fileSystem definido)`);
            continue;
        }

        let fsType = part.fileSystem;
        if (fsType === 'efi') fsType = 'fat32';
        if (fsType === 'bios') fsType = 'ext4';

        const partExists = Boolean(part.UUID);

        if (part.name && part.name.startsWith("/dev/")) {
            part.name = part.name.replace("/dev/", "");
        }

        if (!part.name) {
            const separator = diskBaseName.match(/nvme|mmcblk|loop/) ? 'p' : '';
            part.name = `${diskBaseName}${separator}${partNumber}`;
        }
        const devName = part.name;
        const devPath = toDev(devName);

        script.push(`# Partição ${partNumber}: ${part.name} (${fsType}, ${part.mountPoint || 'sem montagem'})`);

        if (partExists && part.erase === true) {
            script.push(`# Formatando partição existente ${part.UUID} (${part.name})`);

            const targetDevice = `$(blkid -U ${part.UUID} 2>/dev/null || echo ${devPath})`;
            script.push(`umount ${targetDevice} 2>/dev/null || true`);


            if (fsType === 'vfat' || fsType === 'fat32') {
                script.push(`mkfs.vfat -F 32 ${targetDevice}`);
            } else if (fsType === 'ext4' || fsType === 'ext3' || fsType === 'ext2') {
                script.push(`mkfs.${fsType} -F ${targetDevice}`);
            } else if (fsType === 'swap') {
                script.push(`mkswap ${targetDevice}`);
            } else {
                script.push(`mkfs.${fsType} ${targetDevice}`);
            }

            script.push(`# Partição ${part.UUID} formatada como ${fsType}`);
            partNumber++;
            continue;
        }

        if (partExists && !part.erase) {
            script.push(`# Mantendo partição existente ${part.UUID} (${part.name}) sem modificações`);
            script.push(`# Filesystem: ${fsType}, Ponto de montagem: ${part.mountPoint || 'nenhum'}`);
            partNumber++;
            continue;
        }

        if (!partExists) {
            script.push(`# Criando nova partição ${part.name}`);

            let sizeInMiB: number | null = null;
            if (part.size == null) {
                sizeInMiB = null;
            } else if (typeof part.size === 'number') {
                sizeInMiB = Math.round(part.size / (1024 * 1024));
            } else {
                const raw = String(part.size).trim().toUpperCase();
                const pctMatch = raw.match(/^(\d+(?:\.\d+)?)\s*%$/);
                if (raw === "100%" || raw === "100 PERCENT" || raw === "100") {
                    sizeInMiB = null;
                } else if (pctMatch) {
                    sizeInMiB = null;
                } else {
                    const m = raw.match(/^(\d+(?:\.\d+)?)([KMGT]?I?B?|B)?$/);
                    if (m) {
                        const val = parseFloat(m[1]);
                        const unit = m[2] || '';
                        if (/^T/i.test(unit)) sizeInMiB = Math.round(val * 1024 * 1024);
                        else if (/^G/i.test(unit)) sizeInMiB = Math.round(val * 1024);
                        else if (/^M/i.test(unit)) sizeInMiB = Math.round(val);
                        else if (/^K/i.test(unit)) sizeInMiB = Math.max(1, Math.round(val / 1024));
                        else if (/^B$/i.test(unit)) sizeInMiB = Math.max(1, Math.round(val / (1024 * 1024)));
                        else sizeInMiB = Math.round(val);
                    } else {
                        const f = parseFloat(raw);
                        sizeInMiB = Number.isFinite(f) ? Math.round(f) : null;
                    }
                }
            }

            const endStr = sizeInMiB === null ? "100%" : `${startMiB + sizeInMiB}MiB`;
            const partType = part.partType ?? "primary";

            script.push(`# Criando partição ${partNumber}: ${startMiB}MiB -> ${endStr}`);

            if (systemIsUEFI) {
                script.push(`parted -s ${disk.name} mkpart ${partType} ${startMiB}MiB ${endStr}`);
            } else {
                let partedFs = 'ext4';
                if (fsType === 'fat32' || fsType === 'vfat') partedFs = 'fat32';
                else if (fsType === 'swap') partedFs = 'linux-swap';
                script.push(`parted -s ${disk.name} mkpart ${partType} ${partedFs} ${startMiB}MiB ${endStr}`);
            }

            script.push(`partprobe ${disk.name}`);
            script.push(`udevadm settle --timeout=10`);

            script.push(`# Aguardando device ${devPath} estar disponível`);
            script.push(`for i in {1..10}; do [ -b ${devPath} ] && break || sleep 1; done`);
            script.push(`if [ ! -b ${devPath} ]; then echo "ERRO: ${devPath} não foi criado"; exit 1; fi`);

            script.push(`# Formatando ${devName} como ${fsType}`);

            if (fsType === 'vfat' || fsType === 'fat32') {
                script.push(`mkfs.vfat -F 32 ${devPath}`);
            } else if (fsType === 'ext4' || fsType === 'ext3' || fsType === 'ext2') {
                script.push(`mkfs.${fsType} -F ${devPath}`);
            } else if (fsType === 'swap') {
                script.push(`mkswap ${devPath}`);
                script.push(`swapon ${devPath}`);
            } else {
                script.push(`mkfs.${fsType} ${devPath}`);
            }

            if (part.mountPoint === '/boot/efi') {
                script.push(`parted -s ${disk.name} set ${partNumber} esp on`);
                script.push(`parted -s ${disk.name} set ${partNumber} boot on`);
            } else if (part.mountPoint === '/boot') {
                script.push(`parted -s ${disk.name} set ${partNumber} boot on`);
            }

            if (sizeInMiB === null) {
                if (idx < disk.children.length - 1) {
                    script.push(`# AVISO: Partição ${partNumber} ocupou 100% do espaço mas ainda há definições de partições posteriores.`);
                }
                partNumber++;
                break;
            } else {
                startMiB = startMiB + sizeInMiB;
                partNumber++;
            }
        } else {
            script.push(`# Aviso: partição ${part.name || part.UUID} em estado indefinido`);
            partNumber++;
        }
    }

    script.push(`# Finalizando disco ${disk.name}`);
    script.push(`partprobe ${disk.name}`);
    script.push(`udevadm settle --timeout=10`);
    script.push(`parted -s ${disk.name} print`);
    script.push(`blkid | grep ${diskBaseName} || true`);

    return script;
}
