// disk-ui.ts (contém AdvancedDisk + helpers locais)
// Imports usados no seu código original (ajuste caminhos se necessário)
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

/** pequeno utilitário */
function formatSizeGB(bytes: number | '100%'): string {
    if (bytes === '100%') return '100%';
    return (bytes / GB).toFixed(2);
}

/**
 * AdvancedDisk reescrita para usar UUID como identificador principal das partições.
 * Internamente define managePartitions e partMenu adaptados para procurar por UUID primeiro,
 * caindo para name quando UUID não existir (partições novas).
 */
export default async function AdvancedDisk(next = false): Promise<void> {
    // Helpers internos (atualizados para usar UUID)
    function calculateUsedSpace(partitions: part[]) {
        return partitions.reduce((total, p) => total + (typeof p.size === 'number' ? p.size : 0), 0);
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

    // partMenu atualizado: targetId pode ser UUID ou name (valor escolhido na UI)
    async function partMenu(partitions: part[], targetId: string, diskName: string, diskSize: number): Promise<part[] | undefined> {
        const findIndexById = (id: string) => partitions.findIndex(p => (p.UUID && p.UUID === id) || p.name === id);
        const partIndex = findIndexById(targetId);
        if (partIndex === -1) {
            console.error(`[ X ] Partição ${targetId} não encontrada`);
            return partitions;
        }
        const partItem = partitions[partIndex];

        const action = await Select.prompt({
            message: `Gerenciar ${partItem.UUID ? partItem.UUID : partItem.name} (${formatSizeGB(partItem.size)} GB)`,
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

        let newPartitions = [...partitions];

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
                    newPartitions[partIndex].mountPoint = keepMount ? partItem.mountPoint : await choiceMountPoint();
                } else {
                    newPartitions[partIndex].mountPoint = null;
                }

                const status = needsErase ? '[X] será formatada' : '[OK] mantida (apenas ponto de montagem alterado)';
                console.log(`[ OK ] ${partItem.UUID || partItem.name}: ${fileSystem.toUpperCase()} → ${newPartitions[partIndex].mountPoint || 'sem montagem'} (${status})`);
                break;
            }

            case "erase": {
                const eraseConfirm = await Confirm.prompt("Deseja mesmo apagar os dados desta partição?");
                if (!eraseConfirm) break;
                newPartitions[partIndex] = { ...partItem, erase: true };
                break;
            }

            case "mountPoint": {
                const newMount = await choiceMountPoint();
                newPartitions[partIndex] = { ...partItem, mountPoint: newMount, erase: partItem.erase || false };
                if (partItem.mountPoint !== newMount) {
                    console.log(`[ OK ] ${partItem.UUID || partItem.name}: ponto de montagem → ${newMount} (dados preservados)`);
                }
                break;
            }

            case "delete": {
                const confirmDelete = await Confirm.prompt({
                    message: `[ ! ]  Confirma exclusão de ${partItem.UUID || partItem.name}? Todos os dados serão perdidos!`,
                    default: false
                });

                if (confirmDelete) {
                    newPartitions.splice(partIndex, 1);
                    newPartitions = renumberPartitions(newPartitions, diskName);
                    console.log(`[ OK ] Partição ${partItem.UUID || partItem.name} removida`);
                } else {
                    console.log('[ ! ] Operação cancelada');
                    return partitions;
                }
                break;
            }

            case "resize": {
                const otherPartitionsSize = newPartitions.filter((_, i) => i !== partIndex).reduce((acc, p) => acc + (typeof p.size === 'number' ? p.size : 0), 0);
                const maxSize = diskSize - otherPartitionsSize;
                const currentSizeGB = formatSizeGB(partItem.size);
                const maxSizeGB = (maxSize / (1024 ** 3)).toFixed(2);

                const newSize = await Number.prompt({
                    message: `Novo tamanho para ${partItem.UUID || partItem.name} (atual: ${currentSizeGB} GB, máximo: ${maxSizeGB} GB)`,
                    min: 0.1,
                    max: parseFloat(maxSizeGB)
                });

                newPartitions[partIndex] = { ...partItem, size: newSize * (1024 ** 3), erase: true };
                console.log(`[ OK ] ${partItem.UUID || partItem.name} redimensionada → ${newSize} GB (será formatada)`);
                break;
            }
        }

        return newPartitions;
    }

    // managePartitions atualizado: opções listadas usam UUID quando existir, value = UUID||name
    async function managePartitions(diskObj: disk): Promise<part[] | undefined> {
        const partitions = diskObj.children || [];
        const totalUsedBytes = calculateUsedSpace(partitions);
        const totalUsedGB = totalUsedBytes / (1024 ** 3);
        const freeSpaceGB = diskObj.size - totalUsedGB;

        const options = partitions.map(p => {
            const id = p.UUID || p.name;
            const eraseLabel = p.erase ? '[X] Formatar' : '[OK] Manter';
            const sizeLabel = formatSizeGB(p.size);
            const mountLabel = p.mountPoint || '—';
            const fsLabel = (p.fileSystem || '—').toUpperCase();
            const displayName = p.UUID ? `${p.name || '—'} (${p.UUID})` : `${p.name}`;
            return {
                name: `${eraseLabel} │ ${displayName.padEnd(36)} │ ${sizeLabel.padStart(8)} GB │ ${fsLabel.padEnd(6)} │ ${mountLabel}`,
                value: id
            };
        });

        if (freeSpaceGB > 0.01) {
            options.push({ name: `➕ Criar nova partição (${freeSpaceGB.toFixed(2)} GB disponíveis)`, value: 'free' });
        }

        options.push({ name: "⬅️  Voltar", value: "back" }, { name: "[ OK ] Concluir", value: "ok" });

        const partSelect = await Select.prompt({
            message: `Gerenciar partições do disco ${diskObj.name} (${diskObj.size} GB)\n   Ação      │ Partição (nome/UUID)                             │  Tamanho   │ FS    │ Montagem`,
            options
        });

        if (partSelect === "back") { await AdvancedDisk(); return; }
        if (partSelect === "ok") return partitions;

        if (partSelect === 'free') {
            const partSize = await Number.prompt({
                message: `Tamanho da nova partição (GB disponíveis: ${freeSpaceGB.toFixed(2)})`,
                max: freeSpaceGB,
                min: 0.1
            });

            const fileSystemRaw = await selectFileSystem();
            const { fs: fileSystem, mount: autoMount } = normalizeFileSystem(fileSystemRaw);

            let mountPoint = autoMount;
            if (!autoMount && fileSystem === 'ext4') mountPoint = await choiceMountPoint();

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

            const renumbered = renumberPartitions(newPartitions, diskObj.name);
            return await managePartitions({ ...diskObj, children: renumbered });
        }

        // Editar existente (partSelect é UUID ou name)
        const updated = await partMenu(partitions, partSelect, diskObj.name, diskObj.size);
        if (updated) return await managePartitions({ ...diskObj, children: updated });
    }

    // --- início da função AdvancedDisk ---
    const listDisk = await listDisks();
    const options = listDisk.map(d => ({ name: `${d.name.padEnd(8)} │ ${d.size.toString().padStart(6)} GB`, value: d.name }));
    options.push(next ? { name: "[ OK ] Concluir configuração", value: "ok" } : { name: "⬅️  Voltar", value: "back" });

    const diskName = await Select.prompt({ message: "Selecione o disco para configurar", options });

    if (diskName === "back") { await ChoiceDisk(); return; }
    if (diskName === 'ok') return;

    console.log(`\nConfigurando disco: ${diskName}`);
    const diskObject = listDisk.find(v => v.name === diskName);
    if (!diskObject) { console.error(`[ X ] Erro: disco ${diskName} não encontrado`); return; }

    const partitions = await managePartitions(diskObject);
    if (!partitions) return;

    const hasRoot = partitions.some(p => p.mountPoint === '/');
    if (!hasRoot) console.warn('[ ! ]  Aviso: Nenhuma partição configurada como raiz (/)');

    // grava em globalThis.disks usando os UUIDs preservados
    globalThis.disks = [{ ...diskObject, children: partitions }];

    console.log('\nResumo das alterações:');
    partitions.forEach(p => {
        const action = p.erase ? '[X] Formatar' : '[OK] Manter';
        const mount = p.mountPoint || '—';
        const display = p.UUID ? `${p.name || '—'} (${p.UUID})` : p.name;
        console.log(`${action} │ ${display.padEnd(36)} │ ${formatSizeGB(p.size).padStart(8)} GB │ ${(p.fileSystem || '—').toUpperCase().padEnd(6)} │ ${mount}`);
    });

    const confirmChanges = await Confirm.prompt({ message: "\n[ ! ]  Confirmar todas as alterações?", default: false });
    if (!confirmChanges) {
        console.log('[ ! ] Alterações descartadas');
        await AdvancedDisk();
        return;
    }

    console.log('[ OK ] Configuração salva com sucesso!\n');
    await AdvancedDisk(true);
}
