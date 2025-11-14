// partDisk.ts (partitionDisk reescrita)
// Observações: usa isUEFI() e respeita part.UUID para detectar partições existentes.
// Usa `blkid -U <UUID>` sempre que possível para obter device path.

import { disk } from "../../index.d.ts";
import { toDev } from "../../modules/disk/replace.ts";
import { isUEFI } from "./verify.ts";

// Usa toDev(devName) como fallback quando necessário.
export async function partitionDisk(disk: disk) {
    const script: string[] = [];

    const diskBaseName = disk.name.replace('/dev/', '');
    const needsWipe = disk.children.some(p => p.erase);

    if (needsWipe) {
        script.push(`umount ${disk.name}* 2>/dev/null || true`);
        const labelType = await isUEFI() ? 'gpt' : 'msdos';
        script.push(`parted -s ${disk.name} mklabel ${labelType}`);
        script.push(`# Disco ${disk.name} limpo e pronto para particionamento`);
    } else {
        script.push(`# Usando partições existentes em ${disk.name}`);
        script.push(`parted -s ${disk.name} print || true`);
    }

    let start = 1;
    let partNumber = 1;

    for (const part of disk.children) {
        // Se não tem filesystem e não vai apagar, ignorar
        if (!part.fileSystem && !part.erase) {
            script.push(`# Ignorando ${part.name || part.UUID || 'partição'} (sem fileSystem ou erase)`);
            continue;
        }

        // Normalizar fs
        let fsType = part.fileSystem;
        if (fsType === 'efi') fsType = 'fat32';
        if (fsType === 'bios') fsType = 'ext4';

        // Decide existência pela UUID (preferível) ou por type/name
        const partExists = Boolean(part.UUID);

        // Assegura que `name` existe para fallback e geração de comandos que precisam do /dev/<name>
        if (!part.name) {
            const separator = diskBaseName.match(/nvme|mmcblk|loop/) ? 'p' : '';
            part.name = `${diskBaseName}${separator}${partNumber}`;
        }
        const devName = part.name;

        script.push(`# Partição ${partNumber}: ${part.name} (${fsType}, ${part.mountPoint || 'sem montagem'})`);

        // Se a partição já existe e só precisa formatar
        if (part.erase && partExists) {
            script.push(`# Formatando partição existente ${part.UUID || part.name}`);
            // tenta obter device via UUID, senão usa nome
            script.push(`umount $(blkid -U ${part.UUID} 2>/dev/null || echo ${toDev(devName)}) 2>/dev/null || true`);

            const targetDeviceExpr = `$(blkid -U ${part.UUID} 2>/dev/null || echo ${toDev(devName)})`;

            if (fsType === 'vfat' || fsType === 'fat32') {
                script.push(`mkfs.vfat -F 32 ${targetDeviceExpr}`);
            } else if (fsType === 'ext4' || fsType === 'ext3' || fsType === 'ext2') {
                script.push(`mkfs.${fsType} -F ${targetDeviceExpr}`);
            } else if (fsType === 'swap') {
                script.push(`mkswap ${targetDeviceExpr}`);
            } else {
                script.push(`mkfs.${fsType} ${targetDeviceExpr}`);
            }

            partNumber++;
            continue;
        }

        // Se a partição existe mas não vai formatar, apenas usa
        if (partExists && !part.erase && fsType) {
            script.push(`# Usando partição existente ${part.UUID || part.name} sem formatar`);
            partNumber++;
            continue;
        }

        // Criar nova partição (não existe OU needsWipe)
        if (!partExists || needsWipe) {
            if (!fsType) throw new Error(`Partição ${part.name || part.UUID} precisa de fileSystem para ser criada`);

            // calcular tamanho em MiB
            let sizeInMiB: number | null;
            if (typeof part.size === 'number') {
                sizeInMiB = part.size / (1024 * 1024);
            } else {
                const sizeStr = String(part.size).trim().toUpperCase();
                if (sizeStr.endsWith("GB")) sizeInMiB = parseFloat(sizeStr) * 1024;
                else if (sizeStr.endsWith("MB") || sizeStr.endsWith("MIB")) sizeInMiB = parseFloat(sizeStr);
                else if (sizeStr.endsWith("%")) sizeInMiB = null;
                else sizeInMiB = parseFloat(sizeStr);
            }

            const end = sizeInMiB === null ? "100%" : `${start + sizeInMiB}MiB`;
            const partType = part.partType ?? "primary";
            const isGPT = await isUEFI();

            script.push(`# Criando partição ${partNumber}: ${start}MiB -> ${end}`);
            if (isGPT) {
                script.push(`parted -s ${disk.name} mkpart ${partType} ${start}MiB ${end}`);
            } else {
                let partedFs = 'ext4';
                if (fsType === 'fat32' || fsType === 'vfat') partedFs = 'fat32';
                else if (fsType === 'swap') partedFs = 'linux-swap';
                script.push(`parted -s ${disk.name} mkpart ${partType} ${partedFs} ${start}MiB ${end}`);
            }

            script.push(`partprobe ${disk.name}`);
            script.push(`udevadm settle --timeout=10`);

            // Esperar pelo UUID do device (se part tinha UUID, talvez reassigned; se era nova, será criado depois da mkpart)
            if (part.UUID) {
                script.push(`# Aguardando partição com UUID ${part.UUID} aparecer`);
                // loop curto tentando blkid por UUID
                script.push(`for i in {1..15}; do blkid -U ${part.UUID} >/dev/null 2>&1 && break || sleep 1; done`);
            } else {
                // Fallback: esperar pelo device com número esperado
                script.push(`# Aguardando device ${toDev(devName)} estar disponível`);
                script.push(`for i in {1..10}; do [ -b ${toDev(devName)} ] && break || sleep 1; done`);
                script.push(`if [ ! -b ${toDev(devName)} ]; then echo "ERRO: ${toDev(devName)} não foi criado"; exit 1; fi`);
            }

            // Agora formatar (usar blkid -U UUID se disponível)
            script.push(`# Formatando ${part.UUID ? `UUID=${part.UUID}` : devName} como ${fsType}`);

            const targetDevice = part.UUID ? `$(blkid -U ${part.UUID} 2>/dev/null || echo ${toDev(devName)})` : `${toDev(devName)}`;

            if (fsType === 'vfat' || fsType === 'fat32') {
                script.push(`mkfs.vfat -F 32 ${targetDevice}`);
            } else if (fsType === 'ext4' || fsType === 'ext3' || fsType === 'ext2') {
                script.push(`mkfs.${fsType} -F ${targetDevice}`);
            } else if (fsType === 'swap') {
                script.push(`mkswap ${targetDevice}`);
                script.push(`swapon ${targetDevice}`);
            } else {
                script.push(`mkfs.${fsType} ${targetDevice}`);
            }

            // Definir flags
            if (part.mountPoint === '/boot/efi') {
                script.push(`parted -s ${disk.name} set ${partNumber} esp on`);
                script.push(`parted -s ${disk.name} set ${partNumber} boot on`);
            }
            if (part.mountPoint === '/boot') {
                script.push(`parted -s ${disk.name} set ${partNumber} boot on`);
            }

            // Atualizar pointers
            if (end === "100%") {
                partNumber++;
                break;
            } else {
                start = parseFloat(String(end).replace("MiB", ""));
                partNumber++;
            }
        } else {
            partNumber++;
        }
    }

    script.push(`# Finalizando disco ${disk.name}`);
    script.push(`partprobe ${disk.name}`);
    script.push(`udevadm settle --timeout=10`);
    script.push(`parted -s ${disk.name} print`);

    return script;
}
