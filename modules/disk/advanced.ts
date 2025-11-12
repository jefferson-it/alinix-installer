import ChoiceDisk from "../disk.ts";
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import { Number } from "https://deno.land/x/cliffy@v0.25.5/prompt/number.ts";
import { choiceMountPoint } from "./mount.ts";
import { Confirm } from "https://deno.land/x/cliffy@v0.25.5/prompt/confirm.ts";
import { disk, part } from "../../index.d.ts";
import { renumberPartitions } from "./replace.ts";
import { listDisks } from "./list.ts";
import { selectFileSystem } from './filesystem.ts';


const GB = 1024 ** 3;
/**
 * Formata o tamanho em bytes para GB
 */
export function formatSizeGB(bytes: number | '100%'): string {
    if (bytes === '100%') return '100%';
    return (bytes / GB).toFixed(2);
}

/**
 * Calcula o espaço total usado pelas partições
 */
function calculateUsedSpace(partitions: part[]): number {
    return partitions.reduce((total, part) => {
        return total + (typeof part.size === 'number' ? part.size : 0);
    }, 0);
}

/**
 * Verifica se a partição precisa ser formatada baseado nas mudanças
 */
function needsFormatting(
    currentPart: part,
    newFileSystem: string,
    // newMountPoint?: string | null
): boolean {
    if (currentPart.fileSystem !== newFileSystem) {
        return true;
    }

    // Se já está marcada para apagar, mantém
    if (currentPart.erase) {
        return true;
    }

    // Se apenas o ponto de montagem mudou, não precisa formatar
    return false;
}

/**
 * Normaliza o sistema de arquivos para tipos especiais (EFI/BIOS)
 */
function normalizeFileSystem(fileSystem: string): { fs: part['fileSystem']; mount: string | null } {
    switch (fileSystem) {
        case 'efi':
            return { fs: 'fat32', mount: '/boot/efi' };
        case 'bios':
            return { fs: 'ext4', mount: '/boot' };
        default:
            return { fs: fileSystem as part['fileSystem'], mount: null };
    }
}

/**
 * Gerencia as partições de um disco
 */
