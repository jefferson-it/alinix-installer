
import ChoiceDisk, { listDisks } from "../disk.js";
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import { Number } from "https://deno.land/x/cliffy@v0.25.5/prompt/number.ts";
import { selectFileSystem } from "./filesystem.js";
import { choiceMountPoint } from "./mount.js";
import { Confirm } from "https://deno.land/x/cliffy@v0.25.5/prompt/confirm.ts";

// Função para renumerar partições após alterações
export function renumberPartitions(partitions, diskName) {
    // Garantir que diskName é uma string
    const diskNameStr = typeof diskName === 'string' ? diskName : diskName.name || diskName;

    return partitions.map((part, index) => {
        const separator = diskNameStr.match(/nvme|mmcblk|loop/) ? 'p' : '';
        const newName = `${diskNameStr}${separator}${index + 1}`;
        return {
            ...part,
            name: newName
        };
    });
}

async function managePartitions({ children, size, name: diskName, ...disk }) {
    const partitions = children || [];

    const options = partitions.map(({ name, size, erase, mountPoint }) => ({
        name: `${erase ? 'sim' : 'não'} | ${name} | ${(size / 1_000_000_000).toFixed(2)} GB | ${mountPoint || "não usar"}`,
        value: name
    }));

    const totalUsed = partitions.reduce((a, b) => a + b.size, 0) / 1_000_000_000;

    if (totalUsed < size && totalUsed > 0) {
        options.push({
            name: `Espaço livre (${(size - totalUsed).toFixed(2)} GB)`,
            value: 'free'
        });
    } else {
        options.push({
            name: `Espaço livre (${size} GB)`,
            value: 'free'
        });
    }

    options.push({ name: "Reverter", value: "back" });
    options.push({ name: "Concluir", value: "ok" });

    const partSelect = await Select.prompt({
        message: "O que deseja fazer?\nFormatar | Partição | Espaço (GB) | montagem",
        options
    });

    if (partSelect === "back") {
        await AdvancedDisk();
        return;
    } else if (partSelect === "ok") {
        return partitions;
    }

    const sizeLeft = size - totalUsed;

    if (partSelect === 'free') {
        const partSize = await Number.prompt({
            message: `Quanto GB deseja para a partição? (${(sizeLeft).toFixed(2)} GB livre)`,
            max: sizeLeft
        });

        const fileSystem = await selectFileSystem();

        let mountPoint = null;

        if (fileSystem === 'ext4') {
            mountPoint = await choiceMountPoint();
        } else if (fileSystem === 'efi') {
            mountPoint = '/boot/efi';
        } else if (fileSystem === 'bios') {
            mountPoint = '/boot';
        }

        const newPartitions = [
            ...partitions,
            {
                size: partSize * 1_000_000_000,
                fileSystem,
                mountPoint,
                erase: true,
                name: ''
            }
        ];

        const renumbered = renumberPartitions(newPartitions, diskName);

        return await managePartitions({
            ...disk,
            children: renumbered,
            size,
            name: diskName
        });
    } else {
        const updatedPartitions = await partMenu(partitions, partSelect, diskName, size);

        if (updatedPartitions) {
            return await managePartitions({
                ...disk,
                children: updatedPartitions,
                size,
                name: diskName
            });
        }
    }
}

async function partMenu(partitions, targetName, diskName, diskSize) {
    const partIndex = partitions.findIndex(v => v.name === targetName);
    const part = partitions[partIndex];

    const made = await Select.prompt({
        message: "O que fazer com esta partição?",
        options: [
            {
                name: 'Formatar',
                value: 'format'
            },
            {
                name: 'Escolher ponto de montagem',
                value: 'mountPoint',
            },
            {
                name: 'Apagar',
                value: 'delete',
            },
            {
                name: 'Redimensionar',
                value: 'resize',
            },
            {
                name: 'Voltar',
                value: 'back',
            }
        ]
    });

    if (made === 'back') {
        return partitions;
    }

    let newPartitions = [...partitions];

    switch (made) {
        case "format":
            newPartitions[partIndex] = {
                ...part,
                erase: true,
                fileSystem: await selectFileSystem()
            };

            if (newPartitions[partIndex].fileSystem === 'ext4') {
                newPartitions[partIndex].mountPoint = await choiceMountPoint();
            }
            else if (newPartitions[partIndex].fileSystem === 'efi') {
                newPartitions[partIndex].mountPoint = '/boot/efi'
                newPartitions[partIndex].fileSystem = 'fat32'
            }
            else if (newPartitions[partIndex].fileSystem === 'bios') {
                newPartitions[partIndex].mountPoint = '/boot'
                newPartitions[partIndex].fileSystem = 'ext4'
            }
            break;

        case "mountPoint":
            newPartitions[partIndex] = {
                ...part,
                mountPoint: await choiceMountPoint()
            };
            break;

        case "delete":
            newPartitions.splice(partIndex, 1);
            newPartitions = renumberPartitions(newPartitions, diskName);
            console.log(`✅ Partição ${targetName} removida`);
            break;

        // deno-lint-ignore no-case-declarations
        case "resize":
            const otherPartitionsSize = newPartitions
                .filter((_, i) => i !== partIndex)
                .reduce((acc, p) => acc + p.size, 0);

            const maxSize = diskSize - otherPartitionsSize;
            const currentSizeGB = (part.size / 1_000_000_000).toFixed(2);
            const maxSizeGB = (maxSize / 1_000_000_000).toFixed(2);

            const newSize = await Number.prompt({
                message: `Novo tamanho para ${targetName}? (atual: ${currentSizeGB} GB, máximo: ${maxSizeGB} GB)`,
                min: 0.1,
                max: parseFloat(maxSizeGB)
            });

            newPartitions[partIndex] = {
                ...part,
                size: newSize * 1_000_000_000,
                erase: true
            };

            console.log(`✅ Partição ${targetName} redimensionada para ${newSize} GB`);
            break;
    }

    return newPartitions;
}

export default async function AdvancedDisk(next = false) {
    const disks = await listDisks();
    const options = disks.map(d => ({
        name: `${d.name} (${d.size} GB)`,
        value: d.name
    }));

    options.push(next ? { name: "Concluir", value: "ok" } : { name: "⬅ Voltar", value: "back" });

    const disk = await Select.prompt({
        message: "Selecione o disco",
        options
    });

    if (disk === "back") {
        await ChoiceDisk();
        return;
    }
    else if (disk === 'ok') {
        return
    }

    console.log(`💾 Disco selecionado: ${disk}`);
    const diskObject = disks.find(v => v.name === disk);

    const partitions = await managePartitions(diskObject);

    if (!partitions) return;

    globalThis.disks = [{
        ...diskObject,
        children: partitions
    }]

    const confirmAlt = await Confirm.prompt("Confirmar alterações?");

    if (!confirmAlt) await AdvancedDisk();

    await AdvancedDisk(true);
}