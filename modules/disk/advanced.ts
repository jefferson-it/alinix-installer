// disk-ui.ts (contém AdvancedDisk + helpers locais) - VERSÃO CORRIGIDA
import ChoiceDisk from "../disk.ts";
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import { Number } from "https://deno.land/x/cliffy@v0.25.5/prompt/number.ts";
import { choiceMountPoint } from "./mount.ts";
import { Confirm } from "https://deno.land/x/cliffy@v0.25.5/prompt/confirm.ts";
import { disk, part } from "../../index.d.ts";
import { listDisks } from "./list.ts";
import { selectFileSystem } from './filesystem.ts';

const GB = 1024 ** 3;

/** pequeno utilitário */
function formatSizeGB(bytes: number | '100%'): string {
    if (bytes === '100%') return '100%';
    return (bytes / GB).toFixed(2);
}

/**
 * AdvancedDisk reescrita para usar UUID como identificador principal das partições.
 */
export default async function AdvancedDisk(next = false): Promise<void> {

    // Helpers internos
    function calculateUsedSpace(partitions: part[]) {
        return partitions.reduce((total, p) => {
            if (!p.use) return total; // Ignora espaços livres
            return total + (typeof p.size === 'number' ? p.size : 0);
        }, 0);
    }

    function normalizeFileSystem(fileSystem: string): { fs: part['fileSystem']; mount: string | null } {
        switch (fileSystem) {
            case 'efi': return { fs: 'fat32', mount: '/boot/efi' };
            case 'bios': return { fs: 'ext4', mount: '/boot' };
            default: return { fs: fileSystem as part['fileSystem'], mount: null };
        }
    }

    function needsFormatting(currentPart: part, newFileSystem: string): boolean {
        if (currentPart.fileSystem !== newFileSystem) return true;
        if (currentPart.erase) return true;
        return false;
    }

    function validatePartitions(partitions: part[]): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const usedPartitions = partitions.filter(p => p.use);

        // Validar raiz obrigatória
        const hasRoot = usedPartitions.some(p => p.mountPoint === '/');
        if (!hasRoot) {
            errors.push("É obrigatório ter uma partição raiz (/)");
        }

        // Validar pontos de montagem duplicados
        const mountPoints = usedPartitions
            .map(p => p.mountPoint)
            .filter(m => m !== null && m !== undefined);
        const duplicates = mountPoints.filter((m, i) => mountPoints.indexOf(m) !== i);
        if (duplicates.length > 0) {
            errors.push(`Pontos de montagem duplicados: ${[...new Set(duplicates)].join(', ')}`);
        }

        return { valid: errors.length === 0, errors };
    }

    function generatePartitionName(diskName: string, partNumber: number): string {
        // NVMe usa 'p' antes do número (ex: nvme0n1p1)
        // Outros discos não usam (ex: sda1)
        return diskName.includes('nvme')
            ? `${diskName}p${partNumber}`
            : `${diskName}${partNumber}`;
    }

    // partMenu atualizado: targetId pode ser UUID ou name
    async function partMenu(
        partitions: part[],
        targetId: string,
        _diskName: string,
        diskSizeBytes: number
    ): Promise<part[] | undefined> {

        const findIndexById = (id: string) =>
            partitions.findIndex(p => (p.UUID && p.UUID === id) || p.name === id);

        const partIndex = findIndexById(targetId);
        if (partIndex === -1) {
            console.error(`[ X ] Partição ${targetId} não encontrada`);
            return partitions;
        }

        const partItem = partitions[partIndex];
        const displayName = partItem.UUID ? partItem.UUID : partItem.name;

        const action = await Select.prompt({
            message: `Gerenciar ${displayName} (${formatSizeGB(partItem.size)} GB)`,
            options: [
                { name: '[FS] Alterar sistema de arquivos', value: 'format' },
                { name: '[DEL] Apagar os dados', value: 'erase' },
                { name: '[MP] Alterar ponto de montagem', value: 'mountPoint' },
                { name: '[RSZ] Redimensionar', value: 'resize' },
                { name: '[X] Excluir partição', value: 'delete' },
                { name: '[<-] Voltar', value: 'back' }
            ]
        });

        if (action === 'back') return partitions;

        const newPartitions = [...partitions];

        switch (action) {
            case "format": {
                const fileSystemRaw = await selectFileSystem();
                const { fs: fileSystem, mount: autoMount } = normalizeFileSystem(fileSystemRaw);
                const needsErase = needsFormatting(partItem, fileSystem);

                newPartitions[partIndex] = {
                    ...partItem,
                    fileSystem,
                    erase: needsErase
                };

                if (autoMount) {
                    newPartitions[partIndex].mountPoint = autoMount;
                } else if (fileSystem === 'ext4') {
                    const keepMount = partItem.mountPoint && !needsErase;
                    newPartitions[partIndex].mountPoint = keepMount
                        ? partItem.mountPoint
                        : await choiceMountPoint();
                } else {
                    newPartitions[partIndex].mountPoint = null;
                }

                const status = needsErase ? '[X] será formatada' : '[OK] mantida (apenas ponto de montagem alterado)';
                console.log(`[ OK ] ${displayName}: ${fileSystem.toUpperCase()} → ${newPartitions[partIndex].mountPoint || 'sem montagem'} (${status})`);
                break;
            }

            case "erase": {
                const eraseConfirm = await Confirm.prompt("Deseja mesmo apagar os dados desta partição?");
                if (!eraseConfirm) break;

                newPartitions[partIndex] = { ...partItem, erase: true };
                console.log(`[ OK ] ${displayName} será formatada`);
                break;
            }

            case "mountPoint": {
                const newMount = await choiceMountPoint();
                newPartitions[partIndex] = {
                    ...partItem,
                    mountPoint: newMount,
                    erase: partItem.erase || false
                };

                if (partItem.mountPoint !== newMount) {
                    console.log(`[ OK ] ${displayName}: ponto de montagem → ${newMount} (dados preservados)`);
                }
                break;
            }

            case "delete": {
                const confirmDelete = await Confirm.prompt({
                    message: `[ ! ] Confirma exclusão de ${displayName}? Todos os dados serão perdidos!`,
                    default: false
                });

                if (confirmDelete) {
                    // Marca como espaço livre
                    newPartitions[partIndex] = {
                        ...newPartitions[partIndex],
                        name: 'Espaço livre',
                        use: false,
                        mountPoint: null,
                        UUID: `free-${Date.now()}-${Math.random().toString(36).substring(7)}`
                    };
                    console.log(`[ OK ] Partição ${displayName} removida`);
                } else {
                    console.log('[ ! ] Operação cancelada');
                    return partitions;
                }
                break;
            }

            case "resize": {
                const otherPartitionsSize = newPartitions
                    .filter((p, i) => i !== partIndex && p.use)
                    .reduce((acc, p) => acc + (typeof p.size === 'number' ? p.size : 0), 0);

                const maxSizeBytes = diskSizeBytes - otherPartitionsSize;
                const maxSizeGB = maxSizeBytes / GB;
                const currentSizeGB = formatSizeGB(partItem.size);

                if (maxSizeGB < 0.1) {
                    console.error('[ X ] Não há espaço disponível para redimensionar');
                    break;
                }

                const newSize = await Number.prompt({
                    message: `Novo tamanho para ${displayName} (atual: ${currentSizeGB} GB, máximo: ${maxSizeGB.toFixed(2)} GB)`,
                    min: 0.1,
                    max: parseFloat(maxSizeGB.toFixed(2))
                });

                newPartitions[partIndex] = {
                    ...partItem,
                    size: newSize * GB,
                    erase: true
                };
                console.log(`[ OK ] ${displayName} redimensionada → ${newSize} GB (será formatada)`);
                break;
            }
        }

        return newPartitions;
    }

    // managePartitions atualizado
    async function managePartitions(diskObj: disk): Promise<part[] | undefined> {
        const partitions = diskObj.children || [];
        const diskSizeBytes = diskObj.size * GB; // Converte GB para bytes
        const totalUsedBytes = calculateUsedSpace(partitions);
        const freeSpaceBytes = diskSizeBytes - totalUsedBytes;
        const freeSpaceGB = freeSpaceBytes / GB;

        const options = partitions
            .filter(p => p.use) // Mostra apenas partições em uso
            .map(p => {
                const id = p.UUID || p.name;
                const eraseLabel = p.erase ? '[X] Formatar' : '[OK] Manter';
                const sizeLabel = formatSizeGB(p.size);
                const mountLabel = p.mountPoint || '—';
                const fsLabel = (p.fileSystem || '—').toUpperCase();
                const displayName = p.UUID ? `${p.name || '—'} ` : `${p.name}`;

                return {
                    name: `${eraseLabel} │ ${displayName.padEnd(36)} │ ${sizeLabel.padStart(8)} GB │ ${fsLabel.padEnd(6)} │ ${mountLabel}`,
                    value: id
                };
            });

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
            message: `Gerenciar partições do disco ${diskObj.name} (${diskObj.size} GB)\n   Ação      │ Partição (nome/UUID)                             │  Tamanho   │ FS    │ Montagem`,
            options
        });

        if (partSelect === "back") {
            await AdvancedDisk();
            return;
        }
        else if (partSelect === "ok") {
            // Validar antes de finalizar
            const validation = validatePartitions(partitions);
            if (!validation.valid) {
                console.error('\n[ X ] Erros encontrados:');
                validation.errors.forEach(err => console.error(`    - ${err}`));
                console.log('');
                return await managePartitions(diskObj);
            }
            return partitions;
        }
        else if (partSelect === 'free') {
            // Criar nova partição
            if (freeSpaceGB < 0.1) {
                console.error('[ X ] Não há espaço disponível');
                return await managePartitions(diskObj);
            }

            const partSize = await Number.prompt({
                message: `Tamanho da nova partição (GB disponíveis: ${freeSpaceGB.toFixed(2)})`,
                max: parseFloat(freeSpaceGB.toFixed(2)),
                min: 0.1
            });

            const fileSystemRaw = await selectFileSystem();
            const { fs: fileSystem, mount: autoMount } = normalizeFileSystem(fileSystemRaw);

            let mountPoint = autoMount;
            if (!autoMount && fileSystem === 'ext4') {
                mountPoint = await choiceMountPoint();
            }

            // Gerar nome da partição
            const usedPartitions = partitions.filter(p => p.use);
            const partNumber = usedPartitions.length + 1;
            const newName = generatePartitionName(diskObj.name, partNumber);

            const newPartitions: part[] = [
                ...partitions,
                {
                    size: partSize * GB,
                    fileSystem,
                    mountPoint,
                    use: true,
                    erase: true,
                    name: newName,
                }
            ];

            console.log(`[ OK ] Nova partição ${newName} criada: ${partSize} GB, ${fileSystem.toUpperCase()}, ${mountPoint || 'sem montagem'}`);
            return await managePartitions({ ...diskObj, children: newPartitions });
        }

        // Editar partição existente (partSelect é UUID ou name)
        const updated = await partMenu(partitions, partSelect, diskObj.name, diskSizeBytes);
        if (updated) return await managePartitions({ ...diskObj, children: updated });
    }

    // --- início da função AdvancedDisk ---
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
    if (diskName === 'ok') return;

    console.log(`\nConfigurando disco: ${diskName}`);

    const diskObject = listDisk.find(v => v.name === diskName);
    if (!diskObject) {
        console.error(`[ X ] Erro: disco ${diskName} não encontrado`);
        return;
    }

    const partitions = await managePartitions(diskObject);
    if (!partitions) return;

    // Validação final
    const validation = validatePartitions(partitions);
    if (!validation.valid) {
        console.error('\n[ X ] Erros críticos encontrados:');
        validation.errors.forEach(err => console.error(`    - ${err}`));
        console.log('\n[ ! ] Não é possível continuar sem corrigir estes problemas\n');
        await AdvancedDisk();
        return;
    }

    // grava em globalThis.disks usando os UUIDs preservados
    globalThis.disks = [{ ...diskObject, children: partitions }];

    console.log('\nResumo das alterações:');
    partitions
        .filter(p => p.use)
        .forEach(p => {
            const action = p.erase ? '[X] Formatar' : '[OK] Manter';
            const mount = p.mountPoint || '—';
            const display = p.UUID ? `${p.name || '—'} (${p.UUID})` : p.name;
            console.log(`${action} │ ${display.padEnd(36)} │ ${formatSizeGB(p.size).padStart(8)} GB │ ${(p.fileSystem || '—').toUpperCase().padEnd(6)} │ ${mount}`);
        });

    const confirmChanges = await Confirm.prompt({
        message: "\n[ ! ] Confirmar todas as alterações?",
        default: false
    });

    if (!confirmChanges) {
        console.log('[ ! ] Alterações descartadas');
        globalThis.disks = []; // Limpa as alterações
        // Não chama AdvancedDisk() novamente para evitar loop
        return;
    }

    console.log('[ OK ] Configuração salva com sucesso!\n');
    await AdvancedDisk(true);
}