async function managePartitions({ children, size, name: diskName, ...disk }: disk): Promise<part[] | undefined> {
    const partitions = children || [];
    const totalUsedBytes = calculateUsedSpace(partitions);
    const totalUsedGB = totalUsedBytes / (1024 ** 3);
    const freeSpaceGB = size - totalUsedGB;

    // Constrói as opções de partições
    const options = partitions.map(({ name, size, erase, mountPoint, fileSystem }) => {
        const eraseLabel = erase ? '[X] Formatar' : '[OK] Manter';
        const sizeLabel = formatSizeGB(size);
        const mountLabel = mountPoint || '—';
        const fsLabel = fileSystem.toUpperCase();

        return {
            name: `${eraseLabel} │ ${name.padEnd(8)} │ ${sizeLabel.padStart(8)} GB │ ${fsLabel.padEnd(6)} │ ${mountLabel}`,
            value: name
        };
    });

    // Adiciona opção de espaço livre
    if (freeSpaceGB > 0.01) {
        options.push({
            name: `➕ Criar nova partição (${freeSpaceGB.toFixed(2)} GB disponíveis)`,
            value: 'free'
        });
    }

    options.push(
        { name: "⬅️  Voltar", value: "back" },
        { name: "[ OK ] Concluir", value: "ok" }
    );

    const partSelect = await Select.prompt({
        message: `Gerenciar partições do disco ${diskName} (${size} GB)\n   Ação      │ Partição │  Tamanho   │ FS    │ Montagem`,
        options
    });

    if (partSelect === "back") {
        await AdvancedDisk();
        return;
    }

    if (partSelect === "ok") {
        return partitions;
    }

    // Criar nova partição
    if (partSelect === 'free') {
        const partSize = await Number.prompt({
            message: `Tamanho da nova partição (GB disponíveis: ${freeSpaceGB.toFixed(2)})`,
            max: freeSpaceGB,
            min: 0.1
        });

        const fileSystemRaw = await selectFileSystem();
        const { fs: fileSystem, mount: autoMount } = normalizeFileSystem(fileSystemRaw);

        let mountPoint = autoMount;

        if (!autoMount && fileSystem === 'ext4') {
            mountPoint = await choiceMountPoint();
        }

        const newPartitions: part[] = [
            ...partitions,
            {
                size: partSize * (1024 ** 3),
                fileSystem,
                mountPoint,
                erase: true,
                name: '',
            }
        ];

        const renumbered = renumberPartitions(newPartitions, diskName);

        return await managePartitions({
            ...disk,
            children: renumbered,
            size,
            name: diskName
        });
    }

    // Editar partição existente
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

/**
 * Menu de opções para uma partição específica
 */
async function partMenu(
    partitions: part[],
    targetName: string,
    diskName: string,
    diskSize: number
): Promise<part[] | undefined> {
    const partIndex = partitions.findIndex(v => v.name === targetName);
    const part = partitions[partIndex];

    const action = await Select.prompt({
        message: `Gerenciar ${targetName} (${formatSizeGB(part.size)} GB)`,
        options: [
            { name: '[FS] Alterar sistema de arquivos', value: 'format' },
            { name: '[DEL] Apagar os dados', value: 'erase' },
            { name: '[MP] Alterar ponto de montagem', value: 'mountPoint' },
            { name: '[RSZ] Redimensionar', value: 'resize' },
            { name: '[X] Excluir partição', value: 'delete' },
            { name: '[<-] Voltar', value: 'back' }
        ]
    });

    if (action === 'back') {
        return partitions;
    }

    let newPartitions = [...partitions];

    switch (action) {
        case "format": {
            const fileSystemRaw = await selectFileSystem();
            const { fs: fileSystem, mount: autoMount } = normalizeFileSystem(fileSystemRaw);

            const needsErase = needsFormatting(part, fileSystem);

            newPartitions[partIndex] = {
                ...part,
                fileSystem,
                erase: needsErase
            };

            // Define ponto de montagem apropriado
            if (autoMount) {
                newPartitions[partIndex].mountPoint = autoMount;
            } else if (fileSystem === 'ext4') {
                const keepMount = part.mountPoint && !needsErase;
                newPartitions[partIndex].mountPoint = keepMount
                    ? part.mountPoint
                    : await choiceMountPoint();
            } else {
                newPartitions[partIndex].mountPoint = null;
            }

            const status = needsErase ? '[X] será formatada' : '[OK] mantida (apenas ponto de montagem alterado)';
            console.log(`[ OK ] ${targetName}: ${fileSystem.toUpperCase()} → ${newPartitions[partIndex].mountPoint || 'sem montagem'} (${status})`);
            break;
        }
        case "erase": {

            const eraseConfirm = await Confirm.prompt("Deseja mesmo apagar os dados desta partição?");

            if (!eraseConfirm) break;

            newPartitions[partIndex] = {
                ...part,
                erase: true
            };

            break;
        }

        case "mountPoint": {
            const newMount = await choiceMountPoint();

            newPartitions[partIndex] = {
                ...part,
                mountPoint: newMount,
                // Não marca para apagar se só mudou o ponto de montagem
                erase: part.erase || false
            };

            if (part.mountPoint !== newMount) {
                console.log(`[ OK ] ${targetName}: ponto de montagem → ${newMount} (dados preservados)`);
            }
            break;
        }

        case "delete": {
            const confirmDelete = await Confirm.prompt({
                message: `[ ! ]  Confirma exclusão de ${targetName}? Todos os dados serão perdidos!`,
                default: false
            });

            if (confirmDelete) {
                newPartitions.splice(partIndex, 1);
                newPartitions = renumberPartitions(newPartitions, diskName);
                console.log(`[ OK ] Partição ${targetName} removida`);
            } else {
                console.log(`[ ! ] Operação cancelada`);
                return partitions;
            }
            break;
        }

        case "resize": {
            const otherPartitionsSize = newPartitions
                .filter((_, i) => i !== partIndex)
                .reduce((acc, p) => typeof p.size === 'number' ? acc + p.size : acc, 0);

            const maxSize = diskSize - otherPartitionsSize;
            const currentSizeGB = formatSizeGB(part.size);
            const maxSizeGB = (maxSize / (1024 ** 3)).toFixed(2);

            const newSize = await Number.prompt({
                message: `Novo tamanho para ${targetName} (atual: ${currentSizeGB} GB, máximo: ${maxSizeGB} GB)`,
                min: 0.1,
                max: parseFloat(maxSizeGB)
            });

            newPartitions[partIndex] = {
                ...part,
                size: newSize * (1024 ** 3),
                erase: true // Redimensionar requer formatação
            };

            console.log(`[ OK ] ${targetName} redimensionada → ${newSize} GB (será formatada)`);
            break;
        }
    }

    return newPartitions;
}

/**
 * Função principal para gerenciamento avançado de discos
 */
export default async function AdvancedDisk(next = false): Promise<void> {
    const listDisk = await listDisks();

    const options = listDisk.map(d => ({
        name: `${d.name.padEnd(8)} │ ${d.size.toString().padStart(6)} GB`,
        value: d.name
    }));

    options.push(
        next
            ? { name: "[ OK ] Concluir configuração", value: "ok" }
            : { name: "⬅️  Voltar", value: "back" }
    );

    const diskName = await Select.prompt({
        message: "Selecione o disco para configurar",
        options
    });

    if (diskName === "back") {
        await ChoiceDisk();
        return;
    }

    if (diskName === 'ok') {
        return;
    }

    console.log(`\nConfigurando disco: ${diskName}`);

    const diskObject = listDisk.find(v => v.name === diskName);

    if (!diskObject) {
        console.error(`[ X ] Erro: disco ${diskName} não encontrado`);
        return;
    }

    const partitions = await managePartitions(diskObject);

    if (!partitions) return;

    // Validações antes de confirmar
    const hasRoot = partitions.some(p => p.mountPoint === '/');

    if (!hasRoot) {
        console.warn('[ ! ]  Aviso: Nenhuma partição configurada como raiz (/)');
    }

    // Atualiza configuração global
    globalThis.disks = [{
        ...diskObject,
        children: partitions
    }];

    // Exibe resumo
    console.log('\nResumo das alterações:');
    partitions.forEach(p => {
        const action = p.erase ? '[X] Formatar' : '[OK] Manter';
        const mount = p.mountPoint || '—';
        console.log(`${action} │ ${p.name.padEnd(8)} │ ${formatSizeGB(p.size).padStart(8)} GB │ ${p.fileSystem.toUpperCase().padEnd(6)} │ ${mount}`);
    });

    const confirmChanges = await Confirm.prompt({
        message: "\n[ ! ]  Confirmar todas as alterações?",
        default: false
    });

    if (!confirmChanges) {
        console.log('[ ! ] Alterações descartadas');
        await AdvancedDisk();
        return;
    }

    console.log('[ OK ] Configuração salva com sucesso!\n');
    await AdvancedDisk(true);
}