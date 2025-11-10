import { isUEFI } from "../modules/disk.js";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

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
            .sort((a, b) => {
                const depthA = a.mountPoint.split('/').length;
                const depthB = b.mountPoint.split('/').length;
                return depthA - depthB; // Montar os mais rasos primeiro
            });

        for (const part of sortedParts) {
            const devName = part.name;
            const pathDir = path.join(tmpFolder, part.mountPoint);

            diskScript.push(`mkdir -p ${pathDir}`);
            diskScript.push(`mount ${toDev(devName)} ${pathDir}`);
        }
    }

    Deno.writeFileSync('./disk.sh', encode.encode(diskScript.join('\n')), { mode: 0o755 });
}

export async function partitionDisk(disk) {
    const script = [];

    // Extrair nome base do disco (sem /dev/)
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
        if (!part.fileSystem && !part.erase) {
            script.push(`# Ignorando ${part.name || 'partição'} (sem fileSystem ou erase)`);
            continue;
        }

        // Normalizar filesystem
        let fsType = part.fileSystem;
        if (fsType === 'efi') {
            fsType = 'fat32';
        } else if (fsType === 'bios') {
            fsType = 'ext4';
        }

        // Detectar se a partição já existe (veio do lsblk com type="part")
        const partExists = part.type === "part";

        // Gerar nome da partição ANTES de usar
        if (!part.name) {
            const separator = diskBaseName.match(/nvme|mmcblk|loop/) ? 'p' : '';
            part.name = `${diskBaseName}${separator}${partNumber}`;
        }

        const devName = part.name;

        script.push(`# Partição ${partNumber}: ${part.name} (${fsType}, ${part.mountPoint || 'sem montagem'})`);

        // Se a partição já existe e só precisa formatar
        if (part.erase && partExists) {
            script.push(`# Formatando partição existente ${part.name}`);
            script.push(`umount ${devName} 2>/dev/null || true`);

            if (fsType === 'vfat' || fsType === 'fat32') {
                script.push(`mkfs.vfat -F 32 ${devName}`);
            } else if (fsType === 'ext4' || fsType === 'ext3' || fsType === 'ext2') {
                script.push(`mkfs.${fsType} -F ${devName}`);
            } else if (fsType === 'swap') {
                script.push(`mkswap ${devName}`);
            } else {
                script.push(`mkfs.${fsType} ${devName}`);
            }

            partNumber++;
            continue;
        }

        // Se a partição existe mas não vai formatar, apenas usa
        if (partExists && !part.erase && fsType) {
            script.push(`# Usando partição existente ${part.name} sem formatar`);
            partNumber++;
            continue;
        }

        // CRIAR nova partição (não existe OU precisa recriar por wipe total do disco)
        if (!partExists || needsWipe) {
            if (!fsType) {
                throw new Error(`Partição ${part.name} precisa de fileSystem para ser criada`);
            }

            // Calcular tamanho em MiB
            let sizeInMiB;
            if (typeof part.size === 'number') {
                sizeInMiB = part.size / (1024 * 1024);
            } else {
                const sizeStr = part.size.toString().trim().toUpperCase();
                if (sizeStr.endsWith("GB")) {
                    sizeInMiB = parseFloat(sizeStr) * 1024;
                } else if (sizeStr.endsWith("MB") || sizeStr.endsWith("MIB")) {
                    sizeInMiB = parseFloat(sizeStr);
                } else if (sizeStr.endsWith("%")) {
                    // Usar percentual diretamente
                    sizeInMiB = null;
                } else {
                    sizeInMiB = parseFloat(sizeStr);
                }
            }

            let end;
            if (sizeInMiB === null) {
                // Usar percentual (última partição geralmente)
                end = "100%";
            } else {
                end = `${start + sizeInMiB}MiB`;
            }

            const partType = part.partType ?? "primary";
            const isGPT = await isUEFI();

            // Criar partição
            script.push(`# Criando partição ${partNumber}: ${start}MiB -> ${end}`);

            if (isGPT) {
                script.push(`parted -s ${disk.name} mkpart ${partType} ${start}MiB ${end}`);
            } else {
                // MBR precisa do tipo
                let partedFsType = 'ext4';
                if (fsType === 'fat32' || fsType === 'vfat') {
                    partedFsType = 'fat32';
                } else if (fsType === 'swap') {
                    partedFsType = 'linux-swap';
                }
                script.push(`parted -s ${disk.name} mkpart ${partType} ${partedFsType} ${start}MiB ${end}`);
            }

            // CRÍTICO: Sincronizar antes de formatar
            script.push(`partprobe ${disk.name}`);
            script.push(`udevadm settle --timeout=10`);

            // Esperar o device existir
            script.push(`# Aguardando device ${devName} estar disponível`);
            script.push(`for i in {1..10}; do [ -b ${devName} ] && break || sleep 1; done`);
            script.push(`if [ ! -b ${devName} ]; then echo "ERRO: ${devName} não foi criado"; exit 1; fi`);

            // Agora formatar
            script.push(`# Formatando ${devName} como ${fsType}`);

            if (fsType === 'vfat' || fsType === 'fat32') {
                script.push(`mkfs.vfat -F 32 ${devName}`);
            } else if (fsType === 'ext4' || fsType === 'ext3' || fsType === 'ext2') {
                script.push(`mkfs.${fsType} -F ${devName}`);
            } else if (fsType === 'xfs') {
                script.push(`mkfs.xfs -f ${devName}`);
            } else if (fsType === 'btrfs') {
                script.push(`mkfs.btrfs -f ${devName}`);
            } else if (fsType === 'swap') {
                script.push(`mkswap ${devName}`);
                script.push(`swapon ${devName}`);
            } else {
                script.push(`mkfs.${fsType} ${devName}`);
            }

            // Definir flags
            if (part.mountPoint === '/boot/efi') {
                script.push(`parted -s ${disk.name} set ${partNumber} esp on`);
                script.push(`parted -s ${disk.name} set ${partNumber} boot on`);
            }

            if (part.mountPoint === '/boot') {
                script.push(`parted -s ${disk.name} set ${partNumber} boot on`);
            }

            // Atualizar start para próxima partição
            if (end === "100%") {
                partNumber++;
                break;
            } else {
                start = parseFloat(end.replace("MiB", ""));
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

export function toDev(d) {
    return d.startsWith('/dev') ? d : path.join('/dev', d)
}